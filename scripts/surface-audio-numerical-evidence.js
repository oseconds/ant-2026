import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-05-surface-plates/long-run-evidence.json');
const OUTPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-05-surface-plates/audio-numerical-evidence.json');
const WORKLET = resolve(ROOT, 'static/worklets/surface-plate.worklet.js');
const SAMPLE_RATES = [44100, 48000, 96000];
const MAX_PLATES = 12;
const EXCITATION_SECONDS = 0.5;
const TAIL_SECONDS = 2;
const GROUPS_PER_SECOND = 144;
const GROUP_STRENGTH = 0.045;
const AUDIO_QUANTUM = 128;
const ENERGY_SAMPLE_INTERVAL = 0.25;

const experiment = await buildEvidence();
await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(experiment, null, 2)}\n`);
console.log(JSON.stringify({ output: OUTPUT, cases: experiment.cases.length,
  secondsOfSolverTime: experiment.cases.length * (EXCITATION_SECONDS + TAIL_SECONDS) }, null, 2));

async function buildEvidence() {
  const [longRun, workletSource] = await Promise.all([
    readFile(INPUT, 'utf8').then(JSON.parse), readFile(WORKLET, 'utf8')
  ]);
  const cases = [];
  for (const scenario of longRun.scenarios) {
    const plates = scenario.plates.slice(0, MAX_PLATES);
    if (plates.length !== MAX_PLATES) throw new Error(`Seed ${scenario.seed} has ${plates.length} Plates, expected ${MAX_PLATES}.`);
    for (const sampleRate of SAMPLE_RATES) {
      cases.push(runCase({ seed: scenario.seed, plates, sampleRate, workletSource }));
    }
  }
  return {
    provenance: {
      purpose: 'Offline numerical and realtime-budget probe of naturally generated maximum-layer Plate descriptors.',
      input: 'long-run-evidence.json; first 12 frozen Plate descriptors for each of its three deterministic natural-run seeds.',
      worklet: 'static/worklets/surface-plate.worklet.js loaded directly into Node vm; no browser or audio-device path.',
      workletSha256: createHash('sha256').update(workletSource).digest('hex'),
      sourceLongRunEvidenceSha256: createHash('sha256').update(JSON.stringify(longRun)).digest('hex'),
      seeds: longRun.scenarios.map(({ seed }) => seed),
      sampleRatesHz: SAMPLE_RATES,
      excitationSeconds: EXCITATION_SECONDS,
      unexcitedTailSeconds: TAIL_SECONDS,
      syntheticInput: `${GROUPS_PER_SECOND} bounded QA foot-contact groups/s for ${EXCITATION_SECONDS}s; 3 deterministic centerline points/group selected from frozen natural Plate descriptors; group strength ${GROUP_STRENGTH}. Energy is L2-distributed over the actual containing masks and is never replayed from recorded ANT contacts.`,
      cpuProtocol: 'Warm 20 128-frame quanta, then time 400 consecutive 128-frame process calls on the 12 natural masks. Compare p50/p95/max to the exact 128/sampleRate quantum duration. Node VM timings are diagnostic only; they do not certify Chrome AudioWorklet realtime performance.',
      energyFormula: 'Per layer: 0.5*rho*sum((u[t]-u[t-1])^2) + 0.5*rho*b*sum(Lu[t]*Lu[t-1]) - 0.5*T*sum(u[t]*Lu[t-1]); per overlap cell pair: 0.5*k*(uA[t]-uB[t])*(uA[t-1]-uB[t-1]). L is the implemented four-neighbor graph Laplacian.',
      limitations: [
        'The worklet is executed in a Node vm with simulated AudioWorklet globals; this does not include Chrome scheduling, browser output routing, hardware, or actual real-time underruns.',
        'Synthetic deterministic foot-like points and impulses verify bounded numerical behavior; they are not an ANT behavior replay, natural contact distribution, or listening assessment.',
        'CPU quantiles are machine- and load-dependent and should be interpreted as a local measurement.'
      ]
    },
    cases
  };
}

function runCase({ seed, plates, sampleRate, workletSource }) {
  const processor = instantiate(workletSource, sampleRate);
  const layerDescriptors = plates.map(plate => ({
    active96Cells: plate.mask.reduce((sum, value) => sum + (value === 1 ? 1 : 0), 0),
    bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs,
    maskSha256: createHash('sha256').update(Buffer.from(plate.mask)).digest('hex')
  }));
  for (const plate of plates) processor.handleMessage({ type: 'birth', payload: { plate } });
  if (processor.layers.size !== MAX_PLATES) throw new Error(`Seed ${seed}, ${sampleRate} Hz accepted ${processor.layers.size} layers.`);

  const overlap = processor.overlapCoupling.map(pair => ({
    plateIds: pair.plateIds, overlapCells32: pair.overlapCells,
    coefficient: pair.coefficient
  }));
  const overlapCells = overlap.reduce((sum, pair) => sum + pair.overlapCells32, 0);
  const counts = { finiteSamples: 0, nonFiniteSamples: 0, clippedSamples: 0,
    sumLeft: 0, sumRight: 0, sumSqLeft: 0, sumSqRight: 0, peakLeft: 0, peakRight: 0 };
  let maxDisplacementDuringExcitation = 0;
  let maxDisplacementOverall = 0;
  let maxEnergyDuringExcitation = 0;
  const energyTimeline = [];
  const totalFrames = Math.round((EXCITATION_SECONDS + TAIL_SECONDS) * sampleRate);
  const excitationFrames = Math.round(EXCITATION_SECONDS * sampleRate);
  const events = makeSyntheticEvents(plates, excitationFrames, sampleRate);
  let eventCursor = 0;
  const started = performance.now();
  for (let frame = 0; frame < totalFrames;) {
    while (eventCursor < events.length && events[eventCursor].frame <= frame) {
      for (const strike of events[eventCursor].strikes) processor.handleMessage({ type: 'strike', payload: strike });
      eventCursor += 1;
    }
    const count = Math.min(AUDIO_QUANTUM, totalFrames - frame);
    const buffers = [new Float32Array(count), new Float32Array(count)];
    processor.process([], [[buffers[0], buffers[1]]]);
    for (let index = 0; index < count; index += 1) addSample(counts, buffers[0][index], buffers[1][index]);
    frame += count;

    const elapsedSeconds = frame / sampleRate;
    const displacement = getMaxDisplacement(processor.layerList);
    maxDisplacementOverall = Math.max(maxDisplacementOverall, displacement);
    if (frame <= excitationFrames) {
      maxDisplacementDuringExcitation = Math.max(maxDisplacementDuringExcitation, displacement);
      maxEnergyDuringExcitation = Math.max(maxEnergyDuringExcitation, coupledEnergy(processor));
    }
    if (Math.abs(elapsedSeconds / ENERGY_SAMPLE_INTERVAL - Math.round(elapsedSeconds / ENERGY_SAMPLE_INTERVAL)) < count / sampleRate / ENERGY_SAMPLE_INTERVAL) {
      energyTimeline.push({ simulationSeconds: round(elapsedSeconds, 6),
        coupledDiscreteEnergy: round(coupledEnergy(processor), 12),
        maxAbsDisplacement: round(displacement, 12) });
    }
  }
  const wallSeconds = (performance.now() - started) / 1000;
  const tailStartEnergy = energyTimeline.find(item => Math.abs(item.simulationSeconds - EXCITATION_SECONDS) < 0.01)?.coupledDiscreteEnergy
    ?? maxEnergyDuringExcitation;
  const endEnergy = coupledEnergy(processor);
  const layerStats = processor.layerList.map(layer => ({ id: layer.id,
    activeCells32: layer.current.length,
    pickupNodes: layer.pickups.slice(),
    stiffness: layer.bending, density: layer.density,
    dampingPerStep: layer.damping }));
  const cpu = benchmarkCpu(processor, sampleRate);
  const finiteAudio = counts.nonFiniteSamples === 0 && processor.telemetry.nonFinite === 0;
  return {
    seed, sampleRateHz: sampleRate,
    solver: { physicsRateHz: processor.physicsRate,
      decimationPhaseRemainder: processor.decimationPhase,
      activeLayerCount: processor.layers.size,
      naturalDescriptorMaskCells96: layerDescriptors.map(item => item.active96Cells),
      naturalDescriptorMaskSha256: layerDescriptors.map(item => item.maskSha256),
      distinctNaturalMaskCount: new Set(layerDescriptors.map(item => item.maskSha256)).size,
      activeMaskCells32: layerStats.map(item => item.activeCells32),
      totalActiveMaskCells32: layerStats.reduce((sum, item) => sum + item.activeCells32, 0),
      overlapPairCount: overlap.length, overlappingCellGroups32: processor.couplingGroups.length,
      overlapCells32AcrossPairs: overlapCells,
      maxOverlapCells32PerPair: overlap.length ? Math.max(...overlap.map(pair => pair.overlapCells32)) : 0,
      overlapCoupling: overlap,
      layerParameters: layerStats.map(({ id, activeCells32, pickupNodes, stiffness, density, dampingPerStep }) =>
        ({ id, activeCells32, pickupNodes, stiffness, density, dampingPerStep })) },
    excitation: { durationSeconds: EXCITATION_SECONDS,
      groupRateHz: GROUPS_PER_SECOND, groupsGenerated: events.length,
      routedStrikeCount: processor.telemetry.strikes,
      droppedStrikeCount: processor.telemetry.dropped,
      groupStrength: GROUP_STRENGTH,
      maximumCoupledDiscreteEnergy: round(maxEnergyDuringExcitation, 12),
      maximumAbsDisplacement: round(maxDisplacementDuringExcitation, 12) },
    tail: { durationSeconds: TAIL_SECONDS,
      coupledEnergyAtTailStart: round(tailStartEnergy, 12),
      coupledEnergyAtTailEnd: round(endEnergy, 12),
      energyRatioEndOverStart: tailStartEnergy > 0 ? round(endEnergy / tailStartEnergy, 8) : null,
      maximumAbsDisplacement: round(maxDisplacementOverall, 12),
      finalMaximumAbsDisplacement: round(getMaxDisplacement(processor.layerList), 12),
      finiteAndDamped: finiteAudio && Number.isFinite(endEnergy) && (tailStartEnergy === 0 || endEnergy < tailStartEnergy) },
    audio: { outputRmsLeft: rms(counts.sumSqLeft, counts.finiteSamples),
      outputRmsRight: rms(counts.sumSqRight, counts.finiteSamples),
      meanLeft: mean(counts.sumLeft, counts.finiteSamples), meanRight: mean(counts.sumRight, counts.finiteSamples),
      peakAbsLeft: round(counts.peakLeft, 12), peakAbsRight: round(counts.peakRight, 12),
      nonFiniteOutputSamples: counts.nonFiniteSamples,
      outputSamplesOverUnity: counts.clippedSamples,
      workletNonFinite: processor.telemetry.nonFinite,
      workletPreLimiterOverUnity: processor.telemetry.clipped,
      workletMaximumPreLimiterOutput: round(processor.telemetry.maxOutputAbs, 12),
      silent: counts.sumSqLeft + counts.sumSqRight === 0 },
    realtimeCpuProbe: cpu,
    measurement: { simulatedDurationSeconds: totalFrames / sampleRate,
      wallDurationSeconds: round(wallSeconds, 4), realTimeFactor: round((totalFrames / sampleRate) / wallSeconds, 3),
      energyTimeline }
  };
}

function makeSyntheticEvents(plates, excitationFrames, sampleRate) {
  const groupCount = Math.round(EXCITATION_SECONDS * GROUPS_PER_SECOND);
  const eventsByQuantum = new Map();
  let state = (20261005 ^ sampleRate) >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  for (let eventIndex = 0; eventIndex < groupCount; eventIndex += 1) {
    const eventFrame = Math.floor((eventIndex + 0.5) * excitationFrames / groupCount);
    const quantumFrame = Math.floor(eventFrame / AUDIO_QUANTUM) * AUDIO_QUANTUM;
    const feet = [];
    for (let foot = 0; foot < 3; foot += 1) {
      const plate = plates[Math.floor(random() * plates.length)];
      const path = plate.principalPath;
      const index = path[Math.floor(random() * path.length)];
      feet.push({ x: (index % 96) / 95, y: Math.floor(index / 96) / 95 });
    }
    const routes = [];
    for (const position of feet) {
      const x = Math.max(0, Math.min(95, Math.round(position.x * 95)));
      const y = Math.max(0, Math.min(95, Math.round(position.y * 95)));
      const matching = plates.filter(plate => plate.mask[y * 96 + x] === 1);
      if (matching.length) routes.push({ position, matching });
    }
    const norm = Math.sqrt(routes.reduce((sum, route) => sum + 1, 0));
    const scale = Math.min(1, Math.sqrt(feet.length) / norm);
    const strikes = [];
    for (const route of routes) {
      for (const plate of route.matching) strikes.push({ plateId: plate.id,
        position: route.position,
        strength: GROUP_STRENGTH / Math.sqrt(feet.length * route.matching.length) * scale,
        footprintRadius: 0.011, hardness: 0.5 });
    }
    if (!strikes.length) continue;
    const existing = eventsByQuantum.get(quantumFrame) || [];
    existing.push(...strikes);
    eventsByQuantum.set(quantumFrame, existing);
  }
  return [...eventsByQuantum].sort((a, b) => a[0] - b[0])
    .map(([frame, strikes]) => ({ frame, strikes }));
}

function instantiate(source, rate) {
  let Processor;
  class AudioWorkletProcessor {
    constructor() { this.port = { onmessage: null, postMessage() {} }; }
  }
  vm.runInNewContext(source, {
    AudioWorkletProcessor, sampleRate: rate, Float32Array, Uint8Array, Int32Array,
    Map, Array, Math, Number, Object, performance,
    registerProcessor: (name, implementation) => {
      if (name !== 'surface-plate-processor') throw new Error(`Unexpected processor ${name}`);
      Processor = implementation;
    }
  });
  return new Processor({ processorOptions: { maxPlates: MAX_PLATES } });
}

function benchmarkCpu(processor, sampleRate) {
  const quantum = [new Float32Array(AUDIO_QUANTUM), new Float32Array(AUDIO_QUANTUM)];
  for (let index = 0; index < 20; index += 1) processor.process([], [[quantum[0], quantum[1]]]);
  const timings = [];
  for (let index = 0; index < 400; index += 1) {
    const started = performance.now();
    processor.process([], [[quantum[0], quantum[1]]]);
    timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  const budgetMs = AUDIO_QUANTUM / sampleRate * 1000;
  return { warmupQuanta: 20, measuredQuanta: timings.length,
    quantumBudgetMs: round(budgetMs, 6),
    p50Ms: round(percentile(timings, 0.5), 6), p95Ms: round(percentile(timings, 0.95), 6),
    maxMs: round(timings.at(-1), 6),
    p95BudgetFraction: round(percentile(timings, 0.95) / budgetMs, 6),
    maxBudgetFraction: round(timings.at(-1) / budgetMs, 6),
    withinMeasuredQuantumBudget: percentile(timings, 0.95) < budgetMs };
}

function coupledEnergy(processor) {
  let energy = 0;
  for (const layer of processor.layerList) {
    let kinetic = 0, bending = 0, tension = 0;
    for (let index = 0; index < layer.current.length; index += 1) {
      let lapCurrent = -4 * layer.current[index];
      let lapPrevious = -4 * layer.previous[index];
      const offset = index * 4;
      for (let slot = 0; slot < 4; slot += 1) {
        const neighbor = layer.neighbors[offset + slot];
        if (neighbor < 0) continue;
        lapCurrent += layer.current[neighbor];
        lapPrevious += layer.previous[neighbor];
      }
      const velocity = layer.current[index] - layer.previous[index];
      kinetic += 0.5 * layer.density * velocity * velocity;
      bending += 0.5 * layer.density * layer.bending * lapCurrent * lapPrevious;
      tension -= 0.5 * layer.tension * layer.current[index] * lapPrevious;
    }
    energy += kinetic + bending + tension;
  }
  for (const group of processor.couplingGroups || []) {
    for (let i = 0; i < group.entries.length; i += 1) {
      const a = group.entries[i];
      for (let j = i + 1; j < group.entries.length; j += 1) {
        const b = group.entries[j];
        const currentDifference = a.layer.current[a.node] - b.layer.current[b.node];
        const previousDifference = a.layer.previous[a.node] - b.layer.previous[b.node];
        energy += 0.5 * group.coefficient * currentDifference * previousDifference;
      }
    }
  }
  return energy;
}

function getMaxDisplacement(layers) {
  let maximum = 0;
  for (const layer of layers) for (const value of layer.current) maximum = Math.max(maximum, Math.abs(value));
  return maximum;
}
function addSample(counts, left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) { counts.nonFiniteSamples += 1; return; }
  counts.finiteSamples += 1;
  counts.sumLeft += left; counts.sumRight += right;
  counts.sumSqLeft += left * left; counts.sumSqRight += right * right;
  counts.peakLeft = Math.max(counts.peakLeft, Math.abs(left));
  counts.peakRight = Math.max(counts.peakRight, Math.abs(right));
  if (Math.abs(left) > 1 || Math.abs(right) > 1) counts.clippedSamples += 1;
}
function rms(sumSquares, count) { return count ? round(Math.sqrt(sumSquares / count), 12) : 0; }
function mean(sum, count) { return count ? round(sum / count, 12) : 0; }
function percentile(values, fraction) { return values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))]; }
function round(value, digits) { return Number.isFinite(value) ? Number(value.toFixed(digits)) : null; }
