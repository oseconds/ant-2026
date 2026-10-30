import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { TrailPlateBirth } from '../src/lib/agents/ant/TrailPlateBirth.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-30-material-chemical-residence-probe';
const INPUT = 'docs/ant/evidence/2026-10-30-material-pheromone-attenuation-screen/data';
const CHECKPOINTS = [30, 60, 120, 300, 600];
const WIDTH = 316, MATERIAL_SIZE = 96, TICKS = 36000, DT = 1 / 60;
const STEP_MS = 1000 / 60, RADIUS = 0.0045, HALF_LIFE = 15;
const LN2 = Math.LN2, TAU = 20;

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonGz = path => JSON.parse(gunzipSync(path));
const gzipJson = value => gzipSync(Buffer.from(JSON.stringify(value) + '\n'), { level: 9, mtime: 0 });

function assertInputs(input, emissions, maps) {
  assert.equal(input.protocol.seconds, 600);
  assert.equal(input.protocol.tickHz, 60);
  assert.equal(emissions.tickHz, 60);
  assert.equal(emissions.control.length, 100882);
  assert.equal(input.control.actualBirthMasks.length, 36);
  assert.equal(input.protocol.lateReferenceTicks.length, 40);
  assert.deepEqual(maps.map(row => row.seconds), CHECKPOINTS);
  assert.equal(input.control.frames.length, 40);
}

function decayExponent(layerCount) {
  const p = 1 - 0.5 * (1 - Math.exp(-layerCount / 4));
  return -LN2 * DT / HALF_LIFE * p;
}

function writeRequest(field, request) {
  if (request.type === 'point') return field.depositPoint(request.position, { amount: request.amount, radius: RADIUS });
  if (request.type === 'segment') return field.depositSegment(request.from, request.to,
    { amountPerUnitDistance: request.amountPerUnitDistance, radius: RADIUS });
  throw new Error(`Unsupported frozen writer request: ${request.type}`);
}

function fieldStats(values) {
  const hx = 1 / (WIDTH - 1), hy = 1 / (WIDTH - 1);
  let nodeSum = 0, weighted = 0;
  for (let y = 0; y < WIDTH; y += 1) for (let x = 0; x < WIDTH; x += 1) {
    const value = values[y * WIDTH + x];
    nodeSum += value;
    weighted += value * ((x === 0 || x === WIDTH - 1 ? 0.5 : 1)
      * (y === 0 || y === WIDTH - 1 ? 0.5 : 1));
  }
  return { nodeSum, reconstructedIntegral: weighted * hx * hy };
}
function maximum(values) { let max = -Infinity; for (const value of values) if (value > max) max = value; return max; }

function exactArrayEqual(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: length`);
  for (let i = 0; i < actual.length; i += 1) {
    if (actual[i] !== expected[i]) throw new Error(`${label}: first mismatch at ${i}: ${actual[i]} !== ${expected[i]}`);
  }
}
function project96(field) {
  const values = new Array(MATERIAL_SIZE * MATERIAL_SIZE);
  for (let y = 0; y < MATERIAL_SIZE; y += 1) for (let x = 0; x < MATERIAL_SIZE; x += 1) {
    values[y * MATERIAL_SIZE + x] = field.sample(x / 95, y / 95);
  }
  return values;
}

function selfTest() {
  assert.equal(decayExponent(0), -LN2 / HALF_LIFE * DT);
  const p0 = 1 - 0.5 * (1 - Math.exp(0));
  const pInf = 1 - 0.5 * (1 - Math.exp(-1000 / 4));
  assert.equal(p0, 1);
  assert.ok(Math.abs(pInf - 0.5) < 1e-12);
  const field = new PheromoneField();
  const a = field.depositPoint({ x: 0.4, y: 0.5 }, { amount: 0.1, radius: RADIUS });
  assert.equal(a, 0.1);
  const first = field.values.slice();
  field.decay(DT);
  assert.ok(field.values.some((v, i) => v < first[i]));
  const controller = Object.create(AntController.prototype);
  controller.field = field;
  controller.state = { behavior: { sensorDistance: 0.042, sensorWidth: 0.014 } };
  const read = controller.senseLocalTrail({ x: 0.4, y: 0.5, heading: 0 });
  assert.ok(Number.isFinite(read.strength) && read.strength >= 0);
  const supportField = new PheromoneField(); supportField.values[0] = 1;
  const support = supportContext([{ x: 0, y: 0 }], supportField, supportField, Int32Array.from([100]), 1000,
    Uint8Array.from([1, ...new Array(316 * 316 - 1).fill(0)]));
  assert.equal(support.minSourceAgeSeconds, 15);
  assert.equal(support.materialContributingFraction, 1);
  assert.deepEqual(eligibilityDelta([.31, .29], [.29, .31], [.02, .02]),
    { cells: 2, controlEligible: 1, residenceEligible: 1, gained: 1, lost: 1, changed: 2 });
  return { status: 'PASS', checks: ['p-bounds', 'native-point-decay', 'native-local-readout', 'weighted-source-age', 'fixed-D-eligibility'] };
}

function createField() { return new PheromoneField({ width: WIDTH, height: WIDTH, decayHalfLifeSeconds: HALF_LIFE, maxValue: 8 }); }

function mapLayerMap(birthMasks, startMs) {
  const layers = new Uint8Array(WIDTH * WIDTH);
  for (let i = 0; i < layers.length; i += 1) {
    const col = Math.round(i % WIDTH / (WIDTH - 1) * 95);
    const row = Math.round(Math.floor(i / WIDTH) / (WIDTH - 1) * 95);
    const materialIndex = row * 96 + col;
    let count = 0;
    for (const birth of birthMasks) if (birth.bornAtSimulationTimeMs <= startMs && birth.mask[materialIndex]) count += 1;
    layers[i] = count;
  }
  return layers;
}

function footprintIndices(position, width = WIDTH, radius = RADIUS) {
  if (position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) return [];
  const gx = position.x * (width - 1), gy = position.y * (width - 1);
  const rx = Math.ceil(radius * (width - 1)), ry = Math.ceil(radius * (width - 1));
  const out = [];
  for (let y = Math.max(0, Math.floor(gy - ry)); y <= Math.min(width - 1, Math.ceil(gy + ry)); y += 1) {
    for (let x = Math.max(0, Math.floor(gx - rx)); x <= Math.min(width - 1, Math.ceil(gx + rx)); x += 1) {
      if (Math.hypot(x / (width - 1) - position.x, y / (width - 1) - position.y) <= radius) out.push(y * width + x);
    }
  }
  return out;
}

function markRequest(lastWrite, request, tick) {
  const mark = position => { for (const i of footprintIndices(position)) lastWrite[i] = tick; };
  if (request.type === 'point') { mark(request.position); return; }
  const dx = request.to.x - request.from.x, dy = request.to.y - request.from.y;
  const distance = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(distance / (0.5 / (WIDTH - 1))));
  for (let j = 0; j < n; j += 1) {
    const t = (j + 0.5) / n;
    mark({ x: request.from.x + dx * t, y: request.from.y + dy * t });
  }
}

function describe(values) {
  if (!values.length) return { count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { count: values.length, min: sorted[0], p10: q(.1), median: q(.5), p90: q(.9), max: sorted.at(-1), mean: values.reduce((a, b) => a + b, 0) / values.length };
}

function senseAndTrace(controller, field, agent) {
  const points = [];
  controller.field = { sample(x, y) { points.push({ x, y }); return field.sample(x, y); } };
  return { value: controller.senseLocalTrail(agent), points };
}

function supportContext(points, controlField, residenceField, lastWrite, tick, layerMap) {
  const nodeWeight = new Map();
  for (const { x, y } of points) {
    const gx = x * (WIDTH - 1), gy = y * (WIDTH - 1);
    const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(WIDTH - 1, x0 + 1), y1 = Math.min(WIDTH - 1, y0 + 1);
    const tx = gx - x0, ty = gy - y0;
    for (const [index, weight] of [
      [y0 * WIDTH + x0, (1 - tx) * (1 - ty)], [y0 * WIDTH + x1, tx * (1 - ty)],
      [y1 * WIDTH + x0, (1 - tx) * ty], [y1 * WIDTH + x1, tx * ty]
    ]) if (weight > 0 && controlField.values[index] > 0) nodeWeight.set(index, (nodeWeight.get(index) || 0) + weight);
  }
  let totalWeight = 0, oldWeight = 0, materialWeight = 0, oldMaterialWeight = 0;
  const ages = [];
  for (const [index, weight] of nodeWeight) {
    totalWeight += weight;
    const hasSource = lastWrite[index] >= 0;
    if (!hasSource) continue;
    const age = (tick - lastWrite[index]) * DT;
    const isOld = age >= HALF_LIFE;
    const isMaterial = layerMap[index] > 0;
    ages.push({ age, weight });
    if (isOld) oldWeight += weight;
    if (isMaterial) materialWeight += weight;
    if (isOld && isMaterial) oldMaterialWeight += weight;
  }
  ages.sort((a, b) => a.age - b.age);
  let cumulative = 0, medianAge = null;
  for (const item of ages) { cumulative += item.weight; if (cumulative >= totalWeight / 2) { medianAge = item.age; break; } }
  return { positiveSupportNodeCount: nodeWeight.size, positiveSupportWeight: totalWeight,
    weightedBilinearNodes: [...nodeWeight].map(([index, weight]) => ({ index, weight,
      sourceAgeSeconds: lastWrite[index] >= 0 ? (tick - lastWrite[index]) * DT : null,
      tickEntryMaterialLayers: layerMap[index], controlValue: controlField.values[index], residenceValue: residenceField.values[index] })),
    minSourceAgeSeconds: ages.length ? ages[0].age : null, medianSourceAgeSeconds: medianAge,
    oldSourceWeightFraction: totalWeight ? oldWeight / totalWeight : null,
    materialContributingFraction: totalWeight ? materialWeight / totalWeight : null,
    oldMaterialContributingFraction: totalWeight ? oldMaterialWeight / totalWeight : null,
    sourceAgeClass: !totalWeight ? 'no-positive-chemical' : oldWeight === totalWeight ? 'all-old' : oldWeight ? 'partly-old' : 'fresh-only',
    materialSourceClass: !totalWeight ? 'no-positive-chemical' : oldMaterialWeight === totalWeight ? 'all-old-material'
      : oldMaterialWeight ? 'partly-old-material' : 'no-old-material-contribution' };
}

function eligibilityDelta(controlB, residenceB, controlD) {
  let controlEligible = 0, residenceEligible = 0, gained = 0, lost = 0;
  for (let i = 0; i < controlB.length; i += 1) {
    const control = controlB[i] >= 0.30 && controlD[i] >= 0.015;
    const residence = residenceB[i] >= 0.30 && controlD[i] >= 0.015;
    if (control) controlEligible += 1;
    if (residence) residenceEligible += 1;
    if (!control && residence) gained += 1;
    if (control && !residence) lost += 1;
  }
  return { cells: controlB.length, controlEligible, residenceEligible, gained, lost, changed: gained + lost };
}

function runReplay(input, emissions, checkpointMaps, raw) {
  const control = createField(), candidate = createField();
  const memoryControl = new TrailPlateBirth(), memoryCandidate = new TrailPlateBirth();
  const source = emissions.control;
  const anchors = new Map(input.protocol.lateReferenceTicks.map((tick, index) => [tick, index]));
  const expectedB = input.control.frames;
  const readoutRows = [], checkpoints = [], memoryParity = [], memoryMaps = [], mapSnapshots = [], eligibility = [];
  const oldControl = createField(), oldCandidate = createField();
  const lastWrite = new Int32Array(WIDTH * WIDTH); lastWrite.fill(-1);
  let clockMs = 0, lastAnalysisMs = null, emissionIndex = 0, birthIndex = 0, mappedBirthIndex = -1;
  let layerMap = mapLayerMap(input.control.actualBirthMasks, 0);
  const birthMasks = input.control.actualBirthMasks;
  let tick = 0;
  for (tick = 1; tick <= TICKS; tick += 1) {
    const startMs = clockMs;
    while (birthIndex < birthMasks.length && birthMasks[birthIndex].bornAtSimulationTimeMs <= startMs) birthIndex += 1;
    if (tick === 1 || birthIndex !== mappedBirthIndex) {
      layerMap = mapLayerMap(birthMasks.slice(0, birthIndex), startMs);
      mappedBirthIndex = birthIndex;
    }
    control.decay(DT);
    for (let i = 0; i < layerMap.length; i += 1) candidate.values[i] = Math.min(8, candidate.values[i] * Math.exp(decayExponent(layerMap[i])));
    while (emissionIndex < source.length && source[emissionIndex].tick === tick) {
      const request = source[emissionIndex++].deposit;
      writeRequest(control, request); writeRequest(candidate, request); markRequest(lastWrite, request, tick);
    }
    clockMs += DT * 1000;
    const due = lastAnalysisMs === null || clockMs - lastAnalysisMs >= 1000 - 1e-9;
    if (due) {
      const elapsed = lastAnalysisMs === null ? 1 : (clockMs - lastAnalysisMs) / 1000;
      memoryControl.updateChemicalMemory(control, elapsed);
      memoryCandidate.updateChemicalMemory(candidate, elapsed);
      lastAnalysisMs = clockMs;
    }
    if (anchors.has(tick)) {
      const index = anchors.get(tick), expected = expectedB[index].B;
      const maxError = maximum(memoryControl.chemicalMemory.map((v, i) => Math.abs(v - expected[i])));
      memoryParity.push({ tick, id: expectedB[index].materialIds?.[0] ?? null,
        controlMaxAbsError: maxError, candidateMaxAbsDeltaFromControl: maximum(memoryCandidate.chemicalMemory.map((v, i) => Math.abs(v - memoryControl.chemicalMemory[i]))) });
      if (maxError !== 0) throw new Error(`B-memory replay parity failed at anchor ${index}, tick ${tick}: max abs error ${maxError}`);
      memoryMaps.push({ tick, control: Array.from(memoryControl.chemicalMemory), residence: Array.from(memoryCandidate.chemicalMemory), expected: expected.slice() });
      eligibility.push({ tick, ...eligibilityDelta(memoryControl.chemicalMemory,
        memoryCandidate.chemicalMemory, expectedB[index].D) });
    }
    if (tick % 60 === 0) {
      const second = tick / 60;
      const positions = raw.positions[second - 1];
      const ctrlProbe = Object.create(AntController.prototype), candProbe = Object.create(AntController.prototype);
      ctrlProbe.state = candProbe.state = { behavior: { sensorDistance: 0.042, sensorWidth: 0.014 } };
      ctrlProbe.field = control; candProbe.field = candidate;
      for (let i = 0; i < oldControl.values.length; i += 1) {
        const oldMaterial = layerMap[i] > 0 && lastWrite[i] >= 0 && (tick - lastWrite[i]) * DT >= HALF_LIFE;
        oldControl.values[i] = oldMaterial && control.values[i] > 0 ? control.values[i] : 0;
        oldCandidate.values[i] = oldMaterial && candidate.values[i] > 0 ? candidate.values[i] : 0;
      }
      const oldControlProbe = Object.create(AntController.prototype), oldCandidateProbe = Object.create(AntController.prototype);
      oldControlProbe.state = oldCandidateProbe.state = ctrlProbe.state;
      oldControlProbe.field = oldControl; oldCandidateProbe.field = oldCandidate;
      for (const agent of positions.agents) {
        const a = { x: agent.x, y: agent.y, heading: agent.heading };
        const { value: c, points } = senseAndTrace(ctrlProbe, control, a);
        const d = candProbe.senseLocalTrail(a);
        const context = supportContext(points, control, candidate, lastWrite, tick, layerMap);
        const oldC = oldControlProbe.senseLocalTrail(a), oldD = oldCandidateProbe.senseLocalTrail(a);
        readoutRows.push({ second, id: agent.id, x: agent.x, y: agent.y, heading: agent.heading,
          samplePoints: points,
          control: c, residence: d, delta: { strength: d.strength - c.strength, coherence: d.coherence - c.coherence,
            steering: d.steering - c.steering, left: d.left - c.left, center: d.center - c.center, right: d.right - c.right },
          sourceContext: context, oldMaterialOnlyControl: oldC, oldMaterialOnlyResidence: oldD,
          oldMaterialOnlyDelta: { strength: oldD.strength - oldC.strength, coherence: oldD.coherence - oldC.coherence,
            steering: oldD.steering - oldC.steering } });
      }
    }
    if (CHECKPOINTS.includes(tick / 60)) {
      const second = tick / 60, index = CHECKPOINTS.indexOf(second), expected = checkpointMaps[index].pheromone.values;
      exactArrayEqual(project96(control), expected, `control projected96 map ${second}s`);
      const stats = fieldStats(control.values), reference = input.controlCheckpoints.rows.find(row => row.seconds === second).field;
      assert.equal(stats.nodeSum, reference.sum, `control nodeSum ${second}s`);
      assert.equal(stats.reconstructedIntegral, reference.bilinearIntegral, `control integral ${second}s`);
      checkpoints.push({ seconds: second, control: stats, candidate: fieldStats(candidate.values),
        candidateMax: maximum(candidate.values), controlMax: maximum(control.values) });
      mapSnapshots.push({ seconds: second, control: project96(control), residence: project96(candidate) });
    }
  }
  assert.equal(emissionIndex, source.length, 'all frozen source writes consumed');
  const ages = [], response = [];
  for (let i = 0; i < lastWrite.length; i += 1) if (lastWrite[i] >= 0) {
    const age = (TICKS - lastWrite[i]) * DT;
    ages.push(age); response.push(Math.exp(-LN2 * age / HALF_LIFE));
  }
  let massMatchedL1 = 0;
  const candidateMass = fieldStats(candidate.values).nodeSum, controlMass = fieldStats(control.values).nodeSum;
  const globalScale = candidateMass / controlMass;
  for (let i = 0; i < control.values.length; i += 1) massMatchedL1 += Math.abs(candidate.values[i] - control.values[i] * globalScale);
  return { control, candidate, memoryControl, memoryCandidate, mapSnapshots, memoryMaps, eligibility,
    report: { checkpoints, memoryParity, sourceRows: source.length, positionRows: raw.positions.reduce((a, r) => a + r.agents.length, 0),
      prospectiveReadoutCount: readoutRows.length, readoutRows, lastWriteAgeSeconds: describe(ages),
      lastWriteNativeResponse: describe(response), quietOver15SecondsFraction: ages.length ? ages.filter(x => x >= 15).length / ages.length : null,
      prospectiveStrengthControl: describe(readoutRows.map(x => x.control.strength)),
      prospectiveStrengthResidence: describe(readoutRows.map(x => x.residence.strength)),
      prospectiveStrengthDelta: describe(readoutRows.map(x => x.delta.strength)),
      prospectiveSteeringDelta: describe(readoutRows.map(x => x.delta.steering)),
      sourceContext: { sourceAgeClassCounts: Object.fromEntries(['all-old', 'partly-old', 'fresh-only', 'no-positive-chemical'].map(k => [k, readoutRows.filter(x => x.sourceContext.sourceAgeClass === k).length])),
        materialSourceClassCounts: Object.fromEntries(['all-old-material', 'partly-old-material', 'no-old-material-contribution', 'no-positive-chemical'].map(k => [k, readoutRows.filter(x => x.sourceContext.materialSourceClass === k).length])),
        minSourceAgeSeconds: describe(readoutRows.map(x => x.sourceContext.minSourceAgeSeconds).filter(Number.isFinite)),
        medianSourceAgeSeconds: describe(readoutRows.map(x => x.sourceContext.medianSourceAgeSeconds).filter(Number.isFinite)),
        materialContributingFraction: describe(readoutRows.map(x => x.sourceContext.materialContributingFraction).filter(Number.isFinite)),
        oldMaterialContributingFraction: describe(readoutRows.map(x => x.sourceContext.oldMaterialContributingFraction).filter(Number.isFinite)),
        note: 'Age and material fractions use positive bilinear node support only; untouched zero nodes are excluded.' },
      oldMaterialOnlyReadout: { controlStrength: describe(readoutRows.map(x => x.oldMaterialOnlyControl.strength)),
        residenceStrength: describe(readoutRows.map(x => x.oldMaterialOnlyResidence.strength)),
        strengthDelta: describe(readoutRows.map(x => x.oldMaterialOnlyDelta.strength)),
        coherenceDelta: describe(readoutRows.map(x => x.oldMaterialOnlyDelta.coherence)),
        steeringDelta: describe(readoutRows.map(x => x.oldMaterialOnlyDelta.steering)),
        nonzeroControlCount: readoutRows.filter(x => x.oldMaterialOnlyControl.strength > 0).length,
        nonzeroResidenceCount: readoutRows.filter(x => x.oldMaterialOnlyResidence.strength > 0).length,
        note: 'Same saved poses; only positive material nodes with last source-kernel contribution at least 15 seconds old remain. Hill response is nonlinear; deltas are direct masked-field readouts, not additive attribution.' },
      eligibility: { anchors: eligibility, thresholds: { nativeB: 0.30, controlD: 0.015 }, note: 'B varies by replay arm; D remains the saved control map. No selector or formation feedback.' },
      finalTotalMatchedFieldShape: { controlScaleToCandidateNodeSum: globalScale,
        normalizedL1: massMatchedL1 / candidateMass,
        limitation: 'Descriptive shape comparison only; no equal-total global-dose world control was run, so local p(L) advantage is unproven.' } }, lastWrite };
}

function pulseDiagnostics(birthMasks) {
  const at = (field, x, y) => field.sample(x, y);
  const pulse = (layer = 0, sourceScale = 1) => {
    const field = createField(); field.depositPoint({ x: .5, y: .5 }, { amount: .1 * sourceScale, radius: RADIUS });
    const initial = at(field, .5, .5);
    const active = [];
    for (let i = 0; i < field.values.length; i += 1) if (field.values[i] !== 0) active.push(i);
    for (let n = 0; n < 1800; n += 1) {
      const factor = Math.exp(-LN2 * DT / HALF_LIFE * (1 - .5 * (1 - Math.exp(-layer / 4))));
      for (const i of active) field.values[i] *= factor;
    }
    return { initial, after30s: at(field, .5, .5), normalizedAfter30s: at(field, .5, .5) / initial };
  };
  const p1 = 1 - .5 * (1 - Math.exp(-1 / 4));
  const nativePulse = pulse(0), residencePulse = pulse(1), attenuatedPulse = pulse(0, .5);
  const constant = (layer, gain) => {
    const field = createField();
    const active = [];
    for (let t = 1; t <= 18000; t += 1) {
      const factor = Math.exp(-LN2 * DT / HALF_LIFE * (1 - .5 * (1 - Math.exp(-layer / 4))));
      for (const i of active) field.values[i] *= factor;
      field.depositPoint({ x: .5, y: .5 }, { amount: .0001 * gain, radius: RADIUS });
      if (t === 1) for (let i = 0; i < field.values.length; i += 1) if (field.values[i] !== 0) active.push(i);
    }
    const equilibrium = at(field, .5, .5);
    const factor = Math.exp(-LN2 * DT / HALF_LIFE * (1 - .5 * (1 - Math.exp(-layer / 4))));
    for (let n = 0; n < 900; n += 1) {
      for (const i of active) field.values[i] *= factor;
    }
    return { equilibrium, afterSourceStops15s: at(field, .5, .5), normalizedTail: at(field, .5, .5) / equilibrium };
  };
  const controlConstant = constant(0, 1), residenceConstant = constant(1, 1), attenuationGainConstant = constant(0, 1 / p1);
  const first = birthMasks[0].mask;
  let edge = null;
  for (let i = 0; i < first.length && !edge; i += 1) if (first[i]) {
    const x = i % 96, y = Math.floor(i / 96);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < 96 && ny >= 0 && ny < 96 && !first[ny * 96 + nx]) { edge = { x, y, nx, ny }; break; }
    }
  }
  assert.ok(edge, 'first real material mask has a bare neighboring cell');
  const from = { x: edge.x / 95, y: edge.y / 95 }, to = { x: edge.nx / 95, y: edge.ny / 95 };
  const field = createField(); field.depositPoint({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, { amount: .1, radius: RADIUS });
  const initialSamples = [from, to].map(point => field.sample(point.x, point.y));
  const pMaterial = 1 - .5 * (1 - Math.exp(-1 / 4));
  const active = [], layers = new Uint8Array(field.values.length);
  for (let i = 0; i < field.values.length; i += 1) if (field.values[i] !== 0) active.push(i);
  for (let y = 0; y < WIDTH; y += 1) for (let x = 0; x < WIDTH; x += 1) {
    const mx = Math.round(x / 315 * 95), my = Math.round(y / 315 * 95);
    layers[y * WIDTH + x] = first[my * 96 + mx] > 0 ? 1 : 0;
  }
  const factors = [Math.exp(-LN2 * DT / HALF_LIFE), Math.exp(-LN2 * DT / HALF_LIFE * pMaterial)];
  for (let n = 0; n < 900; n += 1) for (const i of active) {
    field.values[i] *= factors[layers[i]];
  }
  const finalSamples = [from, to].map(point => field.sample(point.x, point.y));
  return { layer1EquivalentHalfLifeSeconds: HALF_LIFE / p1,
    fixedPulse: { equalDoseNative15s: nativePulse, residenceMaterialLayer1: residencePulse,
    sourceAttenuationHalfDoseNative15s: attenuatedPulse },
    constantSource: { native15s: controlConstant, residenceLayer1: residenceConstant, gainEquivalentNative15s: attenuationGainConstant,
      note: 'The gain can match equilibrium amplitude; normalized source-free tails differ.' },
    firstRealMaskEdgePulse: { plateId: birthMasks[0].id, edge96: edge, field316Pulse: { from, to },
      initialSamples, after15sSamples: finalSamples, note: 'Piecewise 316-to-96 nearest-cell raster diagnostic; not natural physics.' } };
}

async function execute(save) {
  const inputDir = resolve(ROOT, INPUT), outputDir = resolve(ROOT, PACKAGE, 'data');
  const readGz = async path => jsonGz(await readFile(path));
  const [input, emissions, sourceHashes, summary, maps, raw] = await Promise.all([
    readGz(resolve(inputDir, 'paired-input.json.gz')),
    readGz(resolve(inputDir, 'source-emissions.json.gz')),
    readFile(resolve(inputDir, 'SOURCE-HASHES.json'), 'utf8').then(JSON.parse),
    readFile(resolve(inputDir, 'control/run-summary.json'), 'utf8').then(JSON.parse),
    Promise.all(CHECKPOINTS.map(seconds => readGz(resolve(inputDir, `control/seed20261005-G-${seconds}s.json.gz`)))),
    readGz(resolve(inputDir, 'control/seed20261005-G-raw.json.gz'))
  ]);
  assertInputs(input, emissions, maps);
  for (const [path, expected] of Object.entries(sourceHashes)) {
    const actual = sha(await readFile(resolve(ROOT, path)));
    assert.equal(actual, expected, `frozen source hash ${path}`);
  }
  assert.equal(summary.ticks, TICKS);
  const result = runReplay(input, emissions, maps, raw);
  const pulse = pulseDiagnostics(input.control.actualBirthMasks);
  const stats = result.report.checkpoints;
  const artifact = { schema: 'ant-material-chemical-residence-probe-v1', sourceCommit: 'afea7ec', productionAuthority: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785',
    replayCorrections: [
      { initialAssertion: 'projected field map length 99856 !== saved map length 9216', cause: 'Frozen maps are exact 96x96 bilinear projections of the 316x316 native field.', correction: 'Verifier now samples native field values at each saved 96-grid coordinate; all five projected maps match exactly.' },
      { initialAssertion: 'reconstructed integral 0.012360094191302975 !== 0.012360094191302977', cause: 'Verifier divided by grid area; source computes weighted sum multiplied by hx then hy.', correction: 'Verifier now follows that operation order; all five native integrals match exactly.' }
    ],
    inputs: { pairedInputSha256: sha(await readFile(resolve(inputDir, 'paired-input.json.gz'))), emissionsSha256: sha(await readFile(resolve(inputDir, 'source-emissions.json.gz'))), sourceHashes },
    protocol: { tickHz: 60, ticks: TICKS, decayThenFrozenWrites: true, material: 'actual births at tick entry; nearest 96-grid layer count',
      countermodel: 'lambda=ln(2)/15 * (1 - 0.5*(1-exp(-L/4)))', noAgentFeedback: true,
      prospectiveReadout: 'native senseLocalTrail at all saved post-tick 1Hz positions/headings; these are matched-state readouts, not original pre-move inputs or motor outcomes',
      sourceContext: 'exact native sample points; aggregate positive bilinear 316-grid node weights, last source-kernel write ages, and tick-entry material layer counts; 15s age reference is descriptive',
      oldMaterialOnlyReadout: 'same saved poses; positive material nodes with last actual kernel contribution age >=15s; all other nodes masked to zero',
      eligibility: 'native B>=0.30 and fixed saved control D>=0.015; no formation or selector feedback' },
    summary: { status: 'COMPLETE', controlParity: 'exact maps, nodeSum, integral and 40 B-memory maps', ...result.report,
      pulseDiagnostics: pulse,
      maps: result.mapSnapshots, memoryMaps: result.memoryMaps } };
  const bytes = gzipJson(artifact);
  const reportSummary = { ...artifact.summary };
  delete reportSummary.readoutRows; delete reportSummary.memoryMaps; delete reportSummary.maps;
  const report = { ...artifact, summary: { ...reportSummary, detailedReadouts: 'data/replay.json.gz',
    maps: CHECKPOINTS.map((seconds, i) => ({ seconds, controlStats: stats[i].control,
      residenceStats: stats[i].candidate, nativeMapParity: true })) } };
  report.outputSha256 = sha(bytes);
  const reportBytes = Buffer.from(JSON.stringify(report, null, 2) + '\n');
  if (save) {
    await mkdir(outputDir, { recursive: true });
    await writeFile(resolve(outputDir, 'replay.json.gz'), bytes);
    await writeFile(resolve(ROOT, PACKAGE, 'results.json'), reportBytes);
    console.log(JSON.stringify({ status: 'COMPLETE', outputSha256: report.outputSha256, checkpoints: stats.map(x => x.seconds), rows: result.report.prospectiveReadoutCount }));
  } else {
    const old = await readFile(resolve(outputDir, 'replay.json.gz'));
    const oldReport = JSON.parse(await readFile(resolve(ROOT, PACKAGE, 'results.json'), 'utf8'));
    assert.equal(sha(old), report.outputSha256, 'deterministic replay gzip bytes');
    assert.deepEqual({ ...oldReport, outputSha256: undefined }, { ...report, outputSha256: undefined }, 'deterministic results report');
    console.log(JSON.stringify({ status: 'CHECK-PASS', outputSha256: report.outputSha256 }));
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--self-test')) { console.log(JSON.stringify(selfTest())); return; }
  if (args.has('--run')) { await execute(true); return; }
  if (args.has('--check')) { selfTest(); await execute(false); return; }
  throw new Error('Use --self-test, --run, or --check.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
