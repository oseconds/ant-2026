import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';

const rates = [44100, 48000, 96000];
const layerCounts = [12, 24, 48];
const workletSource = readFileSync(new URL('../static/worklets/surface-plate.worklet.js', import.meta.url), 'utf8');
const outputPath = resolve('docs/ant/evidence/2026-10-06-stratigraphy-runtime/surface-topology-scaling-evidence.json');
const report = {
  protocol: {
    purpose: 'Synthetic bounded numerical and scaling checks for the packed SurfacePlate processor.',
    notNaturalRun: true,
    cpuDisclaimer: 'Node VM timings and Chrome main-thread JavaScript proxy timings are not AudioWorklet realtime measurements.',
    noRealtimeClaim: true,
    sampleRatesHz: rates,
    layerCounts,
    masks: ['full 96x96 masks', 'deterministic narrow Y-shaped trail corridor masks'],
    simulation: 'One bounded grouped strike followed by a short tail; long natural decay is separately checked on the narrow mask.',
    energyEstimators: {
      discreteDiagnostic: 'Plate: 0.5*rho*velocity^2 + 0.5*rho*bending*(Laplacian u)^2 + 0.5*tension*undirectedNeighborGradient^2; adjacent layers: 0.5*compiledLinkCoefficient*(uA-uB)^2; sphere: 0.5*modalMass*velocity^2 + 0.5*modalMass*(2-2*cos(omega))*q^2; foundation: 0.5*weight*springConstant*(plateDisplacement-sum(SH*q))^2.',
      limitations: 'Leapfrog cross-strain terms, damping, sleep truncation and awake-set changes are not represented as conserved physical energy. Reported totals/ranges are bounded diagnostic estimators only.'
    },
    quantumFrames: 128,
    solverRateHz: 6000,
    solverGrid: 32,
    sphereModesPerNodule: 12,
    caps: { historicalLayers: 256, nodules: 32, eviction: false }
  },
  source: { workletSha256: createHash('sha256').update(workletSource).digest('hex') },
  cases: [],
  cpu: { nodeVm: [], chromeMainThreadProxy: null }
};

for (const shape of ['full', 'corridor']) {
  for (const layers of layerCounts) {
    for (const sampleRateHz of rates) {
      report.cases.push(runStabilityCase({ shape, layers, sampleRateHz }));
    }
  }
}
for (const layers of layerCounts) {
  const topology = makeTopology('corridor', layers);
  const processor = instantiate(workletSource, 48000);
  install(processor, topology);
  report.cpu.nodeVm.push(benchmark(processor, topology, { shape: 'corridor', layers, sampleRateHz: 48000 }));
}
report.resourceAccounting = collectResourceAccounting();
report.subcellContact = measureSubcellResponse(makeTopology('corridor', 12));
report.cpu.chromeMainThreadProxy = await chromeProxy();
await mkdir(resolve(outputPath, '..'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: outputPath, cases: report.cases.length,
  nodeVmCases: report.cpu.nodeVm.length, chromeProxy: report.cpu.chromeMainThreadProxy?.available ?? false }, null, 2));

function runStabilityCase({ shape, layers, sampleRateHz }) {
  const topology = makeTopology(shape, layers);
  const processor = instantiate(workletSource, sampleRateHz);
  install(processor, topology);
  const beforeBytes = typedArrayBytes(topology);
  const strike = { type: 'strike', payload: { plateId: topology.layerIds.at(-1),
    layerId: topology.layerIds.at(-1), position: shape === 'full' ? { x: .5, y: .5 } : { x: .5, y: .49 },
    strength: .035, footprintRadius: .009 } };
  processor.handleMessage(strike);
  const initialEnergy = stateEnergy(processor, topology);
  const seconds = shape === 'full' ? .12 : .25;
  const frames = Math.ceil(sampleRateHz * seconds);
  const { output, elapsedMs, outputStats } = render(processor, frames);
  const excitationPhysical = physicalEnergy(processor, topology);
  const afterExcitationEnergy = stateEnergy(processor, topology);
  const tailFrames = Math.ceil(sampleRateHz * .25);
  const shortTailEnergyRange = shape === 'corridor' && layers === 12 && sampleRateHz === 48000
    ? { min: Infinity, max: -Infinity, samples: 0 } : null;
  const tail = render(processor, tailFrames, shortTailEnergyRange ? () => {
    const e = physicalEnergy(processor, topology).total;
    shortTailEnergyRange.min = Math.min(shortTailEnergyRange.min, e);
    shortTailEnergyRange.max = Math.max(shortTailEnergyRange.max, e);
    shortTailEnergyRange.samples++;
  } : null);
  if (shortTailEnergyRange) {
    shortTailEnergyRange.min = round(shortTailEnergyRange.min);
    shortTailEnergyRange.max = round(shortTailEnergyRange.max);
  }
  const tailPhysical = physicalEnergy(processor, topology);
  const tailEnergy = stateEnergy(processor, topology);
  const diagnostics = processor.getDiagnostics();
  const all = [...output, ...tail.output];
  return {
    shape, layers, sampleRateHz,
    topology: { nodeCount: topology.nodeGridIndices.length, activeMaskCells: topology.nodeGridIndices.length,
      sourceMaskCellsPerLayer: shape === 'full' ? 9216 : 520, overlapCells96: countMultiLayerCells(topology),
      actualAdjacentLinks: topology.adjacentLinkCoefficients.length, typedArrayBytes: beforeBytes,
      workletStateTypedArrayBytes: directTypedArrayBytes(processor),
      nodules: topology.nodules.map((nodule, index) => ({ id: nodule.id, physicalRadiusMeters: nodule.physicalRadiusMeters,
        material: nodule.material, burial: nodule.burial,
        foundationPlateId: topology.layerIds[topology.noduleFoundationLayerIndices[index]],
        foundationNode: topology.noduleCouplingNodeIndices[index], couplingWeight: topology.noduleCouplingWeights[index] })),
      maxSphereModesAvailable: processor.sphereCurrent.length, noduleCount: processor.noduleIds.length },
    excitation: { groupedFootImpulse: .035, frames, wallMs: round(elapsedMs), initialStateEnergy: round(initialEnergy),
      postExcitationStateEnergy: round(afterExcitationEnergy), ...outputStats },
    tail: { frames: tailFrames, postTailStateEnergy: round(tailEnergy), energyRatioToPostExcitation: ratio(tailEnergy, afterExcitationEnergy),
      physicalEnergyEstimator: { afterExcitation: excitationPhysical, afterTail: tailPhysical, shortTailRange: shortTailEnergyRange,
        disclaimer: 'Discrete diagnostic estimator; damping, leapfrog cross-strain terms, sleeping cutoffs and coupling proxies mean it is not a full continuum conservation proof.' },
      ...tail.outputStats },
    checks: { finiteArrays: all.every(Number.isFinite) && finiteState(processor), noNonFiniteTelemetry: diagnostics.nonFinite === 0,
      noClipping: diagnostics.clipped === 0, noDroppedStrikes: diagnostics.dropped === 0,
      outputPeakAbs: round(Math.max(...all.map(Math.abs))), dcMeanL: round(mean(all.filter((_, i) => (i & 1) === 0))),
      dcMeanR: round(mean(all.filter((_, i) => (i & 1) === 1))) },
    diagnostics
  };
}

function makeTopology(shape, count, noduleCount = 1) {
  const plates = Array.from({ length: count }, (_, index) => {
    const mask = new Array(96 * 96).fill(0);
    if (shape === 'full') mask.fill(1);
    else {
      for (let y = 8; y < 88; y++) {
        const cx = 48 + Math.round((y - 48) * .27);
        for (let x = cx - 1; x <= cx + 1; x++) mask[y * 96 + x] = 1;
        if (y > 42 && y < 57) for (let x = 38; x <= 57; x++) mask[y * 96 + x] = 1;
      }
    }
    return { id: `synthetic-${shape}-${index}`, grid: { width: 96, height: 96 }, mask, edges: [],
      pickups: shape === 'full' ? [{ x: .5, y: .1 }, { x: .5, y: .9 }]
        : [{ x: 37 / 95, y: 9 / 95 }, { x: 58 / 95, y: 85 / 95 }],
      material: { stiffness: .9, density: 1.1, damping: .35 } };
  });
  const nodules = Array.from({ length: noduleCount }, (_, index) => ({ id: `synthetic-nodule-${shape}-${count}-${index}`,
    position: { x: .5, y: .5 }, physicalRadiusMeters: .024,
    material: { density: 2000, youngModulus: 800000, poisson: .3, damping: .35 }, burial: { buriedDepthMeters: .04 },
    coupling: { plateId: plates[0].id, weight: .2, position: { x: .5, y: .5 } } }));
  return compileSurfaceTopology({ plates, nodules, stratigraphy: { layerOrder: plates.map(plate => plate.id) }, generation: 1 });
}

function collectResourceAccounting() {
  const rows = report.cases.filter(item => item.sampleRateHz === 48000)
    .map(item => ({ shape: item.shape, layers: item.layers, nodes: item.topology.nodeCount,
      topologyTypedArrayBytes: item.topology.typedArrayBytes, workletStateTypedArrayBytes: item.topology.workletStateTypedArrayBytes,
      awakeNodesAfterTail: item.diagnostics.activeNodes,
      sleepingLayersAfterTail: item.diagnostics.sleepingLayers }));
  for (const shape of ['full', 'corridor']) {
    const topology = makeTopology(shape, 256);
    const processor = instantiate(workletSource, 48000); install(processor, topology);
    rows.push({ shape, layers: 256, nodes: topology.nodeGridIndices.length,
      topologyTypedArrayBytes: typedArrayBytes(topology), workletStateTypedArrayBytes: directTypedArrayBytes(processor),
      compiledOnly: true, note: 'No all-awake 256-layer runtime claim; sleep/wake and device-specific workload remain separate.' });
  }
  const capTopology = makeTopology('corridor', 12, 32);
  const capProcessor = instantiate(workletSource, 48000); install(capProcessor, capTopology);
  rows.push({ shape: 'corridor', layers: 12, nodules: capTopology.noduleIds.length,
    allocatedSphereModes: capProcessor.sphereCurrent.length, integratedSphereModes: capProcessor.getDiagnostics().integratedSphereModes,
    topologyTypedArrayBytes: typedArrayBytes(capTopology), workletStateTypedArrayBytes: directTypedArrayBytes(capProcessor),
    cap: '32 nodules / 384 modal states' });
  return { byteDefinition: 'Sum of byteLength for compiler topology typed arrays and direct worklet typed arrays; excludes JS object/array overhead, audio engine buffers and browser process memory.',
    capRationale: '256 is a technical history safety ceiling. Frozen history is retained without eviction; compilation and storage at the ceiling do not assert that all 256 full masks stay awake or meet real-time deadlines.',
    cases: rows };
}

function measureSubcellResponse(topology) {
  const offsetsSolverCells = [-0.5, -0.25, 0, 0.25, 0.5];
  const center = { x: .5, y: .49 };
  const responses = offsetsSolverCells.map(offset => {
    const processor = instantiate(workletSource, 48000); install(processor, topology);
    const position = { x: center.x + offset / 31, y: center.y };
    processor.handleMessage({ type: 'strike', payload: { plateId: topology.layerIds.at(-1), position, strength: .035, footprintRadius: .009 } });
    let excitationKineticProxy = 0, maxAbsImpulseVelocity = 0;
    for (let node = 0; node < processor.previous.length; node++) {
      const velocity = -processor.previous[node], layer = findLayer(topology, node);
      const density = topology.materialCoefficients[layer * 4 + 2];
      excitationKineticProxy += .5 * density * velocity * velocity;
      maxAbsImpulseVelocity = Math.max(maxAbsImpulseVelocity, Math.abs(velocity));
    }
    return { offsetSolverCells: offset, position, accepted: processor.getDiagnostics().strikes === 1,
      excitationKineticProxy: round(excitationKineticProxy), maxAbsImpulseVelocity: round(maxAbsImpulseVelocity),
      finiteAndBounded: finiteState(processor) && maxAbsImpulseVelocity <= .05 / Math.sqrt(.5) };
  });
  const values = responses.map(item => item.excitationKineticProxy);
  return { strength: .035, footprintRadius: .009, responses,
    rangeRatioMaxToMin: ratio(Math.max(...values), Math.min(...values)),
    interpretation: 'Five within-cell synthetic foot-contact offsets verify finite, bounded quadrature response. This is a contact-energy proxy, not a measured biological force or acoustic-energy conservation proof.' };
}

function instantiate(source, rate) {
  let Processor;
  class AudioWorkletProcessor { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  vm.runInNewContext(source, { AudioWorkletProcessor, sampleRate: rate, Float32Array, Uint8Array, Uint16Array, Uint32Array,
    Int8Array, Int16Array, Int32Array, Array, Math, Number, Object, performance, registerProcessor: (_name, type) => { Processor = type; } });
  return new Processor();
}
function install(processor, topology) { processor.handleMessage({ type: 'topology', payload: topology }); }
function render(processor, frames, onQuantum = null) {
  const quantum = 128, left = new Float32Array(quantum), right = new Float32Array(quantum), output = [];
  const start = performance.now();
  for (let i = 0; i < frames; i += quantum) {
    processor.process([], [[left, right]]);
    onQuantum?.();
    for (let j = 0; j < Math.min(quantum, frames - i); j++) output.push(left[j], right[j]);
  }
  const elapsedMs = performance.now() - start;
  return { output, elapsedMs, outputStats: stats(output) };
}
function benchmark(processor, topology, metadata) {
  processor.handleMessage({ type: 'strike', payload: { plateId: topology.layerIds.at(-1), position: { x: .5, y: .5 }, strength: .035, footprintRadius: .009 } });
  const left = new Float32Array(128), right = new Float32Array(128), times = [];
  for (let i = 0; i < 8; i++) processor.process([], [[left, right]]);
  for (let i = 0; i < 40; i++) { const start = performance.now(); processor.process([], [[left, right]]); times.push(performance.now() - start); }
  times.sort((a, b) => a - b);
  const budgetMs = 128 / metadata.sampleRateHz * 1000;
  return { ...metadata, activeNodes: processor.getDiagnostics().activeNodes, sleepingLayers: processor.getDiagnostics().sleepingLayers,
    quantumBudgetMs: round(budgetMs), p50Ms: round(percentile(times, .5)), p95Ms: round(percentile(times, .95)), maxMs: round(times.at(-1)),
    p95BudgetRatio: round(percentile(times, .95) / budgetMs), maxBudgetRatio: round(times.at(-1) / budgetMs),
    typedArrayBytes: typedArrayBytes(topology), disclaimer: 'Node VM timing only; not AudioWorklet realtime performance.' };
}
async function chromeProxy() {
  let browser;
  try {
    const topologies = layerCounts.map(count => makeTopology('corridor', count));
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined });
    const page = await browser.newPage();
    return await page.evaluate(({ source, rates, topologies }) => {
      const Base = class { constructor() { this.port = { onmessage: null, postMessage() {} }; } };
      const instantiateInPage = (rate, topology) => {
        let Processor;
        new Function('AudioWorkletProcessor', 'sampleRate', 'registerProcessor', source)(Base, rate, (_name, type) => { Processor = type; });
        const processor = new Processor();
        processor.handleMessage({ type: 'topology', payload: topology });
        processor.handleMessage({ type: 'strike', payload: { plateId: topology.layerIds.at(-1), position: { x: .5, y: .49 }, strength: .035, footprintRadius: .009 } });
        return processor;
      };
      const times = [];
      for (const rate of rates) for (const topology of topologies) {
        const processor = instantiateInPage(rate, topology);
        const left = new Float32Array(128), right = new Float32Array(128), samples = [];
        for (let i = 0; i < 8; i++) processor.process([], [[left, right]]);
        for (let i = 0; i < 80; i++) { const start = performance.now(); processor.process([], [[left, right]]); samples.push(performance.now() - start); }
        samples.sort((a,b)=>a-b);
        const diagnostics = processor.getDiagnostics();
        times.push({ sampleRateHz: rate, layers: topology.layerIds.length, activeNodes: diagnostics.activeNodes,
          quantumBudgetMs: 128/rate*1000,
          p50Ms: samples[40], p95Ms: samples[76], maxMs: samples.at(-1),
          nonFinite: diagnostics.nonFinite, clipped: diagnostics.clipped,
          mode: 'Chrome main-thread JS proxy with compiled narrow-trail topology and live solver.' });
      }
      return { available: true, userAgent: navigator.userAgent, cases: times,
        disclaimer: 'Chrome main-thread JavaScript proxy only; not an AudioWorklet scheduling or realtime guarantee.' };
    }, { source: workletSource, rates, topologies });
  } catch (error) {
    return { available: false, error: String(error), disclaimer: 'Chrome proxy unavailable in this environment; Node VM results remain diagnostic only.' };
  } finally { await browser?.close(); }
}
function stateEnergy(processor, topology) {
  let energy = 0;
  for (let i = 0; i < processor.current.length; i++) {
    const layer = findLayer(topology, i), density = topology.materialCoefficients[layer * 4 + 2];
    const v = processor.current[i] - processor.previous[i];
    energy += density * (processor.current[i] ** 2 + v ** 2);
  }
  for (let i = 0; i < processor.sphereCurrent.length; i++) energy += processor.sphereCurrent[i] ** 2 + (processor.sphereCurrent[i] - processor.spherePrevious[i]) ** 2;
  return energy;
}
function physicalEnergy(processor, topology) {
  const u = processor.current, p = processor.previous;
  let kinetic = 0, bending = 0, tension = 0, adjacentSpring = 0;
  let modalKinetic = 0, modalPotential = 0, foundationSpring = 0;
  for (let node = 0; node < u.length; node++) {
    const layer = findLayer(topology, node), mi = layer * 4;
    const density = topology.materialCoefficients[mi + 2], bend = topology.materialCoefficients[mi];
    const tautness = topology.materialCoefficients[mi + 1], vel = u[node] - p[node];
    kinetic += .5 * density * vel * vel;
    let lap = -4 * u[node];
    for (let d = 0; d < 4; d++) {
      const other = topology.neighborIndices[node * 4 + d];
      if (other < 0) continue;
      lap += u[other];
      if (other > node) tension += .5 * tautness * (u[node] - u[other]) ** 2;
    }
    bending += .5 * density * bend * lap * lap;
  }
  for (let q = 0; q < topology.adjacentLinkCoefficients.length; q++) {
    const node = topology.adjacentLinkNodes[q * 2], other = topology.adjacentLinkNodes[q * 2 + 1];
    adjacentSpring += .5 * topology.adjacentLinkCoefficients[q] * (u[node] - u[other]) ** 2;
  }
  for (let n = 0; n < processor.noduleIds.length; n++) {
    let modalContact = 0;
    for (let m = 0; m < 12; m++) {
      const i = n * 12 + m, displacement = processor.sphereCurrent[i];
      const velocity = displacement - processor.spherePrevious[i], dampingRadius = processor.sphereRadius[i];
      if (!dampingRadius) continue;
      const cosOmega = Math.max(-1, Math.min(1, processor.sphereCos[i] / (2 * dampingRadius)));
      const mass = processor.sphereMass[n];
      modalKinetic += .5 * mass * velocity * velocity;
      modalPotential += .5 * mass * (2 - 2 * cosOmega) * displacement * displacement;
      modalContact += processor.sphereFoundationShape[i] * displacement;
    }
    const foundation = processor.sphereFoundation[n];
    if (foundation !== 0xffffffff && foundation < u.length) {
      foundationSpring += .5 * processor.sphereWeight[n] * .000025
        * (u[foundation] - modalContact) ** 2;
    }
  }
  // This sum uses the compiler's symmetric per-node adjacency CSR once per link.
  const links = { kinetic, bending, tension, adjacentSpring, modalKinetic, modalPotential, foundationSpring };
  return { ...Object.fromEntries(Object.entries(links).map(([key, value]) => [key, round(value)])),
    total: round(Object.values(links).reduce((sum, value) => sum + value, 0)) };
}
function findLayer(topology, node) { let lo = 0; while (topology.nodeOffsets[lo + 1] <= node && lo < topology.layerIds.length - 1) lo++; return lo; }
function typedArrayBytes(value) { let bytes = 0; for (const item of Object.values(value)) if (ArrayBuffer.isView(item)) bytes += item.byteLength; return bytes; }
function directTypedArrayBytes(value) { let bytes = 0; for (const item of Object.values(value)) if (ArrayBuffer.isView(item)) bytes += item.byteLength; return bytes; }
function finiteState(processor) { return [...processor.current, ...processor.previous, ...processor.sphereCurrent, ...processor.spherePrevious].every(Number.isFinite); }
function countMultiLayerCells(topology) { let count = 0; for (const value of topology.sourceLayerCountByCell96) if (value > 1) count++; return count; }
function stats(values) { let peak = 0, sum = 0, clips = 0; for (const value of values) { peak = Math.max(peak, Math.abs(value)); sum += value; if (Math.abs(value) > 1) clips++; } return { peakAbs: round(peak), rms: round(Math.sqrt(values.reduce((s, v) => s + v * v, 0) / Math.max(1, values.length))), clipSamples: clips }; }
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function ratio(a,b) { return b > 0 ? round(a / b) : null; }
function percentile(sorted, q) { return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))]; }
function round(value) { return Number.isFinite(value) ? Number(value.toFixed(8)) : null; }
