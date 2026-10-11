import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { compileSurfaceTopology } from '../../../../src/lib/audio/compileSurfaceTopology.js';

const source = readFileSync(new URL('../../../../static/worklets/surface-plate.worklet.js', import.meta.url), 'utf8');
function makeProcessor() {
  let Processor;
  class AudioWorkletProcessor { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  vm.runInNewContext(source, { AudioWorkletProcessor, sampleRate: 48000, Float32Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Array, Math, Number, Object, performance: globalThis.performance, registerProcessor(_name, processor) { Processor = processor; } });
  return new Processor();
}
function plate(id, x0, x1, y0, y1) {
  const mask = new Array(96 * 96).fill(0);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mask[y * 96 + x] = 1;
  return { id, grid: { width: 96, height: 96 }, mask, edges: [], pickups: [{ x: x0 / 95, y: 48 / 95 }, { x: x1 / 95, y: 48 / 95 }], thicknessMeters: 0.001, material: { stiffness: 0.9, density: 1.1, damping: 0.35 } };
}
const old = plate('old', 30, 66, 44, 50), added = plate('s0', 48, 76, 44, 50);
const oldTopology = compileSurfaceTopology({ plates: [old], stratigraphy: { layerOrder: ['old'] } });
const newTopology = compileSurfaceTopology({ plates: [old, added], stratigraphy: { layerOrder: ['old', 's0'] } });
const control = makeProcessor(), treatment = makeProcessor();
for (const p of [control, treatment]) p.handleMessage({ type: 'topology', payload: oldTopology });
control.handleMessage({ type: 'topology', payload: oldTopology });
treatment.handleMessage({ type: 'topology', payload: newTopology });
for (const p of [control, treatment]) p.handleMessage({ type: 'strike', payload: { plateId: 'old', position: { x: 45 / 95, y: 48 / 95 }, strength: 0.035, footprintRadius: 0.012 } });
const oldNodes = oldTopology.nodeGridIndices.length;
let maxAbs = 0, maxStep = null, first = null, maxNewValue = 0, awakeNodeSteps = 0, firstNewAwakeStep = null;
const linkCount = newTopology.adjacentLinkCoefficients.length;
for (let step = 1; step <= 3000; step++) {
  const outA = [new Float32Array(8), new Float32Array(8)], outB = [new Float32Array(8), new Float32Array(8)];
  control.process([], [outA]); treatment.process([], [outB]);
  let stepMax = 0;
  for (let i = 0; i < oldNodes; i++) stepMax = Math.max(stepMax, Math.abs(control.current[i] - treatment.current[i]));
  if (first === null && stepMax !== 0) first = { step, maxAbs: stepMax };
  if (stepMax > maxAbs) { maxAbs = stepMax; maxStep = step; }
  for (let i = newTopology.nodeOffsets[1]; i < newTopology.nodeOffsets[2]; i++) {
    maxNewValue = Math.max(maxNewValue, Math.abs(treatment.current[i]), Math.abs(treatment.previous[i]));
    if (treatment.awake[i]) { awakeNodeSteps++; if (firstNewAwakeStep === null) firstNewAwakeStep = step; }
  }
}
// This post-horizon comparison cannot establish equality of the initial strike distribution.
const oldPulseControl = control.contactForces.slice(0, 18 * oldNodes);
const oldPulseTreatment = new Float32Array(18 * oldNodes);
for (let s = 0; s < 18; s++) for (let n = 0; n < oldNodes; n++) oldPulseTreatment[s * oldNodes + n] = treatment.contactForces[s * treatment.current.length + n];
let pulseMismatch = 0; for (let i = 0; i < oldPulseControl.length; i++) if (oldPulseControl[i] !== oldPulseTreatment[i]) pulseMismatch++;
console.log(JSON.stringify({ oldNodes, newNodes: newTopology.nodeOffsets[2] - newTopology.nodeOffsets[1], linkCount, firstOldTraceDivergence: first, maxOldTraceDifference: maxAbs, maxDifferenceStep: maxStep, maxNewLayerAmplitude: maxNewValue, newLayerAwakeNodeSteps: awakeNodeSteps, firstNewLayerAwakeStep: firstNewAwakeStep, wakeTransitionDeltaTreatmentMinusControl: treatment.telemetry.wakes - control.telemetry.wakes, oldPulseRingMismatchCountAfterHorizon: pulseMismatch, dropped: treatment.telemetry.dropped, droppedRoutes: treatment.telemetry.droppedRoutes, nonFinite: treatment.telemetry.nonFinite, physicsSteps: treatment.telemetry.physicsSteps }, null, 2));
