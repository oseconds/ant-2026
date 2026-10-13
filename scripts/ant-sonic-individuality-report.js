import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { encodeStereoFloatWav, sha256 } from './ant-sonic-shadow-render.js';

const evidence='docs/ant/evidence/2026-10-13-plate-sonic-individuality';
const output='test-results/ant-plate-sonic-individuality-20261013';
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const metrics=await readJson(`${evidence}/response-metrics.json`);
const index=await readJson(`${output}/render-index.json`);
const distribution=values=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return {count:v.length,min:v[0],median:v[Math.floor(v.length/2)],max:v.at(-1)};};
const isolated=metrics.cases.filter(r=>r.condition==='native'&&['p25','p50','p75'].includes(r.positionLabel));
const summary={method:'Descriptive distributions, not an individuality score or a perceptual acceptance threshold.',
  isolated: {rmsDbfs:distribution(isolated.map(r=>r.metrics.rmsDbfs)),centroidHz:distribution(isolated.map(r=>r.metrics.spectralCentroidHz)),t90Ms:distribution(isolated.map(r=>r.metrics.energyTimes.t90Ms))},
  pairwise:{},materialMedian:{},world:metrics.ablations.filter(r=>r.condition.startsWith('world-')),
  counterexamples:metrics.pairwise.filter(r=>r.condition==='native'&&r.positionLabel==='p50').sort((a,b)=>b.output.powerSpectrumCosine-a.output.powerSpectrumCosine).slice(0,4),
  limiter:{maxPreLimiterAbs:Math.max(...index.rows.map(r=>r.telemetry.maxOutputAbs)),clippedSteps:index.rows.reduce((s,r)=>s+r.telemetry.clipped,0),nonFinite:index.rows.reduce((s,r)=>s+r.telemetry.nonFinite,0)}};
for(const condition of ['native','material-median']) for(const position of ['p25','p50','p75']) {
  const pairs=metrics.pairwise.filter(r=>r.condition===condition&&r.positionLabel===position);
  summary.pairwise[`${condition}-${position}`]={outputPowerCosine:distribution(pairs.map(r=>r.output.powerSpectrumCosine)),fieldPowerCosine:distribution(pairs.map(r=>r.fieldPowerSpectrumCosine)),output50HzPowerCosine:distribution(pairs.map(r=>r.output.powerCosine50HzBins)),field50HzPowerCosine:distribution(pairs.map(r=>r.fieldPowerCosine50HzBins)),envelope25msRmsCosine:distribution(pairs.map(r=>r.output.envelope25msRmsCosine)),zeroLagCorrelation:distribution(pairs.map(r=>r.output.zeroLagCorrelation))};
}
const medianAblations=metrics.ablations.filter(r=>r.condition==='material-median');
summary.materialMedian={rmsDeltaDb:distribution(medianAblations.map(r=>r.response.rmsDeltaDb)),relativeL2:distribution(medianAblations.map(r=>r.response.relativeL2)),powerSpectrumCosine:distribution(medianAblations.map(r=>r.response.powerSpectrumCosine)),powerCosine50HzBins:distribution(medianAblations.map(r=>r.response.powerCosine50HzBins)),envelope25msRmsCosine:distribution(medianAblations.map(r=>r.response.envelope25msRmsCosine)),centroidShiftHz:distribution(medianAblations.map(r=>r.response.centroidShiftHz))};
await writeFile(`${evidence}/measurement-summary.json`,JSON.stringify(summary,null,2)+'\n');

const priorRoot='docs/ant/evidence/2026-10-07-base-substrate-debug/audio';
const historical=await readJson(`${priorRoot}/event-count-matched-substrate/readout-excitation-decomposition.json`);
const matched=await readJson(`${priorRoot}/event-count-matched-substrate/event-count-matched-report.json`);
const mix=await readJson(`${priorRoot}/mix-audibility/mix-ab-report.json`);
assert.equal(matched.source.inputGzipSha256,mix.sourceRun.inputGzipSha256);
assert.equal(matched.source.firstPlateDescriptorSha256,mix.sourceRun.firstPlateDescriptorSha256);
const measured={};
for(const [role,file,factor] of [['substrate','substrate-matched-parent-groups-raw-worklet-10s-48khz-f32.wav',8],['born','born-p1-63-raw-worklet-10s-48khz-f32.wav',1/Math.sqrt(12)]]) {
  const bytes=await readFile(`${priorRoot}/event-count-matched-substrate/${file}`);
  assert.equal(sha256(bytes),historical.source.rawWavSha256[role]);
  assert.equal(bytes.readUInt16LE(20),3);assert.equal(bytes.readUInt16LE(22),2);assert.equal(bytes.readUInt32LE(24),48000);assert.equal(bytes.readUInt32LE(40),bytes.length-44);
  let sum=0,displacement=0,reconstructedDifferentSamples=0;
  for(let p=44;p<bytes.length;p+=4){const y=bytes.readFloatLE(p);assert.ok(Number.isFinite(y)&&Math.abs(y)<1);const x=y/(1-Math.abs(y));sum+=y*y;displacement+=(x/factor)**2;if(Math.fround(x/(1+Math.abs(x)))!==y)reconstructedDifferentSamples++;}
  assert.equal(reconstructedDifferentSamples,0);
  measured[role]={file,bytes:bytes.length,sha256:sha256(bytes),rms:Math.sqrt(sum/((bytes.length-44)/4)),displacementRms:Math.sqrt(displacement/((bytes.length-44)/4)),reconstructedDifferentSamples};
}
const ratioDb=(a,b)=>20*Math.log10(a/b);
const rawGap=ratioDb(measured.substrate.rms,measured.born.rms);
const displacementGap=ratioDb(measured.substrate.displacementRms,measured.born.displacementRms);
const excitation=10*Math.log10(historical.excitation.substrate.totals.expected/historical.excitation.born.totals.compliant);
for(const [value,expected] of [[rawGap,historical.decomposition.rawWorkletLevelGapDb],[displacementGap,historical.decomposition.pickupDisplacementGapAfterRemovingReadoutAndLimiterDb],[excitation,historical.decomposition.B_excitationEnergyDb]])assert.ok(Math.abs(value-expected)<1e-10);
const mixBytes=await readFile(`${priorRoot}/mix-audibility/${mix.comparison.B.pcm}`);assert.equal(sha256(mixBytes),mix.comparison.B.pcmSha256);
let currentSum=0;for(let p=44;p<mixBytes.length;p+=4)currentSum+=(mixBytes.readFloatLE(p)/mix.settings.surfaceGain)**2;
const currentRms=Math.sqrt(currentSum/((mixBytes.length-44)/4));
const prior={storedPcmHashesVerified:true,measured,oldRawGapDb:rawGap,oldDisplacementGapDb:displacementGap,oldReadoutAndLimiterDb:rawGap-displacementGap,expectedExcitationDb:excitation,residualTransferBundleDb:displacementGap-excitation,genericRandomness:historical.source.genericRandomJitter,jitterBounds:historical.decomposition.C_boundsFromUnrecordedGenericJitterDb,currentPlateReadoutFactor:1,genericReadoutFactor:8,currentScaleGapDb:ratioDb(8,1),storedCurrentReadoutP1RawRms:currentRms,currentReadoutMatchedLegacyGapDb:ratioDb(measured.substrate.rms,currentRms),scope:'Current Plate readout formula applied in the stored B case; legacy single-Plate input predates default-On locomotion. No new generic render, physical equivalence, solver superiority, or current-world masking claim.',sourceToolHashes:{}};
for(const path of ['static/worklets/plate.worklet.js','static/worklets/surface-plate.worklet.js','scripts/ant-sonic-individuality-report.js'])prior.sourceToolHashes[path]=sha256(await readFile(path));
await writeFile(`${evidence}/prior-transfer-verification.json`,JSON.stringify(prior,null,2)+'\n');

const listening=[];
for(const row of index.rows.filter(r=>r.condition==='native'&&r.positionLabel==='p50')) {
  const bytes=await readFile(row.files.pcm),left=new Float32Array(bytes.length/8),right=new Float32Array(left.length);let sum=0;
  for(let i=0;i<left.length;i++){left[i]=bytes.readFloatLE(i*8);right[i]=bytes.readFloatLE(i*8+4);sum+=left[i]**2+right[i]**2;}
  const rms=Math.sqrt(sum/(left.length*2)),gain=.02/rms;
  const wav=encodeStereoFloatWav({left,right},{gain});
  let peak=0;for(let p=44;p<wav.length;p+=4)peak=Math.max(peak,Math.abs(wav.readFloatLE(p)));assert.ok(peak<1);
  const path=`${output}/${row.id}.listening-only.wav`;await writeFile(path,wav);
  const fixedPath=`${output}/${row.id}.measurement.wav`,fixed=await readFile(fixedPath);
  listening.push({id:row.id,fixed:{path:fixedPath,bytes:fixed.length,sha256:sha256(fixed)},levelMatched:{path,bytes:wav.length,sha256:sha256(wav),gain,targetRms:.02,peak},generationCommand:'node scripts/ant-sonic-individuality-report.js',sourceToolSha256:sha256(await readFile('scripts/ant-sonic-individuality-report.js')),sourcePcmSha256:sha256(bytes)});
}
await writeFile(`${evidence}/listening-manifest.json`,JSON.stringify({judgment:'No human listening assessment collected. Player availability is not listening evidence.',listening},null,2)+'\n');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>ANT Plate sonic individuality</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:0 20px;background:#faf9f6;color:#222}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px 8px;border-bottom:1px solid #ccc}audio{width:310px}p{line-height:1.5}</style><h1>Frozen natural Plate comparison</h1><p>Same 0.035 contact, 0.01 footprint, 3 ms pulse, 75 ms recovery, ×50 damping, current point pickups. Path midpoint; 1.5 s render. No Z, Nodule, or Base.</p><p><b>Measurement</b>: fixed gain 1, no per-clip normalization. <b>Listening only</b>: each clip matches stereo RMS 0.02. This column supports timbre comparison only; it cannot support amplitude or transfer claims.</p><p>No human listening assessment collected. Spectral differences do not establish audible discrimination. Files live in the verified ignored output folder; reproduce them before using this sheet in a fresh checkout.</p><table><tr><th>Plate</th><th>Measurement: fixed gain</th><th>Listening only: level matched</th></tr>${listening.map(r=>`<tr><td>${r.id.replace('-p50-native','')}</td><td><audio controls preload="none" src="../../../../${r.fixed.path}"></audio></td><td><audio controls preload="none" src="../../../../${r.levelMatched.path}"></audio></td></tr>`).join('')}</table></html>`;
await writeFile(`${evidence}/listening.html`,html);
const analysisFiles=['scripts/ant-sonic-response-metrics.py','scripts/ant-sonic-modal-transfer.py','scripts/ant-sonic-individuality-report.js',`${output}/render-index.json`,`${output}/modal-topologies.json`,`${evidence}/response-metrics.json`,`${evidence}/measurement-summary.json`,`${evidence}/modal-transfer.json`,`${evidence}/prior-transfer-verification.json`,`${evidence}/listening-manifest.json`,`${evidence}/listening.html`];
const analysisHashes=[];for(const path of analysisFiles){const bytes=await readFile(path);analysisHashes.push({path,bytes:bytes.length,sha256:sha256(bytes)});}
await writeFile(`${evidence}/analysis-manifest.json`,JSON.stringify({tools:{node:process.version,python:'Python 3 with numpy; exact environment version in validation.json'},commands:['python scripts/ant-sonic-response-metrics.py test-results/ant-plate-sonic-individuality-20261013/render-index.json docs/ant/evidence/2026-10-13-plate-sonic-individuality/response-metrics.json','python scripts/ant-sonic-modal-transfer.py','node scripts/ant-sonic-individuality-report.js'],scope:'Final analysis provenance; render-manifest records the source snapshot at audio capture, before later descriptive-analysis additions.',artifacts:analysisHashes},null,2)+'\n');
console.log(JSON.stringify({summary,listeningClips:listening.length,priorGapDb:prior.currentReadoutMatchedLegacyGapDb}));
