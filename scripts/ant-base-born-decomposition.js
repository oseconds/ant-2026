import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { renderSurface, sha256 } from './ant-sonic-shadow-render.js';
import { transformSurface, renderGenericReference, rateAwareSurface } from './ant-base-born-shadow.js';

const phase = process.argv[2] || 'initial';
assert.ok(['initial', 'extended', 'interaction-control'].includes(phase));
const evidence = 'docs/ant/evidence/2026-10-14-base-born-causal-decomposition';
const output = 'test-results/ant-base-born-causal-decomposition-20261014';
const inputPath = 'docs/ant/evidence/2026-10-13-plate-sonic-individuality/frozen-inputs.json.gz';
const priorIndexPath = 'test-results/ant-plate-sonic-individuality-20261013/render-index.json';
const frames = 72000, sampleRate = 48000, strikeFrame = 480, seed = 20261014;
const command = `node --expose-gc scripts/ant-base-born-decomposition.js ${phase}`;
const bytes = await readFile(inputPath);
assert.equal(sha256(bytes), 'f600eb768df2721c98cc607ea8b4b4d4fc64ae74cda6b5bf3f9297e8b0865a2d');
const inputs = JSON.parse(gunzipSync(bytes));
const sorted = [...inputs.selected].sort((a,b) => a.solverNodes-b.solverNodes || a.key.localeCompare(b.key));
const maximum = sorted.at(-1).solverNodes;
const selected = [sorted[0],sorted[Math.floor(sorted.length/2)],sorted.find(row=>row.solverNodes===maximum)];
assert.deepEqual(selected.map(row=>row.key), ['20261005-trail-plate-1','20261005-trail-plate-24','20261007-trail-plate-26']);
for (const row of selected) assert.equal(sha256(JSON.stringify(row.plate)),row.descriptorSha256);
const source = await readFile('static/worklets/surface-plate.worklet.js','utf8');
const generic = await readFile('static/worklets/plate.worklet.js','utf8');
assert.equal(sha256(source),'14c7461f1412f0d6897a6683d46e582dbb80711f2ba74e8ea53e026895eeea5e');
assert.equal(sha256(generic),'43295646dca949d676ebebb80ba57ee6cac9043ecd914ab313ff26329e438dfb');
await mkdir(output,{recursive:true});
await mkdir(evidence,{recursive:true});
let rows=[], artifacts=[];
if(phase!=='initial') {
  const previous=JSON.parse(await readFile(`${output}/render-index.json`,'utf8'));
  rows=previous.rows;
  artifacts=JSON.parse(await readFile(`${evidence}/render-manifest.json`,'utf8')).artifacts;
}
async function save(path,data,role) {
  const b=Buffer.isBuffer(data)?data:Buffer.from(data);
  await writeFile(path,b);
  artifacts=artifacts.filter(a=>a.path!==path);
  artifacts.push({path,role,bytes:b.length,sha256:sha256(b),generationCommand:command});
}
async function borrow(path,role) {
  const b=await readFile(path);
  if(!artifacts.some(a=>a.path===path)) artifacts.push({path,role,bytes:b.length,sha256:sha256(b),
    generationCommand:'node scripts/ant-plate-sonic-individuality.js',reusedFrom:'2a65dc892f96fef2254afdb3c0621e3023e67c0b'});
}
function interleave(left,right) {
  const a=new Float32Array(left.length*2);
  for(let i=0;i<left.length;i++){a[i*2]=left[i];a[i*2+1]=right[i];}
  return Buffer.from(a.buffer);
}
function pathPosition(plate,fraction) {
  const lengths=[0],path=plate.principalPath;
  for(let i=1;i<path.length;i++) lengths.push(lengths.at(-1)+Math.hypot(path[i]%96-path[i-1]%96,Math.floor(path[i]/96)-Math.floor(path[i-1]/96)));
  const cell=path[lengths.findIndex(v=>v>=lengths.at(-1)*fraction)];
  return {x:cell%96/95,y:Math.floor(cell/96)/95};
}
function eventsFor(plate, common3=false) {
  return (common3?[.25,.5,.75]:[.5]).map((f,i)=>({frame:strikeFrame+i*12000,message:{type:'strike',payload:{
    plateId:plate.id,layerId:plate.id,position:pathPosition(plate,f),strength:.035,footprintRadius:.01,hardness:.5}}}));
}
const packedHash = t=>sha256(JSON.stringify(t,(_k,v)=>ArrayBuffer.isView(v)?Array.from(v):v));
const baseB=.01041070909374015, baseT=.0012476847034339226, baseD=.000178, baseGamma=.0000616140594288357;
async function capture(row,condition,topology,transformed,events=eventsFor(row.plate),rate=6000) {
  const id=`${row.key}-${condition}`;
  assert.ok(!rows.some(r=>r.id===id),`duplicate ${id}`);
  const result=renderSurface({source:transformed.source,topology,events,frames});
  assert.equal(result.telemetry.strikes,events.length);
  assert.equal(result.telemetry.droppedRoutes,0);assert.equal(result.telemetry.dropped,0);assert.equal(result.telemetry.clipped,0);
  assert.equal(result.fields.frames,frames*rate/sampleRate);
  assert.equal(result.telemetry.physicsRate,rate);
  assert.deepEqual(result.renderedFrameReceipts.map(r=>r.frame),events.map(e=>e.frame));
  const files={pcm:`${output}/${id}.pcm.f32le`,fields:`${output}/${id}.field.f32le`,rawPickup:`${output}/${id}.pickup.f32le`};
  await save(files.pcm,interleave(result.pcm.left,result.pcm.right),'fixed gain 1 measurement PCM');
  await save(files.fields,Buffer.from(result.fields.values.buffer),`all-node displacement at ${rate} Hz; mean-square units, not joules`);
  await save(files.rawPickup,interleave(result.rawPickup.left,result.rawPickup.right),'unscaled point pickups before limiter');
  files.preLimiter=files.rawPickup;
  if(result.telemetry.baseBornJitterDraws) {
    await save(`${output}/${id}.jitter.json`,JSON.stringify(result.telemetry.baseBornJitterDraws),'deterministic per-event/node jitter receipts');
    result.telemetry.jitterDrawCount=result.telemetry.baseBornJitterDraws.length;
    delete result.telemetry.baseBornJitterDraws;
  }
  rows.push({id,plateKey:row.key,condition,positionLabel:events.length===1?'p50':'common3',frames,sampleRate,
    physicsRate:rate,fieldSampleRate:rate,strikeFrame,nodeCount:result.nodeCount,fieldFrames:result.fields.frames,
    geometryKey:row.descriptorSha256,sourcePairedGeometryKey:row.key,
    pairBaselineId:`${row.key}-${['base-elastic-48','instant-48'].includes(condition)?'rate-aware-48':condition==='base-elastic-instant-48'?'base-elastic-48':'baseline'}`,
    files:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,resolve(v)])),schedule:events,
    scheduleSha256:sha256(JSON.stringify(events)),topologySha256:packedHash(topology),sourceSha256:sha256(transformed.source),
    definition:transformed.definition,patches:transformed.patches,coefficients:Array.from(topology.materialCoefficients),telemetry:result.telemetry});
  console.log(`${id}: peak=${result.telemetry.maxOutputAbs.toFixed(6)} steps=${result.fields.frames}`);
}
const prior=JSON.parse(await readFile(priorIndexPath,'utf8'));
for(const row of selected) {
  const topology=compileSurfaceTopology({plates:[row.plate]});
  assert.equal(topology.nodeGridIndices.length,row.solverNodes);
  assert.equal(topology.adjacentLinkNodes.length,0);assert.equal(topology.noduleIds.length,0);
  if(phase==='initial') {
    const original=prior.rows.find(r=>r.id===`${row.key}-p50-native`);
    const repeat=renderSurface({source,topology,events:eventsFor(row.plate),frames});
    assert.equal(sha256(interleave(repeat.pcm.left,repeat.pcm.right)),sha256(await readFile(original.files.pcm)));
    assert.equal(sha256(Buffer.from(repeat.fields.values.buffer)),sha256(await readFile(original.files.fields)));
    for(const path of Object.values(original.files)) await borrow(path,'unchanged Born baseline reused, exact rerender verified');
    rows.push({...original,id:`${row.key}-baseline`,condition:'baseline',fieldSampleRate:6000,
      geometryKey:row.descriptorSha256,sourcePairedGeometryKey:row.key,sourceSha256:sha256(source),
      files:Object.fromEntries(Object.entries({...original.files,preLimiter:original.files.rawPickup}).map(([k,v])=>[k,resolve(v)])),
      definition:{responsibility:'unchanged production Born'},coefficients:Array.from(topology.materialCoefficients),repeatExactPCMAndField:true});
    globalThis.gc?.();
    for(const [condition,options] of [['instant',{pulseSteps:1}],['spatial-grid',{spatial:'base-grid'}],
      ['spatial-world-width',{spatial:'base-world-width'}],['jitter',{jitterSeed:seed}],['loss-frequency',{frequencyLoss:baseGamma*8}]]) {
      await capture(row,condition,topology,transformSurface(source,options));globalThis.gc?.();
    }
    const uniform={...topology,materialCoefficients:topology.materialCoefficients.slice()};
    uniform.materialCoefficients[3]=(1-(1-baseD)**8)/50;
    await capture(row,'loss-uniform',uniform,{source,patches:['uniform loss coefficient only'],definition:{
      responsibility:'uniform loss magnitude',generic48Loss:baseD,born6Loss:50*uniform.materialCoefficients[3],mapping:'1-(1-d48)^8, constant pole decay preserved'}});
    globalThis.gc?.();
    const mapped=eventsFor(row.plate).map(e=>({frame:e.frame,message:{type:'strike',payload:{strength:e.message.payload.strength,
      position:{x:(2*e.message.payload.position.x-1)*.92/Math.sqrt(2),y:(2*e.message.payload.position.y-1)*.92/Math.sqrt(2)}}}}));
    const base=renderGenericReference({source:generic,config:{resolution:'normal',stiffness:.92,damping:100},events:mapped,frames,seed});
    assert.equal(base.receipts.length,1);assert.equal(base.telemetry.nonFinite,0);
    const id=`${row.key}-base-reference`,files={pcm:`${output}/${id}.pcm.f32le`,fields:`${output}/${id}.field.f32le`,
      rawPickup:`${output}/${id}.pickup.f32le`,preLimiter:`${output}/${id}.pre.f32le`};
    await save(files.pcm,interleave(base.pcm.left,base.pcm.right),'actual circular Base output with native x8 readout and limiter');
    await save(files.fields,Buffer.from(base.fields.values.buffer),'actual circular Base all-node displacement at48k');
    await save(files.rawPickup,interleave(base.rawPickup.left,base.rawPickup.right),'actual circular Base unscaled pickups');
    await save(files.preLimiter,interleave(base.preLimiter.left,base.preLimiter.right),'actual circular Base x8 pre-limiter pickups');
    await save(`${output}/${id}.jitter.json`,JSON.stringify(base.draws),'actual generic strike random draws; LCG seed20261014');
    rows.push({id,plateKey:row.key,condition:'base-reference',isBaseReference:true,positionLabel:'p50-mapped',frames,sampleRate,
      physicsRate:48000,fieldSampleRate:48000,strikeFrame,nodeCount:base.fields.nodeCount,fieldFrames:base.fields.frames,
      geometryKey:'generic-circle-normal-17',sourcePairedGeometryKey:row.key,
      files:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,resolve(v)])),schedule:mapped,scheduleSha256:sha256(JSON.stringify(mapped)),
      sourceSha256:sha256(generic),coefficients:base.coefficients,telemetry:base.telemetry,seed,grid:base.grid});
  } else if(phase==='extended') {
    for(const [condition,options] of [['rate-aware-48',{}],['instant-48',{instant:true}],['base-elastic-48',{baseElastic:true}],
      ['base-elastic-instant-48',{baseElastic:true,instant:true}]]) {
      const transformed=rateAwareSurface(source,topology,options);
      await capture(row,condition,transformed.topology,transformed,eventsFor(row.plate),48000);globalThis.gc?.();
    }
    await capture(row,'pulse-1ms',topology,transformSurface(source,{pulseSteps:6}));globalThis.gc?.();
  } else {
    const transformed=rateAwareSurface(source,topology,{instant:true});
    await capture(row,'instant-48',transformed.topology,transformed,eventsFor(row.plate),48000);
  }
  globalThis.gc?.();
}
await save(`${output}/render-index.json`,JSON.stringify({baseline:'2a65dc892f96fef2254afdb3c0621e3023e67c0b',productionMain:'d45823d40c9a87c1b333fa9872f3c897ee9ab01b',
  inputPath,inputSha256:sha256(bytes),selection:'min, upper median, lexicographically first maximum among roster sorted by solver nodes then key',
  selected:selected.map(({key,solverNodes,descriptorSha256})=>({key,solverNodes,descriptorSha256})),frames,sampleRate,strikeFrame,rows},null,2)+'\n','exact frozen conditions, schedules, transforms and topology hashes');
const sourceFiles=['static/worklets/plate.worklet.js','static/worklets/surface-plate.worklet.js','src/lib/audio/compileSurfaceTopology.js',
  'src/lib/audio/SurfaceAudioBridge.js','src/lib/audio/AntAudioBridge.js','src/lib/audio/AntEnvironmentAudioBridge.js',
  'scripts/ant-sonic-shadow-render.js','scripts/ant-base-born-shadow.js','scripts/ant-base-born-decomposition.js','scripts/ant-base-born-metrics.py'];
const hashes={};for(const path of sourceFiles) hashes[path]=sha256(await readFile(path));
await writeFile(`${evidence}/render-manifest.json`,JSON.stringify({schemaVersion:1,phase,command,inputPath,inputSha256:sha256(bytes),
  productionMain:'d45823d40c9a87c1b333fa9872f3c897ee9ab01b',researchBaseline:'2a65dc892f96fef2254afdb3c0621e3023e67c0b',
  sourceToolHashes:hashes,node:process.version,measurementGain:1,rawOutputLocation:resolve(output),ignored:true,
  reusedBaselineBytes:artifacts.filter(a=>a.reusedFrom).reduce((s,a)=>s+a.bytes,0),
  newRawBytes:artifacts.filter(a=>!a.reusedFrom).reduce((s,a)=>s+a.bytes,0),artifacts},null,2)+'\n');
console.log(JSON.stringify({phase,cases:rows.length,output,evidence}));
