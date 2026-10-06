import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = 'docs/ant/evidence/2026-10-07-dormant-plate-rom/run-48672cd-final';
const SNAPSHOT = 'docs/ant/evidence/2026-10-06-sleep-blockers/2026-10-06T11-08-56-558Z/worklet-state-snapshot.json.gz';
const EVENTS = 'docs/ant/evidence/2026-10-06-sleep-blockers/2026-10-06T11-08-56-558Z/snapshot-following-2s.json';
const RATE = 6000;
const DAMPING_MULTIPLIER = 50;
const WAKE_ENERGY = 1e-10;
const CAPTURE_STEPS = 2500;
const DEFAULT_RANKS = [2, 4, 8, 16, 32, 64, 128];
const MIX = 1 / Math.sqrt(12);
const targetIds = ['trail-plate-1', 'trail-plate-29'];
const outputDir = resolve(ROOT, process.argv[2] || EVIDENCE);

function sha256(data) { return createHash('sha256').update(data).digest('hex'); }
function assertSourceConstant(source, name, value) {
  assert.match(source, new RegExp('const ' + name + ' = ' + value + ';'),
    'Diagnostic assumption drifted from worklet constant ' + name);
}
function typedBytes(value) {
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}
function hashTopology(topology) {
  const hash = createHash('sha256');
  for (const [key, value] of Object.entries(topology)) {
    hash.update(key);
    hash.update(ArrayBuffer.isView(value) ? typedBytes(value) : JSON.stringify(value));
  }
  return hash.digest('hex');
}

const arrayTypes = new Map(['Float32Array', 'Float64Array', 'Uint32Array', 'Int32Array',
  'Uint16Array', 'Uint8Array', 'Int16Array'].map(name => [name, globalThis[name]]));
function revive(value) {
  if (Array.isArray(value)) return value.map(revive);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.__typedArray === 'string' && Array.isArray(value.data)) {
    const Type = arrayTypes.get(value.__typedArray);
    assert.ok(Type, 'Unsupported diagnostic typed array: ' + value.__typedArray);
    return Type.from(value.data);
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, revive(entry)]));
}

function processorConstructor(source) {
  let Processor;
  class AudioWorkletProcessorStub {
    constructor() { this.port = { onmessage: null, postMessage() {} }; }
  }
  const sandbox = {
    AudioWorkletProcessor: AudioWorkletProcessorStub,
    registerProcessor(_name, constructor) { Processor = constructor; },
    sampleRate: 48000,
    Float32Array, Float64Array, Uint32Array, Int32Array, Uint16Array, Uint8Array, Int16Array,
    Math, Number, Object, Array, Map
  };
  vm.runInNewContext(source, sandbox, { filename: 'surface-plate.worklet.rom-feasibility.js' });
  assert.ok(Processor, 'SurfacePlateProcessor did not register');
  return Processor;
}

function createModel(topology, plateId, processor) {
  const layer = topology.layerIds.indexOf(plateId);
  assert.ok(layer >= 0, 'Missing frozen Plate: ' + plateId);
  const start = topology.nodeOffsets[layer], end = topology.nodeOffsets[layer + 1];
  const nodeCount = end - start, localOf = new Int32Array(topology.nodeGridIndices.length);
  localOf.fill(-1);
  for (let i = 0; i < nodeCount; i++) localOf[start + i] = i;
  const neighbors = new Int32Array(nodeCount * 4);
  const degrees = new Uint8Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    for (let d = 0; d < 4; d++) {
      const global = topology.neighborIndices[(start + i) * 4 + d];
      const local = global < 0 ? -1 : localOf[global];
      neighbors[i * 4 + d] = local;
      if (local >= 0) degrees[i]++;
    }
  }
  const mi = layer * 4, density = topology.materialCoefficients[mi + 2];
  const linkDiagonal = new Float64Array(nodeCount);
  const sphereFoundations = [];
  let linkEdges = 0;
  for (let i = 0; i < nodeCount; i++) {
    const global = start + i;
    for (let q = processor.linkOffsets[global]; q < processor.linkOffsets[global + 1]; q++) {
      const other = processor.linkNodes[q];
      assert.ok(localOf[other] < 0, 'Expected compiled adjacent-layer links to leave the selected Plate');
      linkDiagonal[i] += processor.linkCoefficients[q] / density;
      linkEdges++;
    }
    for (let q = processor.sphereLinkOffsets[global]; q < processor.sphereLinkOffsets[global + 1]; q++) {
      const nodule = processor.sphereLinkModes[q];
      const weight = processor.sphereWeight[nodule] || 0;
      linkDiagonal[i] += weight * 0.000025 / density;
      sphereFoundations.push({ node: i, nodule, weight });
    }
  }
  const pickup = [
    localOf[topology.pickupNodeIndices[layer * 2]],
    localOf[topology.pickupNodeIndices[layer * 2 + 1]]
  ];
  assert.ok(pickup.every(node => node >= 0), 'Pickup must belong to selected Plate');
  return {
    plateId, layer, start, end, nodeCount, localOf, neighbors, degrees, pickup,
    bending: topology.materialCoefficients[mi],
    tension: topology.materialCoefficients[mi + 1],
    density,
    damping: topology.materialCoefficients[mi + 3] * DAMPING_MULTIPLIER,
    linkDiagonal, linkEdges, sphereFoundations,
    nodeGridIndices: topology.nodeGridIndices.slice(start, end)
  };
}

function restoreProcessor(Processor, topology, dynamic) {
  const processor = new Processor();
  processor.installTopology(topology);
  for (const key of ['current', 'previous', 'next', 'energyQuiet', 'awake', 'contactForces',
    'contactMemory', 'lastContactStep', 'sphereCurrent', 'spherePrevious']) {
    if (dynamic[key] && processor[key]) processor[key].set(dynamic[key]);
  }
  processor.active.set(dynamic.active);
  processor.activeCount = dynamic.activeCount;
  if (dynamic.pendingWake) processor.pendingWake.set(dynamic.pendingWake);
  if (dynamic.pendingWakeReason) processor.pendingWakeReason.set(dynamic.pendingWakeReason);
  if (dynamic.pendingNodes) processor.pendingNodes.set(dynamic.pendingNodes);
  processor.pendingCount = dynamic.pendingCount || 0;
  processor.contactCursor = dynamic.contactCursor || 0;
  processor.telemetry = { ...dynamic.telemetry };
  processor.telemetry.physicsSteps = dynamic.physicsSteps;
  processor.sleepDiagnosticsEnabled = false;
  return processor;
}

function zeroTarget(processor, model) {
  const totalNodes = processor.current.length;
  for (let global = model.start; global < model.end; global++) {
    processor.current[global] = 0;
    processor.previous[global] = 0;
    processor.next[global] = 0;
    processor.energyQuiet[global] = 0;
    processor.contactMemory[global] = 0;
    processor.lastContactStep[global] = 0;
    for (let pulse = 0; pulse < 18; pulse++)
      processor.contactForces[pulse * totalNodes + global] = 0;
  }
}

function makeFullState(model, current = null, previous = null) {
  return {
    current: current ? Float32Array.from(current) : new Float32Array(model.nodeCount),
    previous: previous ? Float32Array.from(previous) : new Float32Array(model.nodeCount),
    next: new Float32Array(model.nodeCount),
    lap: new Float32Array(model.nodeCount),
    lapOfLap: new Float32Array(model.nodeCount)
  };
}

function inputFor(model, processor) {
  const z = new Float64Array(model.nodeCount), sphere = new Float64Array(model.nodeCount);
  const topology = processor.topology, mi = model.layer * 4;
  for (let i = 0; i < model.nodeCount; i++) {
    const global = model.start + i;
    for (let q = processor.linkOffsets[global]; q < processor.linkOffsets[global + 1]; q++) {
      const other = processor.linkNodes[q];
      z[i] += processor.linkCoefficients[q] * processor.current[other] / model.density;
    }
    for (let q = processor.sphereLinkOffsets[global]; q < processor.sphereLinkOffsets[global + 1]; q++) {
      const nodule = processor.sphereLinkModes[q];
      let modalContact = 0;
      for (let m = 0; m < 12; m++) {
        const mode = nodule * 12 + m;
        modalContact += processor.sphereFoundationShape[mode] * processor.sphereCurrent[mode];
      }
      sphere[i] += (processor.sphereWeight[nodule] || 0) * 0.000025 * modalContact / model.density;
    }
  }
  assert.ok(topology.materialCoefficients[mi + 2] === model.density);
  return { z, sphere };
}

function stepFull(model, state, forceZ, forceSphere) {
  const { current, previous, next, lap, lapOfLap } = state;
  for (let i = 0; i < model.nodeCount; i++) {
    let value = -4 * current[i];
    const off = i * 4;
    for (let d = 0; d < 4; d++) {
      const neighbor = model.neighbors[off + d];
      if (neighbor >= 0) value += current[neighbor];
    }
    lap[i] = value;
  }
  for (let i = 0; i < model.nodeCount; i++) {
    let bilap = -4 * lap[i];
    const off = i * 4;
    for (let d = 0; d < 4; d++) {
      const neighbor = model.neighbors[off + d];
      if (neighbor >= 0) bilap += lap[neighbor];
    }
    lapOfLap[i] = bilap;
    const value = current[i], velocity = value - previous[i];
    next[i] = 2 * value - previous[i] - model.bending * bilap
      + model.tension * lap[i] / model.density - model.damping * velocity
      - model.linkDiagonal[i] * value + forceZ[i] + forceSphere[i];
  }
  state.previous = current;
  state.current = next;
  state.next = previous;
}

function exactEnergyThresholds(model, current, previous) {
  const n = model.nodeCount, lap = new Float64Array(n), lapOfLap = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let value = -4 * previous[i];
    for (let d = 0; d < 4; d++) {
      const j = model.neighbors[i * 4 + d];
      if (j >= 0) value += previous[j];
    }
    lap[i] = value;
  }
  for (let i = 0; i < n; i++) {
    let value = -4 * lap[i];
    for (let d = 0; d < 4; d++) {
      const j = model.neighbors[i * 4 + d];
      if (j >= 0) value += lap[j];
    }
    lapOfLap[i] = value;
  }
  let sleepEnergy = false, intraPlateWakeEnergy = false;
  for (let i = 0; i < n; i++) {
    const velocity = current[i] - previous[i];
    if (current[i] ** 2 + velocity ** 2 + model.bending * lap[i] ** 2 >= WAKE_ENERGY)
      sleepEnergy = true;
    if (current[i] ** 2 + velocity ** 2 + lapOfLap[i] ** 2 * 0.0001 > WAKE_ENERGY)
      intraPlateWakeEnergy = true;
  }
  return { sleepEnergy, intraPlateWakeEnergy };
}

function restoreNaturalProcessor(Processor, snapshot, targetModels) {
  const processor = restoreProcessor(Processor, snapshot.topology, snapshot.dynamic);
  for (const model of targetModels) {
    zeroTarget(processor, model);
    const present = new Uint8Array(processor.current.length);
    for (let a = 0; a < processor.activeCount; a++) present[processor.active[a]] = 1;
    for (let global = model.start; global < model.end; global++) if (!present[global]) {
      processor.awake[global] = 1;
      processor.active[processor.activeCount++] = global;
    }
    for (let global = model.start; global < model.end; global++) processor.awake[global] = 1;
  }
  return processor;
}

function forceTrace(model, steps) {
  return {
    plateId: model.plateId,
    steps,
    nodeCount: model.nodeCount,
    z: new Float64Array(steps * model.nodeCount),
    sphere: new Float64Array(steps * model.nodeCount),
    initialCurrent: new Float32Array(model.nodeCount),
    initialPrevious: new Float32Array(model.nodeCount),
    maxSourceStateError: 0,
    maxSourceVelocityError: 0
  };
}

function recordCapture(processor, models, steps, events, eventFilter, strike = null) {
  const traces = new Map(models.map(model => [model.plateId, forceTrace(model, steps)]));
  const fullStates = new Map(models.map(model => {
    const current = processor.current.slice(model.start, model.end);
    const previous = processor.previous.slice(model.start, model.end);
    const trace = traces.get(model.plateId);
    trace.initialCurrent.set(current);
    trace.initialPrevious.set(previous);
    return [model.plateId, makeFullState(model, current, previous)];
  }));
  if (strike) {
    processor.handleMessage({ type: 'strike', payload: strike });
    assert.equal(processor.telemetry.strikes, 1, 'Recorded strike was not accepted');
    assert.equal(processor.telemetry.droppedRoutes, 0, 'Recorded strike route was dropped');
  }
  let eventIndex = 0, skippedDirect = 0, appliedStrikes = strike ? 1 : 0;
  const startStep = processor.telemetry.physicsSteps;
  for (let step = 0; step < steps; step++) {
    const physicsStep = processor.telemetry.physicsSteps;
    while (eventIndex < events.length && events[eventIndex].physicsStep <= physicsStep) {
      const event = events[eventIndex++];
      if (event.type === 'topology') {
        assert.fail('A topology update entered a frozen-topology capture window');
      }
      if (event.type !== 'strike') continue;
      if (eventFilter && !eventFilter(event)) { skippedDirect++; continue; }
      processor.handleMessage({ type: 'strike', payload: event.payload });
      appliedStrikes++;
    }
    const inputs = new Map();
    for (const model of models) {
      const trace = traces.get(model.plateId), input = inputFor(model, processor);
      inputs.set(model.plateId, input);
      const offset = step * model.nodeCount;
      trace.z.set(input.z, offset);
      trace.sphere.set(input.sphere, offset);
    }
    processor.advancePhysics();
    for (const model of models) {
      const trace = traces.get(model.plateId), state = fullStates.get(model.plateId);
      const input = inputs.get(model.plateId);
      stepFull(model, state, input.z, input.sphere);
      for (let i = 0; i < model.nodeCount; i++) {
        const global = model.start + i;
        trace.maxSourceStateError = Math.max(trace.maxSourceStateError,
          Math.abs(state.current[i] - processor.current[global]));
        trace.maxSourceVelocityError = Math.max(trace.maxSourceVelocityError,
          Math.abs((state.current[i] - state.previous[i])
            - (processor.current[global] - processor.previous[global])));
      }
    }
  }
  return {
    traces,
    capture: {
      startPhysicsStep: startStep,
      endPhysicsStep: processor.telemetry.physicsSteps,
      steps,
      seconds: steps / RATE,
      appliedStrikes,
      skippedDirectStrikes: skippedDirect,
      totalAcceptedStrikes: processor.telemetry.strikes,
      droppedRoutes: processor.telemetry.droppedRoutes,
      nonFinite: processor.telemetry.nonFinite
    }
  };
}

function lapSquareModel(model) {
  const n = model.nodeCount, out = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    out[i * n + i] += 16;
    for (let a = 0; a < 4; a++) {
      const mid = model.neighbors[i * 4 + a];
      if (mid < 0) continue;
      out[i * n + mid] -= 8;
      for (let b = 0; b < 4; b++) {
        const end = model.neighbors[mid * 4 + b];
        if (end >= 0) out[i * n + end] += 1;
      }
    }
  }
  return out;
}

function symmetricEigen(matrix, n) {
  const a = Float64Array.from(matrix), vectors = new Float64Array(n * n);
  for (let i = 0; i < n; i++) vectors[i * n + i] = 1;
  let sweeps = 0, maxOffDiagonal = Infinity;
  for (; sweeps < 80; sweeps++) {
    maxOffDiagonal = 0;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++)
      maxOffDiagonal = Math.max(maxOffDiagonal, Math.abs(a[p * n + q]));
    if (maxOffDiagonal < 2e-13) break;
    const threshold = sweeps < 5 ? maxOffDiagonal / (5 * n) : 2e-13;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      const pq = a[p * n + q];
      if (Math.abs(pq) <= threshold) continue;
      const pp = a[p * n + p], qq = a[q * n + q];
      const tau = (qq - pp) / (2 * pq);
      const t = (tau < 0 ? -1 : 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      const c = 1 / Math.sqrt(1 + t * t), s = t * c;
      a[p * n + p] = pp - t * pq;
      a[q * n + q] = qq + t * pq;
      a[p * n + q] = a[q * n + p] = 0;
      for (let k = 0; k < n; k++) if (k !== p && k !== q) {
        const kp = a[k * n + p], kq = a[k * n + q];
        const np = c * kp - s * kq, nq = s * kp + c * kq;
        a[k * n + p] = a[p * n + k] = np;
        a[k * n + q] = a[q * n + k] = nq;
      }
      for (let k = 0; k < n; k++) {
        const kp = vectors[k * n + p], kq = vectors[k * n + q];
        vectors[k * n + p] = c * kp - s * kq;
        vectors[k * n + q] = s * kp + c * kq;
      }
    }
  }
  assert.ok(sweeps < 80 && maxOffDiagonal < 2e-10,
    'Jacobi eigensolver did not converge: ' + maxOffDiagonal);
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => a[x * n + x] - a[y * n + y]);
  const values = new Float64Array(n), sorted = new Float64Array(n * n);
  for (let k = 0; k < n; k++) {
    const old = order[k], value = a[old * n + old];
    values[k] = value;
    let largest = 0;
    for (let i = 1; i < n; i++)
      if (Math.abs(vectors[i * n + old]) > Math.abs(vectors[largest * n + old])) largest = i;
    const sign = vectors[largest * n + old] < 0 ? -1 : 1;
    for (let i = 0; i < n; i++) sorted[i * n + k] = sign * vectors[i * n + old];
  }
  return { values, vectors: sorted, sweeps, maxOffDiagonal };
}

function buildBasis(model) {
  const n = model.nodeCount, lap2 = lapSquareModel(model);
  const alpha = model.tension / model.density, matrix = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let lap = 0;
    if (i === j) lap = -4;
    else for (let d = 0; d < 4; d++) if (model.neighbors[i * 4 + d] === j) { lap = 1; break; }
    matrix[i * n + j] = model.bending * lap2[i * n + j] - alpha * lap
      + (i === j ? model.linkDiagonal[i] : 0);
  }
  let asymmetry = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
    asymmetry = Math.max(asymmetry, Math.abs(matrix[i * n + j] - matrix[j * n + i]));
  assert.ok(asymmetry < 1e-11, 'Frozen Plate stiffness operator is not symmetric: ' + asymmetry);
  const eig = symmetricEigen(matrix, n);
  let orthogonalityError = 0, residualMax = 0;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    let dot = 0;
    for (let i = 0; i < n; i++) dot += eig.vectors[i * n + a] * eig.vectors[i * n + b];
    orthogonalityError = Math.max(orthogonalityError, Math.abs(dot - (a === b ? 1 : 0)));
  }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    let value = -eig.values[k] * eig.vectors[i * n + k];
    for (let j = 0; j < n; j++) value += matrix[i * n + j] * eig.vectors[j * n + k];
    residualMax = Math.max(residualMax, Math.abs(value));
  }
  return { ...eig, stiffness: matrix, lap2, orthogonalityError, residualMax, asymmetry };
}

function makeScenario(name, model, components) {
  const end = Math.max(...components.map(x => x.offset + x.length));
  return {
    name, plateId: model.plateId, nodeCount: model.nodeCount, steps: end,
    input(steps) {
      const z = new Float64Array(model.nodeCount), sphere = new Float64Array(model.nodeCount);
      for (const component of components) {
        const sourceStep = steps - component.offset + component.from;
        if (sourceStep < component.from || sourceStep >= component.from + component.length) continue;
        const offset = sourceStep * model.nodeCount;
        for (let i = 0; i < model.nodeCount; i++) {
          z[i] += component.trace.z[offset + i] * component.scale;
          sphere[i] += component.trace.sphere[offset + i] * component.scale;
        }
      }
      return { z, sphere };
    },
  };
}

function buildMetrics(model, scenario, basis, rank, keepSeries = false, keepSpectrum = false) {
  const full = makeFullState(model), r = rank, eigenvectors = basis.vectors;
  let q = new Float64Array(r), qPrevious = new Float64Array(r), qNext = new Float64Array(r);
  const forceProjection = new Float64Array(r);
  let refOutSq = 0, romOutSq = 0, errOutSq = 0, maxOutputError = 0, peakRef = 0, peakError = 0;
  let stateRefSq = 0, stateErrSq = 0, statePeakError = 0, statePeakReference = 0;
  let forceNormSq = 0, retainedForceSq = 0, inputWorkFull = 0, inputWorkRom = 0;
  let firstFullSleepEnergy = null, firstRomSleepEnergy = null;
  let firstFullIntraWake = null, firstRomIntraWake = null, nonFinite = 0, clippedSamples = 0;
  const fullLeft = new Float32Array(scenario.steps), fullRight = new Float32Array(scenario.steps);
  const romLeft = new Float32Array(scenario.steps), romRight = new Float32Array(scenario.steps);
  const stateErrorSeries = keepSeries ? new Float32Array(scenario.steps) : null;
  let inputNodeSteps = 0;
  for (let step = 0; step < scenario.steps; step++) {
    const input = scenario.input(step), force = new Float64Array(model.nodeCount);
    for (let i = 0; i < model.nodeCount; i++) {
      force[i] = input.z[i] + input.sphere[i];
      forceNormSq += force[i] * force[i];
      if (force[i] !== 0) inputNodeSteps++;
    }
    forceProjection.fill(0);
    for (let i = 0; i < model.nodeCount; i++) if (force[i] !== 0) {
      const row = i * model.nodeCount;
      for (let k = 0; k < r; k++) forceProjection[k] += eigenvectors[row + k] * force[i];
    }
    for (let k = 0; k < r; k++) retainedForceSq += forceProjection[k] * forceProjection[k];
    stepFull(model, full, input.z, input.sphere);
    for (let k = 0; k < r; k++) {
      qNext[k] = (2 - model.damping - basis.values[k]) * q[k]
        + (model.damping - 1) * qPrevious[k] + forceProjection[k];
    }
    const estimate = new Float64Array(model.nodeCount), estimatePrevious = new Float64Array(model.nodeCount);
    for (let i = 0; i < model.nodeCount; i++) {
      let current = 0, previous = 0;
      const row = i * model.nodeCount;
      for (let k = 0; k < r; k++) {
        current += eigenvectors[row + k] * qNext[k];
        previous += eigenvectors[row + k] * q[k];
      }
      estimate[i] = current; estimatePrevious[i] = previous;
      const refVelocity = full.current[i] - full.previous[i];
      const estVelocity = current - previous;
      const stateError = (full.current[i] - current) ** 2 + (refVelocity - estVelocity) ** 2;
      const stateReference = full.current[i] ** 2 + refVelocity ** 2;
      if (!Number.isFinite(full.current[i] + full.previous[i] + current + previous)) nonFinite++;
      stateErrSq += stateError; stateRefSq += stateReference;
      statePeakError = Math.max(statePeakError, Math.sqrt(stateError));
      statePeakReference = Math.max(statePeakReference, Math.sqrt(stateReference));
      inputWorkFull += force[i] * refVelocity;
      inputWorkRom += force[i] * estVelocity;
    }
    const refL = full.current[model.pickup[0]] * MIX;
    const refR = full.current[model.pickup[1]] * MIX;
    const estL = estimate[model.pickup[0]] * MIX;
    const estR = estimate[model.pickup[1]] * MIX;
    const eL = refL - estL, eR = refR - estR;
    refOutSq += refL * refL + refR * refR;
    romOutSq += estL * estL + estR * estR;
    errOutSq += eL * eL + eR * eR;
    maxOutputError = Math.max(maxOutputError, Math.abs(eL), Math.abs(eR));
    peakRef = Math.max(peakRef, Math.abs(refL), Math.abs(refR));
    peakError = Math.max(peakError, Math.abs(eL), Math.abs(eR));
    if (!Number.isFinite(refL + refR + estL + estR)) nonFinite++;
    if (Math.abs(refL) > 1 || Math.abs(refR) > 1 || Math.abs(estL) > 1 || Math.abs(estR) > 1)
      clippedSamples++;
    const fullThresholds = exactEnergyThresholds(model, full.current, full.previous);
    const romThresholds = exactEnergyThresholds(model, estimate, estimatePrevious);
    if (firstFullSleepEnergy === null && fullThresholds.sleepEnergy) firstFullSleepEnergy = step + 1;
    if (firstRomSleepEnergy === null && romThresholds.sleepEnergy) firstRomSleepEnergy = step + 1;
    if (firstFullIntraWake === null && fullThresholds.intraPlateWakeEnergy) firstFullIntraWake = step + 1;
    if (firstRomIntraWake === null && romThresholds.intraPlateWakeEnergy) firstRomIntraWake = step + 1;
    fullLeft[step] = refL; fullRight[step] = refR;
    romLeft[step] = estL; romRight[step] = estR;
    if (keepSeries) stateErrorSeries[step] = Math.sqrt(stateErrSq / Math.max(stateRefSq, 1e-300));
    const tmp = qPrevious; qPrevious = q; q = qNext; qNext = tmp;
  }
  const rmsOutputError = Math.sqrt(errOutSq / Math.max(2 * scenario.steps, 1));
  const rmsOutputReference = Math.sqrt(refOutSq / Math.max(2 * scenario.steps, 1));
  const result = {
    scenario: scenario.name, plateId: model.plateId, nodeCount: model.nodeCount,
    rank, stateDimension: 2 * rank, fullStateDimension: 2 * model.nodeCount,
    retainedForceL2SquaredFraction: forceNormSq > 0 ? retainedForceSq / forceNormSq : null,
    inputNodeSteps,
    outputRmsError: rmsOutputError,
    outputRmsReference: rmsOutputReference,
    outputPeakReference: peakRef,
    outputRmsErrorDbRelative: rmsOutputError > 0 && peakRef > 0 ? 20 * Math.log10(rmsOutputError / peakRef) : null,
    outputRmsErrorFraction: rmsOutputError / Math.max(rmsOutputReference, 1e-300),
    outputIntegratedEnergyFull: refOutSq,
    outputIntegratedEnergyReduced: romOutSq,
    outputIntegratedEnergyErrorFraction: (romOutSq - refOutSq) / Math.max(refOutSq, 1e-300),
    outputPeakError: peakError, outputPeakErrorFraction: peakError / Math.max(peakRef, 1e-300),
    outputCorrelationL: correlation(fullLeft, romLeft),
    outputCorrelationR: correlation(fullRight, romRight),
    bestLagL: bestLag(fullLeft, romLeft, 120),
    bestLagR: bestLag(fullRight, romRight, 120),
    stateRmsError: Math.sqrt(stateErrSq / Math.max(2 * scenario.steps * model.nodeCount, 1)),
    stateRmsErrorFraction: Math.sqrt(stateErrSq / Math.max(stateRefSq, 1e-300)),
    statePeakError, statePeakErrorFraction: statePeakError / Math.max(statePeakReference, 1e-300),
    signedInputWorkFull: inputWorkFull, signedInputWorkRom: inputWorkRom,
    signedInputWorkError: inputWorkRom - inputWorkFull,
    signedInputWorkErrorFraction: Math.abs(inputWorkFull) > 1e-300
      ? (inputWorkRom - inputWorkFull) / inputWorkFull : null,
    fullSleepEnergyFirstStep: firstFullSleepEnergy,
    reducedSleepEnergyFirstStep: firstRomSleepEnergy,
    sleepEnergyTimingErrorSteps: firstFullSleepEnergy === null || firstRomSleepEnergy === null
      ? null : firstRomSleepEnergy - firstFullSleepEnergy,
    fullIntraPlateWakeFirstStep: firstFullIntraWake,
    reducedIntraPlateWakeFirstStep: firstRomIntraWake,
    intraPlateWakeTimingErrorSteps: firstFullIntraWake === null || firstRomIntraWake === null
      ? null : firstRomIntraWake - firstFullIntraWake,
    nonFinite, clippedSamples, steps: scenario.steps,
    ...(keepSeries ? { series: { fullLeft, fullRight, romLeft, romRight, stateErrorSeries } } : {}),
    ...(keepSpectrum ? { spectrum: spectralComparison(fullLeft, fullRight, romLeft, romRight) } : {})
  };
  assert.equal(nonFinite, 0, 'Reduced recurrence produced non-finite state/output');
  return result;
}

function correlation(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return null;
  let ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
  ma /= a.length; mb /= b.length;
  let xy = 0, xx = 0, yy = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    xy += x * y; xx += x * x; yy += y * y;
  }
  return xx * yy > 0 ? xy / Math.sqrt(xx * yy) : null;
}

function bestLag(a, b, maxLag) {
  if (!a || !b || a.length !== b.length) return null;
  let best = { lagSamples: 0, correlation: -Infinity };
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let xy = 0, xx = 0, yy = 0;
    for (let i = Math.max(0, -lag); i < Math.min(a.length, b.length - lag); i++) {
      xy += a[i] * b[i + lag]; xx += a[i] * a[i]; yy += b[i + lag] * b[i + lag];
    }
    const value = xx * yy > 0 ? xy / Math.sqrt(xx * yy) : -Infinity;
    if (value > best.correlation) best = { lagSamples: lag, lagMs: lag * 1000 / RATE, correlation: value };
  }
  return best.correlation === -Infinity ? null : best;
}

function fftPower(samples, nfft) {
  const real = new Float64Array(nfft), imag = new Float64Array(nfft);
  const count = Math.min(samples.length, nfft);
  for (let i = 0; i < count; i++) {
    const window = count < 2 ? 1 : 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (count - 1));
    real[i] = samples[i] * window;
  }
  for (let i = 1, j = 0; i < nfft; i++) {
    let bit = nfft >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let size = 2; size <= nfft; size <<= 1) {
    const half = size >> 1, angle = -2 * Math.PI / size;
    const stepR = Math.cos(angle), stepI = Math.sin(angle);
    for (let base = 0; base < nfft; base += size) {
      let wr = 1, wi = 0;
      for (let j = 0; j < half; j++) {
        const even = base + j, odd = even + half;
        const tr = wr * real[odd] - wi * imag[odd];
        const ti = wr * imag[odd] + wi * real[odd];
        real[odd] = real[even] - tr; imag[odd] = imag[even] - ti;
        real[even] += tr; imag[even] += ti;
        const nextWr = wr * stepR - wi * stepI;
        wi = wr * stepI + wi * stepR; wr = nextWr;
      }
    }
  }
  const power = new Float64Array(nfft / 2 + 1);
  for (let i = 0; i < power.length; i++) {
    power[i] = real[i] ** 2 + imag[i] ** 2;
    if (i > 0 && i < nfft / 2) power[i] *= 2;
  }
  return power;
}

function assertFftImplementation() {
  const nfft = 2048, bin = 48, tone = new Float64Array(nfft);
  for (let i = 0; i < nfft; i++) tone[i] = Math.sin(2 * Math.PI * bin * i / nfft);
  const power = fftPower(tone, nfft);
  let peak = 0;
  for (let i = 1; i < power.length; i++) if (power[i] > power[peak]) peak = i;
  assert.equal(peak, bin, 'Hann FFT failed the fixed-bin sine check');
  assert.ok(Number.isFinite(power[bin]) && power[bin] > 0, 'Hann FFT returned invalid power');
}

function spectralComparison(fullLeft, fullRight, romLeft, romRight) {
  const nfft = 2048, frameSteps = Math.min(nfft, fullLeft.length);
  const leftReference = fftPower(fullLeft.subarray(0, frameSteps), nfft);
  const rightReference = fftPower(fullRight.subarray(0, frameSteps), nfft);
  const leftReduced = fftPower(romLeft.subarray(0, frameSteps), nfft);
  const rightReduced = fftPower(romRight.subarray(0, frameSteps), nfft);
  const reference = new Float64Array(nfft / 2 + 1), reduced = new Float64Array(nfft / 2 + 1);
  let referenceEnergy = 0, reducedEnergy = 0, diffSq = 0, refSq = 0, dot = 0;
  for (let i = 0; i < reference.length; i++) {
    reference[i] = leftReference[i] + rightReference[i];
    reduced[i] = leftReduced[i] + rightReduced[i];
    referenceEnergy += reference[i]; reducedEnergy += reduced[i];
    diffSq += (reduced[i] - reference[i]) ** 2;
    refSq += reference[i] ** 2;
    dot += reduced[i] * reference[i];
  }
  const refNormSq = reference.reduce((sum, value) => sum + value * value, 0);
  const reducedNormSq = reduced.reduce((sum, value) => sum + value * value, 0);
  const bandPowerSharesAnalysisOnly = {};
  for (const [name, low, high] of [['0-250Hz', 0, 250], ['250-1000Hz', 250, 1000], ['1000-3000Hz', 1000, 3000]]) {
    let ref = 0, estimate = 0;
    for (let i = 0; i < reference.length; i++) {
      const hz = i * RATE / nfft;
      if (hz >= low && hz < high) { ref += reference[i]; estimate += reduced[i]; }
    }
    bandPowerSharesAnalysisOnly[name] = {
      full: ref / Math.max(referenceEnergy, 1e-300),
      reduced: estimate / Math.max(reducedEnergy, 1e-300),
      difference: estimate / Math.max(reducedEnergy, 1e-300)
        - ref / Math.max(referenceEnergy, 1e-300),
      rawDifferenceFractionOfFullTotal: (estimate - ref) / Math.max(referenceEnergy, 1e-300)
    };
  }
  let shapeL1 = 0;
  for (let i = 0; i < reference.length; i++)
    shapeL1 += Math.abs(reduced[i] / Math.max(reducedEnergy, 1e-300)
      - reference[i] / Math.max(referenceEnergy, 1e-300));
  return {
    method: '2048-point Hann FFT, first available frame, 6 kHz rate; fixed-gain raw power comparisons',
    frameSteps, frameMilliseconds: frameSteps * 1000 / RATE,
    frequencyResolutionHz: RATE / nfft,
    rawPowerEnergyErrorFraction: (reducedEnergy - referenceEnergy) / Math.max(referenceEnergy, 1e-300),
    rawPowerVectorRmsErrorFraction: Math.sqrt(diffSq / Math.max(refSq, 1e-300)),
    rawPowerCosineSimilarity: dot / Math.max(Math.sqrt(refNormSq * reducedNormSq), 1e-300),
    normalizedSpectralShapeL1AnalysisOnly: shapeL1,
    bandPowerSharesAnalysisOnly
  };
}

function operationEstimate(model, trace, traceName, ranks) {
  const n = model.nodeCount;
  const neighborPairs = model.degrees.reduce((sum, value) => sum + value, 0);
  let touchedNodeSteps = 0;
  for (let i = 0; i < trace.z.length; i++)
    if (trace.z[i] + trace.sphere[i] !== 0) touchedNodeSteps++;
  const meanInputNodes = touchedNodeSteps / trace.steps;
  const stencilUnits = 2 * (n + neighborPairs);
  const recurrenceUnits = 9 * n;
  const transferUnits = 4 * model.linkEdges + 28 * model.sphereFoundations.length;
  const fullUnits = stencilUnits + recurrenceUnits + transferUnits;
  const breakEvenRank = (stencilUnits + recurrenceUnits) / (2 * meanInputNodes + 8);
  return ranks.map(rank => {
    const projectionUnits = 2 * meanInputNodes * rank;
    const modalUpdateAndPickupUnits = 8 * rank;
    const reducedCoreUnits = transferUnits + projectionUnits + modalUpdateAndPickupUnits;
    const exactMonitorUnits = 4 * n * rank + stencilUnits;
    return {
      plateId: model.plateId, trace: traceName, nodeCount: n, directedMaskNeighborPairs: neighborPairs,
      zLinkEdges: model.linkEdges, sphereFoundationLinks: model.sphereFoundations.length,
      meanInputNodesPerStep: meanInputNodes, rank, reducedStateDimension: 2 * rank,
      estimatedFullTargetUnitsPerStep: fullUnits,
      estimatedReducedCoreUnitsPerStep: reducedCoreUnits,
      estimatedReducedCoreRatio: reducedCoreUnits / Math.max(fullUnits, 1),
      estimatedReducedWithExactMonitorUnitsPerStep: reducedCoreUnits + exactMonitorUnits,
      estimatedReducedWithExactMonitorRatio: (reducedCoreUnits + exactMonitorUnits) / Math.max(fullUnits, 1),
      approximateBreakEvenRank: breakEvenRank,
      unitDefinition: 'Approximate scalar arithmetic count; each stencil node diagonal multiply and each directed neighbor add count one, recurrence about 9 per node, transfer about 4 per Z edge or 28 per sphere foundation; excludes memory traffic and control overhead.'
    };
  });
}

function toCsv(rows) {
  if (!rows.length) return '';
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const cell = value => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  return [columns.join(','), ...rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\n') + '\n';
}

function writeWaveformSvg(seriesRows, outPath, title) {
  const W = 1200, H = 560, left = 72, right = 1160, top = 65, bottom = 460;
  const groups = [...new Set(seriesRows.map(row => row.scenario))];
  const maxValue = Math.max(1e-30, ...seriesRows.filter(row => row.label === 'full')
    .flatMap(row => [Math.abs(row.left), Math.abs(row.right)]));
  const traces = [];
  const colors = { full: '#111827', r8: '#2563eb', r16: '#dc2626', r32: '#059669' };
  let y = top;
  for (const scenario of groups) {
    const entries = seriesRows.filter(row => row.scenario === scenario);
    const steps = Math.max(...entries.map(row => row.step)) + 1;
    const panelHeight = (bottom - top) / groups.length;
    const y0 = y + panelHeight / 2;
    const scale = panelHeight * 0.42 / maxValue;
    for (const row of entries) {
      if (row.step % Math.max(1, Math.floor(steps / 800)) !== 0) continue;
      const x = left + row.step / Math.max(steps - 1, 1) * (right - left);
      for (const channel of ['left', 'right']) {
        const yy = y0 - row[channel] * scale;
        const key = scenario + '|' + row.label + '|' + channel;
        if (!traces.some(item => item.key === key)) traces.push({ key, label: row.label, channel, color: colors[row.label] || '#6b7280', points: [] });
        traces.find(item => item.key === key).points.push((traces.find(item => item.key === key).points.length ? 'L' : 'M') + x.toFixed(2) + ',' + yy.toFixed(2));
      }
    }
    traces.push({ separator: true, y: y + panelHeight, title: scenario });
    y += panelHeight;
  }
  const lines = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">',
    '<rect width="100%" height="100%" fill="white"/>',
    '<text x="72" y="30" font-family="Arial,sans-serif" font-size="18" fill="#111827">' + title + '</text>',
    '<text x="72" y="49" font-family="Arial,sans-serif" font-size="11" fill="#4b5563">Fixed scale, raw solver pickup × 1/√12; one common amplitude range; 6 kHz</text>',
    '<line x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + bottom + '" stroke="#6b7280"/>'
  ];
  for (const trace of traces) {
    if (trace.separator) {
      lines.push('<line x1="' + left + '" y1="' + trace.y + '" x2="' + right + '" y2="' + trace.y + '" stroke="#e5e7eb"/>');
      lines.push('<text x="78" y="' + (trace.y - 5) + '" font-family="Arial,sans-serif" font-size="12" fill="#374151">' + trace.title + '</text>');
    } else {
      lines.push('<path d="' + trace.points.join(' ') + '" fill="none" stroke="' + trace.color + '" stroke-width="' + (trace.label === 'full' ? '1.8' : '1.1') + '" opacity="0.88"/>');
    }
  }
  const legend = [...new Set(traces.filter(x => x.key).map(x => x.label))];
  let lx = 700;
  for (const label of legend) {
    const color = colors[label] || '#6b7280';
    lines.push('<line x1="' + lx + '" y1="30" x2="' + (lx + 24) + '" y2="30" stroke="' + color + '" stroke-width="2"/>');
    lines.push('<text x="' + (lx + 29) + '" y="34" font-family="Arial,sans-serif" font-size="11" fill="#374151">' + label + '</text>');
    lx += 95;
  }
  lines.push('</svg>');
  return writeFile(outPath, lines.join('\n'), { flag: 'wx' });
}

async function saveTrace(filePath, trace) {
  const count = trace.z.length;
  const buffer = Buffer.allocUnsafe(count * 16);
  for (let i = 0; i < count; i++) {
    buffer.writeDoubleLE(trace.z[i], i * 16);
    buffer.writeDoubleLE(trace.sphere[i], i * 16 + 8);
  }
  await writeFile(filePath, gzipSync(buffer, { level: 9 }), { flag: 'wx' });
}

function stateMetricsAsRows(result) {
  const { series, ...row } = result;
  return row;
}

function runHandoff(model, basis, trace, rank) {
  const n = model.nodeCount, r = rank, phi = basis.vectors;
  const reference = makeFullState(model);
  let hybridState = null;
  let q = new Float64Array(r), qp = new Float64Array(r), qn = new Float64Array(r);
  const projection = new Float64Array(r);
  let wakeStep = null, stateDisplacementError = null, stateVelocityError = null;
  let wakeOutputStepError = null, reconstructionRoundingError = null;
  let firstResumedOutputError = null, firstResumedJumpError = null;
  let handoffEnergyRelativeError = null;
  const hybridLeft = new Float32Array(trace.steps), fullLeft = new Float32Array(trace.steps);
  for (let step = 0; step < trace.steps; step++) {
    const z = trace.z.subarray(step * n, (step + 1) * n);
    const s = trace.sphere.subarray(step * n, (step + 1) * n);
    stepFull(model, reference, z, s);
    if (wakeStep !== null) {
      stepFull(model, hybridState, z, s);
      hybridLeft[step] = hybridState.current[model.pickup[0]] * MIX;
    } else {
      projection.fill(0);
      for (let i = 0; i < n; i++) {
        const f = z[i] + s[i];
        if (f !== 0) for (let k = 0; k < r; k++) projection[k] += phi[i * n + k] * f;
      }
      for (let k = 0; k < r; k++)
        qn[k] = (2 - model.damping - basis.values[k]) * q[k]
          + (model.damping - 1) * qp[k] + projection[k];
      const current = new Float64Array(n), previous = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let u = 0, v = 0;
        for (let k = 0; k < r; k++) { u += phi[i * n + k] * qn[k]; v += phi[i * n + k] * q[k]; }
        current[i] = u; previous[i] = v;
      }
      hybridLeft[step] = current[model.pickup[0]] * MIX;
      if (exactEnergyThresholds(model, current, previous).sleepEnergy) {
        wakeStep = step + 1;
        let errU = 0, normU = 0, errV = 0, normV = 0;
        let fullStateEnergy = 0, reducedStateEnergy = 0;
        for (let i = 0; i < n; i++) {
          const u = current[i] - reference.current[i];
          const v = (current[i] - previous[i]) - (reference.current[i] - reference.previous[i]);
          errU += u * u; normU += reference.current[i] * reference.current[i];
          errV += v * v; normV += (reference.current[i] - reference.previous[i]) ** 2;
          fullStateEnergy += reference.current[i] ** 2 + (reference.current[i] - reference.previous[i]) ** 2;
          reducedStateEnergy += current[i] ** 2 + (current[i] - previous[i]) ** 2;
        }
        stateDisplacementError = Math.sqrt(errU / Math.max(normU, 1e-300));
        stateVelocityError = Math.sqrt(errV / Math.max(normV, 1e-300));
        const preWake = current[model.pickup[0]] * MIX;
        const projected = Float32Array.from(current), projectedPrevious = Float32Array.from(previous);
        hybridState = makeFullState(model, projected, projectedPrevious);
        const reconstructed = hybridState.current[model.pickup[0]] * MIX;
        wakeOutputStepError = reconstructed - reference.current[model.pickup[0]] * MIX;
        reconstructionRoundingError = reconstructed - preWake;
        handoffEnergyRelativeError = (reducedStateEnergy - fullStateEnergy)
          / Math.max(fullStateEnergy, 1e-300);
        q = null; qp = null; qn = null;
      } else {
        const tmp = qp; qp = q; q = qn; qn = tmp;
      }
    }
    fullLeft[step] = reference.current[model.pickup[0]] * MIX;
  }
  const firstResumedStep = wakeStep === null ? trace.steps : Math.min(trace.steps, wakeStep);
  let errSq = 0, refSq = 0;
  for (let i = firstResumedStep; i < trace.steps; i++) {
    const error = hybridLeft[i] - fullLeft[i];
    errSq += error * error; refSq += fullLeft[i] * fullLeft[i];
  }
  const transitionStep = wakeStep === null ? null : wakeStep - 1;
  if (wakeStep !== null && wakeStep < trace.steps) {
    firstResumedOutputError = hybridLeft[wakeStep] - fullLeft[wakeStep];
    firstResumedJumpError = (hybridLeft[wakeStep] - hybridLeft[transitionStep])
      - (fullLeft[wakeStep] - fullLeft[transitionStep]);
  }
  return {
    plateId: model.plateId, rank, nodeCount: n, steps: trace.steps,
    fullSleepEnergyFirstStep: firstSleepEnergyThresholdFromTrace(model, trace),
    reducedWakeStep: wakeStep,
    reducedWakeMs: wakeStep === null ? null : wakeStep * 1000 / RATE,
    handoffDisplacementRelativeError: stateDisplacementError,
    handoffVelocityRelativeError: stateVelocityError,
    handoffDisplacementVelocityEnergyRelativeError: handoffEnergyRelativeError,
    outputErrorAtHandoff: wakeOutputStepError,
    reconstructionRoundingErrorAtPickup: reconstructionRoundingError,
    firstResumedOutputError: firstResumedOutputError,
    firstResumedJumpError: firstResumedJumpError,
    postHandoffLeftRmsError: wakeStep === null ? null : Math.sqrt(errSq / Math.max(trace.steps - firstResumedStep, 1)),
    postHandoffLeftRmsErrorFraction: wakeStep === null ? null : Math.sqrt(errSq / Math.max(refSq, 1e-300)),
    postHandoffCorrelation: wakeStep === null ? null : correlation(fullLeft.slice(firstResumedStep), hybridLeft.slice(firstResumedStep))
  };
}

function firstSleepEnergyThresholdFromTrace(model, trace) {
  const state = makeFullState(model, trace.initialCurrent, trace.initialPrevious);
  for (let step = 0; step < trace.steps; step++) {
    const off = step * model.nodeCount;
    const z = trace.z.subarray(off, off + model.nodeCount);
    const sphere = trace.sphere.subarray(off, off + model.nodeCount);
    stepFull(model, state, z, sphere);
    if (exactEnergyThresholds(model, state.current, state.previous).sleepEnergy) return step + 1;
  }
  return null;
}

function geometrySummary(model, topology, basis) {
  let sourceCells = 0, exposedCells = 0;
  for (let cell = 0; cell < 96 * 96; cell++) {
    const start = topology.sourceColumnOffsets[cell], end = topology.sourceColumnOffsets[cell + 1];
    let contains = false;
    for (let q = start; q < end; q++) if (topology.sourceColumnLayerIndices[q] === model.layer) contains = true;
    if (contains) {
      sourceCells++;
      if (topology.routingTopLayerByCell96[cell] === model.layer) exposedCells++;
    }
  }
  const eigenClusters = [];
  let from = 0;
  for (let i = 1; i <= basis.values.length; i++) {
    const split = i === basis.values.length
      || Math.abs(basis.values[i] - basis.values[i - 1]) > Math.max(1e-9, Math.abs(basis.values[i - 1]) * 1e-7);
    if (split) { eigenClusters.push({ startRank: from + 1, endRank: i, size: i - from,
      kappaMin: basis.values[from], kappaMax: basis.values[i - 1] }); from = i; }
  }
  return {
    plateId: model.plateId, layerIndex: model.layer, nodeCount: model.nodeCount,
    sourceCells, exposedSourceCells: exposedCells, coveredSourceCells: sourceCells - exposedCells,
    globalNodeOffset: model.start, solverGridNodeIndices: Array.from(model.nodeGridIndices),
    localNeighborIndices: Array.from(model.neighbors), localDegrees: Array.from(model.degrees),
    pickupLocalNodeIndices: model.pickup, materialCoefficients: {
      bending: model.bending, tension: model.tension, density: model.density,
      dampingBeforePlateMultiplier: model.damping / DAMPING_MULTIPLIER,
      plateDampingMultiplier: DAMPING_MULTIPLIER, effectiveDamping: model.damping
    },
    zLinkEdges: model.linkEdges, sphereFoundationLinks: model.sphereFoundations,
    stiffnessEigenvaluesAscending: Array.from(basis.values),
    eigenClusters,
    eigensolver: {
      method: 'cyclic symmetric Jacobi on actual frozen masked-Plate stiffness matrix',
      sweeps: basis.sweeps, maxOffDiagonal: basis.maxOffDiagonal,
      maximumAsymmetry: basis.asymmetry,
      maximumOrthogonalityError: basis.orthogonalityError,
      maximumEigenResidual: basis.residualMax
    }
  };
}

function plotRows(results, scenarioNames) {
  const rows = [];
  for (const result of results) if (scenarioNames.includes(result.scenario) && result.series) {
    const label = result.rank === result.nodeCount ? 'full-rank' : 'r' + result.rank;
    for (let step = 0; step < result.steps; step++) rows.push({
      scenario: result.scenario, label, step, milliseconds: step * 1000 / RATE,
      left: result.series.romLeft[step], right: result.series.romRight[step],
      referenceLeft: result.series.fullLeft[step], referenceRight: result.series.fullRight[step],
      cumulativeStateError: result.series.stateErrorSeries[step]
    });
  }
  return rows;
}

function seriesRowsToSvgRows(rows) {
  const out = [];
  for (const scenario of [...new Set(rows.map(row => row.scenario))]) {
    const subset = rows.filter(row => row.scenario === scenario);
    for (const row of subset.filter(item => item.label === 'r8')) out.push({
      scenario, label: 'full', step: row.step, left: row.referenceLeft,
      right: row.referenceRight, cumulativeStateError: 0
    });
    for (const row of subset.filter(item => ['r8', 'r16', 'r32'].includes(item.label))) {
      out.push({ scenario, label: row.label, step: row.step, left: row.left,
        right: row.right, cumulativeStateError: row.cumulativeStateError });
    }
  }
  return out;
}

function writeStateErrorSvg(rows, outPath) {
  const W = 1200, H = 560, left = 72, right = 1160, top = 65, bottom = 460;
  const groups = [...new Set(rows.map(row => row.scenario))];
  const maxValue = Math.max(1e-30, ...rows.map(row => row.cumulativeStateError || 0));
  const colors = { r8: '#2563eb', r16: '#dc2626', r32: '#059669' };
  const lines = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">',
    '<rect width="100%" height="100%" fill="white"/>',
    '<text x="72" y="30" font-family="Arial,sans-serif" font-size="18" fill="#111827">Full-state relative RMS error, cumulative</text>',
    '<text x="72" y="49" font-family="Arial,sans-serif" font-size="11" fill="#4b5563">Fixed common linear scale; displacement and velocity state; 6 kHz</text>'
  ];
  const panelHeight = (bottom - top) / groups.length;
  groups.forEach((scenario, index) => {
    const selected = rows.filter(row => row.scenario === scenario && ['r8', 'r16', 'r32'].includes(row.label));
    const y0 = top + index * panelHeight;
    for (const label of ['r8', 'r16', 'r32']) {
      const series = selected.filter(row => row.label === label);
      const stride = Math.max(1, Math.floor(series.length / 800));
      const points = [];
      for (let i = 0; i < series.length; i += stride) {
        const x = left + series[i].step / Math.max(series.length - 1, 1) * (right - left);
        const y = y0 + panelHeight - (series[i].cumulativeStateError || 0) / maxValue * panelHeight;
        points.push((points.length ? 'L' : 'M') + x.toFixed(2) + ',' + y.toFixed(2));
      }
      if (points.length) lines.push('<path d="' + points.join(' ') + '" fill="none" stroke="' + colors[label] + '" stroke-width="1.4"/>');
    }
    lines.push('<text x="78" y="' + (y0 + 14) + '" font-family="Arial,sans-serif" font-size="12" fill="#374151">' + scenario + '</text>');
    lines.push('<line x1="' + left + '" y1="' + (y0 + panelHeight) + '" x2="' + right + '" y2="' + (y0 + panelHeight) + '" stroke="#e5e7eb"/>');
  });
  let lx = 700;
  for (const label of ['r8', 'r16', 'r32']) {
    lines.push('<line x1="' + lx + '" y1="30" x2="' + (lx + 24) + '" y2="30" stroke="' + colors[label] + '" stroke-width="2"/>');
    lines.push('<text x="' + (lx + 29) + '" y="34" font-family="Arial,sans-serif" font-size="11" fill="#374151">' + label + '</text>');
    lx += 80;
  }
  lines.push('</svg>');
  return writeFile(outPath, lines.join('\n'), { flag: 'wx' });
}

async function main() {
  assertFftImplementation();
  await mkdir(dirname(outputDir), { recursive: true });
  await mkdir(outputDir, { recursive: false });
  const snapshotBytes = await readFile(resolve(ROOT, SNAPSHOT));
  const followupBytes = await readFile(resolve(ROOT, EVENTS));
  const snapshot = revive(JSON.parse(gunzipSync(snapshotBytes).toString('utf8')));
  const followup = JSON.parse(followupBytes.toString('utf8'));
  const futureEvents = followup.result.futureEvents;
  const sourceBytes = await readFile(resolve(ROOT, 'static/worklets/surface-plate.worklet.js'));
  const source = sourceBytes.toString('utf8');
  assertSourceConstant(source, 'RATE', RATE);
  assertSourceConstant(source, 'PLATE_DAMPING_MULTIPLIER', DAMPING_MULTIPLIER);
  assertSourceConstant(source, 'SLEEP_ENERGY', WAKE_ENERGY);
  assert.match(source, /const SLEEP_STEPS = RATE \* 2;/, 'Sleep interval assumption drifted');
  assert.match(source, /const WAKE_ENERGY = 1e-10;/, 'Wake threshold assumption drifted');
  const Processor = processorConstructor(source);
  assert.equal(snapshot.topology.layerIds.length, 30);
  assert.equal(snapshot.dynamic.physicsSteps, 1534928);
  const firstTopology = futureEvents.find(event => event.type === 'topology');
  assert.ok(firstTopology, 'Missing captured topology event');
  assert.equal(firstTopology.physicsStep - snapshot.dynamic.physicsSteps, 11392);
  assert.ok(CAPTURE_STEPS < firstTopology.physicsStep - snapshot.dynamic.physicsSteps,
    'The fixed topology capture window crossed a topology rebuild');
  const topStrikes = futureEvents.filter(event => event.type === 'strike'
    && event.physicsStep < firstTopology.physicsStep
    && event.payload.plateId === 'trail-plate-30');
  assert.ok(topStrikes.length > 0, 'No recorded strike targets the frozen top Plate');
  const weakStrikeEvent = topStrikes[0];
  const strongStrikeEvent = [...topStrikes].sort((a, b) => b.payload.strength - a.payload.strength)[0];
  assert.ok(strongStrikeEvent.payload.strength >= weakStrikeEvent.payload.strength);
  const topologySha = hashTopology(snapshot.topology);
  const workletSha = sha256(sourceBytes);
  const eventSha = sha256(followupBytes);
  const baseProcessor = restoreProcessor(Processor, snapshot.topology, snapshot.dynamic);
  const models = new Map(targetIds.map(id => [id, createModel(snapshot.topology, id, baseProcessor)]));
  const bases = new Map([...models].map(([id, model]) => [id, buildBasis(model)]));
  const naturalModels = [...models.values()];

  console.log(JSON.stringify({ phase: 'capture-clean-weak', strikeStrength: weakStrikeEvent.payload.strength }));
  const weakProcessor = new Processor();
  weakProcessor.installTopology(snapshot.topology);
  weakProcessor.clearVibration();
  zeroTarget(weakProcessor, models.get('trail-plate-29'));
  const target29 = models.get('trail-plate-29');
  for (let global = target29.start; global < target29.end; global++) {
    weakProcessor.awake[global] = 1;
    weakProcessor.active[weakProcessor.activeCount++] = global;
  }
  const weakCapture = recordCapture(weakProcessor, [target29], CAPTURE_STEPS, [], null, weakStrikeEvent.payload);
  const weakTrace = weakCapture.traces.get(target29.plateId);

  console.log(JSON.stringify({ phase: 'capture-clean-strong', strikeStrength: strongStrikeEvent.payload.strength }));
  const strongProcessor = new Processor();
  strongProcessor.installTopology(snapshot.topology);
  strongProcessor.clearVibration();
  for (let global = target29.start; global < target29.end; global++) {
    strongProcessor.awake[global] = 1;
    strongProcessor.active[strongProcessor.activeCount++] = global;
  }
  const strongCapture = recordCapture(strongProcessor, [target29], CAPTURE_STEPS, [], null, strongStrikeEvent.payload);
  const strongTrace = strongCapture.traces.get(target29.plateId);

  console.log(JSON.stringify({ phase: 'capture-natural-force', steps: CAPTURE_STEPS }));
  const naturalProcessor = restoreNaturalProcessor(Processor, snapshot, naturalModels);
  const naturalEvents = futureEvents.filter(event => event.physicsStep < snapshot.dynamic.physicsSteps + CAPTURE_STEPS);
  const naturalCapture = recordCapture(naturalProcessor, naturalModels, CAPTURE_STEPS, naturalEvents, event => {
    const id = event.payload.plateId || event.payload.layerId;
    return !targetIds.includes(id);
  });
  for (const trace of [weakTrace, strongTrace, ...naturalCapture.traces.values()]) {
    assert.ok(trace.maxSourceStateError < 2e-6,
      'Force-driven full recurrence did not match production source state for ' + trace.plateId);
    assert.ok(trace.maxSourceVelocityError < 2e-6,
      'Force-driven full recurrence velocity did not match production source for ' + trace.plateId);
  }
  for (const capture of [weakCapture.capture, strongCapture.capture, naturalCapture.capture]) {
    assert.equal(capture.droppedRoutes, 0, 'Captured replay dropped a direct strike route');
    assert.equal(capture.nonFinite, 0, 'Captured replay produced non-finite values');
  }

  const weak = weakTrace;
  const strong = strongTrace;
  const natural29 = naturalCapture.traces.get('trail-plate-29');
  const natural1 = naturalCapture.traces.get('trail-plate-1');
  const weakWindow = 450;
  const repeatedComponents = [0, 180, 360, 540].map(offset => ({
    trace: weak, from: 0, length: weakWindow, offset, scale: 1
  }));
  const alternatingComponents = [0, 180, 360, 540].map((offset, index) => ({
    trace: weak, from: 0, length: weakWindow, offset, scale: index % 2 ? -1 : 1
  }));
  const scenarios = [
    makeScenario('single-weak-recorded-contact', target29, [{ trace: weak, from: 0, length: weak.steps, offset: 0, scale: 1 }]),
    makeScenario('single-strong-recorded-contact', target29, [{ trace: strong, from: 0, length: strong.steps, offset: 0, scale: 1 }]),
    makeScenario('repeated-weak-same-sign-derived', target29, repeatedComponents),
    makeScenario('alternating-signed-derived', target29, alternatingComponents),
    makeScenario('same-step-plus-minus-cancel', target29, [
      { trace: weak, from: 0, length: weakWindow, offset: 0, scale: 1 },
      { trace: weak, from: 0, length: weakWindow, offset: 0, scale: -1 }
    ]),
    makeScenario('natural-multi-edge-z-sphere-open-loop', target29, [
      { trace: natural29, from: 0, length: natural29.steps, offset: 0, scale: 1 }
    ]),
    makeScenario('natural-multi-edge-z-sphere-open-loop', models.get('trail-plate-1'), [
      { trace: natural1, from: 0, length: natural1.steps, offset: 0, scale: 1 }
    ])
  ];
  const cancelScenario = scenarios.find(scenario => scenario.name === 'same-step-plus-minus-cancel');
  for (let step = 0; step < cancelScenario.steps; step++) {
    const { z, sphere } = cancelScenario.input(step);
    for (let i = 0; i < target29.nodeCount; i++)
      assert.equal(z[i] + sphere[i], 0, 'Equal opposite same-step inputs failed to cancel');
  }
  const sweep = [];
  for (const scenario of scenarios) {
    const model = models.get(scenario.plateId), basis = bases.get(scenario.plateId);
    const ranks = [...new Set([...DEFAULT_RANKS.filter(rank => rank < model.nodeCount), model.nodeCount])];
    console.log(JSON.stringify({ phase: 'rank-sweep', scenario: scenario.name, plateId: model.plateId,
      nodes: model.nodeCount, steps: scenario.steps, ranks }));
    for (const rank of ranks) {
      const keep = model.plateId === 'trail-plate-29'
        && ['single-weak-recorded-contact', 'repeated-weak-same-sign-derived',
          'alternating-signed-derived'].includes(scenario.name)
        && [8, 16, 32, model.nodeCount].includes(rank);
      const keepSpectrum = [
        'single-weak-recorded-contact', 'single-strong-recorded-contact',
        'natural-multi-edge-z-sphere-open-loop'
      ].includes(scenario.name)
        && ((model.plateId === 'trail-plate-29' && [8, 32, 64, 128, model.nodeCount].includes(rank))
          || (model.plateId === 'trail-plate-1' && [8, 16, 32, 64, model.nodeCount].includes(rank)));
      const result = buildMetrics(model, scenario, basis, rank, keep, keepSpectrum);
      if (scenario.name === 'same-step-plus-minus-cancel') {
        assert.equal(result.outputRmsError, 0, 'Opposite same-step inputs failed to cancel at output');
        assert.equal(result.stateRmsError, 0, 'Opposite same-step inputs left a residual state');
      }
      if (rank === model.nodeCount) {
        assert.ok(result.outputRmsErrorFraction < 1e-4, 'Full-rank modal output did not reproduce the Plate solver');
        assert.ok(result.stateRmsErrorFraction < 1e-4, 'Full-rank modal state did not reproduce the Plate solver');
      }
      sweep.push(result);
    }
  }
  const weakHandoffs = [];
  for (const rank of [...new Set([...DEFAULT_RANKS.filter(rank => rank < target29.nodeCount), target29.nodeCount])]) {
    const result = runHandoff(target29, bases.get('trail-plate-29'), weakTrace, rank);
    if (rank === target29.nodeCount) {
      assert.ok(result.handoffDisplacementRelativeError < 1e-5, 'Full-rank wake changed displacement at handoff');
      assert.ok(result.handoffVelocityRelativeError < 1e-5, 'Full-rank wake changed velocity at handoff');
      assert.ok(Math.abs(result.firstResumedJumpError) < 1e-10, 'Full-rank wake introduced an output jump');
    }
    weakHandoffs.push(result);
  }
  const strongHandoffs = [];
  for (const rank of [...new Set([8, 16, 32, 64, 128, target29.nodeCount].filter(rank => rank <= target29.nodeCount))]) {
    const result = runHandoff(target29, bases.get('trail-plate-29'), strongTrace, rank);
    if (rank === target29.nodeCount) {
      assert.ok(result.handoffDisplacementRelativeError < 1e-5, 'Full-rank strong wake changed displacement');
      assert.ok(result.handoffVelocityRelativeError < 1e-5, 'Full-rank strong wake changed velocity');
      assert.ok(Math.abs(result.firstResumedJumpError) < 1e-10, 'Full-rank strong wake introduced an output jump');
    }
    strongHandoffs.push(result);
  }
  const estimateRanks = [2, 4, 8, 16, 32, 64, 128];
  const performanceRows = [
    ...operationEstimate(target29, weakTrace, 'single-weak', estimateRanks.filter(rank => rank < target29.nodeCount)),
    ...operationEstimate(target29, natural29, 'natural-multi-edge', estimateRanks.filter(rank => rank < target29.nodeCount)),
    ...operationEstimate(models.get('trail-plate-1'), natural1, 'natural-multi-edge', estimateRanks.filter(rank => rank < models.get('trail-plate-1').nodeCount))
  ];

  const traceFiles = [];
  for (const [name, trace] of [
    ['single-weak-trail-plate-29', weakTrace],
    ['single-strong-trail-plate-29', strongTrace],
    ['natural-multi-edge-trail-plate-29', natural29],
    ['natural-multi-edge-trail-plate-1', natural1]
  ]) {
    const file = 'trace-' + name + '.f64le.gz';
    await saveTrace(resolve(outputDir, file), trace);
    let maxZ = 0, maxSphere = 0, touchedNodeSteps = 0, totalZSq = 0, totalSphereSq = 0;
    for (let i = 0; i < trace.z.length; i++) {
      maxZ = Math.max(maxZ, Math.abs(trace.z[i]));
      maxSphere = Math.max(maxSphere, Math.abs(trace.sphere[i]));
      totalZSq += trace.z[i] * trace.z[i]; totalSphereSq += trace.sphere[i] * trace.sphere[i];
      if (trace.z[i] !== 0 || trace.sphere[i] !== 0) touchedNodeSteps++;
    }
    traceFiles.push({
      name, plateId: trace.plateId, steps: trace.steps, nodeCount: trace.nodeCount,
      format: 'gzip of interleaved Float64LE [step][localNode][signed external Z force, signed external Sphere force]',
      file, sha256: sha256(await readFile(resolve(outputDir, file))),
      maxAbsZInput: maxZ, maxAbsSphereInput: maxSphere,
      zInputL2: Math.sqrt(totalZSq), sphereInputL2: Math.sqrt(totalSphereSq),
      nonzeroNodeSteps: touchedNodeSteps,
      maxSourceStateError: trace.maxSourceStateError,
      maxSourceVelocityError: trace.maxSourceVelocityError
    });
  }
  const geometry = [...models].map(([id, model]) => geometrySummary(model, snapshot.topology, bases.get(id)));
  const rankRows = sweep.map(stateMetricsAsRows);
  const selectedPlots = plotRows(sweep, [
    'single-weak-recorded-contact',
    'repeated-weak-same-sign-derived',
    'alternating-signed-derived'
  ]);
  const spectrumRows = sweep.filter(row => row.spectrum).map(({ scenario, plateId, rank, ...rest }) => ({
    scenario, plateId, rank, ...rest.spectrum
  }));
  const plotSvgRows = seriesRowsToSvgRows(selectedPlots);
  const summary = {
    purpose: 'Offline feasibility only; no production source or behavior changed.',
    gitHeadExpectedAtStart: '48672cdc4d0aeea5873ad10bd83ddd5878ebf3f6',
    source: {
      workletSha256: workletSha,
      snapshotSha256: sha256(snapshotBytes),
      topologySha256: topologySha,
      eventStreamSha256: eventSha,
      topologyFrozen: true,
      solverRateHz: RATE,
      sourceGrid: snapshot.topology.sourceGrid,
      solverGrid: snapshot.topology.solverGrid,
      layerCount: snapshot.topology.layerIds.length,
      nodeCount: snapshot.topology.nodeGridIndices.length,
      noduleCount: snapshot.topology.noduleIds.length,
      capturedAtPhysicsStep: snapshot.dynamic.physicsSteps,
      captureWindowSteps: CAPTURE_STEPS,
      captureWindowMs: CAPTURE_STEPS * 1000 / RATE,
      topologyBirthAtPhysicsStep: firstTopology.physicsStep,
      topologyBirthExcluded: true,
      directTargetStrikePolicy: 'Direct strike events aimed at the reduced target plates are excluded; target receives only signed external Z/Sphere traces.'
    },
    semantics: {
      laplacian: 'L u at a masked node = -4u + sum of existing four-neighbor values; missing neighbors remain zero (Dirichlet boundary).',
      recurrence: 'next = 2u - previous - bending*L(Lu) + (tension/density)*Lu - effectiveDamping*(u-previous) + externalZ + externalSphere - linkDiagonal*u.',
      zInput: 'externalZ[i] = sum over adjacent-layer links coefficient*(otherCurrent)/density; linkDiagonal sums coefficient/density.',
      sphereInput: 'externalSphere[i] = sum weight*0.000025*modalContact/density; linkDiagonal includes sum weight*0.000025/density.',
      sleepQuietEnergy: 'next^2 + (next-current)^2 + bending*(L current)^2 >= 1e-10 blocks quiet sleep.',
      intraPlateWakeEnergy: 'next^2 + (next-current)^2 + (L(L current))^2*0.0001 > 1e-10 triggers production intra-Plate neighbor wake.',
      handoffTrigger: 'For this diagnostic only, reconstruct at the first sample where any target node crosses the exact production sleep quiet-energy threshold; this is not a proposed production wake policy.',
      feedbackLimit: 'Recorded inputs are open-loop. The full target replay matches the captured full solver at the same inputs, but ROM differences do not feed back into neighboring Plate or Sphere states.'
    },
    basis: {
      method: 'frozen-mask generalized modal projection; symmetric Plate stiffness includes exact masked L^2/L terms and frozen reciprocal-link diagonal stiffness; signed incoming Z/Sphere source terms are projected each step',
      recurrence: 'u[n+1]=(2-d)u[n]+(d-1)u[n-1]-K u[n]+fZ_external[n]+fSphere_external[n]',
      rankLadder: DEFAULT_RANKS,
      modalOrder: 'ascending eigenvalue of the positive restoring operator; no content-normalized or loudness-matched data'
    },
    captures: {
      weak: {
        ...weakCapture.capture, payload: weakStrikeEvent.payload,
        previousEvidenceTarget29PeakEnergyDb: -36.494
      },
      strong: { ...strongCapture.capture, payload: strongStrikeEvent.payload },
      natural: { ...naturalCapture.capture, sourcePrefixEventCount: naturalEvents.length,
        firstEventPhysicsStep: naturalEvents[0]?.physicsStep,
        lastEventPhysicsStep: naturalEvents.at(-1)?.physicsStep,
        topologyMessageCount: naturalEvents.filter(event => event.type === 'topology').length,
        strikeCount: naturalEvents.filter(event => event.type === 'strike').length,
        skippedDirectTargetStrikes: naturalCapture.capture.skippedDirectStrikes }
    },
    geometry,
    forceTraces: traceFiles,
    rankSweep: rankRows,
    weakWakeHandoff: weakHandoffs,
    strongWakeHandoff: strongHandoffs,
    performance: {
      estimatedRows: performanceRows,
      operationModel: {
        fullPerStep: 'two masked stencils + about 9 recurrence operations per active node + the incoming Z/Sphere edge work',
        reducedCorePerStep: 'the same incoming edge work + about 2 × meanInputNodes × r projection operations + 8r modal update/pickup operations',
        exactWakeMonitoring: 'Exact local quiet-energy and intra-Plate wake checks reconstruct current and previous full fields (about 4Nr operations) and recalculate the two masked stencils; this cost is shown separately.',
        breakEven: 'The reported approximate rank compares reduced projection/update work to the Plate stencils and local recurrence after common coupling edge work cancels. It is arithmetic only, not a wall-clock speedup.',
        fixedComputeFloor: 'Sphere modes continue in the current worklet even when Plate nodes sleep; the observed 32-nodule topology has 384 modes.',
        timingLimit: 'No wall-clock timing or Chrome AudioWorklet runtime test was used as evidence.'
      }
    },
    verdict: 'See measured rank, handoff, and cost metrics; no production candidate is implied.'
  };
  await writeFile(resolve(outputDir, 'selected-plate-geometry.json'),
    JSON.stringify({ source: summary.source, geometry }, null, 2) + '\n', { flag: 'wx' });
  await writeFile(resolve(outputDir, 'rank-sweep.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
  await writeFile(resolve(outputDir, 'rank-sweep.csv'), toCsv(rankRows), { flag: 'wx' });
  await writeFile(resolve(outputDir, 'wake-handoff.csv'), toCsv([...weakHandoffs, ...strongHandoffs]), { flag: 'wx' });
  await writeFile(resolve(outputDir, 'operation-estimate.csv'), toCsv(performanceRows), { flag: 'wx' });
  await writeFile(resolve(outputDir, 'selected-waveforms.csv'), toCsv(selectedPlots), { flag: 'wx' });
  await writeFile(resolve(outputDir, 'spectrum-summary.csv'), toCsv(spectrumRows), { flag: 'wx' });
  await writeWaveformSvg(plotSvgRows, resolve(outputDir, 'waveform-comparison.svg'),
    'ANT dormant Plate: full versus modal pickup waveforms');
  await writeStateErrorSvg(selectedPlots, resolve(outputDir, 'state-error.svg'));
  console.log(JSON.stringify({
    phase: 'complete', outputDir,
    weakStrike: { plateId: weakStrikeEvent.payload.plateId, strength: weakStrikeEvent.payload.strength },
    strongStrike: { plateId: strongStrikeEvent.payload.plateId, strength: strongStrikeEvent.payload.strength },
    naturalSteps: naturalCapture.capture.steps,
    maxSourceStateError: Math.max(...traceFiles.map(trace => trace.maxSourceStateError)),
    maxSourceVelocityError: Math.max(...traceFiles.map(trace => trace.maxSourceVelocityError)),
    files: ['rank-sweep.json', 'rank-sweep.csv', 'wake-handoff.csv', 'operation-estimate.csv',
      'selected-waveforms.csv', 'spectrum-summary.csv', 'waveform-comparison.svg', 'state-error.svg', 'selected-plate-geometry.json']
      .concat(traceFiles.map(trace => trace.file))
  }));
}

await main();
