import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { compileSurfaceTopology, SURFACE_DAMPING_BASELINE, SURFACE_DAMPING_GAIN } from '../src/lib/audio/compileSurfaceTopology.js';

const RATE = 48000;
const GAIN = 0.245;
const DURATION_SECONDS = 10;
const WORKLET_SOURCE = await readFile(new URL('../static/worklets/surface-plate.worklet.js', import.meta.url), 'utf8');
const sourceRun = JSON.parse(gunzipSync(await readFile(new URL('../docs/ant/evidence/2026-10-06-stratigraphy-runtime/motion/continuous-natural-0-600s-browser-evidence.json.gz', import.meta.url))));
const birth = sourceRun.events.find(event => event.type === 'plate-birth')?.payload;
const input = JSON.parse(await readFile(new URL('../docs/ant/evidence/2026-10-06-plate-decay/baseline-isolated.json', import.meta.url)));
const strike = input.isolatedStrike;
if (!birth || !strike || input.topology.plateCount !== 1 || input.topology.zLinks !== 0 || input.topology.nodules !== 0) {
  throw new Error('Expected the recorded first frozen Plate and its isolated one-Plate strike.');
}

const rows = [];
for (const materialDamping of [0.25, 0.45]) {
  const plate = structuredClone(birth);
  plate.material = { ...plate.material, damping: materialDamping };
  const topology = compileSurfaceTopology({ plates: [plate], nodules: [], stratigraphy: { layerOrder: [plate.id] } });
  const processor = instantiate(WORKLET_SOURCE);
  processor.handleMessage({ type: 'topology', payload: topology });
  processor.handleMessage({ type: 'strike', payload: strike });
  if (processor.telemetry.strikes !== 1 || processor.telemetry.droppedRoutes !== 0) throw new Error('Isolated strike was not accepted exactly once.');

  const sleepSteps = [];
  const advance = processor.advancePhysics.bind(processor);
  let observedSleeps = processor.telemetry.sleeps;
  processor.advancePhysics = (...args) => {
    const result = advance(...args);
    if (processor.telemetry.sleeps !== observedSleeps) {
      observedSleeps = processor.telemetry.sleeps;
      sleepSteps.push({ physicsStep: processor.telemetry.physicsSteps, count: observedSleeps,
        timeSeconds: processor.telemetry.physicsSteps / 6000 });
    }
    return result;
  };

  const left = new Float32Array(RATE * DURATION_SECONDS);
  const right = new Float32Array(RATE * DURATION_SECONDS);
  for (let offset = 0; offset < left.length; offset += 128) {
    const count = Math.min(128, left.length - offset);
    const l = new Float32Array(count), r = new Float32Array(count);
    processor.process([], [[l, r]]);
    for (let frame = 0; frame < count; frame++) {
      left[offset + frame] = l[frame] * GAIN;
      right[offset + frame] = r[frame] * GAIN;
    }
  }
  const metrics = measure(left, right, RATE);
  const coefficient = SURFACE_DAMPING_BASELINE + SURFACE_DAMPING_GAIN * materialDamping;
  rows.push({
    materialDamping,
    compiledPlateDampingCoefficient: topology.materialCoefficients[3],
    expectedUnscaledDampingCoefficient: coefficient,
    effectiveWorkletPlateDampingCoefficient: coefficient * 50,
    strike,
    input: { acceptedStrikeCount: processor.telemetry.strikes, droppedRoutes: processor.telemetry.droppedRoutes,
      requestedContactImpulseSquared: processor.telemetry.requestedContactImpulseSquared,
      compliantContactImpulseSquared: processor.telemetry.compliantContactImpulseSquared },
    pcm: metrics,
    sleep: { threshold: { quietEnergy: processor.getDiagnostics().truncatedTailRiskThreshold,
        consecutiveSteps: processor.getDiagnostics().quietStepsThreshold },
      firstSleep: sleepSteps[0] ?? null, lastSleep: sleepSteps.at(-1) ?? null,
      transitionCount: sleepSteps.length, finalSleepCount: processor.telemetry.sleeps,
      truncatedTailEnergy: processor.telemetry.truncatedTailEnergy },
    topology: { plates: topology.layerIds, zLinks: topology.adjacentLinkNodes.length / 2, noduleCount: topology.noduleIds.length }
  });
}
if (!(rows[0].effectiveWorkletPlateDampingCoefficient < rows[1].effectiveWorkletPlateDampingCoefficient)) {
  throw new Error('Expected higher frozen material damping to retain stronger relative damping.');
}
if (rows.some(row => row.pcm.nonFinite || row.pcm.clipping || row.topology.plates.length !== 1 || row.topology.zLinks !== 0 || row.topology.noduleCount !== 0)) {
  throw new Error('Material-range condition had non-finite/clipped output or unintended topology.');
}

const output = {
  status: 'node-vm-shared-worklet-material-range-engineering-check',
  interpretation: 'Synthetic frozen descriptor variants on the first natural Plate geometry; same captured isolated strike; not a Chrome recording and not separate natural Plate births.',
  source: { baselineHead: '7f8ebf8d50752341383d1bd3d90e568fc2340fdd', candidateWorkletSha256: sha(WORKLET_SOURCE),
    runSeed: sourceRun.seed, plateId: birth.id, birthSimulationTimeMs: birth.bornAtSimulationTimeMs,
    geometrySha256: sha(JSON.stringify({ mask: birth.mask, pickups: birth.pickups, edges: birth.edges })) },
  solver: { physicsRateHz: 6000, sampleRateHz: RATE, durationSeconds: DURATION_SECONDS, outputGain: GAIN,
    dampingMapping: 'compiled = 9e-6 + 18e-6 * frozen material.damping; Plate recurrence coefficient = compiled * 50; Sphere damping is not scaled',
    pulseDurationMs: 3, pulseSteps: 18, localRecoveryMs: 75,
    windowMs: 50, hopMs: 10, crossingSustainMs: 500, noPerRenderNormalization: true },
  cases: rows
};
await writeFile(new URL('../docs/ant/evidence/2026-10-06-plate-decay/material-damping-range.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ output: 'docs/ant/evidence/2026-10-06-plate-decay/material-damping-range.json', cases: rows.map(({ materialDamping, effectiveWorkletPlateDampingCoefficient, pcm, sleep }) => ({ materialDamping, effectiveWorkletPlateDampingCoefficient, crossings: pcm.crossings, sleep })) }, null, 2));

function instantiate(source) {
  let Processor;
  class AudioWorkletProcessor { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  vm.runInNewContext(source, { AudioWorkletProcessor, sampleRate: RATE, Float32Array, Uint8Array, Uint16Array,
    Uint32Array, Int8Array, Int16Array, Int32Array, Array, Math, Number, Object, performance,
    registerProcessor: (_name, Klass) => { Processor = Klass; } });
  if (!Processor) throw new Error('surface-plate-processor was not registered.');
  return new Processor();
}

function measure(left, right, rate) {
  const window = Math.round(rate * 0.05), hop = Math.round(rate * 0.01), envelope = [];
  let sumL = 0, sumR = 0, peakL = 0, peakR = 0, nonFinite = 0, clipping = 0;
  for (let i = 0; i < left.length; i++) {
    const l = left[i], r = right[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) { nonFinite++; continue; }
    sumL += l * l; sumR += r * r; peakL = Math.max(peakL, Math.abs(l)); peakR = Math.max(peakR, Math.abs(r));
    if (Math.abs(l) >= 1) clipping++;
    if (Math.abs(r) >= 1) clipping++;
  }
  const count = Math.floor((left.length - window) / hop) + 1;
  for (let k = 0; k < count; k++) {
    const start = k * hop; let l = 0, r = 0;
    for (let i = start; i < start + window; i++) { l += left[i] ** 2; r += right[i] ** 2; }
    envelope.push({ timeSeconds: (start + window / 2) / rate, rmsL: Math.sqrt(l / window), rmsR: Math.sqrt(r / window) });
  }
  const crossings = key => {
    const maximum = Math.max(...envelope.map(row => row[key]));
    const ref = envelope.findIndex(row => row[key] === maximum);
    const output = { referenceTimeSeconds: envelope[ref].timeSeconds, referenceRms: maximum,
      referenceDbfs: 20 * Math.log10(Math.max(maximum, 1e-30)) };
    for (const db of [20, 40, 60]) {
      const target = maximum * 10 ** (-db / 20);
      let lastAbove = -1;
      for (let i = ref; i < envelope.length; i++) if (envelope[i][key] > target) lastAbove = i;
      let found = null;
      for (let i = Math.max(ref, lastAbove + 1); i < envelope.length - 50; i++) {
        let held = true;
        for (let j = i; j < i + 50; j++) if (envelope[j][key] > target) { held = false; break; }
        if (held) { found = envelope[i].timeSeconds - envelope[ref].timeSeconds; break; }
      }
      output[`T${db}Seconds`] = found;
      output[`T${db}Status`] = found === null ? 'not reached within 10 s; no extrapolation' : 'after last above-threshold 50 ms RMS window, then sustained below for 500 ms';
      output[`T${db}LastAboveThresholdSeconds`] = lastAbove < 0 ? null : envelope[lastAbove].timeSeconds;
    }
    return output;
  };
  return { durationSeconds: left.length / rate, windowMs: 50, hopMs: 10, rmsL: Math.sqrt(sumL / left.length),
    rmsR: Math.sqrt(sumR / right.length), peakL, peakR, finiteSamples: (left.length - nonFinite) * 2,
    nonFinite, clipping, crossings: { L: crossings('rmsL'), R: crossings('rmsR') } };
}

function sha(value) { return createHash('sha256').update(value).digest('hex'); }
