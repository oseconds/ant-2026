import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { sha256 } from './ant-sonic-shadow-render.js';

const evidence='docs/ant/evidence/2026-10-14-base-born-causal-decomposition';
const output='test-results/ant-base-born-causal-decomposition-20261014';
const indexBytes=await readFile(`${output}/render-index.json`), metricsBytes=await readFile(`${output}/metrics.json`);
const index=JSON.parse(indexBytes), metrics=JSON.parse(metricsBytes);
assert.equal(metrics.cases.length,index.rows.length);
const summary=metrics.cases.map(c=>{
  const s=c.metrics, row=index.rows.find(r=>r.id===c.id);
  const p=metrics.comparisons.find(p=>p.kind==='declared-baseline'&&p.b===c.id);
  return {id:c.id,plateKey:c.plateKey,condition:c.condition,nodes:row.nodeCount,physicsRate:row.physicsRate,
    pairBaseline:p?.a||null,outputRms:s.rms,outputRmsDbfs:s.rmsDbfs,outputPeak:s.peakAbs,
    outputCentroidHz:s.spectralCentroidHz,outputBandShares:s.bandPowerFractions,outputStereoRatio:s.rmsLeft/s.rmsRight,
    fieldCentroidHz:s.field.spectralCentroidHz,fieldBandShares:s.field.bandPowerFractions,
    fieldRms:s.field.fieldRms,fieldT90Ms:s.field.energyTimes.t90Ms,fieldTailAfter500ms:s.field.remainingEnergyFractionAfterMs['500'],
    fieldPowerAbove3kFraction:s.field.power50HzOutside0To3000Fraction,
    limiterRmsDeltaDb:s.limiterContribution.preToSoftLimiter.rmsDeltaDb,
    forwardQueueResidualL2:s.limiterContribution.softInterpolationToSavedPCM.relativeL2,
    differenceFromDeclaredBaseline:p?{output:p.output,field:p.field}:null,
    readoutGain8:c.condition==='baseline'?{
      comparison:s.baselineReadoutGain8Control.savedBaselineToSoftLimitedReadoutGain8,
      limiterCompression:s.baselineReadoutGain8Control.limiterCompressionRelativeTo8xRaw}:null};
});
const artifacts=[];
async function save(path,data,role) {
  const b=Buffer.isBuffer(data)?data:Buffer.from(data);
  await writeFile(path,b);artifacts.push({path,role,bytes:b.length,sha256:sha256(b),generationCommand:'node scripts/ant-base-born-report.js'});
}
await save(`${evidence}/response-metrics.json.gz`,gzipSync(metricsBytes,{level:9}),'complete response metrics with field/output/limiter and pair comparisons; compressed JSON');
await save(`${evidence}/experiment-index.json.gz`,gzipSync(indexBytes,{level:9}),'exact frozen conditions, event receipts, coefficient and source hashes; compressed JSON');
await save(`${evidence}/summary.json`,JSON.stringify({method:'response coordinates and declared A/B comparisons, not a Base similarity score',cases:summary},null,2)+'\n','compact interpretable coordinates for each condition');
const columns=['id','nodes','physicsRate','pairBaseline','outputRmsDbfs','outputCentroidHz','fieldCentroidHz','fieldT90Ms','fieldTailAfter500ms','limiterRmsDeltaDb'];
await save(`${evidence}/summary.csv`,columns.join(',')+'\n'+summary.map(s=>columns.map(k=>s[k]??'').join(',')).join('\n')+'\n','human readable response table');

// One fixed scale per chart; no per-curve or per-panel normalization.
const key='20261005-trail-plate-24', conditions=['baseline','instant','loss-frequency','loss-uniform','rate-aware-48','base-elastic-48','base-elastic-instant-48','base-reference'];
const colors=['#222','#d45c00','#156bc0','#9b3db4','#16a083','#d79600','#e52b42','#657080'];
const chosen=conditions.map(condition=>metrics.cases.find(c=>c.id===`${key}-${condition}`));
const width=1100,height=750,x0=70,x1=1030,y0=65,y1=330,y2=440,y3=700;
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif" font-size="13" fill="#222"><text x="70" y="24" font-size="18">P24: fixed-scale field spectrum and decay</text><text x="70" y="44">Spectrum: 50 Hz mean-node power, −140..0 dB; decay: RMS displacement −120..0 dB. No normalization.</text>`;
const xf=hz=>x0+(x1-x0)*hz/3000, xt=ms=>x0+(x1-x0)*ms/1500;
const yp=db=>y1-(y1-y0)*(Math.max(-140,Math.min(0,db))+140)/140;
const ye=db=>y3-(y3-y2)*(Math.max(-120,Math.min(0,db))+120)/120;
for(let db=-140;db<=0;db+=20)svg+=`<path d="M${x0} ${yp(db)}H${x1}" stroke="#ddd"/><text x="15" y="${yp(db)+4}">${db} dB</text>`;
for(let db=-120;db<=0;db+=20)svg+=`<path d="M${x0} ${ye(db)}H${x1}" stroke="#ddd"/><text x="15" y="${ye(db)+4}">${db} dB</text>`;
for(let hz=0;hz<=3000;hz+=500)svg+=`<text x="${xf(hz)-15}" y="350">${hz} Hz</text>`;
for(let ms=0;ms<=1500;ms+=250)svg+=`<text x="${xt(ms)-16}" y="722">${ms} ms</text>`;
chosen.forEach((c,i)=>{
  const f=c.metrics.field, points=f.power50HzBins.map(b=>`${xf((b.lowHz+b.highHz)/2).toFixed(2)},${yp(10*Math.log10(Math.max(b.power,1e-30))).toFixed(2)}`).join(' ');
  const env=f.envelope25msRms.map((v,j)=>`${xt((j+.5)*25).toFixed(2)},${ye(20*Math.log10(Math.max(v,1e-30))).toFixed(2)}`).join(' ');
  svg+=`<polyline points="${points}" fill="none" stroke="${colors[i]}" stroke-width="1.5"/><polyline points="${env}" fill="none" stroke="${colors[i]}" stroke-width="1.5"/>`;
  const column=i%4,row=Math.floor(i/4);
  svg+=`<text x="${70+column*255}" y="${380+row*22}" fill="${colors[i]}">${conditions[i]} (&gt;3k ${(100*f.power50HzOutside0To3000Fraction).toFixed(2)}%)</text>`;
});
svg+='</g></svg>';
await save(`${evidence}/fixed-scale-field.svg`,svg,'fixed displacement power/RMS scale; 0..3k spectral interval with outside mass labeled');
const sourceToolHashes={};
for(const path of ['scripts/ant-base-born-report.js','scripts/ant-base-born-metrics.py','scripts/ant-sonic-response-metrics.py','scripts/ant-base-born-modal.py'])sourceToolHashes[path]=sha256(await readFile(path));
await writeFile(`${evidence}/analysis-manifest.json`,JSON.stringify({command:'python scripts/ant-base-born-metrics.py test-results/ant-base-born-causal-decomposition-20261014/render-index.json test-results/ant-base-born-causal-decomposition-20261014/metrics.json; node scripts/ant-base-born-report.js',
  sourceToolHashes,indexSha256:sha256(indexBytes),metricsSha256:sha256(metricsBytes),artifacts},null,2)+'\n');
console.log(JSON.stringify({cases:summary.length,artifacts:artifacts.length}));
