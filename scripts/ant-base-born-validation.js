import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { instrumentSurfaceSchedule, renderSurface, sha256 } from './ant-sonic-shadow-render.js';
import { transformSurface, rateAwareSurface } from './ant-base-born-shadow.js';

const evidence='docs/ant/evidence/2026-10-14-base-born-causal-decomposition';
const index=JSON.parse(await readFile('test-results/ant-base-born-causal-decomposition-20261014/render-index.json','utf8'));
const inputs=JSON.parse(gunzipSync(await readFile(index.inputPath)));
const source=await readFile('static/worklets/surface-plate.worklet.js','utf8');
const frames=index.frames, key='20261005-trail-plate-24';
const selected=inputs.selected.find(r=>r.key===key), native=compileSurfaceTopology({plates:[selected.plate]});
function scenario(condition) {
  const row=index.rows.find(r=>r.id===`${key}-${condition}`);
  const transformed=condition==='instant'?transformSurface(source,{pulseSteps:1})
    :condition==='loss-frequency'?transformSurface(source,{frequencyLoss:row.definition.frequencyLoss})
    :rateAwareSurface(source,native,{baseElastic:condition==='base-elastic-instant-48',instant:condition==='base-elastic-instant-48'});
  const topology=transformed.topology||native;
  assert.equal(sha256(transformed.source),row.sourceSha256);
  assert.deepEqual(Array.from(topology.materialCoefficients),row.coefficients);
  return {row,topology,transformed};
}
const items=['instant','loss-frequency','rate-aware-48','base-elastic-instant-48'].map(scenario);
let browser,server;
const checks=[];
try {
  server=createServer((_request,response)=>{response.writeHead(200,{'content-type':'text/html'});response.end('<!doctype html><title>ANT causal shadow validation</title>');});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  for(const {row,topology,transformed} of items) {
    let module=instrumentSurfaceSchedule(transformed.source).replace('this.__shadowFields = [];','this.__shadowFields = null;');
    const anchor='    return true;\n  }\n\n  advancePhysics()';assert.equal(module.split(anchor).length,2);
    module=module.replace(anchor,`    if(!this.__done && this.__shadowFrame>=${frames}) {this.__done=true;this.port.postMessage({type:'done',frame:this.__shadowFrame,receipts:this.__shadowReceipts,telemetry:this.getDiagnostics()});}\n${anchor}`);
    const actual=await page.evaluate(async({module,topology,events,frames})=>{
      const context=new OfflineAudioContext(2,frames,48000),url=URL.createObjectURL(new Blob([module],{type:'text/javascript'}));
      await context.audioWorklet.addModule(url);URL.revokeObjectURL(url);
      const node=new AudioWorkletNode(context,'surface-plate-processor',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{evidenceTopology:topology,evidenceSchedule:{events}}});node.connect(context.destination);
      const done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('schedule completion timeout')),30000);node.port.onmessage=e=>{if(e.data.type==='done'){clearTimeout(timer);resolve(e.data);}};node.onprocessorerror=()=>{clearTimeout(timer);reject(new Error('worklet processor error'));};});
      const [buffer,receipt]=await Promise.all([context.startRendering(),done]);
      const bytes=new Uint8Array(frames*8),view=new DataView(bytes.buffer);
      for(let i=0;i<frames;i++){view.setFloat32(i*8,buffer.getChannelData(0)[i],true);view.setFloat32(i*8+4,buffer.getChannelData(1)[i],true);}
      let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
      node.disconnect();node.port.close();return {pcm:btoa(binary),receipt};
    },{module,topology,events:row.schedule,frames});
    const expected=await readFile(row.files.pcm),actualBytes=Buffer.from(actual.pcm,'base64');
    assert.equal(sha256(actualBytes),sha256(expected),`${row.id}: Chrome/VM PCM parity`);
    assert.equal(actual.receipt.telemetry.nonFinite,0);assert.equal(actual.receipt.telemetry.clipped,0);
    assert.deepEqual(actual.receipt.receipts.map(r=>r.frame),row.schedule.map(e=>e.frame));
    const repeat=renderSurface({source:transformed.source,topology,events:row.schedule,frames,captureFields:false});
    const interleaved=new Float32Array(frames*2);
    for(let i=0;i<frames;i++){interleaved[i*2]=repeat.pcm.left[i];interleaved[i*2+1]=repeat.pcm.right[i];}
    assert.equal(sha256(Buffer.from(interleaved.buffer)),sha256(expected),`${row.id}: deterministic repeat`);
    checks.push({id:row.id,exactChromeVmPcm:true,exactRepeatPcm:true,pcmSha256:sha256(expected),browser:browser.version(),receipt:actual.receipt});
    console.log(`${row.id}: Chrome/VM/repeat exact`);
  }
} finally {await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));}
await writeFile(`${evidence}/browser-parity.json`,JSON.stringify({command:'node scripts/ant-base-born-validation.js',toolSha256:sha256(await readFile('scripts/ant-base-born-validation.js')),checks},null,2)+'\n');
