import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';
import { SurfaceAudioBridge } from '../src/lib/audio/SurfaceAudioBridge.js';

const dir = resolve('docs/ant/evidence/2026-10-06-contact-sonic-baseline');
const compressed = await readFile(resolve('docs/ant/evidence/2026-10-06-stratigraphy-runtime/motion/continuous-natural-0-600s-browser-evidence.json.gz'));
const recording = JSON.parse(gunzipSync(compressed));
const events = recording.events;
const plate = events.find(event => event.type === 'plate-birth')?.payload;
if (!plate) throw new Error('Missing recorded immutable first Plate descriptor.');
const sourceEventsSha256 = createHash('sha256').update(compressed).digest('hex');
const baselineWorklet = execFileSync('git', ['show', '2d9430b:static/worklets/surface-plate.worklet.js'],
  { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const candidateWorklet = await readFile(resolve('static/worklets/surface-plate.worklet.js'), 'utf8');
const workletHashes = {
  baseline: createHash('sha256').update(baselineWorklet).digest('hex'),
  candidate: createHash('sha256').update(candidateWorklet).digest('hex')
};
const groups = { dense: events.filter(event => event.type === 'FOOT_CONTACT'
  && event.simulationTimeMs >= 154000 && event.simulationTimeMs < 164000) };
groups.sparse = [];
let lastSparseTime = -Infinity;
for (const event of groups.dense) if (event.simulationTimeMs - lastSparseTime >= 1000) {
  groups.sparse.push(event); lastSparseTime = event.simulationTimeMs;
}

const field = new SurfaceField();
const responses = new Map(); let previousTime = 0;
for (const event of events) {
  if (event.type !== 'FOOT_CONTACT' || event.simulationTimeMs > 164000) continue;
  field.relax(Math.max(0, event.simulationTimeMs - previousTime) / 1000);
  previousTime = event.simulationTimeMs;
  responses.set(event, field.applyFootContact(event.payload));
}

function routedSchedule(selected) {
  const bridge = new SurfaceAudioBridge({ audioEngine: { context: { currentTime: 0 } } });
  bridge.storePlates([plate]); bridge.compileTopology({ plates: [plate], nodules: [] }); bridge._enabled = true;
  const messages = [];
  bridge.worklet = { node: { port: { postMessage(message) { if (message.type === 'strike') messages.push(message.payload); } } } };
  const frames = [];
  for (const event of selected) {
    const before = messages.length;
    bridge.handleFootContact(event.payload, { responses: responses.get(event) || [] });
    const frame = Math.round((event.simulationTimeMs - 154000) * 48);
    for (let i = before; i < messages.length; i++) frames.push(frame);
  }
  const canonical = messages.map((payload, i) => ({ frame: frames[i], plateId: payload.plateId,
    position: payload.position, strength: payload.strength, footprintRadius: payload.footprintRadius, hardness: payload.hardness }));
  return { bridge: { ...bridge.diagnostics }, canonical, sha256: createHash('sha256').update(JSON.stringify(canonical)).digest('hex') };
}

function readFloatWav(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE'
    || bytes.readUInt16LE(20) !== 3 || bytes.readUInt16LE(22) !== 2 || bytes.readUInt16LE(34) !== 32) {
    throw new Error('Expected stereo IEEE float WAV evidence.');
  }
  const sampleRate = bytes.readUInt32LE(24), count = bytes.readUInt32LE(40) / 8;
  const left = new Float32Array(count), right = new Float32Array(count);
  for (let i = 0, offset = 44; i < count; i++, offset += 8) { left[i] = bytes.readFloatLE(offset); right[i] = bytes.readFloatLE(offset + 4); }
  return { left, right, sampleRate };
}

function pcmMetrics({ left, right, sampleRate }) {
  let squareL = 0, squareR = 0, peakL = 0, peakR = 0, finite = 0, nonFinite = 0, clipL = 0, clipR = 0, diffL = 0, diffR = 0;
  for (let i = 0; i < left.length; i++) {
    const l = left[i], r = right[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) { nonFinite += 1; continue; }
    finite += 2; squareL += l*l; squareR += r*r; peakL = Math.max(peakL, Math.abs(l)); peakR = Math.max(peakR, Math.abs(r));
    if (Math.abs(l) >= 1) clipL++; if (Math.abs(r) >= 1) clipR++;
    if (i) { diffL += (l-left[i-1])**2; diffR += (r-right[i-1])**2; }
  }
  return { sampleRate, samplesPerChannel: left.length, finiteSamples: finite, nonFiniteSamples: nonFinite,
    clippingChannelSamplesL: clipL, clippingChannelSamplesR: clipR, clippingSamples: clipL + clipR,
    peakL, peakR, rmsL: Math.sqrt(squareL/left.length), rmsR: Math.sqrt(squareR/right.length),
    firstDifferenceRmsL: Math.sqrt(diffL/Math.max(1,left.length-1)), firstDifferenceRmsR: Math.sqrt(diffR/Math.max(1,right.length-1)) };
}

const reports = {};
for (const condition of ['dense', 'sparse']) {
  const input = groups[condition], routing = routedSchedule(input);
  for (const mode of ['baseline', 'candidate']) {
    const path = resolve(dir, `${mode}-${condition}-10s-48khz-f32.wav`);
    const wav = await readFile(path), pcm = readFloatWav(wav);
    const metricsPath = resolve(dir, `${mode}-${condition}-metrics.json`);
    const metrics = JSON.parse(await readFile(metricsPath, 'utf8'));
    const baselineSource = input[0]?.simulationTimeMs;
    void baselineSource;
    if (metrics.workletSourceSha256 && metrics.workletSourceSha256 !== workletHashes[mode]) throw new Error(`Worklet SHA changed while capturing ${mode}/${condition}.`);
    if (!metrics.routedPayloadAndFrameScheduleSha256 || metrics.routedPayloadAndFrameScheduleSha256 !== routing.sha256)
      throw new Error(`Captured routed payload/frame SHA disagrees with independent replay for ${mode}/${condition}.`);
    metrics.status = 'real-chrome-offline-audioworklet-render';
    metrics.sourceEventsSha256 = sourceEventsSha256;
    metrics.workletSourceSha256 = workletHashes[mode];
    metrics.routedPayloadAndFrameScheduleSha256 = routing.sha256;
    metrics.footContactGroups = input.length;
    metrics.individualFootContacts = input.reduce((sum, event) => sum + (event.payload.contacts?.length || 0), 0);
    metrics.routedFeet = routing.bridge.routedFeet;
    metrics.routedStrikeMessages = routing.bridge.strikeRoutes;
    metrics.bridgeDiagnostics = routing.bridge;
    metrics.wavSha256 = createHash('sha256').update(wav).digest('hex');
    metrics.audioMetrics = { ...metrics.audioMetrics, ...pcmMetrics(pcm) };
    if (metrics.sampleRate !== pcm.sampleRate || pcm.sampleRate !== 48000 || metrics.audioMetrics.samplesPerChannel !== 480000) {
      throw new Error(`Unexpected PCM size or sample rate ${mode}/${condition}.`);
    }
    const injected = metrics.processorTestReport?.injected;
    metrics.frameSchedulerAppliedEveryBridgeRoute = injected === routing.bridge.strikeRoutes
      && metrics.processorTestReport?.rejected === 0
      && metrics.processorTestReport?.scheduled === routing.bridge.strikeRoutes
      && metrics.processorTestReport?.diagnostics?.strikes === routing.bridge.strikeRoutes;
    if (!metrics.frameSchedulerAppliedEveryBridgeRoute) throw new Error(`Processor strike report mismatch in ${mode}/${condition}.`);
    if (metrics.audioMetrics.nonFiniteSamples || metrics.audioMetrics.clippingSamples)
      throw new Error(`Captured PCM has a numerical/clipping regression in ${mode}/${condition}.`);
    metrics.validContactGroupsAndFeet = { groups: input.length, individualFeet: metrics.individualFootContacts };
    reports[`${mode}-${condition}`] = metrics;
    await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
  }
  const a = reports[`baseline-${condition}`], b = reports[`candidate-${condition}`];
  const parity = a.sourceEventsSha256 === b.sourceEventsSha256 && a.footContactGroups === b.footContactGroups
    && a.individualFootContacts === b.individualFootContacts && a.routedFeet === b.routedFeet
    && a.routedStrikeMessages === b.routedStrikeMessages && a.routedPayloadAndFrameScheduleSha256 === b.routedPayloadAndFrameScheduleSha256;
  if (!parity) throw new Error(`A/B input event and routed payload/frame schedule diverged for ${condition}.`);
  a.sameInputContactAndRoutingCounts = true; b.sameInputContactAndRoutingCounts = true;
  await writeFile(resolve(dir, `baseline-${condition}-metrics.json`), `${JSON.stringify(a, null, 2)}\n`);
  await writeFile(resolve(dir, `candidate-${condition}-metrics.json`), `${JSON.stringify(b, null, 2)}\n`);
}

const summary = { status: 'verified-real-chrome-worklet-ab', source: {
  run: 'seed 20261005 recorded natural ANT run', simulationWindowSeconds: [154,164],
  sourceEvidenceGzipSha256: sourceEventsSha256, volume: 0.35, finalGain: 0.245, sampleRate: 48000,
  onePlateId: plate.id, plateBirthSimulationSeconds: plate.bornAtSimulationTimeMs/1000,
  controlledZAdjacency: 0, controlledNodules: 0 },
  inputs: Object.fromEntries(['dense','sparse'].map(condition => [condition, {
    sourceGroups: reports[`baseline-${condition}`].footContactGroups,
    individualFeet: reports[`baseline-${condition}`].individualFootContacts,
    bridgeRoutedFeet: reports[`baseline-${condition}`].routedFeet,
    bridgePayloadFrameSha256: reports[`baseline-${condition}`].routedPayloadAndFrameScheduleSha256,
    parityPassed: reports[`baseline-${condition}`].sameInputContactAndRoutingCounts,
    baselineProcessorAccepted: reports[`baseline-${condition}`].processorTestReport?.diagnostics?.strikes,
    candidateProcessorAccepted: reports[`candidate-${condition}`].processorTestReport?.diagnostics?.strikes
  }])),
  renderer: { presetId: 'ant-surface-stratigraphy-v1', waveformScale: [-1,1], spectrogramDbfs: [-100,0],
    grayscale: 'fixed global linear dBFS brightness, gamma 1', fftSize: 1024, window: 'Hann', hopSize: 256,
    frequencyHz: [0,8000], image: 'aligned-ab-10s-fixed-scale.png' },
  workletSourceHashes: workletHashes,
  audioFiles: ['baseline-dense-10s-48khz-f32.wav','candidate-dense-10s-48khz-f32.wav',
    'baseline-sparse-10s-48khz-f32.wav','candidate-sparse-10s-48khz-f32.wav'] };
await writeFile(resolve(dir,'summary.json'),`${JSON.stringify(summary,null,2)}\n`);
console.log(JSON.stringify({ status: summary.status, cases: Object.keys(reports), parity: summary.inputs }, null, 2));
