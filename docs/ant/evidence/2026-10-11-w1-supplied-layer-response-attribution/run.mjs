import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { compileSurfaceTopology } from '../../../../src/lib/audio/compileSurfaceTopology.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../');
const SOURCE_GRID = 96;
const RUNNER_PATH = 'docs/ant/evidence/2026-10-11-w1-supplied-layer-response-attribution/run.mjs';
const STEPS = 3000;
const RATE = 48000;
const QUANTUM = 8;
const OLD_ID = 'old';
const NEW_ID = 's0';
const PROBE = Object.freeze({
  type: 'strike',
  payload: { plateId: OLD_ID, position: { x: 45 / 95, y: 48 / 95 }, strength: 0.035, footprintRadius: 0.012 }
});

function plate(id, x0, x1, y0, y1, pickupY = 48) {
  const mask = new Array(SOURCE_GRID * SOURCE_GRID).fill(0);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mask[y * SOURCE_GRID + x] = 1;
  return {
    id,
    grid: { width: SOURCE_GRID, height: SOURCE_GRID },
    mask,
    edges: [],
    pickups: [{ x: x0 / 95, y: pickupY / 95 }, { x: x1 / 95, y: pickupY / 95 }],
    thicknessMeters: 0.001,
    material: { stiffness: 0.9, density: 1.1, damping: 0.35 }
  };
}

function makeProcessor(workletSource = null) {
  const source = workletSource ?? readFileSync(resolve(root, 'static/worklets/surface-plate.worklet.js'), 'utf8');
  let Processor;
  class AudioWorkletProcessor { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  vm.runInNewContext(source, {
    AudioWorkletProcessor, sampleRate: RATE, Float32Array, Float64Array,
    Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
    Array, Math, Number, Object, performance: globalThis.performance,
    registerProcessor(_name, processor) { Processor = processor; }
  });
  return new Processor();
}

function topology(...plates) {
  return compileSurfaceTopology({ plates, stratigraphy: { layerOrder: plates.map((item) => item.id) } });
}

function layerRange(t, id) {
  const layer = t.layerIds.indexOf(id);
  if (layer < 0) throw new Error(`Missing layer ${id}`);
  return { layer, start: t.nodeOffsets[layer], end: t.nodeOffsets[layer + 1] };
}

function nodeMap(t, id) {
  const { start, end } = layerRange(t, id), result = new Map();
  for (let node = start; node < end; node++) result.set(`${id}:${t.nodeGridIndices[node]}`, node);
  return result;
}

function nodeKey(t, node) {
  const layer = t.layerIds.findIndex((_id, index) => node >= t.nodeOffsets[index] && node < t.nodeOffsets[index + 1]);
  return `${t.layerIds[layer]}:${t.nodeGridIndices[node]}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equalArray(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function equalBytes(a, b) {
  return a.byteLength === b.byteLength
    && Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
}

function layerTopologySignature(t, id) {
  const map = nodeMap(t, id), { start, end } = layerRange(t, id);
  const rows = [];
  for (let node = start; node < end; node++) {
    const neighbors = [];
    for (let d = 0; d < 4; d++) {
      const other = t.neighborIndices[node * 4 + d];
      neighbors.push(other < 0 ? null : nodeKey(t, other));
    }
    rows.push([nodeKey(t, node), neighbors]);
  }
  return { mapSize: map.size, rows };
}

function layerCoefficientValues(t, id) {
  const { layer } = layerRange(t, id);
  return Array.from(t.materialCoefficients.slice(layer * 4, layer * 4 + 4));
}

function crossLayerLinks(t) {
  const links = [];
  for (let i = 0; i < t.adjacentLinkCoefficients.length; i++) {
    const a = t.adjacentLinkNodes[i * 2], b = t.adjacentLinkNodes[i * 2 + 1];
    if (t.nodeLayer && t.nodeLayer[a] !== t.nodeLayer[b]) links.push({ a, b, coefficient: t.adjacentLinkCoefficients[i] });
    else {
      const layerA = t.nodeOffsets.findIndex((_v, layer) => layer < t.layerIds.length && a >= t.nodeOffsets[layer] && a < t.nodeOffsets[layer + 1]);
      const layerB = t.nodeOffsets.findIndex((_v, layer) => layer < t.layerIds.length && b >= t.nodeOffsets[layer] && b < t.nodeOffsets[layer + 1]);
      if (layerA !== layerB) links.push({ a, b, coefficient: t.adjacentLinkCoefficients[i] });
    }
  }
  return links;
}

function restBoundary(p) {
  const zeros = (array) => array.every((value) => value === 0);
  return {
    currentPreviousZero: zeros(p.current) && zeros(p.previous),
    awakeQuietZero: zeros(p.awake) && zeros(p.energyQuiet),
    pendingZero: p.pendingCount === 0 && zeros(p.pendingWake) && zeros(p.pendingWakeReason),
    noActiveNodes: p.activeCount === 0,
    contactStateZero: zeros(p.contactForces) && zeros(p.contactMemory) && zeros(p.lastContactStep),
    allRest: zeros(p.current) && zeros(p.previous) && zeros(p.awake) && zeros(p.energyQuiet)
      && p.pendingCount === 0 && zeros(p.pendingWake) && zeros(p.pendingWakeReason)
      && p.activeCount === 0 && zeros(p.contactForces) && zeros(p.contactMemory) && zeros(p.lastContactStep)
  };
}

function install(...types) {
  const p = makeProcessor();
  for (const t of types) p.handleMessage({ type: 'topology', payload: t });
  return p;
}

function pulseByLayer(p, id) {
  const t = p.topology, map = nodeMap(t, id), result = new Map();
  for (const [key, node] of map) {
    const ring = [];
    for (let step = 0; step < 18; step++) ring.push(p.contactForces[step * p.current.length + node]);
    result.set(key, ring);
  }
  return result;
}

function pulseMismatch(a, b) {
  let count = 0;
  for (const [key, row] of a) {
    const other = b.get(key);
    if (!other || !equalArray(row, other)) count++;
  }
  return count;
}

function pulseNonzeroCount(p, id) {
  let count = 0;
  const { start, end } = layerRange(p.topology, id), n = p.current.length;
  for (let step = 0; step < 18; step++) for (let node = start; node < end; node++) {
    if (p.contactForces[step * n + node] !== 0) count++;
  }
  return count;
}

function contactStateByLayer(p, id) {
  const map = nodeMap(p.topology, id), result = new Map();
  for (const [key, node] of map) result.set(key, [p.contactMemory[node], p.lastContactStep[node]]);
  return result;
}

function snapshotLayerState(p, id) {
  const result = new Map();
  for (const [key, node] of nodeMap(p.topology, id)) {
    result.set(key, {
      current: p.current[node], previous: p.previous[node], next: p.next[node], lap: p.lap[node], lapStamp: p.lapStamp[node],
      awake: p.awake[node], quiet: p.energyQuiet[node],
      pendingWake: p.pendingWake[node], pendingWakeReason: p.pendingWakeReason[node],
      contactMemory: p.contactMemory[node], lastContactStep: p.lastContactStep[node]
    });
  }
  return result;
}

function equalLayerSnapshots(a, b) {
  if (a.size !== b.size) return false;
  for (const [key, row] of a) {
    const other = b.get(key);
    if (!other || Object.keys(row).some((field) => row[field] !== other[field])) return false;
  }
  return true;
}

function equalLayerDynamicState(a, b, id) {
  if (!equalLayerSnapshots(snapshotLayerState(a, id), snapshotLayerState(b, id))) return false;
  if (pulseMismatch(pulseByLayer(a, id), pulseByLayer(b, id))) return false;
  const activeA = new Set(Array.from(a.active.subarray(0, a.activeCount), (node) => nodeKey(a.topology, node)));
  const activeB = new Set(Array.from(b.active.subarray(0, b.activeCount), (node) => nodeKey(b.topology, node)));
  if (activeA.size !== activeB.size || [...activeA].some((key) => !activeB.has(key))) return false;
  if (a.pendingCount !== b.pendingCount || a.contactCursor !== b.contactCursor || a.phase !== b.phase
    || a.samplesSinceStep !== b.samplesSinceStep || a.outputL !== b.outputL || a.outputR !== b.outputR
    || a.lastL !== b.lastL || a.lastR !== b.lastR || a.queueHead !== b.queueHead || a.queueLength !== b.queueLength
    || !equalBytes(a.queueL, b.queueL) || !equalBytes(a.queueR, b.queueR)) return false;
  const telemetryKeys = Object.keys(a.telemetry);
  return telemetryKeys.length === Object.keys(b.telemetry).length
    && telemetryKeys.every((key) => a.telemetry[key] === b.telemetry[key]);
}

function compareCoreState(a, b) {
  const fields = [
    'current', 'previous', 'next', 'lap', 'lapStamp', 'nodeLayer', 'energyQuiet', 'awake',
    'pendingWake', 'pendingWakeReason', 'pendingNodes', 'contactForces', 'contactMemory', 'lastContactStep',
    'active', 'sphereCurrent', 'spherePrevious'
  ];
  for (const field of fields) {
    const av = a[field], bv = b[field];
    if (!av || !bv || !equalBytes(av, bv)) return false;
  }
  const scalars = [
    'activeCount', 'pendingCount', 'contactCursor', 'epoch', 'phase', 'samplesSinceStep',
    'lastL', 'lastR', 'outputL', 'outputR', 'queueHead', 'queueLength'
  ];
  for (const field of scalars) if (a[field] !== b[field]) return false;
  if (!equalBytes(a.queueL, b.queueL) || !equalBytes(a.queueR, b.queueR)) return false;
  const telemetry = Object.keys(a.telemetry).filter((field) => field !== 'topologies');
  for (const field of telemetry) if (a.telemetry[field] !== b.telemetry[field]) return false;
  return true;
}

function makeArm(name, p, topologyRef, struck = false) {
  const layerIds = p.topology.layerIds;
  const previousAwake = new Uint8Array(p.current.length);
  const layerStats = Object.fromEntries(layerIds.map((id) => [id, {
    nodeCount: layerRange(p.topology, id).end - layerRange(p.topology, id).start,
    firstAwakeStep: null, wakeTransitions: 0, awakeNodeSteps: 0, maxAwakeNodes: 0,
    finalAwakeNodes: 0, maxAbsCurrent: 0, maxAbsPrevious: 0
  }]));
  const traceChunks = [];
  const traceHash = createHash('sha256');
  const arm = { name, p, topologyRef, struck, previousAwake, layerStats, traceChunks, traceHash, nonFiniteStateCount: 0 };
  return arm;
}

function encodeFrame(p) {
  const n = p.current.length, buffer = Buffer.allocUnsafe(n * 8);
  for (let i = 0; i < n; i++) buffer.writeFloatLE(p.current[i], i * 4);
  for (let i = 0; i < n; i++) buffer.writeFloatLE(p.previous[i], (n + i) * 4);
  return buffer;
}

function recordFrame(arm, step, captureTrace) {
  const { p, layerStats, previousAwake } = arm;
  const frame = encodeFrame(p);
  arm.traceHash.update(frame);
  if (captureTrace) arm.traceChunks.push(frame);
  for (let layer = 0; layer < p.topology.layerIds.length; layer++) {
    const id = p.topology.layerIds[layer], stats = layerStats[id];
    const start = p.topology.nodeOffsets[layer], end = p.topology.nodeOffsets[layer + 1];
    let awake = 0;
    for (let node = start; node < end; node++) {
      if (!Number.isFinite(p.current[node]) || !Number.isFinite(p.previous[node])) arm.nonFiniteStateCount++;
      stats.maxAbsCurrent = Math.max(stats.maxAbsCurrent, Math.abs(p.current[node]));
      stats.maxAbsPrevious = Math.max(stats.maxAbsPrevious, Math.abs(p.previous[node]));
      if (p.awake[node]) {
        awake++;
        stats.awakeNodeSteps++;
        if (!previousAwake[node]) stats.wakeTransitions++;
        if (stats.firstAwakeStep === null) stats.firstAwakeStep = step;
      }
      previousAwake[node] = p.awake[node];
    }
    stats.maxAwakeNodes = Math.max(stats.maxAwakeNodes, awake);
    stats.finalAwakeNodes = awake;
  }
}

function mapMaxDifference(a, b, id, property) {
  const am = nodeMap(a.topology, id), bm = nodeMap(b.topology, id);
  let max = 0, first = null, count = 0;
  const differences = [];
  for (const [key, ai] of am) {
    const bi = bm.get(key);
    if (bi === undefined) throw new Error(`Unmatched node ${key}`);
    const delta = b[property][bi] - a[property][ai];
    if (delta !== 0) {
      count++;
      const row = { key, solverCell: Number(key.split(':')[1]), baseline: a[property][ai], treatment: b[property][bi], delta, sign: Math.sign(delta) };
      if (first === null) first = row;
      differences.push(row);
      max = Math.max(max, Math.abs(delta));
    }
  }
  return { maxAbs: max, mismatchCount: count, first, differences };
}

function mapAllZero(p, id) {
  const { start, end } = layerRange(p.topology, id);
  for (let i = start; i < end; i++) if (p.current[i] !== 0 || p.previous[i] !== 0 || p.awake[i] !== 0) return false;
  return true;
}

function activeReachability(t, seedKeys, destinationKeys, id) {
  const map = nodeMap(t, id), { start, end } = layerRange(t, id);
  const reverse = new Map([...map].map(([key, node]) => [node, key]));
  const queue = [], visited = new Set();
  for (const key of seedKeys) { const node = map.get(key); if (node !== undefined && !visited.has(node)) { visited.add(node); queue.push(node); } }
  const dest = new Set(destinationKeys);
  for (let q = 0; q < queue.length; q++) {
    const node = queue[q];
    if (dest.has(reverse.get(node))) return { reachable: true, visitedNodes: visited.size };
    for (let d = 0; d < 4; d++) {
      const other = t.neighborIndices[node * 4 + d];
      if (other >= start && other < end && !visited.has(other)) { visited.add(other); queue.push(other); }
    }
  }
  return { reachable: false, visitedNodes: visited.size };
}

function topologyChecks(config, arms) {
  const oldRef = config.oldTopology, overlap = config.overlapTopology, disjoint = config.disjointTopology;
  const oldMap = nodeMap(oldRef, OLD_ID), overlapMap = nodeMap(overlap, OLD_ID), disjointMap = nodeMap(disjoint, OLD_ID);
  const addedMap = nodeMap(overlap, NEW_ID), disjointAddedMap = nodeMap(disjoint, NEW_ID);
  const oldRows = JSON.stringify(layerTopologySignature(oldRef, OLD_ID).rows);
  const oldCoefficients = layerCoefficientValues(oldRef, OLD_ID);
  const oldMatchesOverlap = oldMap.size === overlapMap.size && [...oldMap.keys()].every((key) => overlapMap.has(key))
    && JSON.stringify(layerTopologySignature(overlap, OLD_ID).rows) === oldRows
    && equalArray(oldCoefficients, layerCoefficientValues(overlap, OLD_ID));
  const oldMatchesDisjoint = oldMap.size === disjointMap.size && [...oldMap.keys()].every((key) => disjointMap.has(key))
    && JSON.stringify(layerTopologySignature(disjoint, OLD_ID).rows) === oldRows
    && equalArray(oldCoefficients, layerCoefficientValues(disjoint, OLD_ID));
  const links = crossLayerLinks(overlap), disjointLinks = crossLayerLinks(disjoint);
  const linkedOldKeys = new Set(links.map(({ a, b }) => nodeKey(overlap, overlap.layerIds[0] === OLD_ID ? a : b)));
  const sourceX = Math.round(PROBE.payload.position.x * 95), sourceY = Math.round(PROBE.payload.position.y * 95);
  const sourceCell = sourceY * SOURCE_GRID + sourceX;
  const sourceMaskOld = config.oldPlate.mask[sourceCell] === 1;
  const sourceMaskNew = config.newPlate.mask[sourceCell] === 1;
  assert(sourceMaskOld && !sourceMaskNew, 'Probe source coordinate must lie inside old and outside new source mask.');
  const a = arms['baseline-reinstall'].p, b = arms.treatment.p;
  const pulseA = pulseByLayer(a, OLD_ID), pulseB = pulseByLayer(b, OLD_ID);
  const pulseNonzeroOld = [...pulseA].filter(([, row]) => row.some((value) => value !== 0)).map(([key]) => key);
  const reachable = activeReachability(overlap, pulseNonzeroOld, linkedOldKeys, OLD_ID);
  const oldStateMatch = equalLayerSnapshots(arms['baseline-reinstall'].preStrikeOldState, arms.treatment.preStrikeOldState);
  const baselineMessages = arms['baseline-reinstall'].inputMessageOrder;
  const treatmentMessages = arms.treatment.inputMessageOrder;
  const messageOrderValid = baselineMessages.length === treatmentMessages.length
    && baselineMessages.every((item, index) => item.type === treatmentMessages[index].type)
    && JSON.stringify(baselineMessages.at(-1)?.payload) === JSON.stringify(treatmentMessages.at(-1)?.payload)
    && JSON.stringify(arms['baseline-reinstall'].topologySequence) === JSON.stringify([[OLD_ID], [OLD_ID]])
    && JSON.stringify(arms.treatment.topologySequence) === JSON.stringify([[OLD_ID], [OLD_ID, NEW_ID]]);
  const oldContactsA = contactStateByLayer(a, OLD_ID), oldContactsB = contactStateByLayer(b, OLD_ID);
  const oldContactMatch = [...oldContactsA].every(([key, value]) => equalArray(value, oldContactsB.get(key)));
  return {
    oldNodeCount: oldMap.size,
    overlapAddedNodeCount: addedMap.size,
    disjointAddedNodeCount: disjointAddedMap.size,
    overlapCrossLayerZLinkCount: links.length,
    disjointCrossLayerZLinkCount: disjointLinks.length,
    oldNodeKeysMatchByPlateIdAndSolverCell: oldMatchesOverlap && oldMatchesDisjoint,
    oldCoefficientsAndWithinLayerTopologyMatch: oldMatchesOverlap && oldMatchesDisjoint,
    preStrikeOldStateMatch: oldStateMatch,
    postStrikeOldContactMemoryAndLastContactMatch: oldContactMatch,
    inputMessageOrderValid: messageOrderValid,
    allRestAtInsertionBoundary: ['baseline-reinstall', 'treatment', 'disjoint-treatment'].every((name) =>
      arms[name].restBeforeInsertion?.allRest === true && arms[name].restAfterInsertion?.allRest === true),
    pulseTargetOldMask: sourceMaskOld,
    pulseTargetOutsideNewMask: !sourceMaskNew,
    oldPulseRingMismatchCountBeforeStepping: pulseMismatch(pulseA, pulseB),
    newLayerNonzeroPulseIncrementCount: pulseNonzeroCount(b, NEW_ID),
    oldPulseNonzeroNodeCount: pulseNonzeroOld.length,
    strikeReachableToOverlappingLinks: reachable,
    allChecksPass: oldMatchesOverlap && oldMatchesDisjoint && oldStateMatch && oldContactMatch
      && links.length > 0 && disjointLinks.length === 0 && pulseMismatch(pulseA, pulseB) === 0
      && pulseNonzeroCount(b, NEW_ID) === 0 && sourceMaskOld && !sourceMaskNew && reachable.reachable
      && messageOrderValid
      && ['baseline-reinstall', 'treatment', 'disjoint-treatment'].every((name) =>
        arms[name].restBeforeInsertion?.allRest === true && arms[name].restAfterInsertion?.allRest === true)
  };
}

function restReportBeforeInsertion(p) {
  const report = restBoundary(p);
  if (!report.allRest) throw new Error('Initial old topology is not at the declared all-rest insertion boundary.');
  return report;
}

function prepareConfig() {
  const oldPlate = plate(OLD_ID, 30, 66, 44, 50);
  const newPlate = plate(NEW_ID, 48, 76, 44, 50);
  const disjointPlate = plate(NEW_ID, 48, 76, 54, 60, 58);
  const oldTopology = topology(oldPlate);
  const overlapTopology = topology(oldPlate, newPlate);
  const disjointTopology = topology(oldPlate, disjointPlate);
  return { oldPlate, newPlate, disjointPlate, oldTopology, overlapTopology, disjointTopology };
}

function configureArms(config) {
  const specs = {
    'baseline-reinstall': [config.oldTopology, config.oldTopology],
    treatment: [config.oldTopology, config.overlapTopology],
    'reinstall-once': [config.oldTopology],
    'reinstall-twice': [config.oldTopology, config.oldTopology],
    'no-probe-baseline': [config.oldTopology, config.oldTopology],
    'no-probe-treatment': [config.oldTopology, config.overlapTopology],
    'disjoint-baseline': [config.oldTopology, config.oldTopology],
    'disjoint-treatment': [config.oldTopology, config.disjointTopology],
    'treatment-replay': [config.oldTopology, config.overlapTopology]
  };
  const arms = {};
  for (const [name, topologies] of Object.entries(specs)) {
    const p = makeProcessor();
    p.handleMessage({ type: 'topology', payload: topologies[0] });
    const preInsertion = restReportBeforeInsertion(p);
    for (let i = 1; i < topologies.length; i++) p.handleMessage({ type: 'topology', payload: topologies[i] });
    const postInsertion = restBoundary(p);
    if (!postInsertion.allRest) throw new Error(`${name} changed the fully quiescent insertion state.`);
    const arm = makeArm(name, p, topologies.at(-1), !name.startsWith('no-probe'));
    arm.restBeforeInsertion = preInsertion;
    arm.restAfterInsertion = postInsertion;
    arm.topologySequence = topologies.map((item) => [...item.layerIds]);
    arm.inputMessageOrder = [...topologies.map((item) => ({ type: 'topology', layerIds: [...item.layerIds] })),
      ...(!name.startsWith('no-probe') ? [{ type: 'strike', payload: PROBE.payload }] : [])];
    arm.preStrikeOldState = snapshotLayerState(p, OLD_ID);
    if (arm.struck) {
      arm.pulseBeforeStrike = pulseByLayer(p, OLD_ID);
      arm.newPulseBeforeStrike = topologies.at(-1).layerIds.includes(NEW_ID) ? pulseByLayer(p, NEW_ID) : new Map();
      p.handleMessage(PROBE);
      arm.pulseAfterStrike = pulseByLayer(p, OLD_ID);
      arm.newPulseAfterStrike = topologies.at(-1).layerIds.includes(NEW_ID) ? pulseByLayer(p, NEW_ID) : new Map();
      arm.oldContactAfterStrike = contactStateByLayer(p, OLD_ID);
    }
    arms[name] = arm;
  }
  return arms;
}

function recordAllStepStats(arms, step, captureTraces, comparison) {
  for (const arm of Object.values(arms)) {
    const before = arm.p.telemetry.physicsSteps;
    const left = new Float32Array(QUANTUM), right = new Float32Array(QUANTUM);
    arm.p.process([], [[left, right]]);
    assert(arm.p.telemetry.physicsSteps === before + 1, `${arm.name} did not advance exactly one physics step.`);
    recordFrame(arm, step, captureTraces);
  }
  const base = arms['baseline-reinstall'].p, treatment = arms.treatment.p;
  for (const id of [OLD_ID]) {
    const current = mapMaxDifference(base, treatment, id, 'current');
    const previous = mapMaxDifference(base, treatment, id, 'previous');
    for (const property of ['current', 'previous']) {
      const diff = property === 'current' ? current : previous;
      for (const [key, ai] of nodeMap(base.topology, id)) {
        const bi = nodeMap(treatment.topology, id).get(key);
        const delta = treatment[property][bi] - base[property][ai];
        if (delta !== 0 && property === 'current' && !comparison.firstCurrent) {
          comparison.firstCurrent = { step, property, key, solverCell: Number(key.split(':')[1]), baseline: base[property][ai], treatment: treatment[property][bi], delta, sign: Math.sign(delta) };
        }
        if (delta !== 0 && !comparison.firstState) {
          comparison.firstState = { step, property, key, solverCell: Number(key.split(':')[1]), baseline: base[property][ai], treatment: treatment[property][bi], delta, sign: Math.sign(delta) };
        }
      }
    }
    if (current.mismatchCount && comparison.firstCurrentNodes === null) comparison.firstCurrentNodes = current.differences;
    if (current.maxAbs > comparison.maxCurrentAbs) { comparison.maxCurrentAbs = current.maxAbs; comparison.maxCurrentStep = step; }
    if (Math.max(current.maxAbs, previous.maxAbs) > comparison.maxStateAbs) { comparison.maxStateAbs = Math.max(current.maxAbs, previous.maxAbs); comparison.maxStateStep = step; }
    comparison.perStep.push({ step, currentMismatchNodes: current.mismatchCount, currentMaxAbs: current.maxAbs,
      previousMismatchNodes: previous.mismatchCount, previousMaxAbs: previous.maxAbs });
  }
  comparison.reinstallControlMismatchSteps += compareCoreState(arms['reinstall-once'].p, arms['reinstall-twice'].p) ? 0 : 1;
  comparison.treatmentReplayMismatchSteps += compareCoreState(treatment, arms['treatment-replay'].p) ? 0 : 1;
  comparison.disjointOldMismatchSteps += equalLayerDynamicState(arms['disjoint-baseline'].p, arms['disjoint-treatment'].p, OLD_ID) ? 0 : 1;
  const noProbeBaseline = arms['no-probe-baseline'].p, noProbeTreatment = arms['no-probe-treatment'].p;
  comparison.noProbeOldMismatchSteps += equalLayerDynamicState(noProbeBaseline, noProbeTreatment, OLD_ID) ? 0 : 1;
  if (!mapAllZero(noProbeBaseline, OLD_ID) || !mapAllZero(noProbeTreatment, OLD_ID) || !mapAllZero(noProbeTreatment, NEW_ID)
    || noProbeBaseline.activeCount || noProbeTreatment.activeCount || noProbeBaseline.pendingCount || noProbeTreatment.pendingCount
    || noProbeBaseline.contactForces.some((value) => value !== 0) || noProbeTreatment.contactForces.some((value) => value !== 0)) comparison.noProbeNonzeroSteps++;
  if (Object.values(arms).some(({ p }) => p.telemetry.dropped || p.telemetry.droppedRoutes || p.telemetry.nonFinite)) comparison.anyDiagnosticFault = true;
}

function summarizeArm(arm) {
  const { p } = arm;
  return {
    topologySequence: arm.topologySequence,
    inputMessageOrder: arm.inputMessageOrder,
    strikeCount: arm.struck ? 1 : 0,
    layerActivity: arm.layerStats,
    wholeProcessorTelemetry: { ...p.telemetry },
    physicsSteps: p.telemetry.physicsSteps,
    nonfiniteStateCount: arm.nonFiniteStateCount,
    trace: { bytes: arm.traceChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0), sha256: arm.traceHash.copy().digest('hex') }
  };
}

function nextFloat64(value, direction) {
  if (Number.isNaN(value) || value === (direction > 0 ? Infinity : -Infinity)) return value;
  if (value === 0) return direction > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  let bits = view.getBigUint64(0, false);
  bits += (value > 0) === (direction > 0) ? 1n : -1n;
  view.setBigUint64(0, bits, false);
  return view.getFloat64(0, false);
}

function nextFloat32(value, direction) {
  const f = Math.fround(value);
  if (f === 0) return direction > 0 ? 1.401298464324817e-45 : -1.401298464324817e-45;
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, f, false);
  let bits = view.getUint32(0, false);
  bits += ((f > 0) === (direction > 0)) ? 1 : -1;
  view.setUint32(0, bits, false);
  return view.getFloat32(0, false);
}

function point(value) { return [value, value]; }
function addInterval(a, b) { return [nextFloat64(a[0] + b[0], -1), nextFloat64(a[1] + b[1], 1)]; }
function subInterval(a, b) { return [nextFloat64(a[0] - b[1], -1), nextFloat64(a[1] - b[0], 1)]; }
function mulInterval(a, b) {
  const values = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]];
  return [nextFloat64(Math.min(...values), -1), nextFloat64(Math.max(...values), 1)];
}
function divInterval(a, b) {
  assert(!(b[0] <= 0 && b[1] >= 0), 'Cannot bound division by an interval containing zero.');
  const values = [a[0] / b[0], a[0] / b[1], a[1] / b[0], a[1] / b[1]];
  return [nextFloat64(Math.min(...values), -1), nextFloat64(Math.max(...values), 1)];
}

function f32RoundingCell(value) {
  const f = Math.fround(value), lower = nextFloat32(f, -1), upper = nextFloat32(f, 1);
  return { value: f, lower: (lower + f) / 2, upper: (f + upper) / 2, lowerNeighbor: lower, upperNeighbor: upper };
}

function sourceLap(t, current, node) {
  let value = -4 * current[node];
  const neighbors = [];
  for (let d = 0; d < 4; d++) {
    const other = t.neighborIndices[node * 4 + d];
    neighbors.push(other);
    if (other >= 0) value += current[other];
  }
  return { value: Math.fround(value), neighbors };
}

function sourceLapOfLap(t, current, node) {
  const own = sourceLap(t, current, node);
  let value = -4 * own.value;
  const neighborRows = [];
  for (const other of own.neighbors) {
    if (other < 0) continue;
    const row = sourceLap(t, current, other);
    value += row.value;
    neighborRows.push({ node: other, lap: row.value });
  }
  return { value, ownLap: own.value, neighborRows };
}

function linkTerms(p, node) {
  const rows = [];
  for (let i = p.linkOffsets[node]; i < p.linkOffsets[node + 1]; i++) {
    const other = p.linkNodes[i], coefficient = p.linkCoefficients[i];
    const delta = p.current[other] - p.current[node];
    const rawZForce = coefficient * delta;
    const density = p.topology.materialCoefficients[p.nodeLayer[node] * 4 + 2];
    const zForce = rawZForce / density;
    rows.push({ node: other, key: nodeKey(p.topology, other), coefficient, current: p.current[other], previous: p.previous[other], delta, rawZForce, density, zForce });
  }
  return rows;
}

function linkForceAndInterval(rows, value, density) {
  let force = 0, interval = point(0);
  for (const row of rows) {
    const delta = row.current - value;
    const raw = row.coefficient * delta;
    const term = raw / density;
    force += term;
    const termInterval = divInterval(mulInterval(point(row.coefficient), subInterval(point(row.current), point(value))), point(density));
    interval = addInterval(interval, termInterval);
  }
  return { force, interval };
}

function reconstructUpdate(snapshot, includeLinks) {
  const { value, previousAfterContact, bending, tension, density, damping, lap, lapOfLap, zLinks } = snapshot;
  const vel = value - previousAfterContact;
  const link = includeLinks ? linkForceAndInterval(zLinks, value, density) : { force: 0, interval: point(0) };
  const doubleNext = 2 * value - previousAfterContact - bending * lapOfLap
    + tension * lap / density - damping * vel + link.force;
  let interval = subInterval(mulInterval(point(2), point(value)), point(previousAfterContact));
  interval = subInterval(interval, mulInterval(point(bending), point(lapOfLap)));
  interval = addInterval(interval, divInterval(mulInterval(point(tension), point(lap)), point(density)));
  interval = subInterval(interval, mulInterval(point(damping), subInterval(point(value), point(previousAfterContact))));
  interval = addInterval(interval, link.interval);
  return { doubleNext, float32Next: Math.fround(doubleNext), interval, linkForce: link.force, linkInterval: link.interval, vel };
}

function instrumentedWorkletSource() {
  const source = readFileSync(resolve(root, 'static/worklets/surface-plate.worklet.js'), 'utf8');
  const marker = `      const next = 2 * value - this.previous[node] - bending * lapOfLap
        + tension * lap[node] / density - damping * vel + linkForce;`;
  assert(source.indexOf(marker) === source.lastIndexOf(marker), 'Expected exactly one source update expression for isolated instrumentation.');
  return source.replace(marker, `${marker}
      if (this.auditLocalCapture?.step === this.telemetry.physicsSteps + 1 && this.auditLocalCapture.node === node) {
        const auditLinkRows = [];
        for (let auditQ = this.linkOffsets[node]; auditQ < this.linkOffsets[node + 1]; auditQ++) {
          const auditOther = this.linkNodes[auditQ];
          auditLinkRows.push({ node: auditOther, coefficient: this.linkCoefficients[auditQ],
            current: this.current[auditOther], previous: this.previous[auditOther] });
        }
        this.auditLocalCapture.result = { value, previous: this.previous[node], vel, lap: lap[node], lapOfLap,
          bending, tension, density, damping, linkForce, next, linkRows: auditLinkRows };
      }`);
}

function captureAttribution(config, first) {
  const source = instrumentedWorkletSource();
  const baseline = makeProcessor(source), treatment = makeProcessor(source);
  baseline.handleMessage({ type: 'topology', payload: config.oldTopology });
  baseline.handleMessage({ type: 'topology', payload: config.oldTopology });
  treatment.handleMessage({ type: 'topology', payload: config.oldTopology });
  treatment.handleMessage({ type: 'topology', payload: config.overlapTopology });
  baseline.handleMessage(PROBE); treatment.handleMessage(PROBE);
  const baselineNode = nodeMap(baseline.topology, OLD_ID).get(first.key);
  const treatmentNode = nodeMap(treatment.topology, OLD_ID).get(first.key);
  baseline.auditLocalCapture = { step: first.step, node: baselineNode, result: null };
  treatment.auditLocalCapture = { step: first.step, node: treatmentNode, result: null };
  for (const p of [baseline, treatment]) {
    const originalAdvance = p.advancePhysics.bind(p);
    p.advancePhysics = function capturePreStep() {
      if (this.telemetry.physicsSteps === first.step - 1) {
        this.auditLocalCapture.pre = {
          current: this.current.slice(), previous: this.previous.slice(),
          active: Array.from(this.active.subarray(0, this.activeCount)),
          contactCursor: this.contactCursor, contactForces: this.contactForces.slice()
        };
      }
      originalAdvance();
    };
  }
  for (let step = 1; step <= first.step; step++) {
    for (const p of [baseline, treatment]) {
      const left = new Float32Array(QUANTUM), right = new Float32Array(QUANTUM);
      p.process([], [[left, right]]);
    }
  }
  const baselineActual = baseline.auditLocalCapture.result, treatmentActual = treatment.auditLocalCapture.result;
  assert(baselineActual && treatmentActual, 'Could not capture first-divergence source update values.');
  const snapshot = (p, node, actual, addedLinks) => {
    const pre = p.auditLocalCapture.pre;
    const independentLap = sourceLapOfLap(p.topology, pre.current, node);
    const contactForceAtCursor = pre.contactForces[pre.contactCursor * p.current.length + node];
    const links = actual.linkRows.map((row) => {
      const delta = row.current - actual.value, rawZForce = row.coefficient * delta;
      return { ...row, key: nodeKey(p.topology, row.node), delta, rawZForce, density: actual.density, zForce: rawZForce / actual.density };
    });
    return {
      node, key: first.key, solverCell: p.topology.nodeGridIndices[node],
      value: actual.value, previousAfterContact: actual.previous, contactForceAtCursor,
      bending: actual.bending, tension: actual.tension, density: actual.density, damping: actual.damping,
      vel: actual.vel, lap: independentLap.ownLap, lapOfLap: independentLap.value,
      independentlyReconstructedLap: independentLap.ownLap,
      independentlyReconstructedLapOfLap: independentLap.value,
      sourceObservedLap: actual.lap, sourceObservedLapOfLap: actual.lapOfLap,
      lapReconstructionMatchesSource: independentLap.ownLap === actual.lap && independentLap.value === actual.lapOfLap,
      lapNeighborRows: independentLap.neighborRows,
      zLinks: addedLinks ? links.filter((row) => row.key.startsWith(`${NEW_ID}:`)) : [],
      allLinkRows: links, sourceDoubleNext: actual.next,
      sourceCurrentAfterStep: p.current[node], sourcePreviousAfterStep: p.previous[node],
      sourceLinkForce: actual.linkForce
    };
  };
  const baselineInput = snapshot(baseline, baselineNode, baselineActual, false);
  const treatmentInput = snapshot(treatment, treatmentNode, treatmentActual, true);
  const noLink = reconstructUpdate(treatmentInput, false);
  const withLink = reconstructUpdate(treatmentInput, true);
  const baseObserved = baseline.current[baselineNode], treatmentObserved = treatment.current[treatmentNode];
  const baseCell = f32RoundingCell(baseObserved), treatmentCell = f32RoundingCell(treatmentObserved);
  const positiveTerm = withLink.linkInterval[0] > 0;
  const negativeTerm = withLink.linkInterval[1] < 0;
  const crossedBoundary = positiveTerm ? withLink.interval[0] > baseCell.upper
    : negativeTerm ? withLink.interval[1] < baseCell.lower : false;
  const sameInputs = baselineInput.value === treatmentInput.value
    && baselineInput.previousAfterContact === treatmentInput.previousAfterContact
    && baselineInput.bending === treatmentInput.bending && baselineInput.tension === treatmentInput.tension
    && baselineInput.density === treatmentInput.density && baselineInput.damping === treatmentInput.damping
    && baselineInput.lap === treatmentInput.lap && baselineInput.lapOfLap === treatmentInput.lapOfLap
    && baselineActual.vel === treatmentActual.vel
    && baselineInput.lapReconstructionMatchesSource && treatmentInput.lapReconstructionMatchesSource;
  const predictedNoLinkMatchesBaseline = noLink.float32Next === baseObserved
    && noLink.doubleNext === baselineActual.next;
  const predictedWithLinkMatchesTreatment = withLink.float32Next === treatmentObserved
    && withLink.doubleNext === treatmentActual.next && withLink.linkForce === treatmentInput.sourceLinkForce;
  return {
    target: { key: first.key, solverCell: first.solverCell, firstCurrentDifference: first },
    preStepBaseline: baselineInput,
    preStepTreatment: treatmentInput,
    sourceReconstruction: {
      instrumentation: 'Isolated source-text hook records locals immediately after the unchanged update expression; production worklet is not modified.',
      instrumentedWorkletSourceSha256: sha256(Buffer.from(source)),
      formula: '2*value - previous - bending*lapOfLap + tension*lap/density - damping*vel + linkForce; source operation order preserved',
      sourceStepInputsMatch: sameInputs,
      noLink: { ...noLink, interval: { lower: noLink.interval[0], upper: noLink.interval[1] },
        roundingCell: baseCell, observedFloat32: baseObserved, bitPattern: float32Bits(baseObserved), sourceDoubleNext: baselineActual.next },
      withNewZLinks: { ...withLink, interval: { lower: withLink.interval[0], upper: withLink.interval[1] },
        linkInterval: { lower: withLink.linkInterval[0], upper: withLink.linkInterval[1] },
        roundingCell: treatmentCell, observedFloat32: treatmentObserved,
        bitPattern: float32Bits(treatmentObserved), sourceDoubleNext: treatmentActual.next },
      sourceLocalValues: { baseline: baselineActual, treatment: treatmentActual },
      expectedNoLinkFloat32: noLink.float32Next,
      expectedWithLinkFloat32: withLink.float32Next,
      observedDifference: treatmentObserved - baseObserved,
      binary64NextDifference: treatmentActual.next - baselineActual.next,
      zTermIntervalExcludesZero: positiveTerm || negativeTerm,
      treatmentIntervalCrossesOutOfBaselineFloat32Cell: crossedBoundary,
      independentlyReconstructedLinkForceMatchesSource: withLink.linkForce === treatmentInput.sourceLinkForce,
      sourceFloat32ResultsMatchObserved: predictedNoLinkMatchesBaseline && predictedWithLinkMatchesTreatment,
      sourceDoubleResultsMatchReconstruction: noLink.doubleNext === baselineActual.next && withLink.doubleNext === treatmentActual.next,
      attributionPass: sameInputs && (positiveTerm || negativeTerm) && crossedBoundary
        && predictedNoLinkMatchesBaseline && predictedWithLinkMatchesTreatment
        && noLink.doubleNext === baselineActual.next && withLink.doubleNext === treatmentActual.next
    }
  };
}
function float32Bits(value) {
  const view = new DataView(new ArrayBuffer(4)); view.setFloat32(0, value, true); return `0x${view.getUint32(0, true).toString(16).padStart(8, '0')}`;
}

function sourceFingerprint(relativePath) {
  const bytes = readFileSync(resolve(root, relativePath));
  const normalized = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  return { bytes: bytes.length, sha256: sha256(bytes), normalizedLfSha256: sha256(normalized) };
}

function validatePriorFeasibilityManifest(fingerprints) {
  const manifestPath = 'docs/ant/evidence/2026-10-11-w1-supplied-layer-response-feasibility/artifact-hashes.json';
  const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8'));
  const checks = [
    ['src/lib/audio/compileSurfaceTopology.js', fingerprints.compiler],
    ['static/worklets/surface-plate.worklet.js', fingerprints.worklet],
    ['docs/ant/evidence/2026-10-11-w1-supplied-layer-response-feasibility/probe.mjs', fingerprints.priorFixtureScript],
    ['docs/ant/evidence/2026-10-11-w1-supplied-layer-response-feasibility/results.json', fingerprints.priorFixtureResults]
  ].map(([path, actual]) => {
    const recorded = manifest.files[path];
    return { path, recordedBytes: recorded?.bytes ?? null, actualBytes: actual.bytes,
      recordedSha256: recorded?.sha256 ?? null, actualSha256: actual.sha256,
      match: recorded?.bytes === actual.bytes && recorded?.sha256 === actual.sha256 };
  });
  return { sourceHead: manifest.sourceHead, checks, pass: checks.every((item) => item.match) };
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function encodeTrace(frames) { return Buffer.concat(frames); }

export function runAudit({ captureTraces = true } = {}) {
  const config = prepareConfig();
  const arms = configureArms(config);
  const baselineRest = arms['baseline-reinstall'].restBeforeInsertion;
  const treatmentRest = arms.treatment.restBeforeInsertion;
  const manipulation = topologyChecks(config, arms);
  const pulseBeforeA = arms['baseline-reinstall'].pulseBeforeStrike;
  const pulseBeforeB = arms.treatment.pulseBeforeStrike;
  const pulseAfterA = arms['baseline-reinstall'].pulseAfterStrike;
  const pulseAfterB = arms.treatment.pulseAfterStrike;
  const oldPulseIncrementA = new Map([...pulseAfterA].map(([key, row]) => [key, row.map((value, i) => value - pulseBeforeA.get(key)[i])]));
  const oldPulseIncrementB = new Map([...pulseAfterB].map(([key, row]) => [key, row.map((value, i) => value - pulseBeforeB.get(key)[i])]));
  const newPulseIncrements = arms.treatment.newPulseAfterStrike;
  let newLayerPulseIncrementCount = 0;
  for (const row of newPulseIncrements.values()) for (const value of row) if (value !== 0) newLayerPulseIncrementCount++;
  const pulseChecks = {
    oldContactPulseIncrementMismatchCount: pulseMismatch(oldPulseIncrementA, oldPulseIncrementB),
    treatmentNewLayerContactPulseIncrementCount: newLayerPulseIncrementCount,
    oldContactMemoryAfterStrikeMatches: [...arms['baseline-reinstall'].oldContactAfterStrike].every(([key, row]) => equalArray(row, arms.treatment.oldContactAfterStrike.get(key))),
    cursorsMatchBeforeStep: arms['baseline-reinstall'].p.contactCursor === arms.treatment.p.contactCursor,
    oldPulseIncrementHashes: {
      baseline: sha256(Buffer.from(JSON.stringify([...oldPulseIncrementA]))),
      treatment: sha256(Buffer.from(JSON.stringify([...oldPulseIncrementB])))
    }
  };
  const comparison = {
    firstCurrent: null, firstCurrentNodes: null, firstState: null, maxCurrentAbs: 0, maxCurrentStep: null,
    maxStateAbs: 0, maxStateStep: null, perStep: [],
    reinstallControlMismatchSteps: 0, treatmentReplayMismatchSteps: 0,
    disjointOldMismatchSteps: 0, noProbeOldMismatchSteps: 0, noProbeNonzeroSteps: 0,
    anyDiagnosticFault: false
  };
  for (let step = 1; step <= STEPS; step++) recordAllStepStats(arms, step, captureTraces, comparison);
  const disjointLinks = crossLayerLinks(config.disjointTopology);
  const oldMap = nodeMap(config.oldTopology, OLD_ID);
  const disjointNewZero = mapAllZero(arms['disjoint-treatment'].p, NEW_ID);
  const noProbeNoActive = ['no-probe-baseline', 'no-probe-treatment'].every((name) => arms[name].p.activeCount === 0);
  const controlResults = {
    reinstall: { mismatchPhysicsSteps: comparison.reinstallControlMismatchSteps, pass: comparison.reinstallControlMismatchSteps === 0 },
    noProbe: { oldMismatchPhysicsSteps: comparison.noProbeOldMismatchSteps, nonzeroPhysicsSteps: comparison.noProbeNonzeroSteps,
      noActiveNodesThroughHorizon: noProbeNoActive, pass: comparison.noProbeOldMismatchSteps === 0 && comparison.noProbeNonzeroSteps === 0 && noProbeNoActive },
    disjoint: { oldMismatchPhysicsSteps: comparison.disjointOldMismatchSteps, crossLayerZLinks: disjointLinks.length,
      newLayerRemainsZero: disjointNewZero, pass: comparison.disjointOldMismatchSteps === 0 && disjointLinks.length === 0 && disjointNewZero },
    deterministicTreatmentReplay: { mismatchPhysicsSteps: comparison.treatmentReplayMismatchSteps,
      traceHashMatches: arms.treatment.traceHash.copy().digest('hex') === arms['treatment-replay'].traceHash.copy().digest('hex'),
      pass: comparison.treatmentReplayMismatchSteps === 0 && arms.treatment.traceHash.copy().digest('hex') === arms['treatment-replay'].traceHash.copy().digest('hex') }
  };
  const first = comparison.firstCurrent;
  const attributionTargets = (comparison.firstCurrentNodes ?? []).map((target) => captureAttribution(config, { ...target, step: first.step }));
  const attribution = attributionTargets.length ? {
    firstDivergenceTargetCount: attributionTargets.length,
    targets: attributionTargets,
    allTargetsPass: attributionTargets.every((target) => target.sourceReconstruction.attributionPass)
  } : null;
  const allRequiredSteps = Object.values(arms).every(({ p }) => p.telemetry.physicsSteps === STEPS);
  const diagnostics = Object.fromEntries(Object.entries(arms).map(([name, { p, nonFiniteStateCount }]) => [name, {
    dropped: p.telemetry.dropped, routeDrops: p.telemetry.droppedRoutes, nonFinite: p.telemetry.nonFinite,
    nonFiniteTraceValues: nonFiniteStateCount, physicsSteps: p.telemetry.physicsSteps
  }]));
  const zeroDiagnosticFaults = Object.values(diagnostics).every((item) => !item.dropped && !item.routeDrops && !item.nonFinite && !item.nonFiniteTraceValues && item.physicsSteps === STEPS);
  const sourceFingerprints = {
    auditRunner: sourceFingerprint(RUNNER_PATH),
    compiler: sourceFingerprint('src/lib/audio/compileSurfaceTopology.js'),
    worklet: sourceFingerprint('static/worklets/surface-plate.worklet.js'),
    priorFixtureScript: sourceFingerprint('docs/ant/evidence/2026-10-11-w1-supplied-layer-response-feasibility/probe.mjs'),
    priorFixtureResults: sourceFingerprint('docs/ant/evidence/2026-10-11-w1-supplied-layer-response-feasibility/results.json'),
    priorFixtureManifest: sourceFingerprint('docs/ant/evidence/2026-10-11-w1-supplied-layer-response-feasibility/artifact-hashes.json')
  };
  const priorFeasibilityIntegrity = validatePriorFeasibilityManifest(sourceFingerprints);
  const manipulationPass = manipulation.allChecksPass && priorFeasibilityIntegrity.pass && pulseChecks.oldContactPulseIncrementMismatchCount === 0
    && pulseChecks.treatmentNewLayerContactPulseIncrementCount === 0 && pulseChecks.oldContactMemoryAfterStrikeMatches && pulseChecks.cursorsMatchBeforeStep;
  const controlsPass = Object.values(controlResults).every((item) => item.pass);
  const judgment = !manipulationPass || !controlsPass || !zeroDiagnosticFaults || !allRequiredSteps
    ? 'INCONCLUSIVE' : !first ? 'NEGATIVE' : attribution?.allTargetsPass ? 'SUPPORTED' : 'ARITHMETIC_INCONCLUSIVE';
  const configDescriptor = {
    world: { sourceGrid: '96x96', solverGrid: '32x32' },
    oldPlate: { id: OLD_ID, inclusiveMask: { x: [30, 66], y: [44, 50] }, pickupY: 48, material: { stiffness: 0.9, density: 1.1, damping: 0.35 }, thicknessMeters: 0.001, edges: [] },
    addedPlate: { id: NEW_ID, inclusiveMask: { x: [48, 76], y: [44, 50] }, pickupY: 48, sameMaterial: true },
    disjointAddedPlate: { id: NEW_ID, inclusiveMask: { x: [48, 76], y: [54, 60] }, pickupY: 58, sameMaterial: true },
    probe: { plateId: OLD_ID, position: [45 / 95, 48 / 95], strength: 0.035, footprintRadius: 0.012 },
    solver: { sampleRateHz: RATE, physicsRateHz: 6000, steps: STEPS, horizonSeconds: 0.5, processQuantumSamples: QUANTUM }
  };
  const traces = Object.fromEntries(Object.entries(arms).map(([name, arm]) => [name, captureTraces ? encodeTrace(arm.traceChunks) : null]));
  const traceInfo = Object.fromEntries(Object.entries(arms).map(([name, arm]) => [name, {
    nodeOrder: Array.from({ length: arm.p.current.length }, (_v, index) => nodeKey(arm.p.topology, index)),
    layout: 'each step: Float32LE current[nodeCount], then Float32LE previous[nodeCount]',
    frameCount: STEPS, bytes: arm.traceChunks.reduce((sum, chunk) => sum + chunk.length, 0),
    sha256: arm.traceHash.copy().digest('hex')
  }]));
  return {
    schemaVersion: 1,
    judgment,
    scope: 'read-only attribution inside the existing authored normalized Plate solver; no material formation or production behavior claim',
    sourceFingerprints,
    priorFeasibilityIntegrity,
    config: configDescriptor,
    configSha256: sha256(Buffer.from(JSON.stringify(configDescriptor))),
    topology: {
      oldOnlyNodes: config.oldTopology.nodeGridIndices.length,
      overlapNodes: config.overlapTopology.nodeGridIndices.length,
      overlapZLinks: crossLayerLinks(config.overlapTopology).length,
      disjointNodes: config.disjointTopology.nodeGridIndices.length,
      disjointZLinks: disjointLinks.length,
      oldLayerCoefficientValues: layerCoefficientValues(config.oldTopology, OLD_ID),
      overlapOldLayerCoefficientValues: layerCoefficientValues(config.overlapTopology, OLD_ID),
      oldLayerSolverCellsSha256: sha256(Buffer.from(JSON.stringify([...oldMap.keys()]))),
      overlapTopologyArraySha256: topologyHash(config.overlapTopology),
      disjointTopologyArraySha256: topologyHash(config.disjointTopology)
    },
    preInsertionBoundary: { baseline: baselineRest, treatment: treatmentRest, manipulation },
    pulseChecks,
    comparison: { ...comparison, maxCurrentDifferenceUnits: 'solver displacement units; Float32 nodal state', firstDivergence: first },
    controls: controlResults,
    attribution,
    arms: Object.fromEntries(Object.entries(arms).map(([name, arm]) => [name, summarizeArm(arm)])),
    diagnostics,
    validation: {
      allArmsReached3000Steps: allRequiredSteps,
      priorFeasibilityInputHashesMatch: priorFeasibilityIntegrity.pass,
      manipulationPass,
      controlsPass,
      zeroDiagnosticFaults,
      attributionPass: attribution?.allTargetsPass === true
    },
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    traceInfo,
    traces
  };
}

function topologyHash(t) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(t.layerIds));
  for (const key of ['nodeOffsets', 'nodeGridIndices', 'neighborIndices', 'materialCoefficients', 'adjacentLinkNodes', 'adjacentLinkCoefficients']) {
    hash.update(key); hash.update(Buffer.from(t[key].buffer, t[key].byteOffset, t[key].byteLength));
  }
  return hash.digest('hex');
}

function parseOutputDir(args) {
  const index = args.indexOf('--output-dir');
  return index >= 0 ? resolve(args[index + 1]) : resolve(here, 'artifacts');
}

function writeArtifacts(result, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const safe = { ...result }; delete safe.traces;
  const files = {};
  for (const [name, bytes] of Object.entries(result.traces)) {
    const filename = `trace-${name}.f32le`;
    writeFileSync(resolve(outputDir, filename), bytes);
    files[filename] = { bytes: bytes.length, sha256: sha256(bytes) };
  }
  const resultBytes = Buffer.from(`${JSON.stringify(safe, null, 2)}\n`);
  writeFileSync(resolve(outputDir, 'results.json'), resultBytes);
  files['results.json'] = { bytes: resultBytes.length, sha256: sha256(resultBytes) };
  const manifest = {
    schemaVersion: 1,
    traceLayout: 'For each frame, all Float32LE current values in nodeOrder followed by all Float32LE previous values.',
    sourceFingerprints: safe.sourceFingerprints,
    files
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(resolve(outputDir, 'artifact-hashes.json'), manifestBytes);
  return { outputDir, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runAudit({ captureTraces: true });
  const written = writeArtifacts(result, parseOutputDir(process.argv.slice(2)));
  console.log(JSON.stringify({ judgment: result.judgment, firstDivergence: result.comparison.firstDivergence,
    controls: result.controls, validation: result.validation, outputDir: written.outputDir,
    artifactCount: Object.keys(written.manifest.files).length }, null, 2));
}
