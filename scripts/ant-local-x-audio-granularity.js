import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ANALYSIS = resolve(ROOT, 'docs/ant/evidence/2026-11-01-local-x-audio-reassessment/analysis');
const SOURCE_GRID = 96, SOLVER_GRID = 32, RATE = 48_000, FRAMES = 12_288;
const MATERIAL = { stiffness: .9, density: 1.1, damping: .35 };
const sha = value => createHash('sha256').update(value).digest('hex');

function unpack(value) {
  if (Array.isArray(value)) return value.map(unpack);
  if (!value || typeof value !== 'object') return value;
  if (value.__typedArray) {
    const types = { Uint8Array, Uint16Array, Uint32Array, Int16Array, Int32Array, Float32Array, Float64Array };
    const Type = types[value.__typedArray]; assert.ok(Type, `known capture type ${value.__typedArray}`);
    const bytes = Buffer.from(value.data, 'base64');
    assert.equal(bytes.byteLength, value.length * Type.BYTES_PER_ELEMENT);
    return new Type(Uint8Array.from(bytes).buffer);
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, unpack(child)]));
}

async function readCapture(seed, arm) {
  const path = resolve(ANALYSIS, `seed-${seed}-${arm}-capture.json.gz`);
  return JSON.parse(gunzipSync(await readFile(path)).toString('utf8'));
}

function makeDescriptor(id, mask, pickups = [{ x: .5, y: .5 }, { x: .5, y: .5 }]) {
  return { id, grid: { width: SOURCE_GRID, height: SOURCE_GRID }, mask, edges: [], pickups, material: MATERIAL };
}

function topologyFor(plate) {
  return compileSurfaceTopology({ plates: [plate], stratigraphy: { layerOrder: [plate.id] }, generation: 1 });
}

function instantiate(source) {
  let Processor;
  class Stub { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  vm.runInNewContext(source, { AudioWorkletProcessor: Stub, sampleRate: RATE, Float32Array, Float64Array, Uint8Array,
    Uint16Array, Uint32Array, Int16Array, Int32Array, Array, Math, Number, Object, Map, performance: globalThis.performance,
    registerProcessor(_name, type) { Processor = type; } });
  return new Processor();
}

function isolatedImpulse(source, plate, sourceCell, strength = .035) {
  const topology = topologyFor(plate), processor = instantiate(source);
  processor.handleMessage({ type: 'topology', payload: topology });
  const x = sourceCell % SOURCE_GRID, y = Math.floor(sourceCell / SOURCE_GRID);
  processor.handleMessage({ type: 'strike', payload: { plateId: plate.id, layerId: plate.id,
    position: { x: x / (SOURCE_GRID - 1), y: y / (SOURCE_GRID - 1) }, strength, footprintRadius: .012 } });
  assert.equal(processor.getDiagnostics().strikes, 1, `accepted isolated impulse ${plate.id}`);
  const left = new Float32Array(128), right = new Float32Array(128), pcm = Buffer.alloc(FRAMES * 2 * 4);
  for (let frame = 0; frame < FRAMES; frame += 128) {
    processor.process([], [[left, right]]);
    for (let i = 0; i < 128; i++) { pcm.writeFloatLE(left[i], (frame + i) * 8); pcm.writeFloatLE(right[i], (frame + i) * 8 + 4); }
  }
  assert.equal(processor.getDiagnostics().droppedRoutes, 0);
  return { pcmSha256: sha(pcm), samplesPerChannel: FRAMES,
    peakAbs: maxAbs(pcm), rms: pcmRms(pcm), diagnostics: processor.getDiagnostics() };
}

function maxAbs(pcm) { let peak = 0; for (let i = 0; i < pcm.length; i += 4) peak = Math.max(peak, Math.abs(pcm.readFloatLE(i))); return peak; }
function pcmRms(pcm) { let sum = 0, count = 0; for (let i = 0; i < pcm.length; i += 4) { const v = pcm.readFloatLE(i); sum += v * v; count++; } return Math.sqrt(sum / count); }

function translatePlate(plate, dx, dy) {
  const mask = new Uint8Array(SOURCE_GRID * SOURCE_GRID);
  for (let cell = 0; cell < plate.mask.length; cell++) if (plate.mask[cell]) {
    const x = cell % SOURCE_GRID + dx, y = Math.floor(cell / SOURCE_GRID) + dy;
    if (x < 0 || x >= SOURCE_GRID || y < 0 || y >= SOURCE_GRID) return null;
    mask[y * SOURCE_GRID + x] = 1;
  }
  const pickups = plate.pickups.map(pickup => ({ x: pickup.x + dx / (SOURCE_GRID - 1), y: pickup.y + dy / (SOURCE_GRID - 1) }));
  if (pickups.some(p => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return null;
  return { ...plate, mask, pickups };
}

function componentCount(topology) {
  const count = topology.nodeGridIndices.length, seen = new Uint8Array(count); let components = 0;
  for (let start = 0; start < count; start++) if (!seen[start]) {
    components++; seen[start] = 1; const stack = [start];
    while (stack.length) { const node = stack.pop(); for (let d = 0; d < 4; d++) {
      const next = topology.neighborIndices[node * 4 + d]; if (next >= 0 && !seen[next]) { seen[next] = 1; stack.push(next); }
    } }
  }
  return components;
}

function geometrySummary(topology) {
  const cells = Array.from(topology.nodeGridIndices), minX = Math.min(...cells.map(v => v % SOLVER_GRID));
  const minY = Math.min(...cells.map(v => Math.floor(v / SOLVER_GRID)));
  const relative = cells.map(v => [v % SOLVER_GRID - minX, Math.floor(v / SOLVER_GRID) - minY])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return { nodes: cells.length, components4: componentCount(topology), absoluteCells: cells,
    relativeGeometrySha256: sha(JSON.stringify(relative)), pickupNodes: Array.from(topology.pickupNodeIndices),
    pickupsCoincident: topology.pickupNodeIndices[0] === topology.pickupNodeIndices[1] };
}

function staticGraph(topology) {
  const count = topology.nodeGridIndices.length, adjacency = Array.from({ length: count }, () => []);
  for (let i = 0; i < count; i++) for (let d = 0; d < 4; d++) {
    const j = topology.neighborIndices[i * 4 + d]; if (j >= 0 && i < j) { adjacency[i].push(j); adjacency[j].push(i); }
  }
  for (let i = 0; i < topology.adjacentLinkCoefficients.length; i++) {
    const a = topology.adjacentLinkNodes[i * 2], b = topology.adjacentLinkNodes[i * 2 + 1];
    adjacency[a].push(b); adjacency[b].push(a);
  }
  const pickup = new Uint8Array(count);
  for (const node of topology.pickupNodeIndices) if (node !== 0xffffffff) pickup[node] = 1;
  const seen = new Uint8Array(count), components = [];
  for (let start = 0; start < count; start++) if (!seen[start]) {
    seen[start] = 1; const stack = [start], nodes = []; let hasPickup = false;
    while (stack.length) { const node = stack.pop(); nodes.push(node); hasPickup ||= Boolean(pickup[node]);
      for (const next of adjacency[node]) if (!seen[next]) { seen[next] = 1; stack.push(next); } }
    components.push({ nodes: nodes.length, hasPickup });
  }
  return { plateNodes: count, fourNeighborEdges: topology.neighborIndices.reduce((s, v) => s + Number(v >= 0), 0) / 2,
    zEdges: topology.adjacentLinkCoefficients.length, pickupVertices: Array.from(topology.pickupNodeIndices).filter(v => v !== 0xffffffff).length,
    components, componentsWithoutPickup: components.filter(c => !c.hasPickup).length,
    excludesNoduleModes: true, disclaimer: 'Static readout reachability only; not a counterfactual causal contribution estimate.' };
}

export function assertGranularityHelpers() {
  const source = readFileSync(new URL('../static/worklets/surface-plate.worklet.js', import.meta.url), 'utf8');
  const mask = new Uint8Array(96 * 96); mask[40 * 96 + 40] = 1;
  const plate = makeDescriptor('fixture', mask, [{ x: 40 / 95, y: 40 / 95 }, { x: 40 / 95, y: 40 / 95 }]);
  const a = isolatedImpulse(source, plate, 40 * 96 + 40), b = isolatedImpulse(source, plate, 40 * 96 + 40);
  assert.equal(a.pcmSha256, b.pcmSha256, 'same one-node fixture renders deterministic PCM');
  assert.equal(geometrySummary(topologyFor(plate)).nodes, 1);
  assert.equal(staticGraph(topologyFor(plate)).componentsWithoutPickup, 0);
  assert.equal(translatePlate(plate, 1, 1).mask[41 * 96 + 41], 1);
}

async function run(outputPath = resolve(ANALYSIS, 'granularity-probe.json')) {
  const worklet = await readFile(resolve(ROOT, 'static/worklets/surface-plate.worklet.js'), 'utf8');
  const output = { schema: 'ant-local-x-audio-granularity-v1', protocol: {
    scope: 'Frozen six native captures; isolated current-worklet diagnostics only. No world or production source mutation.',
    nativeReplay: false, audibilityClaim: false, proxy: 'fixed-strength isolated native PCM; no RMS matching',
    impulse: { strength: .035, footprintRadius: .012, frames: FRAMES, sampleRate: RATE },
    registration: 'translate full 96-grid mask and pickups by integer offsets, keeping relative source geometry and material fixed; isolated diagnostic only.' },
    source: { compilerSha256: sha(await readFile(resolve(ROOT, 'src/lib/audio/compileSurfaceTopology.js'))),
      workletSha256: sha(worklet) }, worlds: [] };
  for (const seed of ['20261005', '20261006', '20261007']) for (const arm of ['control', 'replacement']) {
    const capture = await readCapture(seed, arm);
    const last = capture.topologyStates.at(-1), state = unpack(last.state);
    const topology = compileSurfaceTopology({ plates: state.plates, nodules: state.nodules,
      stratigraphy: state.stratigraphy, generation: state.revision });
    const byId = new Map(state.plates.map((plate, index) => [plate.id, index]));
    const metrics = state.plates.map((plate, index) => {
      const layer = topology.layerIds.indexOf(plate.id), start = topology.nodeOffsets[layer], end = topology.nodeOffsets[layer + 1];
      const coarse = Array.from(topology.nodeGridIndices.subarray(start, end));
      const minX = Math.min(...coarse.map(v => v % SOLVER_GRID)), minY = Math.min(...coarse.map(v => Math.floor(v / SOLVER_GRID)));
      const relative = coarse.map(v => [v % SOLVER_GRID - minX, Math.floor(v / SOLVER_GRID) - minY]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
      const absolute = sha(JSON.stringify(coarse)), normalized = sha(JSON.stringify(relative));
      const pickups = Array.from(topology.pickupNodeIndices.subarray(layer * 2, layer * 2 + 2));
      return { id: plate.id, bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs ?? null, provenance: plate.provenance?.kind ?? 'production',
        sourceMaskCells: plate.mask.reduce((sum, bit) => sum + Number(bit === 1), 0), nodes: end - start,
        components4: countLayerComponents(topology, layer), components8: countLayerComponents8(topology, layer),
        absoluteGeometrySha256: absolute, normalizedGeometrySha256: normalized,
        pickupCells: pickups.map(node => topology.nodeGridIndices[node]), pickupsCoincident: pickups[0] === pickups[1] };
    });
    const local = state.plates.filter(p => p.provenance?.kind === 'research-local-singleton-X');
    const firstX = local.filter(p => p.mask.reduce((n, bit) => n + Number(bit === 1), 0) === 2)
      .sort((a,b) => (a.bornAtSimulationTimeMs ?? 0) - (b.bornAtSimulationTimeMs ?? 0))[0] ?? null;
    const firstOne = state.plates.filter(p => metrics[byId.get(p.id)].nodes === 1)
      .sort((a,b) => (a.bornAtSimulationTimeMs ?? 0) - (b.bornAtSimulationTimeMs ?? 0))[0] ?? null;
    const singletons = state.plates.filter(p => metrics[byId.get(p.id)].nodes === 1);
    const oneNodeComparisons = firstOne ? singletons.map(p => ({ id: p.id,
      bornAtSimulationTimeMs: p.bornAtSimulationTimeMs ?? null, ...isolatedImpulse(worklet, p, p.mask.findIndex(Boolean)) })) : [];
    const canonicalOneNode = firstOne ? (() => {
      const cell = firstOne.mask.findIndex(Boolean), mask = new Uint8Array(SOURCE_GRID * SOURCE_GRID); mask[cell] = 1;
      const x = cell % SOURCE_GRID, y = Math.floor(cell / SOURCE_GRID);
      const point = { x: x / 95, y: y / 95 }, descriptor = makeDescriptor('canonical-one-node', mask, [point, point]);
      descriptor.material = firstOne.material;
      return isolatedImpulse(worklet, descriptor, cell);
    })() : null;
    const registration = [];
    if (firstX) for (let dy = 0; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) {
      const shifted = translatePlate(firstX, dx, dy); if (!shifted) continue;
      const topo = topologyFor(shifted), shape = geometrySummary(topo), sourceCell = shifted.mask.findIndex(Boolean);
      registration.push({ dx, dy, sourceCell, ...shape, ...isolatedImpulse(worklet, shifted, sourceCell) });
    }
    output.worlds.push({ seed, arm, capturedAtTick: last.tick, plateCount: state.plates.length,
      nodeCount: topology.nodeGridIndices.length, fourNeighborEdges: topology.neighborIndices.reduce((s,v)=>s+Number(v>=0),0)/2,
      zEdges: topology.adjacentLinkCoefficients.length, geometryCensus: summarize(metrics), plates: metrics,
      firstTwoSourceCellLocalX: firstX?.id ?? null,
      isolatedOneNode: { count: oneNodeComparisons.length, comparisons: oneNodeComparisons,
        canonicalReference: canonicalOneNode,
        allPCMEqualToCanonical: Boolean(canonicalOneNode) && oneNodeComparisons.length > 0
          && oneNodeComparisons.every(row => row.pcmSha256 === canonicalOneNode.pcmSha256) },
      registrationSensitivity: registration, staticGraph: staticGraph(topology) });
  }
  output.allWorldsCensus = summarize(output.worlds.flatMap(world => world.plates));
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ output: outputPath, worlds: output.worlds.length,
    descriptors: output.worlds.reduce((n,w)=>n+w.plateCount,0) }));
}

function countLayerComponents(topology, layer) {
  const start = topology.nodeOffsets[layer], end = topology.nodeOffsets[layer + 1], seen = new Uint8Array(end - start); let components = 0;
  for (let first = start; first < end; first++) if (!seen[first-start]) {
    components++; seen[first-start] = 1; const stack = [first];
    while (stack.length) { const node = stack.pop(); for (let d=0; d<4; d++) { const next=topology.neighborIndices[node*4+d];
      if (next>=start && next<end && !seen[next-start]) { seen[next-start]=1; stack.push(next); } } }
  }
  return components;
}
function countLayerComponents8(topology, layer) {
  const start=topology.nodeOffsets[layer], end=topology.nodeOffsets[layer+1], local=new Set(Array.from(topology.nodeGridIndices.subarray(start,end))), seen=new Set(); let n=0;
  for (const cell of local) if (!seen.has(cell)) { n++; seen.add(cell); const stack=[cell]; while(stack.length) { const q=stack.pop(), x=q%32, y=Math.floor(q/32);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,r=ny*32+nx;if(nx>=0&&nx<32&&ny>=0&&ny<32&&local.has(r)&&!seen.has(r)){seen.add(r);stack.push(r);}} } }
  return n;
}
function summarize(rows) {
  const groups = key => { const map = new Map(); for (const row of rows) map.set(row[key], (map.get(row[key]) || 0) + 1);
    return [...map].filter(([, count]) => count > 1).map(([sha256,count]) => ({ sha256, count })); };
  const sorted = rows.map(row=>row.nodes).sort((a,b)=>a-b), at=q=>sorted[Math.floor((sorted.length-1)*q)] ?? null;
  return { descriptors: rows.length, solverNodeQuantiles: { p0: at(0), p25: at(.25), p50: at(.5), p75: at(.75), p90: at(.9), p100: at(1) },
    oneNode: rows.filter(row=>row.nodes===1).length, coincidentPickups: rows.filter(row=>row.pickupsCoincident).length,
    absoluteDuplicateGeometryGroups: groups('absoluteGeometrySha256'), translationNormalizedDuplicateGeometryGroups: groups('normalizedGeometrySha256'),
    components8Vs4: rows.filter(row=>row.components8!==row.components4).length,
    coarseComponents4Total: rows.reduce((sum,row)=>sum+row.components4,0), coarseComponents8Total: rows.reduce((sum,row)=>sum+row.components8,0) };
}

if (process.argv.includes('--self-check')) assertGranularityHelpers();
else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf('--output');
  await run(outputIndex >= 0 ? resolve(process.argv[outputIndex + 1]) : undefined);
}
