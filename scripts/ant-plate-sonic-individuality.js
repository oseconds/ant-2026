import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { renderSurface, instrumentSurfaceSchedule, encodeStereoFloatWav, sha256 } from './ant-sonic-shadow-render.js';

const baseline = 'd45823d40c9a87c1b333fa9872f3c897ee9ab01b';
const research = '70bef249a4e451e1fc26ee18ecc5da801ff27433';
const evidence = 'docs/ant/evidence/2026-10-13-plate-sonic-individuality';
const output = 'test-results/ant-plate-sonic-individuality-20261013';
const inputFile = `${evidence}/frozen-inputs.json.gz`;
const rate = 48000, frames = 72000, strikeFrame = 480;
await mkdir(evidence, { recursive: true });
await mkdir(output, { recursive: true });
assert.equal(execFileSync('git', ['check-ignore', output], { encoding: 'utf8' }).trim(), output);
const source = await readFile('static/worklets/surface-plate.worklet.js', 'utf8');
const artifacts = [];
async function save(file, data, role) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  await writeFile(file, bytes);
  artifacts.push({ role, path: file, bytes: bytes.length, sha256: sha256(bytes),
    generationCommand: 'node scripts/ant-plate-sonic-individuality.js' });
}
const median = values => [...values].sort((a,b) => a-b)[Math.floor(values.length/2)];
let inputs;
try { inputs = JSON.parse(gunzipSync(await readFile(inputFile))); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const birthPath = 'docs/ant/evidence/2026-10-13-morphology-attribution/data/birth-measurements.json';
  const birthBytes = execFileSync('git', ['show', `${research}:${birthPath}`], { maxBuffer: 128e6 });
  const birthData = JSON.parse(birthBytes);
  assert.equal(birthData.baseline.main, baseline);
  assert.equal(birthData.births.length, 100);
  const worldPath = 'test-results/ant-material-formation-temporal-seed07-20261013/raw/final-world-snapshot.json.gz';
  const worldBytes = await readFile(worldPath);
  assert.equal(sha256(worldBytes), '7e044576b55bcfb47697c2cfec953a7f42870b5273c551fadfaad404d3022dc1');
  const world = JSON.parse(gunzipSync(worldBytes));
  const corpus = birthData.births.map(row => {
    const plate = row.frozenPlate, topology = compileSurfaceTopology({ plates: [plate] });
    let boundary = 0;
    for (let n=0;n<topology.nodeGridIndices.length;n++)
      if (Array.from(topology.neighborIndices.slice(n*4,n*4+4)).some(v=>v<0)) boundary++;
    return { key: `${row.provenance.seed}-${plate.id}`, seed: row.provenance.seed,
      plateId: plate.id, birthSeconds: plate.bornAtSimulationTimeMs/1000,
      descriptorSha256: sha256(JSON.stringify(plate)), maskCells: plate.mask.reduce((a,b)=>a+b,0),
      solverNodes: topology.nodeGridIndices.length, geodesicLength: plate.metrics.geodesicLength,
      meanHalfWidth: plate.meanHalfWidth, boundaryFraction: boundary/topology.nodeGridIndices.length,
      pickupDistance: Math.hypot(plate.pickups[0].x-plate.pickups[1].x, plate.pickups[0].y-plate.pickups[1].y),
      material: plate.material, coefficients: Array.from(topology.materialCoefficients), plate };
  });
  const axes = ['solverNodes','geodesicLength','meanHalfWidth','boundaryFraction','pickupDistance','stiffness'];
  const feature = (r,k) => k==='stiffness'?r.material.stiffness:r[k];
  const ranges = axes.map(k => { const v=corpus.map(r=>feature(r,k)); return [Math.min(...v),Math.max(...v)]; });
  const vector = r => axes.map((k,i)=>(feature(r,k)-ranges[i][0])/(ranges[i][1]-ranges[i][0]||1));
  const distance = (a,b) => vector(a).reduce((sum,v,i)=>sum+(v-vector(b)[i])**2,0);
  const selected = [];
  const add = row => { if (!selected.includes(row)) selected.push(row); };
  for (const seed of [20261005,20261006,20261007]) {
    const rows=corpus.filter(r=>r.seed===seed); add(rows[Math.floor(rows.length/2)]);
  }
  add([...corpus].sort((a,b)=>a.material.stiffness-b.material.stiffness)[0]);
  add([...corpus].sort((a,b)=>b.material.stiffness-a.material.stiffness)[0]);
  while (selected.length<12) add(corpus.filter(r=>!selected.includes(r)).sort((a,b)=>
    Math.min(...selected.map(s=>distance(b,s)))-Math.min(...selected.map(s=>distance(a,s))))[0]);
  const byStiffness=[...corpus].sort((a,b)=>a.material.stiffness-b.material.stiffness);
  inputs = { schemaVersion:1, baseline, research, source:{ birthPath, birthBytes:birthBytes.length,
    birthSha256:sha256(birthBytes), worldPath, worldBytes:worldBytes.length, worldSha256:sha256(worldBytes) },
    selection:{ method:'Three seed median-ordinal anchors, both observed stiffness extrema, then deterministic maximin coverage of range-scaled descriptors; no visual or audio selection.', axes, ranges },
    corpus:corpus.map(({plate,...r})=>r), selected,
    materials:{ median:byStiffness[Math.floor(byStiffness.length/2)].material,
      low:byStiffness[0].material, high:byStiffness.at(-1).material },
    world:{ seed:20261007, timeMs:world.materialStratigraphy.simulationTimeMs,
      plates:world.trailPlateBirth.plates, nodules:world.materialStratigraphy.nodules } };
  await save(inputFile,gzipSync(JSON.stringify(inputs),{level:9}), 'portable frozen selected descriptors and final current-law world; no temporal diagnostic code');
}
assert.equal(inputs.baseline,baseline);
for (const row of inputs.selected) assert.equal(sha256(JSON.stringify(row.plate)),row.descriptorSha256);
assert.equal(inputs.world.plates.length,38);
assert.equal(inputs.world.nodules.length,32);
await save(`${evidence}/descriptor-roster.json`,JSON.stringify({selection:inputs.selection,materials:inputs.materials,corpus:inputs.corpus,selectedKeys:inputs.selected.map(r=>r.key)},null,2)+'\n','100-birth roster and nonvisual selection');

function pathPosition(plate, fraction) {
  const path=plate.principalPath, lengths=[0];
  for(let i=1;i<path.length;i++) lengths.push(lengths.at(-1)+Math.hypot(path[i]%96-path[i-1]%96,Math.floor(path[i]/96)-Math.floor(path[i-1]/96)));
  let index=lengths.findIndex(v=>v>=lengths.at(-1)*fraction);
  const cell=path[index]; return {x:(cell%96)/95,y:Math.floor(cell/96)/95};
}
function schedule(plate,position,frame=strikeFrame) {
  return {frame,message:{type:'strike',payload:{plateId:plate.id,layerId:plate.id,position,strength:.035,footprintRadius:.01,hardness:.5}}};
}
function interleave(left,right) {const a=new Float32Array(left.length*2);for(let i=0;i<left.length;i++){a[i*2]=left[i];a[i*2+1]=right[i];}return Buffer.from(a.buffer);}
const rows=[], browserCases=[];
async function capture(id,plateKey,condition,positionLabel,topology,events,captureFields=true,metadata={}) {
  const result=renderSurface({source,topology,events,frames,captureFields});
  assert.equal(result.telemetry.strikes,events.length);
  assert.equal(result.telemetry.droppedRoutes,0); assert.equal(result.telemetry.dropped,0);
  assert.equal(result.telemetry.clipped,0);
  assert.deepEqual(result.renderedFrameReceipts.map(r=>r.frame),events.map(r=>r.frame));
  const files={pcm:`${output}/${id}.pcm.f32le`};
  await save(files.pcm,interleave(result.pcm.left,result.pcm.right),'fixed-gain stereo measurement PCM');
  if(captureFields) {
    assert.ok(result.fieldsFinite);
    files.fields=`${output}/${id}.field.f32le`;files.rawPickup=`${output}/${id}.pickup.f32le`;
    await save(files.fields,Buffer.from(result.fields.values.buffer),'all-node displacement observation at 6kHz');
    await save(files.rawPickup,interleave(result.rawPickup.left,result.rawPickup.right),'sum of Plate point pickups before limiter at 6kHz');
  }
  const topologyHash=sha256(JSON.stringify(topology,(_k,v)=>ArrayBuffer.isView(v)?Array.from(v):v));
  rows.push({id,plateKey,condition,positionLabel,frames,sampleRate:rate,physicsRate:6000,
    strikeFrame,nodeCount:result.nodeCount,fieldFrames:result.fields?.frames??0,files,metadata,
    topologySha256:topologyHash,schedule:events,scheduleSha256:sha256(JSON.stringify(events)),telemetry:result.telemetry});
  if(condition==='native'&&positionLabel==='p50'&&browserCases.length<3) browserCases.push({id,topology,events,pcm:result.pcm});
  if(condition==='native'&&positionLabel==='p50') {
    const wav=`${output}/${id}.measurement.wav`;await save(wav,encodeStereoFloatWav(result.pcm),'listening-sheet fixed gain 1 measurement WAV');
  }
  console.log(`${id}: nodes=${result.nodeCount} peak=${result.telemetry.maxOutputAbs.toFixed(6)}`);
}
const modalTopologies=[];
for(const row of inputs.selected) {
  const native=compileSurfaceTopology({plates:[row.plate]});
  assert.equal(native.adjacentLinkNodes.length,0);assert.equal(native.noduleIds.length,0);
  modalTopologies.push({key:row.key,nodeGridIndices:Array.from(native.nodeGridIndices),neighborIndices:Array.from(native.neighborIndices),pickupNodeIndices:Array.from(native.pickupNodeIndices),materialCoefficients:Array.from(native.materialCoefficients)});
  for(const [label,fraction] of [['p25',.25],['p50',.5],['p75',.75]]) {
    const position=pathPosition(row.plate,fraction),events=[schedule(row.plate,position)];
    for(const condition of ['native','material-median']) {
      const plate=condition==='native'?row.plate:{...row.plate,material:inputs.materials.median};
      await capture(`${row.key}-${label}-${condition}`,row.key,condition,label,compileSurfaceTopology({plates:[plate]}),events,true,{material:plate.material,position});
    }
  }
}
for(const row of inputs.selected.slice(0,3)) {
  const position=pathPosition(row.plate,.5),events=[schedule(row.plate,position)];
  for(const condition of ['material-low','material-high']) {
    const material=inputs.materials[condition.slice('material-'.length)];
    await capture(`${row.key}-p50-${condition}`,row.key,condition,'p50',compileSurfaceTopology({plates:[{...row.plate,material}]}),events,true,{material,position});
  }
}
// A controlled shared contact subset, not a recovered natural schedule.
for(const row of inputs.selected.slice(0,3)) {
  const events=[.25,.5,.75].map((fraction,i)=>schedule(row.plate,pathPosition(row.plate,fraction),strikeFrame+i*12000));
  await capture(`${row.key}-common3-native`,row.key,'native','common3',compileSurfaceTopology({plates:[row.plate]}),events,true,{scheduleRole:'same three-contact timing/strength/footprint, homologous path positions; synthetic common control'});
}
await save(`${output}/modal-topologies.json`,JSON.stringify(modalTopologies),'isolated packed matrices for exact linear all-active modal analysis');

const worldZ=compileSurfaceTopology({plates:inputs.world.plates});
const worldZN=compileSurfaceTopology({plates:inputs.world.plates,nodules:inputs.world.nodules});
const worldNone={...worldZ,adjacentLinkOffsets:new Int32Array(1025),adjacentLinkNodes:new Uint32Array(0),adjacentLinkCoefficients:new Float32Array(0)};
const exposed=inputs.world.plates.map((plate,i)=>({plate,i,cells:Array.from(worldZ.routingTopLayerByCell96).flatMap((v,c)=>v===i?[c]:[])})).filter(r=>r.cells.length>0).sort((a,b)=>b.cells.length-a.cells.length).slice(0,4);
for(const row of exposed) {
  const wanted=pathPosition(row.plate,.5);
  const cell=row.cells.sort((a,b)=>Math.hypot(a%96/95-wanted.x,Math.floor(a/96)/95-wanted.y)-Math.hypot(b%96/95-wanted.x,Math.floor(b/96)/95-wanted.y))[0];
  const position={x:cell%96/95,y:Math.floor(cell/96)/95},events=[schedule(row.plate,position)];
  for(const [condition,topology] of [['world-isolated',compileSurfaceTopology({plates:[row.plate]})],['world-none',worldNone],['world-z',worldZ],['world-zn',worldZN]])
    await capture(`world-${row.plate.id}-${condition}`,`world-seed07-${row.plate.id}`,condition,'exposed',topology,events,false,{position,exposedCells:row.cells.length,totalLinks:topology.adjacentLinkCoefficients.length,nodules:topology.noduleIds.length});
}

// Verify the VM capture against Chrome's actual OfflineAudioWorklet, without field logging.
let browser,server;
const browserParity=[];
try {
  server=createServer(async(request,response)=>{
    if(request.url==='/') {response.writeHead(200,{'content-type':'text/html'});response.end('<!doctype html><title>ANT offline evidence</title>');return;}
    if(request.url==='/scripts/audio-snapshot-renderer.js') {response.writeHead(200,{'content-type':'text/javascript'});response.end(await readFile('scripts/audio-snapshot-renderer.js'));return;}
    response.writeHead(404);response.end();
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  let module=instrumentSurfaceSchedule(source).replace('this.__shadowFields = [];','this.__shadowFields = null;');
  const anchor='    return true;\n  }\n\n  advancePhysics()';assert.equal(module.split(anchor).length,2);
  module=module.replace(anchor,`    if(!this.__done && this.__shadowFrame>=${frames}) {this.__done=true;this.port.postMessage({type:'done',frame:this.__shadowFrame,receipts:this.__shadowReceipts,telemetry:this.getDiagnostics()});}\n${anchor}`);
  for(const item of browserCases) {
    const rendered=await page.evaluate(async({module,topology,events,frames})=>{
      const context=new OfflineAudioContext(2,frames,48000),url=URL.createObjectURL(new Blob([module],{type:'text/javascript'}));
      await context.audioWorklet.addModule(url);URL.revokeObjectURL(url);
      const node=new AudioWorkletNode(context,'surface-plate-processor',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{evidenceTopology:topology,evidenceSchedule:{events}}});node.connect(context.destination);
      const done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Chrome schedule completion timeout')),30000);node.port.onmessage=e=>{if(e.data.type==='done'){clearTimeout(timer);resolve(e.data);}};node.onprocessorerror=()=>{clearTimeout(timer);reject(new Error('Chrome worklet processor error'));};});
      const [buffer,receipt]=await Promise.all([context.startRendering(),done]);
      const bytes=new Uint8Array(frames*8),view=new DataView(bytes.buffer);for(let i=0;i<frames;i++){view.setFloat32(i*8,buffer.getChannelData(0)[i],true);view.setFloat32(i*8+4,buffer.getChannelData(1)[i],true);}
      let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));node.disconnect();node.port.close();return {pcm:btoa(binary),receipt};
    },{module,topology:item.topology,events:item.events,frames});
    const bytes=Buffer.from(rendered.pcm,'base64'),expected=interleave(item.pcm.left,item.pcm.right);
    assert.equal(sha256(bytes),sha256(expected),`${item.id}: Chrome/VM PCM equality`);
    assert.equal(rendered.receipt.telemetry.strikes,item.events.length);
    assert.deepEqual(rendered.receipt.receipts.map(r=>r.frame),item.events.map(r=>r.frame));
    browserParity.push({id:item.id,exactPcmEquality:true,pcmSha256:sha256(bytes),browser:browser.version(),receipt:rendered.receipt});
  }
  const plotCases=rows.filter(r=>r.condition==='native'&&r.positionLabel==='p50').slice(0,6);
  const plotData=await Promise.all(plotCases.map(async r=>({label:r.id,bytes:Array.from(await readFile(r.files.pcm))})));
  const plot=await page.evaluate(async data=>{const {buildStratigraphyAudioSnapshot,renderStratigraphyAudioComparison}=await import('/scripts/audio-snapshot-renderer.js');
    const rows=data.map(r=>{const view=new DataView(Uint8Array.from(r.bytes).buffer),left=new Float32Array(view.byteLength/8),right=new Float32Array(left.length);for(let i=0;i<left.length;i++){left[i]=view.getFloat32(i*8,true);right[i]=view.getFloat32(i*8+4,true);}return {label:r.label,snapshot:buildStratigraphyAudioSnapshot({left,right},{sampleRate:48000})};});
    const canvas=document.createElement('canvas');renderStratigraphyAudioComparison(canvas,rows);return canvas.toDataURL('image/png').split(',')[1];},plotData);
  await save(`${evidence}/isolated-fixed-scale.png`,Buffer.from(plot,'base64'),'fixed +/-1 waveform, -100..0 dBFS, 1024 Hann/256 hop; 1.5s clips padded to locked 10s display');
} finally {await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));}
await save(`${evidence}/browser-parity.json`,JSON.stringify(browserParity,null,2)+'\n','Chrome/VM exact PCM and event receipt verification');
await save(`${output}/render-index.json`,JSON.stringify({baseline,sourceSha256:sha256(source),frames,sampleRate:rate,strikeFrame,rows},null,2)+'\n','exact frame schedules, topology hashes and validation receipts for every measurement');
const sourceFiles=['static/worklets/surface-plate.worklet.js','static/worklets/plate.worklet.js','src/lib/audio/compileSurfaceTopology.js','src/lib/audio/SurfaceAudioBridge.js','src/lib/agents/ant/TrailPlateBirth.js','scripts/ant-sonic-shadow-render.js','scripts/ant-sonic-response-metrics.py','scripts/ant-plate-sonic-individuality.js','scripts/audio-snapshot-renderer.js'];
const hashes={};for(const file of sourceFiles)hashes[file]=sha256(await readFile(file));
await save(`${evidence}/render-manifest.json`,JSON.stringify({baseline,research,inputSha256:sha256(await readFile(inputFile)),source:inputs.source,toolVersions:{node:process.version},sourceToolHashes:hashes,renderCount:rows.length,measurementGain:1,genericStrikeRandomness:'No new generic solver render. Stored decomposition jitter unrecorded; historical bounds retained.',rawOutputLocation:resolve(output),ignored:true,artifacts},null,2)+'\n','raw artifact byte sizes/hashes, generation command and source/tool hashes');
console.log(JSON.stringify({renderCount:rows.length,browserParity:browserParity.length,output,evidence}));
