import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { decodeStereoFloatWav } from './stratigraphy-audio-overview.js';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntEnvironmentAudioBridge } from '../src/lib/audio/AntEnvironmentAudioBridge.js';

const audioDir = resolve('docs/ant/evidence/2026-10-07-base-substrate-debug/audio');
const evidenceDir = resolve(audioDir, 'event-count-matched-substrate');
const sourceReport = JSON.parse(await readFile(resolve(evidenceDir, 'event-count-matched-report.json'), 'utf8'));
const sha = (data) => createHash('sha256').update(data).digest('hex');
const dbRatio = (a, b) => 20 * Math.log10(a / b);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const MIX = 1 / Math.sqrt(12);
const genericReadout = 8;

const frozenBytes = await readFile(resolve(audioDir, sourceReport.source.inputFile));
assert.equal(sha(frozenBytes), sourceReport.source.inputGzipSha256);
const frozen = JSON.parse(gunzipSync(frozenBytes));
const fresh = await captureFrozenControllerRun();
assert.deepEqual(fresh.recording, frozen, 'reconstructed topology must come from the exact frozen event stream');
assert.equal(sha(JSON.stringify(fresh.firstBirth)), sourceReport.source.firstPlateDescriptorSha256);
assert.deepEqual(fresh.topology.layerIds, [sourceReport.source.firstPlateId]);

const schedules = sourceReport.scheduleHashes.schedules;
const genericSchedule = schedules.matchedSubstrate.map(({ frame, payload }) => ({ frame, payload }));
const bornSchedule = schedules.bornP1.map(({ frame, payload }) => ({ frame, payload }));
assert.equal(sha(JSON.stringify(genericSchedule)), sourceReport.scheduleHashes.matchedSubstrateScheduleSha256);
assert.equal(sha(JSON.stringify(bornSchedule)), sourceReport.scheduleHashes.p1AcceptedScheduleSha256);
assert.equal(genericSchedule.length, 44);
assert.equal(bornSchedule.length, 63);

const rawStems = {
  substrate: await loadRaw('substrate-matched-parent-groups-raw-worklet-10s-48khz-f32.wav',
    sourceReport.outputs['substrate-matched-parent-groups-raw-worklet-10s-48khz-f32.wav'].sha256, genericReadout),
  born: await loadRaw('born-p1-63-raw-worklet-10s-48khz-f32.wav',
    sourceReport.outputs['born-p1-63-raw-worklet-10s-48khz-f32.wav'].sha256, MIX)
};
const displacementGapDb = dbRatio(rawStems.substrate.displacement.pooled.rms,
  rawStems.born.displacement.pooled.rms);
const rawGapDb = dbRatio(rawStems.substrate.raw.pooled.rms, rawStems.born.raw.pooled.rms);
const preLimiterGapDb = dbRatio(rawStems.substrate.preLimiter.pooled.rms, rawStems.born.preLimiter.pooled.rms);
const readoutScaleDb = dbRatio(genericReadout, MIX);
const limiterContributionDb = rawGapDb - preLimiterGapDb;
const readoutAndLimiterDb = readoutScaleDb + limiterContributionDb;

const genericGroups = genericSchedule.map((event, index) => ({
  sourceContactIndex: schedules.matchedSubstrate[index].sourceContactIndex,
  frame: event.frame,
  ...genericInjectedEnergy(event.payload)
}));
const bornEnergy = computeBornInjectedEnergy(fresh.topology, bornSchedule,
  sourceReport.eventMapping.acceptedP1ToParentGroup, frozen.bornStrikes);
const savedBornTelemetry = sourceReport.capture.workletReports.find(row => row.type === 'evidence-done'
  && row.diagnostics)?.diagnostics;
assert.ok(savedBornTelemetry, 'saved born worklet diagnostics');
assert.ok(Math.abs(bornEnergy.total.requested - savedBornTelemetry.requestedContactImpulseSquared) < 1e-10,
  'computed per-foot requested impulse energy must close to saved worklet telemetry');
assert.ok(Math.abs(bornEnergy.total.compliant - savedBornTelemetry.compliantContactImpulseSquared) < 1e-10,
  'computed per-foot compliant impulse energy must close to saved worklet telemetry');

const bornByGroup = new Map();
for (const foot of bornEnergy.feet) {
  const row = bornByGroup.get(foot.parentContactIndex) || { acceptedP1Feet: 0, requestedImpulseSquared: 0,
    compliantImpulseSquared: 0, affectedSolverNodes: 0, attenuatedNodeContributions: 0 };
  row.acceptedP1Feet += 1;
  row.requestedImpulseSquared += foot.requestedImpulseSquared;
  row.compliantImpulseSquared += foot.compliantImpulseSquared;
  row.affectedSolverNodes += foot.affectedSolverNodes;
  row.attenuatedNodeContributions += foot.attenuatedNodeContributions;
  bornByGroup.set(foot.parentContactIndex, row);
}
const genericByParent = new Map(genericGroups.map(row => [row.sourceContactIndex, row]));
const parentGroups = sourceReport.eventMapping.matchedContactGroupRows.map(group => {
  const substrate = genericByParent.get(group.contactIndex);
  const born = bornByGroup.get(group.contactIndex) || { acceptedP1Feet: 0, requestedImpulseSquared: 0,
    compliantImpulseSquared: 0, affectedSolverNodes: 0, attenuatedNodeContributions: 0 };
  assert.ok(substrate, `matched generic source group ${group.contactIndex}`);
  return { contactIndex: group.contactIndex, simulationTimeMs: group.simulationTimeMs,
    substrate, born };
});
assert.equal(parentGroups.length, 44);
assert.equal(parentGroups.reduce((sum, row) => sum + row.born.acceptedP1Feet, 0), 63);

const genericTotals = genericGroups.reduce((sum, row) => {
  sum.nominalJ1 += row.nominalDeltaVSquared;
  sum.expected += row.expectedDeltaVSquared;
  sum.lowerBound += row.jitterLowerBoundDeltaVSquared;
  sum.upperBound += row.jitterUpperBoundDeltaVSquared;
  return sum;
}, { nominalJ1: 0, expected: 0, lowerBound: 0, upperBound: 0 });
const excitationDeltaDb = 10 * Math.log10(genericTotals.expected / bornEnergy.total.compliant);
const excitationRangeDb = {
  lower: 10 * Math.log10(genericTotals.lowerBound / bornEnergy.total.compliant),
  upper: 10 * Math.log10(genericTotals.upperBound / bornEnergy.total.compliant)
};
const requestedExcitationDeltaDb = 10 * Math.log10(genericTotals.expected / bornEnergy.total.requested);
const residualTransferDb = displacementGapDb - excitationDeltaDb;

const report = {
  status: 'frozen-matched-pcm-readout-and-excitation-decomposition',
  source: {
    seed: sourceReport.source.seed,
    inputGzipSha256: sha(frozenBytes),
    firstPlateDescriptorSha256: sourceReport.source.firstPlateDescriptorSha256,
    p1AcceptedScheduleSha256: sourceReport.scheduleHashes.p1AcceptedScheduleSha256,
    matchedSubstrateScheduleSha256: sourceReport.scheduleHashes.matchedSubstrateScheduleSha256,
    rawWavSha256: {
      substrate: rawStems.substrate.sha256,
      born: rawStems.born.sha256
    },
    acceptedP1Feet: bornSchedule.length,
    uniqueMatchedParentGroups: genericSchedule.length,
    genericRandomJitter: 'Per-node J=0.92+0.16*U was not stored for the original PCM; per-group realized sum(deltaV^2) is unrecoverable. Nominal J=1, expectation E[J^2]=1.0021333333333334, and strict multiplier bounds are reported.'
  },
  reconstruction: {
    inverse: 'x = y / (1 - abs(y)); pickup displacement = x / readoutFactor',
    forward: 'y = x / (1 + abs(x)); forward float32 sample compared to the stored raw WAV',
    readoutFactors: { substrate: genericReadout, born: MIX },
    stems: rawStems,
    rawPooledRmsGapDb: rawGapDb,
    reconstructedDisplacementPooledRmsGapDb: displacementGapDb,
    preLimiterPooledRmsGapDb: preLimiterGapDb,
    sampleExactReconstruction: {
      substrate: rawStems.substrate.reconstruction,
      born: rawStems.born.reconstruction
    }
  },
  excitation: {
    interpretation: 'Sum(deltaV^2) at each production solver input, before subsequent propagation. Generic Plate is a 48 kHz circular-grid initial-velocity injection; born Plate is a 6 kHz surface-worklet requested/compliant contact-impulse injection. These are solver-space proxies, not calibrated physical joules.',
    substrate: { events: genericGroups.length, jitter: { nominalMultiplier: 1,
      expectedSquaredMultiplier: 1 + 0.16 ** 2 / 12, lowerSquaredMultiplier: 0.92 ** 2,
      upperSquaredMultiplier: 1.08 ** 2 }, totals: genericTotals, groups: genericGroups },
    born: { acceptedFeet: bornEnergy.feet.length, totals: bornEnergy.total,
      savedWorkletTotals: { requestedImpulseSquared: savedBornTelemetry.requestedContactImpulseSquared,
        compliantImpulseSquared: savedBornTelemetry.compliantContactImpulseSquared,
        exactTotalsMatch: true }, feet: bornEnergy.feet },
    parentGroups
  },
  decomposition: {
    rawWorkletLevelGapDb: rawGapDb,
    A_readoutScaleAndLimiterDb: readoutAndLimiterDb,
    A_componentsDb: { linearReadoutScale: readoutScaleDb, limiterNonlinearity: limiterContributionDb },
    pickupDisplacementGapAfterRemovingReadoutAndLimiterDb: displacementGapDb,
    B_excitationEnergyDb: excitationDeltaDb,
    B_boundsFromUnrecordedGenericJitterDb: excitationRangeDb,
    bornRequestedInsteadOfCompliantBDb: requestedExcitationDeltaDb,
    C_residualTransferDb: residualTransferDb,
    C_boundsFromUnrecordedGenericJitterDb: {
      lower: displacementGapDb - excitationRangeDb.upper,
      upper: displacementGapDb - excitationRangeDb.lower
    },
    closureDb: readoutAndLimiterDb + excitationDeltaDb + residualTransferDb,
    caveat: 'C is a residual transfer term, not a pure intrinsic resonator constant. It includes distinct event timing/spatial distribution, per-group versus per-foot semantics, resonator/topology response, and solver discretization. Generic realized jitter energy cannot be recovered from the saved PCM; the expected value is used for B and the matching bounds are shown.'
  }
};

await mkdir(evidenceDir, { recursive: true });
await writeFile(resolve(evidenceDir, 'readout-excitation-decomposition.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ rawGapDb, readoutAndLimiterDb, displacementGapDb,
  genericExcitation: genericTotals, bornExcitation: bornEnergy.total,
  excitationDeltaDb, excitationRangeDb, residualTransferDb,
  parentGroups: parentGroups.length, bornFeet: bornEnergy.feet.length,
  reconstruction: report.reconstruction.sampleExactReconstruction }, null, 2));

async function loadRaw(name, expectedSha256, readoutFactor) {
  const bytes = await readFile(resolve(evidenceDir, name));
  assert.equal(sha(bytes), expectedSha256, `${name} frozen PCM hash`);
  const wav = decodeStereoFloatWav(bytes);
  const raw = audioStats(wav.channels.left, wav.channels.right);
  const displacement = { left: new Float64Array(wav.sampleCount), right: new Float64Array(wav.sampleCount) };
  const preLimiter = { left: new Float64Array(wav.sampleCount), right: new Float64Array(wav.sampleCount) };
  let maxDoubleError = 0, sumSquaredError = 0, float32DifferentSamples = 0, nonFinite = 0;
  for (const channel of ['left', 'right']) for (let i = 0; i < wav.sampleCount; i += 1) {
    const y = wav.channels[channel][i];
    if (!Number.isFinite(y) || Math.abs(y) >= 1) { nonFinite += 1; continue; }
    const x = y / (1 - Math.abs(y));
    preLimiter[channel][i] = x;
    displacement[channel][i] = x / readoutFactor;
    const reapplied = x / (1 + Math.abs(x));
    const error = reapplied - y;
    maxDoubleError = Math.max(maxDoubleError, Math.abs(error));
    sumSquaredError += error * error;
    if (Math.fround(reapplied) !== y) float32DifferentSamples += 1;
  }
  const sampleCount = wav.sampleCount * 2;
  return {
    sha256: sha(bytes),
    raw,
    preLimiter: audioStats(preLimiter.left, preLimiter.right),
    displacement: audioStats(displacement.left, displacement.right),
    reconstruction: { sampleCount, float32DifferentSamples, exactFloat32SampleMatch: float32DifferentSamples === 0,
      maxAbsoluteDoubleError: maxDoubleError, rmsDoubleError: Math.sqrt(sumSquaredError / sampleCount), nonFiniteInputSamples: nonFinite }
  };
}

function audioStats(left, right) {
  const channelStats = channel => {
    let sum = 0, peak = 0, nonFinite = 0;
    for (const sample of channel) {
      if (!Number.isFinite(sample)) { nonFinite += 1; continue; }
      sum += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    return { rms: Math.sqrt(sum / channel.length), peak, nonFiniteSamples: nonFinite };
  };
  const l = channelStats(left), r = channelStats(right);
  const pooled = { rms: Math.sqrt((left.length * l.rms ** 2 + right.length * r.rms ** 2) / (left.length + right.length)),
    peak: Math.max(l.peak, r.peak), nonFiniteSamples: l.nonFiniteSamples + r.nonFiniteSamples };
  return { left: l, right: r, pooled };
}

function genericInjectedEnergy(payload) {
  const size = 17, center = 8, radius = center - 0.7, width = 0.72;
  const strength = clamp(Number(payload.strength) || 0, 0, 1);
  const x = clamp(Number(payload.position?.x) || 0, -0.92, 0.92);
  const y = clamp(Number(payload.position?.y) || 0, -0.92, 0.92);
  const px = center + x * radius, py = center + y * radius;
  const centerX = Math.round(px), centerY = Math.round(py), amplitude = 0.01 + strength * 0.24;
  let weightSquaredSum = 0, affectedSolverNodes = 0;
  for (let oy = -3; oy <= 3; oy += 1) for (let ox = -3; ox <= 3; ox += 1) {
    const gx = centerX + ox, gy = centerY + oy;
    if (gx < 0 || gy < 0 || gx >= size || gy >= size) continue;
    const dxGrid = gx - center, dyGrid = gy - center;
    if (dxGrid * dxGrid + dyGrid * dyGrid > radius * radius) continue;
    const dx = gx - px, dy = gy - py;
    const weight = Math.exp(-(dx * dx + dy * dy) / (2 * width * width));
    weightSquaredSum += weight * weight;
    affectedSolverNodes += 1;
  }
  const nominalDeltaVSquared = amplitude * amplitude * weightSquaredSum;
  return { payload, normalizedStrength: strength, amplitude, affectedSolverNodes,
    nominalDeltaVSquared, expectedDeltaVSquared: nominalDeltaVSquared * (1 + 0.16 ** 2 / 12),
    jitterLowerBoundDeltaVSquared: nominalDeltaVSquared * 0.92 ** 2,
    jitterUpperBoundDeltaVSquared: nominalDeltaVSquared * 1.08 ** 2 };
}

function computeBornInjectedEnergy(topology, schedule, parentMapping, frozenBornRows) {
  const RATE = 6000, SAMPLE_RATE = 48000, CONTACT_RECOVERY_STEPS = 450;
  const CONTACT_REFERENCE_DELTA_V = 0.020, CONTACT_MAX_COMPLIANCE_LOSS = 0.25;
  const contactMemory = new Float32Array(topology.nodeGridIndices.length);
  const lastContactStep = new Float64Array(topology.nodeGridIndices.length);
  const parentByPayload = new Map(parentMapping.map(row => [JSON.stringify(frozenBornRows[row.bornRecordingIndex].payload), row]));
  const feet = [];
  let requestedTotal = 0, compliantTotal = 0;
  for (let index = 0; index < schedule.length; index += 1) {
    const event = schedule[index], p = event.payload, parent = parentByPayload.get(JSON.stringify(p));
    assert.ok(parent, `parent map for P1 foot ${index}`);
    assert.equal(parent.requestedFrame, event.frame);
    const sx = Math.round(p.position.x * 95), sy = Math.round(p.position.y * 95);
    const layer = topology.routingTopLayerByCell96[sy * 96 + sx];
    assert.equal(layer, topology.layerIds.indexOf(p.layerId), `valid P1 route for foot ${index}`);
    assert.equal(p.layerId, topology.layerIds[layer]);
    const begin = topology.nodeOffsets[layer], end = topology.nodeOffsets[layer + 1];
    const radius = Number.isFinite(p.footprintRadius) && p.footprintRadius > 0 ? p.footprintRadius : 0.01;
    const sigma = radius * 31, x = p.position.x * 31, y = p.position.y * 31;
    let normSquared = 0;
    for (let node = begin; node < end; node += 1) {
      const cell = topology.nodeGridIndices[node], gx = cell % 32, gy = Math.floor(cell / 32);
      const weight = integratedGaussian(gx, gy, x, y, sigma);
      normSquared += weight * weight;
    }
    const norm = Math.sqrt(normSquared), impulse = Math.min(0.05, p.strength);
    const density = topology.materialCoefficients[layer * 4 + 2], reach = 4 * sigma + 0.5;
    const physicsStep = Math.floor(event.frame * RATE / SAMPLE_RATE);
    let requested = 0, compliant = 0, affectedSolverNodes = 0, attenuatedNodeContributions = 0;
    for (let node = begin; node < end; node += 1) {
      const cell = topology.nodeGridIndices[node], gx = cell % 32, gy = Math.floor(cell / 32);
      if (Math.abs(gx - x) > reach || Math.abs(gy - y) > reach) continue;
      const weight = integratedGaussian(gx, gy, x, y, sigma);
      if (weight * weight < 1e-12 * normSquared) continue;
      const deltaV = impulse * weight / norm / Math.sqrt(density);
      const elapsed = Math.max(0, physicsStep - lastContactStep[node]);
      const memory = contactMemory[node] * Math.exp(-elapsed / CONTACT_RECOVERY_STEPS);
      const transfer = 1 - CONTACT_MAX_COMPLIANCE_LOSS * memory;
      contactMemory[node] = memory + (1 - memory) * Math.min(1, Math.abs(deltaV) / CONTACT_REFERENCE_DELTA_V);
      lastContactStep[node] = physicsStep;
      const delivered = deltaV * transfer;
      requested += deltaV * deltaV;
      compliant += delivered * delivered;
      affectedSolverNodes += 1;
      if (transfer < 1) attenuatedNodeContributions += 1;
    }
    requestedTotal += requested;
    compliantTotal += compliant;
    feet.push({ bornRecordingIndex: index, parentContactIndex: parent.contactIndex, contactLegId: parent.contactLegId,
      frame: event.frame, simulationTimeMs: parent.simulationTimeMs, payload: p, physicsStep,
      affectedSolverNodes, attenuatedNodeContributions, requestedImpulseSquared: requested,
      compliantImpulseSquared: compliant });
  }
  return { feet, total: { requested: requestedTotal, compliant: compliantTotal,
    complianceLossRatio: 1 - compliantTotal / requestedTotal } };
}

function integratedGaussian(cx, cy, x, y, sigma) {
  const q = 0.7745966692414834, w0 = 0.5555555555555556, w1 = 0.8888888888888888;
  let total = 0;
  for (let iy = -1; iy <= 1; iy += 1) for (let ix = -1; ix <= 1; ix += 1) {
    const oy = iy === 0 ? 0 : iy * q * 0.5, wy = iy === 0 ? w1 : w0;
    const ox = ix === 0 ? 0 : ix * q * 0.5, wx = ix === 0 ? w1 : w0;
    const dx = cx + ox - x, dy = cy + oy - y;
    total += wx * wy * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
  }
  return total / 9;
}

async function captureFrozenControllerRun() {
  const seed = 20261005;
  let rngState = seed >>> 0, rngCalls = 0, currentMs = 0, firstBirth = null;
  const contacts = [], legacyStrikes = [], bornStrikes = [];
  const audioEngine = { context: { currentTime: 0 }, async createWorklet(name, _url, _config, _onMessage, _onError, output = {}) {
    const gain = { value: output.gain ?? 1, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; },
      linearRampToValueAtTime(value) { this.value = value; } };
    return { node: { port: { onmessage: null, postMessage(message) {
      if (name === 'surface-plate-processor' && message?.type === 'strike') bornStrikes.push({ simulationTimeMs: currentMs, payload: message.payload });
    }, close() {} }, addEventListener() {}, removeEventListener() {} }, gainNode: { gain }, disconnect() {} };
  } };
  const audioBridge = new AntEnvironmentAudioBridge({ audioEngine });
  const controller = new AntController({ random: () => {
    rngCalls += 1; rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 0x100000000;
  }, audioBridge, state: { audioExperiment: { mode: 'bornSurface', baseSubstrate: true } } });
  const unsubscribe = controller.subscribe(({ type, payload }) => {
    if (type === 'plate-birth' && !firstBirth) firstBirth = payload;
  });
  try {
    await controller.init(); controller.setAudioVolume(0.35); await controller.setAudioEnabled(true);
    if (!audioBridge.legacy.plate || !audioBridge.surface.worklet) throw new Error('Frozen audio bridges failed to initialize.');
    const originalHandle = audioBridge.handleFootContact.bind(audioBridge);
    audioBridge.handleFootContact = (event, context) => {
      currentMs = event.simulationTimeMs;
      contacts.push({ simulationTimeMs: currentMs, payload: event, responses: context.responses });
      return originalHandle(event, context);
    };
    audioBridge.legacy.plate.strike = async payload => { legacyStrikes.push({ simulationTimeMs: currentMs, payload }); return true; };
    while (controller.simulationTimeMs < 120000 && (!firstBirth
      || controller.simulationTimeMs < firstBirth.bornAtSimulationTimeMs + 10000)) controller.tick(1 / 60);
    assert.ok(firstBirth && controller.simulationTimeMs >= firstBirth.bornAtSimulationTimeMs + 9999);
    const result = { firstBirth, topology: structuredClone(audioBridge.surface.topology), recording: {
      seed, simulationDurationSeconds: controller.simulationTimeMs / 1000, rngCalls, finalRngState: rngState,
      contacts, legacyStrikes, bornStrikes
    } };
    await controller.destroy();
    return result;
  } catch (error) {
    await controller.destroy();
    throw error;
  } finally { unsubscribe(); }
}
