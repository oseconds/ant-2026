import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-local-x-audio-reassessment/analysis');
const WINDOWS = [[50, 60], [110, 120], [170, 180], [230, 240], [290, 300]];
const TYPES = { Uint8Array, Uint16Array, Uint32Array, Int16Array, Int32Array, Float32Array, Float64Array };

function unpack(value) {
  if (Array.isArray(value)) return value.map(unpack);
  if (!value || typeof value !== 'object') return value;
  if (value.__typedArray) {
    const Type = TYPES[value.__typedArray]; assert.ok(Type, `known packed type: ${value.__typedArray}`);
    const bytes = Buffer.from(value.data, 'base64');
    assert.equal(bytes.length, value.length * Type.BYTES_PER_ELEMENT, 'packed typed array byte length');
    return new Type(Uint8Array.from(bytes).buffer);
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, unpack(child)]));
}

async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function gzipJson(path) { return JSON.parse(gunzipSync(await readFile(path)).toString('utf8')); }
const keyOf = (seed, arm) => `${seed}/${arm}`;
const layerCount = (topology, index) => topology.nodeOffsets[index + 1] - topology.nodeOffsets[index];

export function graphSummary(topology) {
  const layerN = topology.layerIds.length, zDegrees = new Uint32Array(layerN), pairs = new Map();
  for (let i = 0; i < topology.adjacentLinkCoefficients.length; i++) {
    if (!(topology.adjacentLinkCoefficients[i] > 0)) continue;
    const a = topology.adjacentLinkNodes[i * 2], b = topology.adjacentLinkNodes[i * 2 + 1];
    const aLayer = findLayer(topology.nodeOffsets, a), bLayer = findLayer(topology.nodeOffsets, b);
    if (aLayer === bLayer) continue;
    zDegrees[aLayer]++; zDegrees[bLayer]++;
    const key = [topology.layerIds[aLayer], topology.layerIds[bLayer]].sort().join('\0');
    pairs.set(key, (pairs.get(key) || 0) + 1);
  }
  const adjacency = Array.from({ length: layerN }, () => new Set());
  for (const key of pairs.keys()) { const [a, b] = key.split('\0'), i = topology.layerIds.indexOf(a), j = topology.layerIds.indexOf(b); adjacency[i].add(j); adjacency[j].add(i); }
  const seen = new Set(), components = [];
  for (let i = 0; i < layerN; i++) if (!seen.has(i)) {
    const stack = [i], members = []; seen.add(i);
    while (stack.length) { const v = stack.pop(); members.push(topology.layerIds[v]); for (const n of adjacency[v]) if (!seen.has(n)) { seen.add(n); stack.push(n); } }
    components.push(members);
  }
  return { zDegrees: Object.fromEntries(topology.layerIds.map((id, i) => [id, zDegrees[i]])),
    zBridges: [...pairs].map(([key, links]) => ({ layers: key.split('\0'), links })), components,
    isolatedLayers: components.flatMap(c => c.length === 1 && !(adjacency[topology.layerIds.indexOf(c[0])].size) ? c : []) };
}
function findLayer(offsets, node) {
  let lo = 0, hi = offsets.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (offsets[mid] <= node) lo = mid; else hi = mid; }
  return lo;
}

function exposedSourceCells(plate, state, layerIndex) {
  const top = state.stratigraphy.topLayerByCell; let exposed = 0, occupied = 0;
  for (let i = 0; i < plate.mask.length; i++) if (plate.mask[i]) { occupied++; if (top[i] === layerIndex) exposed++; }
  return { occupied, exposed, exposedFraction: occupied ? exposed / occupied : null };
}

function strikesByLayer(schedule) {
  const events = schedule.events.filter(e => e.message?.type === 'strike');
  for (let i = 1; i < events.length; i++) assert.ok(events[i - 1].frame <= events[i].frame, 'strikes ordered by frame');
  return events;
}

export function countScheduleStrikesInWindow(events, startSeconds, endSeconds, layerIds = null) {
  assert.ok(Number.isFinite(startSeconds) && Number.isFinite(endSeconds) && startSeconds < endSeconds, 'valid half-open window');
  const allowed = layerIds ? new Set(layerIds) : null, counts = new Map();
  for (const event of events) if (event.message?.type === 'strike'
    && event.frame >= startSeconds * 48_000 && event.frame < endSeconds * 48_000) {
    const id = event.message.payload.layerId;
    if (!allowed || allowed.has(id)) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

export function partitionScheduleStrikes(events, renderedFrames) {
  assert.ok(Number.isSafeInteger(renderedFrames) && renderedFrames > 0);
  for (const event of events) assert.ok(Number.isSafeInteger(event.frame) && event.frame >= 0 && event.frame <= renderedFrames, 'strike lies within rendered range or exact endpoint');
  return { rendered: events.filter(event => event.frame < renderedFrames), endpoint: events.filter(event => event.frame === renderedFrames) };
}

export function buildResults({ probe, renderReceipts, captures, schedules, runtimeProfile = null, audioAnalysis = null }) {
  assert.equal(probe.allWorldsCensus.descriptors, 468, 'full frozen six-world census');
  assert.equal(probe.allWorldsCensus.oneNode, 110, 'one-node census');
  const fullWorlds = probe.worlds;
  assert.equal(fullWorlds.length, 6);
  const captureByWorld = new Map(captures.map(c => [keyOf(c.seed, c.arm), c]));
  const scheduleByWorld = new Map(schedules.map(s => [keyOf(s.seed, s.arm), s]));
  const receipts = new Map(renderReceipts.receipts.map(r => [keyOf(r.seed, r.arm), r]));
  const worlds = [], histories = [], topologyRows = [];
  for (const probeWorld of fullWorlds) {
    const key = keyOf(probeWorld.seed, probeWorld.arm), capture = captureByWorld.get(key), schedule = scheduleByWorld.get(key), receipt = receipts.get(key);
    assert.ok(capture && schedule && receipt, `all receipts present: ${key}`);
    assert.equal(receipt.renderedFrames, 14_400_000, `${key} full render`);
    assert.equal(receipt.receivedEvents, receipt.scheduledEvents, `${key} accepted render gate`);
    assert.equal(receipt.invalidTopologies, 0, `${key} topology acceptance`);
    const strikes = strikesByLayer(schedule), allIds = new Set(probeWorld.plates.map(p => p.id));
    assert.equal(schedule.world.frames, 14_400_000);
    const fullStrikeCounts = new Map([...allIds].map(id => [id, 0])), endpointStrikeCounts = new Map([...allIds].map(id => [id, 0]));
    const partitioned = partitionScheduleStrikes(strikes, schedule.world.frames);
    for (const event of [...partitioned.rendered, ...partitioned.endpoint]) {
      const id = event.message.payload.layerId; assert.ok(allIds.has(id), `strike resolves to captured layer ${id}`);
      const counts = event.frame < schedule.world.frames ? fullStrikeCounts : endpointStrikeCounts;
      counts.set(id, counts.get(id) + 1);
    }
    const windows = [];
    for (let wi = 0; wi < WINDOWS.length; wi++) {
      const [start, end] = WINDOWS[wi], endFrame = end * 48_000;
      const chron = capture.topologyStates.filter(t => t.tick * 800 <= endFrame).at(-1);
      assert.ok(chron, `${key} topology at ${end}s`);
      const state = unpack(chron.state), topology = compileSurfaceTopology({ plates: state.plates, nodules: state.nodules,
        stratigraphy: state.stratigraphy, generation: state.revision });
      const observerWindow = receipt.observer[wi];
      assert.equal(observerWindow.start, start); assert.equal(observerWindow.end, end);
      const observerMap = new Map(observerWindow.layers.map(row => [row.layerId, row]));
      const currentIds = new Set(topology.layerIds), historyRows = [];
      const inWindow = countScheduleStrikesInWindow(strikes, start, end, currentIds);
      const windowCounts = new Map([...currentIds].map(id => [id, inWindow.get(id) || 0]));
      const asOfCounts = new Map([...currentIds].map(id => [id, 0]));
      for (const event of strikes) if (event.frame < end * 48_000) { const id = event.message.payload.layerId; if (asOfCounts.has(id)) asOfCounts.set(id, asOfCounts.get(id) + 1); }
      const graph = graphSummary(topology);
      for (let li = 0; li < topology.layerIds.length; li++) {
        const id = topology.layerIds[li], plate = state.plates.find(p => p.id === id), gran = probeWorld.plates.find(p => p.id === id);
        const obs = observerMap.get(id) ?? null, exposure = exposedSourceCells(plate, state, li), raw = obs ? {
          pickupSumSq: obs.pickupSumSq, pickupPeak: obs.pickupPeak, pickupSamples: obs.pickupSamples,
          rawMeanPickupPowerPerObservedOutputFrame: obs.pickupSamples ? obs.pickupSumSq / obs.pickupSamples : null,
          awakeSamples: obs.awakeSamples, awakeSamplesCount: obs.awakeSamplesCount,
          awakeFraction: obs.awakeSamplesCount ? obs.awakeSamples / obs.awakeSamplesCount : null,
          activeSamples: obs.activeSamples, activeSamplesCount: obs.activeSamplesCount,
          sleepTransitions: obs.sleepTransitions, nativeActivationEventsIncludingReinstall: obs.wakeTransitions
        } : { pickupSumSq: 0, pickupPeak: 0, pickupSamples: 0, rawMeanPickupPowerPerObservedOutputFrame: null,
          awakeSamples: 0, awakeSamplesCount: 0, awakeFraction: null, activeSamples: 0, activeSamplesCount: 0,
          sleepTransitions: 0, nativeActivationEventsIncludingReinstall: 0 };
        const layer = { seed: probeWorld.seed, arm: probeWorld.arm, start, end, layerId: id,
          sourceCells: plate.mask.reduce((n, v) => n + Number(v === 1), 0), nodes: layerCount(topology, li),
          zDegree: graph.zDegrees[id] ?? 0, exposureAtWindowEnd: exposure,
          fullHistoryDirectStrikes: fullStrikeCounts.get(id) ?? 0, endpointDirectStrikes: endpointStrikeCounts.get(id) ?? 0,
          directStrikesAsOfWindowEnd: asOfCounts.get(id) ?? 0,
          inWindowDirectStrikes: windowCounts.get(id) ?? 0, ...raw };
        histories.push(layer); historyRows.push(layer);
      }
      const corrected = Object.fromEntries(windowCounts), observerDirect = Object.fromEntries([...observerMap].map(([id, row]) => [id, row.directStrikes]));
      const mismatch = Object.entries(corrected).flatMap(([id, count]) => (observerDirect[id] ?? 0) !== count
        ? [{ layerId: id, scheduleCount: count, observerCount: observerDirect[id] ?? 0, difference: (observerDirect[id] ?? 0) - count }] : []);
      const countStrikes = arr => arr.reduce((n, x) => n + x.inWindowDirectStrikes, 0);
      const indirectReachable = historyRows.filter(row => row.zDegree > 0).map(row => row.layerId);
      const indirectReadoutNonzero = historyRows.filter(row => row.zDegree > 0 && row.pickupSumSq > 0).map(row => row.layerId);
      const buriedUnstruck = historyRows.filter(row => row.exposureAtWindowEnd.exposed === 0 && row.fullHistoryDirectStrikes === 0);
      windows.push({ seed: probeWorld.seed, arm: probeWorld.arm, start, end, topologyTick: chron.tick, revision: state.revision, layerCount: topology.layerIds.length,
        nodeCount: topology.nodeGridIndices.length, zLinkCount: topology.adjacentLinkCoefficients.length,
        noduleCount: state.nodules.length, correctedDirectStrikeCount: countStrikes(historyRows),
        observerDirectStrikeCount: Object.values(observerDirect).reduce((a, b) => a + b, 0),
        observerCounterMismatches: mismatch, topology: graph,
        neverDirectStruckFullRun: historyRows.filter(row => row.fullHistoryDirectStrikes === 0).map(row => row.layerId),
        fullyBuriedNeverDirectStruck: buriedUnstruck.map(row => row.layerId),
        fullyBuriedNeverDirectStruckZReachableWithNonzeroRawPickup: buriedUnstruck.filter(row => row.zDegree > 0 && row.pickupSumSq > 0).map(row => row.layerId),
        zReachableLayers: indirectReachable, zReachableWithNonzeroRawPickup: indirectReadoutNonzero,
        note: 'Nonzero pickup is an observed raw layer readout proxy; it does not identify energy source or audible contribution.' });
      topologyRows.push({ seed: probeWorld.seed, arm: probeWorld.arm, start, end,
        nodes: topology.nodeGridIndices.length, layers: topology.layerIds.length, revisions: state.revision,
        zLinks: topology.adjacentLinkCoefficients.length, fourNeighborEdges: topology.neighborIndices.reduce((n, v) => n + Number(v >= 0), 0) / 2,
        noduleCount: state.nodules.length, graph });
    }
    worlds.push({ seed: probeWorld.seed, arm: probeWorld.arm, discretization: {
      descriptors: probeWorld.plateCount, nodes: probeWorld.nodeCount, oneNode: probeWorld.geometryCensus.oneNode,
      coincidentPickups: probeWorld.geometryCensus.coincidentPickups, eightVsFourComponentDiscrepancies: probeWorld.geometryCensus.components8Vs4,
      absoluteDuplicateGeometryGroups: probeWorld.geometryCensus.absoluteDuplicateGeometryGroups,
      translationNormalizedDuplicateGeometryGroups: probeWorld.geometryCensus.translationNormalizedDuplicateGeometryGroups,
      fullHistoryLayerCount: probeWorld.plateCount,
      partialBurialLayersAt300s: histories.filter(r => r.seed === probeWorld.seed && r.arm === probeWorld.arm && r.end === 300 && r.exposureAtWindowEnd.exposed > 0 && r.exposureAtWindowEnd.exposed < r.exposureAtWindowEnd.occupied).length,
      fullBurialLayersAt300s: histories.filter(r => r.seed === probeWorld.seed && r.arm === probeWorld.arm && r.end === 300 && r.exposureAtWindowEnd.exposed === 0).length }, windows });
  }
  const fullCensus = probe.allWorldsCensus;
  const provenanceCensus = probe.worlds.flatMap(w => w.plates).reduce((out, plate) => {
    out[plate.provenance] = (out[plate.provenance] || 0) + 1; return out;
  }, {});
  assert.deepEqual(provenanceCensus, { production: 32, 'research-local-singleton-X': 436 }, '32 production + 436 research descriptors');
  const outputArchitecture = { schema: 'ant-local-x-audio-architecture-summary-v1', scope: 'six frozen continuous 300 s world histories; current production compiler/worklet receipts',
    census: { descriptors: fullCensus.descriptors, byProvenance: provenanceCensus, oneNode: fullCensus.oneNode, multiNode: fullCensus.descriptors - fullCensus.oneNode,
      coincidentPickups: fullCensus.coincidentPickups, absoluteDuplicateGeometryGroups: fullCensus.absoluteDuplicateGeometryGroups.length,
      translationNormalizedDuplicateGeometryGroups: fullCensus.translationNormalizedDuplicateGeometryGroups.length,
      solverNodeQuantiles: fullCensus.solverNodeQuantiles }, worlds,
    rawReadoutLimits: ['pickupSumSq and peak are raw observer values, not additive acoustic energy or audibility measures.',
      'Z reachability is structural; nonzero pickup does not establish causal contribution or perceptual relevance.',
      'Unstruck buried layers may be driven indirectly through Z coupling and remain represented.'],
    audioAnalysisLoaded: Boolean(audioAnalysis), runtimeProfileLoaded: Boolean(runtimeProfile) };
  const contribution = { schema: 'ant-local-x-audio-layer-contribution-histories-v1', windowsSeconds: WINDOWS,
    definition: { rawMeanPickupPowerPerObservedOutputFrame: 'pickupSumSq / pickupSamples; combined L^2+R^2 per observed physics output frame while the layer exists, before limiter and bridge gain; not a per-channel mean or a full-window mean for newborn layers',
      zDegree: 'count of incident positive compiled node-link pairs for this layer; link multiplicity, not unique neighboring-layer count',
      zComponents: 'connected components of the layer-ID Z graph; a layer may itself contain disconnected planar subgraphs, so these are not full acoustic node components',
      awakeFraction: 'awakeSamples / awakeSamplesCount; observer samples at 100-physics-step cadence',
      nativeActivationEventsIncludingReinstall: 'raw observer activation counter includes topology installs; it cannot separate physical sleep-to-wake from reinstalls',
      sleepTransitions: 'raw counter for awake-to-sleep events; unlike activations, topology reinstall does not increment it',
      directStrikes: 'recounted from accepted schedule events; rendered history is [0,300 s), and frame 14,400,000 endpoint events are reported separately',
      exposure: 'fraction of occupied source-grid cells routed to that layer at selected latest topology state <= window end' }, layers: histories,
    limits: ['No layerwise sum is called energy or audibility.', 'Readout does not separate direct excitation, indirect coupling, and retained state.',
      'Native activation counters include topology reinstallation and do not identify physical sleep-to-wake events.'] };
  const cost = { schema: 'ant-local-x-audio-topology-cost-summary-v1', scope: 'computed topology operation counts; runtime profiling loaded only if source file exists',
    windows: topologyRows, computedCounts: { sixWorlds: 6, fixedWindowsPerWorld: 5,
      descriptorCensus: fullCensus.descriptors, oneNodeDescriptors: fullCensus.oneNode,
      multiNodeDescriptors: fullCensus.descriptors - fullCensus.oneNode }, runtimeProfile: runtimeProfile ?? null,
    audioAnalysis: audioAnalysis ?? null,
    limits: ['Topology node/link counts describe compiled work size, not wall-clock cost.', 'Do not merge observer-instrumented timings with clean runtime.'] };
  return { architecture: outputArchitecture, histories: contribution, costs: cost };
}

async function run(outputDir = BASE, probePath = resolve(BASE, 'granularity-probe.json')) {
  const probe = await json(probePath);
  const render = await json(resolve(BASE, 'audio-render-receipts.json'));
  const captures = [], schedules = [];
  for (const w of render.receipts) {
    captures.push(await gzipJson(resolve(BASE, `seed-${w.seed}-${w.arm}-capture.json.gz`)));
    schedules.push(await gzipJson(resolve(BASE, `seed-${w.seed}-${w.arm}-schedule.json.gz`)));
  }
  const maybe = async path => { try { return await json(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
  const result = buildResults({ probe, renderReceipts: render, captures, schedules,
    runtimeProfile: await maybe(resolve(BASE, 'ant-local-x-audio-runtime-profile.json')),
    audioAnalysis: await maybe(resolve(ROOT, 'docs/ant/evidence/2026-11-01-local-x-audio-reassessment/audio-analysis/analysis.json')) });
  await Promise.all([
    writeFile(resolve(outputDir, 'architecture-summary.json'), JSON.stringify(result.architecture, null, 2) + '\n'),
    writeFile(resolve(outputDir, 'layer-contribution-histories.json'), JSON.stringify(result.histories, null, 2) + '\n'),
    writeFile(resolve(outputDir, 'topology-cost-summary.json'), JSON.stringify(result.costs, null, 2) + '\n')
  ]);
  console.log(`Wrote 3 JSON summaries; ${result.histories.layers.length} layer-window rows; runtime=${Boolean(result.costs.runtimeProfile)} audioAnalysis=${Boolean(result.costs.audioAnalysis)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf('--output-dir');
  const probeIndex = process.argv.indexOf('--probe');
  run(outputIndex >= 0 ? resolve(process.argv[outputIndex + 1]) : BASE,
    probeIndex >= 0 ? resolve(process.argv[probeIndex + 1]) : resolve(BASE, 'granularity-probe.json'))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
