import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { fastWakeSource, denseLapSource, withoutZ, serializable } from './ant-exhibition-variants.js';
import { filterStrikeEvents } from './ant-exhibition-excitation.js';
import { instrumentSurfaceSchedule, sha256 } from './ant-sonic-shadow-render.js';

const DIR = 'docs/ant/evidence/2026-10-21-exhibition-audio-runtime';
const RATE = 48_000, PHYSICS_RATE = 6_000, START_FRAME = 2 * RATE, WINDOW_STEPS = PHYSICS_RATE / 2;
const inputPath = process.argv[2] || `${DIR}/capture-inputs.v8.gz`;
const counts = (process.env.ANT_STEMS_PLATES || '30').split(',').map(Number);
const variants = (process.env.ANT_STEMS_VARIANTS || 'full,z-off,plate-gate,cell-gate').split(',');
const bench = JSON.parse(await readFile(`${DIR}/benchmark.json`, 'utf8'));
const benchmarkRows = new Map(bench.results.map(row => [`${row.plateCount}:${row.id}`, row]));
const bytes = await readFile(inputPath), inputs = deserialize(gunzipSync(bytes));
const source = await readFile('static/worklets/surface-plate.worklet.js', 'utf8');
const output = [];
const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>ANT exhibition stems</title>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;

function pickupConfig(topology, events, frames) {
  const topologies = [topology, ...events.filter(e => e.message.type === 'topology').map(e => e.message.payload)];
  const layerIds = [...new Set(topologies.flatMap(t => Array.isArray(t?.layerIds) ? t.layerIds : []))];
  const maxLayers = topologies.reduce((n, t) => Math.max(n, t?.layerIds?.length || 0), 0);
  const maxPhysicsSteps = (frames - START_FRAME) * PHYSICS_RATE / RATE;
  if (!Number.isSafeInteger(maxPhysicsSteps) || maxPhysicsSteps <= 0) throw new Error('invalid pickup-stem frame range');
  const allocatedBytes = maxPhysicsSteps * (layerIds.length * 16 + maxLayers * 4 + 40);
  if (allocatedBytes > 256 * 1024 * 1024) throw new Error(`pickup stems exceed helper limit: ${allocatedBytes} bytes`);
  return { layerIds, maxPhysicsSteps, maxLayers, allocatedBytes, startFrame: START_FRAME, endFrame: frames };
}

function summarize(capture, strikeEvents, settings) {
  const frames = capture.steps;
  if (frames !== capture.maxPhysicsSteps) throw new Error(`incomplete stem capture: ${frames}/${capture.maxPhysicsSteps}`);
  const energy = (plate, start, end) => {
    const l = plate.left.subarray(start, end), r = plate.right.subarray(start, end);
    return (l.reduce((s, x) => s + x * x, 0) + r.reduce((s, x) => s + x * x, 0)) / (2 * (end - start));
  };
  const plateRows = capture.plates.map(plate => ({ id: plate.id, left: plate.left, right: plate.right }));
  const bins = [];
  for (let start = 0; start + settings.windowSteps <= frames; start += settings.windowSteps) {
    const end = start + settings.windowSteps;
    const values = plateRows.map(plate => ({ id: plate.id, meanSquare: energy(plate, start, end) }));
    const total = values.reduce((s, x) => s + x.meanSquare, 0);
    const shares = values.map(x => total ? x.meanSquare / total : 0);
    const effectiveContributorCount = shares.some(Boolean) ? 1 / shares.reduce((s, x) => s + x * x, 0) : 0;
    const sphereMeanSquare = energy(capture.sphere, start, end);
    bins.push({ startMs: start * 1000 / settings.physicsRateHz, endMs: end * 1000 / settings.physicsRateHz,
      plateSummedMeanSquare: total, sphereMeanSquare, effectiveContributorCount,
      plates: values.map((x, i) => ({ id: x.id, meanSquare: x.meanSquare, energyShare: shares[i] })) });
  }
  const eventWindows = [];
  for (const event of strikeEvents) {
    const id = event.message?.payload?.layerId;
    if (typeof id !== 'string') continue;
    if (event.frame < settings.startFrame) continue;
    const start = Math.floor((event.frame - settings.startFrame) / settings.samplesPerPhysicsStep);
    const end = start + settings.windowSteps;
    if (end > frames) continue;
    const focal = plateRows.find(p => p.id === id);
    if (!focal) continue;
    const focalPower = energy(focal, start, end);
    const rest = plateRows.filter(p => p.id !== id);
    const restLeft = new Float64Array(end - start), restRight = new Float64Array(end - start);
    for (const p of rest) for (let i = start; i < end; i++) {
      restLeft[i - start] += p.left[i]; restRight[i - start] += p.right[i];
    }
    const restPower = (restLeft.reduce((s, x) => s + x * x, 0) + restRight.reduce((s, x) => s + x * x, 0))
      / (2 * (end - start));
    eventWindows.push({ layerId: id, eventFrame: event.frame, windowStartMs: start * 1000 / settings.physicsRateHz,
      windowEndMs: end * 1000 / settings.physicsRateHz, focalMeanSquare: focalPower,
      restSignedSumMeanSquare: restPower,
      focalToRestDb: focalPower > 0 && restPower > 0 ? 10 * Math.log10(focalPower / restPower) : null });
  }
  const ids = [...new Set(plateRows.map(p => p.id))];
  const overall = ids.map(id => {
    const plate = plateRows.find(p => p.id === id), value = energy(plate, 0, frames);
    return { id, meanSquare: value, rms: Math.sqrt(value) };
  });
  const quantile = (values, p) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b), at = (sorted.length - 1) * p;
    const lo = Math.floor(at), hi = Math.ceil(at);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
  };
  const mainPlateEnergyDistribution = ids.map(id => {
    const values = bins.map(bin => bin.plates.find(plate => plate.id === id).meanSquare);
    return { id, medianMeanSquare: quantile(values, .5), p10MeanSquare: quantile(values, .1),
      p90MeanSquare: quantile(values, .9) };
  });
  const effectiveCounts = bins.map(bin => bin.effectiveContributorCount);
  const effectiveContributorCountDistribution = { median: quantile(effectiveCounts, .5),
    p10: quantile(effectiveCounts, .1), p90: quantile(effectiveCounts, .9) };
  return { sampleRateHz: settings.physicsRateHz, physicsFrames: frames, windowMs: 500,
    energyDefinition: 'Mean square of the two per-Plate pickup channels; effective contributor count is inverse Simpson concentration of these nonnegative energy shares.',
    bins, overallPlateEnergy: overall, mainPlateEnergyDistribution,
    effectiveContributorCountDistribution, eventWindows500ms: eventWindows,
    eventWindowDefinition: 'For each delivered strike with a registered layerId, compare that Plate pickup mean-square with the sum across other Plate pickups during the following 500 ms.',
    sphereSeparate: true, preLimiterCaptured: Boolean(capture.preLimiter),
    interpretationLimit: 'Pickup-component energy is not perceptual salience; summed component energies ignore cross-Plate phase cancellation and cannot establish masking or audibility.' };
}

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  for (const item of inputs.cases) {
    if (!counts.includes(item.plateCount)) continue;
    for (const id of variants) {
      const expected = benchmarkRows.get(`${item.plateCount}:${id}`);
      if (!expected) { output.push({ plateCount: item.plateCount, variant: id, skipped: 'no matching benchmark row' }); continue; }
      const frames = Number(expected.frames);
      if (frames <= START_FRAME) throw new Error(`${item.plateCount}-${id}: no post-precondition frames`);
      const gate = id === 'plate-gate' || id === 'cell-gate'
        ? filterStrikeEvents(item.events, { mode: id === 'plate-gate' ? 'plate' : 'cell' }) : null;
      const code = id === 'fast-wake' ? fastWakeSource(source) : id === 'dense-lap' ? denseLapSource(source) : source;
      const topology = id === 'z-off' ? withoutZ(item.topology) : item.topology;
      const events = (gate?.events || item.events).map(row => id === 'z-off' && row.message.type === 'topology'
        ? { ...row, message: { type: 'topology', payload: withoutZ(row.message.payload) } } : row);
      assert.ok(events.every((event, i) => Number.isSafeInteger(event.frame) && event.frame >= 0
        && event.frame < frames && (!i || event.frame >= events[i - 1].frame)), 'frozen events must be sorted in range');
      const range = { startFrame: START_FRAME, endFrame: frames };
      const instrumented = instrumentSurfaceSchedule(code, pickupConfig(topology, events, frames), range, false);
      console.log(JSON.stringify({ stage: 'stem-capture-start', plateCount: item.plateCount, id, frames }));
      const result = await page.evaluate(async ({ source, topology: packedTopology, events: packedEvents, frames, summarizerSource, settings }) => {
        const revive = value => {
          if (!value || typeof value !== 'object') return value;
          if (value.__typedArray) return new globalThis[value.__typedArray](value.data);
          if (Array.isArray(value)) return value.map(revive);
          return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]));
        };
        const topology = revive(packedTopology), events = revive(packedEvents).filter(e => e.frame < frames);
        const extension = `
const Raw=SurfacePlateProcessor;
class Bench extends Raw {
  constructor(options) { super(options); this.__shadowFields=null; }
  process(inputs,outputs) { const live=super.process(inputs,outputs); if(this.__shadowFrame>=${frames})
    this.port.postMessage({done:true,capture:this.__shadowPickupCapture,diagnostics:this.getDiagnostics()}); return live; }
}`;
        const module = source.replace("registerProcessor('surface-plate-processor', SurfacePlateProcessor);",
          extension + "\nregisterProcessor('surface-plate-processor', Bench);");
        const context = new OfflineAudioContext(2, frames, 48000), url = URL.createObjectURL(new Blob([module], {type:'text/javascript'}));
        await context.audioWorklet.addModule(url); URL.revokeObjectURL(url);
        const node = new AudioWorkletNode(context, 'surface-plate-processor', {numberOfInputs:0,numberOfOutputs:1,
          outputChannelCount:[2],processorOptions:{events,topology,evidenceSchedule:{events},evidenceTopology:topology}});
        const receipt = new Promise((resolve, reject) => { node.port.onmessage=e=>{if(e.data.done)resolve(e.data)};
          node.onprocessorerror=()=>reject(Error('AudioWorklet processor error')); });
        node.connect(context.destination); const audio=await context.startRendering(), done=await receipt;
        const raw=new Uint8Array(frames*8), view=new DataView(raw.buffer);
        for(let i=0;i<frames;i++){view.setFloat32(i*8,audio.getChannelData(0)[i],true);view.setFloat32(i*8+4,audio.getChannelData(1)[i],true);}
        let binary='';for(let o=0;o<raw.length;o+=32768)binary+=String.fromCharCode(...raw.subarray(o,o+32768));
        node.disconnect();node.port.close();
        const summarizeOnPage = new Function('capture','strikeEvents','settings',`return (${summarizerSource})(capture,strikeEvents,settings)`);
        const pickupSummary = summarizeOnPage(done.capture, events.filter(e=>e.message.type==='strike'),
          settings);
        return {pcm:btoa(binary),pickupSummary,diagnostics:done.diagnostics,sampleRate:audio.sampleRate,
          capturedPlateCount:done.capture.layerIds.length,capturedPhysicsFrames:done.capture.steps};
      }, { source: instrumented, topology: serializable(topology), events: serializable(events), frames,
        summarizerSource: summarize.toString(), settings: {physicsRateHz:PHYSICS_RATE,samplesPerPhysicsStep:8,
          windowSteps:WINDOW_STEPS,startFrame:START_FRAME} });
      const pcm = Buffer.from(result.pcm, 'base64'), pcmHash = sha256(pcm);
      if (pcmHash !== expected.pcmSha256) throw new Error(`${item.plateCount}-${id}: stem replay PCM differs from benchmark (${pcmHash} != ${expected.pcmSha256})`);
      if (result.sampleRate !== RATE || result.diagnostics.nonFinite !== 0) throw new Error(`${item.plateCount}-${id}: invalid audio receipt`);
      if (result.diagnostics.strikes !== expected.diagnostics.strikes || result.diagnostics.dropped !== 0)
        throw new Error(`${item.plateCount}-${id}: strike/drop diagnostics differ from benchmark`);
      output.push({ plateCount: item.plateCount, variant: id, frames, pcmSha256: pcmHash,
        benchmarkPcmSha256: expected.pcmSha256, strikeDiagnostics: result.diagnostics, pickupSummary: result.pickupSummary });
      await writeFile(`${DIR}/stems-summary.json`, JSON.stringify({ schemaVersion: 1,
        benchmarkSha256: sha256(await readFile(`${DIR}/benchmark.json`)), captureInputSha256: sha256(bytes),
        sourceSha256: sha256(source), frameRange: { startFrame: START_FRAME, endFrameExclusive: frames,
          preconditionSecondsExcluded: START_FRAME / RATE,
          firstCapturedPostStepShadowFrame: START_FRAME + 8, lastCapturedPostStepShadowFrame: frames,
          eventFrameOrigin: 'zero-based 48 kHz replay audio frame',
          windowMsOrigin: 'integration interval indexed from the two-second cut; slot zero stores the post-update value at cut + 8 frames',
          eventStepMapping: 'floor((eventFrame - startFrame) / 8), first solver update consuming the strike' },
        pcmParityRequired: true, timingClaim: false,
        perRun: output }, null, 2) + '\n');
      console.log(JSON.stringify({ stage: 'stem-capture-complete', plateCount: item.plateCount, id, pcmSha256: pcmHash,
        plates: result.capturedPlateCount, windows: result.capturedPhysicsFrames / WINDOW_STEPS }));
    }
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
