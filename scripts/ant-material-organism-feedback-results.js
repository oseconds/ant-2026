import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/ant/evidence/2026-10-30-material-organism-feedback-discovery/data');
const output = path.join(root, 'RESULTS.json');
const read = p => JSON.parse((p.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(p)) : fs.readFileSync(p)).toString());
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const num = n => Number.isFinite(n) ? n : null;
const pct = (value, baseline) => baseline ? (value / baseline - 1) * 100 : null;
const median = xs => { const a = xs.filter(Number.isFinite).sort((x,y)=>x-y); return a.length ? a[Math.round((a.length-1)*0.5)] : null; };
const files = ['control', 'turning', 'stride'];
const native = Object.fromEntries(files.map(arm => [arm, {
  summary: read(path.join(root, arm, 'run-summary.json')),
  aux: read(path.join(root, arm, 'auxiliary.json.gz')),
  analysis: arm === 'control' ? null : read(path.join(root, arm, 'ANALYSIS.json')),
  parity: arm === 'control' ? null : read(path.join(root, arm, 'PARITY.json')),
}]));
const inputHashes = {};
for (const arm of files) for (const file of ['run-summary.json', 'auxiliary.json.gz', ...(arm === 'control' ? [] : ['ANALYSIS.json', 'PARITY.json'])]) {
  const p = path.join(root, arm, file); inputHashes[`${arm}/${file}`] = hash(p);
}
const final = arm => native[arm].summary.timeline.at(-1);
const opportunities = arm => [300,600].map(seconds => {
  const frames = native[arm].analysis.lateFrames.filter(x => Math.abs(x.timeMs/1000-seconds) <= 22);
  const tops = frames.map(x => x.D.separatedCenters015);
  const top1 = tops.map(x=>x[0]), top2 = tops.map(x=>x[1]), top3 = tops.map(x=>x[2]);
  const near = frames.map(x => x.D.separatedCenters015.find(p=>p.index===x.D.globalMaximumWithinS?.index)?.entryDistance <= 0.037);
  return { referenceSeconds:seconds, anchorCount:frames.length,
    medianD1:median(top1.map(x=>x?.value)), medianD2OverD1:median(frames.map(x=>x.D.top2ToTop1)), medianD3OverD1:median(frames.map(x=>x.D.top3ToTop1)),
    medianLeadingEntryDistance:median(top1.map(x=>x?.entryDistance)), medianLeadingLayerCount:median(top1.map(x=>x?.priorLayers)),
    medianLeadingExactFeet20s:median(top1.map(x=>x?.exactFeet20s)), medianLeadingNearbyFeet20s:median(top1.map(x=>x?.nearbyFeet20sR037)),
    medianXOverlap:median(frames.map((_,i)=>native[arm].analysis.lateFrameDetails.filter(y=>y.tick===frames[i].tick)[0]?.candidate?.X?.preexistingMaterialFraction ?? null)),
    maxDEntryNear037All40:near.length===40 && near.every(Boolean), maxDEntryNear037Count:near.filter(Boolean).length,
    medianTop2EntryDistance:median(top2.map(x=>x?.entryDistance)), medianTop3EntryDistance:median(top3.map(x=>x?.entryDistance)) };
});
const pairedActivation = arm => {
  const a=native[arm].aux.activation, b=native.control.aux.activation;
  const diffs=a.map((x,i)=>({activation:x.activation-b[i].activation,evidence:x.evidence-b[i].evidence,limit:x.recruitmentLimit-b[i].recruitmentLimit,desiredPopulation:x.desiredPopulation-b[i].desiredPopulation}));
  const firstRecruitmentDifference=native[arm].summary.timeline.findIndex((x,i)=>x.recruitedThisSecond!==native.control.summary.timeline[i].recruitedThisSecond);
  const firstPopulationDifference=native[arm].summary.timeline.findIndex((x,i)=>x.population!==native.control.summary.timeline[i].population);
  const out=Object.fromEntries(['activation','evidence','limit','desiredPopulation'].map(key=>{
    const xs=diffs.map(x=>x[key]); const i=xs.findIndex(x=>x!==0); return [key,{firstChangedTimeMs:i<0?null:a[i].timeMs,samples:xs.length,maxAbs:Math.max(...xs.map(Math.abs)),mean:xs.reduce((x,y)=>x+y,0)/xs.length,changedSamples:xs.filter(x=>x!==0).length}];
  }));
  out.recruitmentCounts={firstChangedTimeMs:firstRecruitmentDifference<0?null:native[arm].summary.timeline[firstRecruitmentDifference].simulationTimeSeconds*1000};
  out.population={firstChangedTimeMs:firstPopulationDifference<0?null:native[arm].summary.timeline[firstPopulationDifference].simulationTimeSeconds*1000};
  return out;
};
const armResult = arm => {
  const s = native[arm].summary, t = final(arm), e = s.events, f = s.fieldWrites;
  const checkpoint = arm === 'control' ? native.turning.analysis.checkpointComparison.at(-1).control : native[arm].analysis.checkpointComparison.at(-1).candidate;
  const material = checkpoint?.material;
  return {
    travel: s.movement.totalDistance, activeAntSeconds: s.movement.activeAntSeconds,
    admissions: s.movement.recruited, retirees: s.movement.retired, feet: e.individualFeet,
    contactGroups: e.contactGroups, sourceAcceptedFieldDose: f.acceptedDose,
    nativeFieldNodeSum: t.pheromoneNodeSum, reconstructedIntegral: t.reconstructedIntegral,
    Csum: checkpoint?.C?.surfaceSum ?? null, plateCount: t.plateCountFromMaterial,
    noduleCount: e.sphereBirths, exposedCells: material?.exposedCells ?? null,
    buriedLayerCells: material?.buriedLayerCells ?? null,
    maxLocalLayerCount: material?.maxLocalLayerCount ?? null, endpointActivation: t.activation,
    endpointActivationEvidence: t.activationEvidence, endpointPopulation: t.population,
    activePopulation: t.population, cumulativeFootContacts: t.cumulativeFootContacts,
    finalRng: s.finalRng,
    zeroAnomalies: { ...s.invariants, capTouches: f.capTouchCount, saturatedUpdates: f.saturatedUpdateCount, saturationLoss: f.saturationLoss },
    sourceDoseAuditUnavailable: true,
    percentagesVsNeutral: arm === 'control' ? null : {
      travel: pct(s.movement.totalDistance, native.control.summary.movement.totalDistance),
      activeAntSeconds: pct(s.movement.activeAntSeconds, native.control.summary.movement.activeAntSeconds),
      feet: pct(e.individualFeet, native.control.summary.events.individualFeet),
      sourceAcceptedFieldDose: pct(f.acceptedDose, native.control.summary.fieldWrites.acceptedDose),
      nativeFieldNodeSum: pct(t.pheromoneNodeSum, final('control').pheromoneNodeSum),
      Csum: pct(checkpoint.C.surfaceSum, native.turning.analysis.checkpointComparison.at(-1).control.C.surfaceSum), endpointActivation: pct(t.activation, final('control').activation),
      endpointPopulation: pct(t.population, final('control').population),
    }
  };
};
const result = {
  schema: 'ant-material-organism-feedback-results-v1',
  protocol: { seed: 20261005, horizonSeconds: 600, tickHz: 60, slowdown: 'OFF', residence: 'OFF', comparison: 'actual native corridor formation', turningAndStride: 'offline probes; no simulation in collation' },
  inputs: inputHashes,
  nativeArms: Object.fromEntries(files.map(arm => [arm, armResult(arm)])),
  savedParityChecks: {
    stridePositionParity: native.stride.analysis.locomotionAndPopulation.firstPositionDivergence === null,
    strideActivationAndFieldTimelineParity: native.stride.summary.timeline.every((x,i) => ['activation','activationEvidence','pheromoneNodeSum','reconstructedIntegral'].every(k => x[k] === native.control.summary.timeline[i][k])),
    strideEndpointRngParity: native.stride.summary.finalRng.state === native.control.summary.finalRng.state && native.stride.summary.finalRng.calls === native.control.summary.finalRng.calls,
    strideBirthMaskAndTimeParityCount: native.stride.analysis.actualBirthMasks.filter(m=>m.exactMaskParity&&m.controlBirthTimeMs===m.candidateBirthTimeMs).length,
    turningParityReceipt: native.turning.parity,
    strideParityReceipt: native.stride.parity,
  },
  turning: {
    firstChangedTurn: native.turning.aux.turning.firstChanged,
    firstSampledPosition: native.turning.analysis.locomotionAndPopulation.firstPositionDivergence,
    changedCounts: { calls:native.turning.aux.turning.calls, changedCalls:native.turning.aux.turning.changedCalls, byLayer:native.turning.aux.turning.byLayer },
    actualCohortLocomotion: native.turning.analysis.locomotionAndPopulation.checkpointTravelAndRecruitment,
    angularRateAndTargetSpeedByL: Object.fromEntries(Object.entries(native.turning.aux.turning.byLayer).map(([L,v]) => [L, {
      angularRateAbsRadPerSec: v.dtSeconds ? v.angularVelocityAbsSum / v.dtSeconds : null,
      meanTargetSpeed: native.turning.aux.motorByLayer[L]?.ticks ? native.turning.aux.motorByLayer[L].targetSpeedSum / native.turning.aux.motorByLayer[L].ticks : null,
      meanRealizedSpeed: native.turning.aux.motorByLayer[L]?.ticks ? native.turning.aux.motorByLayer[L].speedSum / native.turning.aux.motorByLayer[L].ticks : null,
      calls: v.calls, changedCalls: v.changedCalls,
    }])),
    perExposedAngularRate: Object.fromEntries(Object.entries(native.turning.aux.turning.byLayer).filter(([L])=>Number(L)>0).map(([L,v])=>[L,{calls:v.calls,meanAbsRadPerSec:v.dtSeconds?v.angularVelocityAbsSum/v.dtSeconds:null,changedCalls:v.changedCalls}])),
    stridePhaseResiduals: Object.fromEntries(Object.entries(native.turning.aux.motorByLayer).map(([L,v]) => [L, { samples:v.phaseResidualSamples, meanAbs:v.phaseResidualSamples ? v.phaseResidualAbsSum/v.phaseResidualSamples : null }])),
    lateFrames: native.turning.analysis.lateFrames,
    lateFrameDetails: native.turning.analysis.lateFrameDetails,
    actualBirthMasks: native.turning.analysis.actualBirthMasks,
    opportunityNear300And600: opportunities('turning'),
    maskMapDeltas40: native.turning.analysis.lateFrameDetails.map(x=>({tick:x.tick,timeMs:x.timeMs, deltas:x.delta})),
    checkpoints600: native.turning.analysis.checkpointComparison.at(-1),
    footMaps: native.turning.analysis.footMaps,
  },
  stride: {
    firstChangedTurn: native.stride.aux.turning.firstChanged,
    firstSampledPosition: native.stride.analysis.locomotionAndPopulation.firstPositionDivergence,
    changedCounts: { calls:native.stride.aux.turning.calls, changedCalls:native.stride.aux.turning.changedCalls, byLayer:native.stride.aux.turning.byLayer },
    actualCohortLocomotion: native.stride.analysis.locomotionAndPopulation.checkpointTravelAndRecruitment,
    stridePhaseResiduals: Object.fromEntries(Object.entries(native.stride.aux.motorByLayer).map(([L,v]) => [L, { samples:v.phaseResidualSamples, meanAbs:v.phaseResidualSamples ? v.phaseResidualAbsSum/v.phaseResidualSamples : null }])),
    lateFrames: native.stride.analysis.lateFrames,
    lateFrameDetails: native.stride.analysis.lateFrameDetails,
    actualBirthMasks: native.stride.analysis.actualBirthMasks,
    opportunityNear300And600: opportunities('stride'),
    maskMapDeltas40: native.stride.analysis.lateFrameDetails.map(x=>({tick:x.tick,timeMs:x.timeMs, deltas:x.delta})),
    checkpoints600: native.stride.analysis.checkpointComparison.at(-1),
    footMaps: native.stride.analysis.footMaps,
  },
  limits: {
    activationEvidencePopulationRecruitmentLimitPairedDifferences: Object.fromEntries(['turning','stride'].map(arm=>[arm,pairedActivation(arm)])),
    sourceDoseAuditUnavailable: true,
    sourceDoseAuditReason: 'Common legacy analysis sourceDose conservation residuals are null; no source-conservation claim is computed.',
    angularCohorts: 'Actual exposed and layer cohorts; not matched cohorts.',
    activation: 'Saved timeline samples only; no amplification inference.',
  }
};
for (const arm of ['turning','stride']) {
  const p = native[arm].parity;
  assert(p.commonControlInitialState === true && p.preMaterialPositionParityThroughSecond === 84, `${arm}: parity receipt mismatch`);
  assert(native[arm].analysis.lateFrames.length === 40 && native[arm].analysis.lateFrameDetails.length === 40, `${arm}: expected 40 anchors`);
  assert(native[arm].analysis.actualBirthMasks.length === 38, `${arm}: expected 38 ordinal comparison rows`);
  assert(native[arm].analysis.actualBirthMasks.every(m => /^trail-plate-\d+$/.test(m.id) && (!m.controlPresent || Number.isFinite(m.controlBirthTimeMs)) && (!m.candidatePresent || Number.isFinite(m.candidateBirthTimeMs))), `${arm}: birth mask ordinal/time record mismatch`);
}
assert(native.stride.analysis.locomotionAndPopulation.firstPositionDivergence === null, 'stride: saved position parity must remain exact');
assert(native.stride.summary.timeline.every((x,i) => ['activation','activationEvidence','pheromoneNodeSum','reconstructedIntegral'].every(k => x[k] === native.control.summary.timeline[i][k])), 'stride: saved activation/field timeline mismatch');
assert(native.stride.summary.finalRng.state === native.control.summary.finalRng.state && native.stride.summary.finalRng.calls === native.control.summary.finalRng.calls, 'stride: saved endpoint RNG mismatch');
assert(native.stride.analysis.actualBirthMasks.every(m => m.exactMaskParity && m.controlBirthTimeMs === m.candidateBirthTimeMs), 'stride: 38 saved mask/time parity mismatch');
assert(native.control.summary.finalRng.state === 2778740003 && native.control.summary.finalRng.calls === 345790, 'control RNG receipt mismatch');
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (process.argv.includes('--check')) {
  assert(fs.existsSync(output), 'RESULTS.json missing');
  assert(fs.readFileSync(output, 'utf8') === serialized, 'RESULTS.json differs from deterministic collation');
  console.log('RESULTS.json matches deterministic collation; parity assertions passed.');
} else {
  assert(!fs.existsSync(output), 'RESULTS.json exists; refusing overwrite (use --check or move it explicitly)');
  fs.writeFileSync(output, serialized, { flag: 'wx' });
  console.log(`Wrote ${path.relative(process.cwd(), output)}; parity assertions passed.`);
}
