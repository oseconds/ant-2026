import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';
import { SurfaceAudioBridge } from '../src/lib/audio/SurfaceAudioBridge.js';

const mode = process.argv[2] || 'baseline';
if (!['baseline', 'candidate'].includes(mode)) throw new Error('Usage: node scripts/ant-plate-decay.js baseline|candidate');
const dir = resolve('docs/ant/evidence/2026-10-06-plate-decay');
await mkdir(dir, { recursive: true });
const sourceGzip = await readFile(resolve('docs/ant/evidence/2026-10-06-stratigraphy-runtime/motion/continuous-natural-0-600s-browser-evidence.json.gz'));
const recording = JSON.parse(gunzipSync(sourceGzip));
const events = recording.events;
const plate = events.find(event => event.type === 'plate-birth')?.payload;
if (!plate) throw new Error('Recorded run has no frozen first Plate.');
const denseGroups = events.filter(event => event.type === 'FOOT_CONTACT' && event.simulationTimeMs >= 154000 && event.simulationTimeMs < 164000);
const field = new SurfaceField();
let lastMs = 0;
const responses = new Map();
for (const event of events) {
  if (event.type !== 'FOOT_CONTACT' || event.simulationTimeMs > 164000) continue;
  field.relax(Math.max(0, event.simulationTimeMs - lastMs) / 1000); lastMs = event.simulationTimeMs;
  responses.set(event, field.applyFootContact(event.payload));
}
function route(selected) {
  const bridge = new SurfaceAudioBridge({ audioEngine: { context: { currentTime: 0 } } });
  bridge.storePlates([plate]); bridge.compileTopology({ plates: [plate], nodules: [] }); bridge._enabled = true;
  const messages = [];
  bridge.worklet = { node: { port: { postMessage(message) { if (message.type === 'strike') messages.push(message.payload); } } } };
  const frames = [];
  for (const event of selected) {
    const n = messages.length; bridge.handleFootContact(event.payload, { responses: responses.get(event) || [] });
    for (let i=n;i<messages.length;i++) frames.push(Math.round((event.simulationTimeMs-154000)*48));
  }
  const payloads = messages.map((payload, i) => ({ frame: frames[i], payload }));
  const canonical = JSON.stringify(payloads.map(({ frame, payload }) => ({ frame, plateId: payload.plateId,
    position: payload.position, strength: payload.strength, footprintRadius: payload.footprintRadius, hardness: payload.hardness })));
  return { bridge, payloads, sha: createHash('sha256').update(canonical).digest('hex') };
}
const dense = route(denseGroups);
if (!dense.payloads.length) throw new Error('Natural dense interval produced no routed strikes.');
const sparseGroups=[];let sparseLast=-Infinity;for(const event of denseGroups)if(event.simulationTimeMs-sparseLast>=1000){sparseGroups.push(event);sparseLast=event.simulationTimeMs;}
const sparse=route(sparseGroups);
const priorSparse=JSON.parse(await readFile(resolve('docs/ant/evidence/2026-10-06-contact-sonic-baseline/baseline-sparse-metrics.json'),'utf8'));
if(sparse.payloads.length!==priorSparse.routedStrikeMessages||sparseGroups.length!==priorSparse.footContactGroups||sparse.sha!==priorSparse.routedPayloadAndFrameScheduleSha256)
  throw new Error('Sparse subset differs from the previous sonic-baseline evidence stream.');
const isolatedStrike = dense.payloads[0].payload;
const topology = dense.bridge.topology;
const sourceWorklet = mode === 'baseline'
  ? execFileSync('git', ['show', '7f8ebf8d50752341383d1bd3d90e568fc2340fdd:static/worklets/surface-plate.worklet.js'], { encoding: 'utf8', maxBuffer: 8*1024*1024 })
  : await readFile(resolve('static/worklets/surface-plate.worklet.js'), 'utf8');
const workletSha = createHash('sha256').update(sourceWorklet).digest('hex');
const instrumented = instrument(sourceWorklet);
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async ({ source, topology, strike, durationSeconds, denseRoutes }) => {
    const context = new OfflineAudioContext(2, Math.round(48000*durationSeconds), 48000);
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' })); await context.audioWorklet.addModule(url);
    const node = new AudioWorkletNode(context, 'surface-plate-processor', { numberOfInputs:0, numberOfOutputs:1, outputChannelCount:[2] });
    const gain = context.createGain(); gain.gain.value = .245; node.connect(gain); gain.connect(context.destination);
    let resolveReady, resolveDone;
    const ready = new Promise((resolve, reject) => { resolveReady=resolve; setTimeout(()=>reject(new Error('worklet schedule handshake timed out')),10000); });
    const done = new Promise((resolve, reject) => { resolveDone=resolve; setTimeout(()=>reject(new Error('worklet render completion timed out')),120000); });
    node.port.onmessage=e=>{if(e.data?.type==='evidence-ready')resolveReady();if(e.data?.type==='evidence-done')resolveDone(e.data);};
    node.port.postMessage({ type:'topology', payload: topology });
    node.port.postMessage({ type:'evidence-schedule', payload:{ endFrame:Math.round(48000*durationSeconds), events:[{frame:0,message:{type:'strike',payload:strike}}] } });
    await ready;
    const rendered=await context.startRendering(); const doneReport=await done;
    const L=rendered.getChannelData(0),R=rendered.getChannelData(1);
    const bytes=new Uint8Array(44+L.length*8); const view=new DataView(bytes.buffer);
    const ascii=(offset,s)=>{for(let i=0;i<s.length;i++)bytes[offset+i]=s.charCodeAt(i);};
    ascii(0,'RIFF');view.setUint32(4,bytes.length-8,true);ascii(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,3,true);view.setUint16(22,2,true);view.setUint32(24,48000,true);view.setUint32(28,48000*8,true);view.setUint16(32,8,true);view.setUint16(34,32,true);ascii(36,'data');view.setUint32(40,L.length*8,true);
    for(let i=0,o=44;i<L.length;i++,o+=8){view.setFloat32(o,L[i],true);view.setFloat32(o+4,R[i],true);}
    let binary=''; const stride=0x8000; for(let i=0;i<bytes.length;i+=stride)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+stride)));
    return { wavBase64:btoa(binary), processor:doneReport, durationSeconds, sampleRate:48000, denseRoutes };
  }, { source:instrumented, topology, strike:isolatedStrike, durationSeconds:60, denseRoutes:dense.payloads.length });
  const wav=Buffer.from(result.wavBase64,'base64');
  const pcm=parseWav(wav); const metrics=measureDecay(pcm.left,pcm.right,pcm.sampleRate);
  const metadata={ status:'real-chrome-offline-audioworklet-render', mode, sourceRun:{seed:recording.seed, intervalSeconds:[154,164]}, sampleRate:48000,
    renderDurationSeconds:60, volume:.35, finalGain:.245, topology:{plateCount:1,zLinks:0,nodules:0,plateId:plate.id}, isolatedStrike,
    denseInput:{groups:denseGroups.length,individualFeet:denseGroups.reduce((a,e)=>a+(e.payload.contacts?.length||0),0),routedStrikes:dense.payloads.length,routedPayloadFrameSha256:dense.sha},
    sparseInput:{groups:sparseGroups.length,individualFeet:sparseGroups.reduce((a,e)=>a+(e.payload.contacts?.length||0),0),routedStrikes:sparse.payloads.length,routedPayloadFrameSha256:sparse.sha},
    outputSha256:createHash('sha256').update(wav).digest('hex'),workletSha256:workletSha,processor:result.processor,decay:metrics,outputFile:`${mode}-isolated-60s-48khz-f32.wav` };
  if(result.processor.strikes!==1 || result.processor.diagnostics?.physicsSteps<350000 || (metrics.peakL===0 && metrics.peakR===0))
    throw new Error(`Invalid isolated impulse render; require one accepted strike, 350000+ physics steps and nonzero PCM: ${JSON.stringify(result.processor)}`);
  if(metrics.nonFinite || metrics.clipping) throw new Error(`Invalid PCM: ${JSON.stringify({nonFinite:metrics.nonFinite,clipping:metrics.clipping})}`);
  await writeFile(resolve(dir,`${mode}-isolated-60s-48khz-f32.wav`),wav);
  await writeFile(resolve(dir,`${mode}-isolated-decay.json`),JSON.stringify(metadata,null,2)+'\n');
  await renderContactStream(browser,server.httpServer.address().port,dir,mode,'dense',instrumented,topology,denseGroups,dense.payloads,dense.sha,workletSha);
  await renderContactStream(browser,server.httpServer.address().port,dir,mode,'sparse',instrumented,topology,sparseGroups,sparse.payloads,sparse.sha,workletSha);
  console.log(JSON.stringify({mode,workletSha,plateId:plate.id,routedDense:dense.payloads.length,decay:metrics.crossings,pcm:{rmsL:metrics.rmsL,rmsR:metrics.rmsR,peakL:metrics.peakL,peakR:metrics.peakR,nonFinite:metrics.nonFinite,clipping:metrics.clipping},directory:dir},null,2));
} finally { await browser?.close(); await server.close(); }

function instrument(source){
  source=source.replace(/\r\n/g,'\n');
  source=source.replace('    super();','    super(); this.__evidenceFrame=0; this.__evidenceEnd=0; this.__evidenceEvents=[]; this.__evidenceCursor=0; this.__evidenceDone=false; this.__sleepFrames=new Int32Array(512); this.__sleepCount=0;');
  const marker="    if (message.type === 'topology') {";
  source=source.replace(marker,"    if (message.type === 'evidence-schedule') { this.__evidenceFrame=0; this.__evidenceEnd=p.endFrame; this.__evidenceEvents=p.events||[]; this.__evidenceCursor=0; this.port.postMessage({type:'evidence-ready'}); return; }\n"+marker);
  source=source.replace('    for (let frame = 0; frame < left.length; frame++) {',"    for (let frame = 0; frame < left.length; frame++) {\n      while(this.__evidenceCursor<this.__evidenceEvents.length && this.__evidenceEvents[this.__evidenceCursor].frame<=this.__evidenceFrame){this.handleMessage(this.__evidenceEvents[this.__evidenceCursor++].message);}\n      this.__evidenceFrame++;\n");
  source=source.replace('    return true;\n  }\n\n  advancePhysics()',"    if (!this.__evidenceDone && this.__evidenceEnd>0 && this.__evidenceFrame >= this.__evidenceEnd) { this.__evidenceDone=true; this.port.postMessage({type:'evidence-done',strikes:this.telemetry.strikes,scheduled:this.__evidenceEvents.length,diagnostics:this.getDiagnostics?.()||null,firstSleepFrame:this.__sleepCount?this.__sleepFrames[0]:null,lastSleepFrame:this.__sleepCount?this.__sleepFrames[this.__sleepCount-1]:null,sleepTransitions:this.__sleepCount}); }\n    return true;\n  }\n\n  advancePhysics()");
  source=source.replace('          this.telemetry.sleeps++;','          this.telemetry.sleeps++; if(this.__sleepCount<this.__sleepFrames.length)this.__sleepFrames[this.__sleepCount++]=this.__evidenceFrame;');
  if(!source.includes('this.__evidenceEnd>0 && this.__evidenceFrame >= this.__evidenceEnd')
    || !source.includes('while(this.__evidenceCursor<this.__evidenceEvents.length')
    || !source.includes("this.port.postMessage({type:'evidence-ready'})"))
    throw new Error('Worklet evidence scheduler instrumentation failed.'); return source;
}
function parseWav(bytes){const n=bytes.readUInt32LE(40)/8,L=new Float32Array(n),R=new Float32Array(n);for(let i=0,o=44;i<n;i++,o+=8){L[i]=bytes.readFloatLE(o);R[i]=bytes.readFloatLE(o+4);}return{left:L,right:R,sampleRate:bytes.readUInt32LE(24)};}
function measureDecay(L,R,rate){
  const win=Math.round(.05*rate),hop=Math.round(.01*rate),envelope=[];let finite=0,nonFinite=0,clipping=0,peakL=0,peakR=0,sumL=0,sumR=0;
  for(let i=0;i<L.length;i++){const l=L[i],r=R[i];if(!Number.isFinite(l)||!Number.isFinite(r)){nonFinite++;continue;}finite+=2;peakL=Math.max(peakL,Math.abs(l));peakR=Math.max(peakR,Math.abs(r));if(Math.abs(l)>=1)clipping++;if(Math.abs(r)>=1)clipping++;sumL+=l*l;sumR+=r*r;}
  const count=Math.floor((L.length-win)/hop)+1;
  for(let k=0;k<count;k++){const start=k*hop;let a=0,b=0;for(let i=start;i<start+win;i++){a+=L[i]*L[i];b+=R[i]*R[i];}envelope.push({timeSeconds:(start+win/2)/rate,rmsL:Math.sqrt(a/win),rmsR:Math.sqrt(b/win)});}
  const crossings=channel=>{const key=channel==='L'?'rmsL':'rmsR',max=Math.max(...envelope.map(x=>x[key])),ref=envelope.findIndex(x=>x[key]===max),out={referenceTimeSeconds:envelope[ref].timeSeconds,referenceRms:max,referenceDbfs:20*Math.log10(max)};
    for(const db of [20,40,60]){const target=max*Math.pow(10,-db/20);let found=null;const hold=50;
      let lastAbove=-1;for(let i=ref;i<envelope.length;i++)if(envelope[i][key]>target)lastAbove=i;
      let crossingIndex=-1;for(let i=Math.max(ref,lastAbove+1);i<envelope.length-hold;i++){if(envelope[i][key]<=target){let ok=true;for(let j=i;j<i+hold;j++)if(envelope[j][key]>target){ok=false;break;}if(ok){crossingIndex=i;break;}}}
      found=crossingIndex<0?null:envelope[crossingIndex].timeSeconds-envelope[ref].timeSeconds;
      out[`T${db}Seconds`]=found;out[`T${db}PreliminarySustainedCrossingSeconds`]=found;
      out[`T${db}Status`]=found===null?'not reached within render; no extrapolation':'measured from peak after final above-threshold window; below for at least 0.5 s and through render end';
      out[`T${db}LastAboveThresholdSeconds`]=lastAbove<0?null:envelope[lastAbove].timeSeconds;}
    return out;};
  const totalL=sumL,totalR=sumR,hopCount=Math.ceil(L.length/hop),blocksL=new Float64Array(hopCount),blocksR=new Float64Array(hopCount);
  for(let i=0;i<L.length;i++){const k=Math.floor(i/hop);blocksL[k]+=L[i]*L[i];blocksR[k]+=R[i]*R[i];}
  let remainL=0,remainR=0;for(let k=hopCount-1;k>=0;k--){remainL+=blocksL[k];remainR+=blocksR[k];if(envelope[k]){envelope[k].energyDecayFractionL=totalL?remainL/totalL:null;envelope[k].energyDecayFractionR=totalR?remainR/totalR:null;}}
  const finalWindow=Math.min(win,L.length),tailEnergyL=blocksL.slice(-Math.ceil(finalWindow/hop)).reduce((a,b)=>a+b,0),tailEnergyR=blocksR.slice(-Math.ceil(finalWindow/hop)).reduce((a,b)=>a+b,0);
  const refL=crossings('L').referenceRms,refR=crossings('R').referenceRms;
  for(const row of envelope){row.energyDbfsL=20*Math.log10(Math.max(row.rmsL,1e-12));row.energyDbfsR=20*Math.log10(Math.max(row.rmsR,1e-12));row.relativeDbL=20*Math.log10(Math.max(row.rmsL/refL,1e-12));row.relativeDbR=20*Math.log10(Math.max(row.rmsR/refR,1e-12));}
  return{durationSeconds:L.length/rate,windowMs:50,hopMs:10,sustainBelowThresholdMs:500,thresholdReboundCheck:'after the sustained 0.5 s crossing, any later 50 ms RMS window above threshold is flagged',envelope, crossings:{L:crossings('L'),R:crossings('R')},rmsL:Math.sqrt(sumL/L.length),rmsR:Math.sqrt(sumR/R.length),peakL,peakR,finiteSamples:finite,nonFinite,clipping,energyDecayCurve:{definition:'remaining exact sum of squared PCM samples from each 10 ms block to observed render end divided by total observed energy; render endpoint is preserved without padding or forced zero',final50msEnergyFraction:{L:totalL?tailEnergyL/totalL:null,R:totalR?tailEnergyR/totalR:null},truncatedAtRenderEnd:true}};
}
async function renderFixedPreview(browser,port,dir,pcm){
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${port}`,{waitUntil:'domcontentloaded'});
  const base64=await page.evaluate(async ({l,r})=>{const {buildStratigraphyAudioSnapshot,renderStratigraphyAudioSnapshot}=await import('/scripts/audio-snapshot-renderer.js');
    const s=buildStratigraphyAudioSnapshot({left:Float32Array.from(l),right:Float32Array.from(r)},{sampleRate:48000,sourceDurationSeconds:10});s.label='Isolated Plate strike · first 10 s · fixed preset';const c=document.createElement('canvas');renderStratigraphyAudioSnapshot(c,s);return c.toDataURL('image/png').split(',')[1];}, {l:Array.from(pcm.left.slice(0,480000)),r:Array.from(pcm.right.slice(0,480000))});
  await writeFile(resolve(dir,'baseline-isolated-first-10s-fixed-scale.png'),Buffer.from(base64,'base64'));await page.close();
}
async function renderContactStream(browser,port,dir,mode,kind,source,topology,groups,payloads,sha,workletSha){
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${port}`,{waitUntil:'domcontentloaded'});
  const rendered=await page.evaluate(async({source,topology,payloads})=>{const c=new OfflineAudioContext(2,480000,48000);const u=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));await c.audioWorklet.addModule(u);const n=new AudioWorkletNode(c,'surface-plate-processor',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});const g=c.createGain();g.gain.value=.245;n.connect(g);g.connect(c.destination);let readyResolve,doneResolve;n.port.onmessage=e=>{if(e.data?.type==='evidence-ready')readyResolve();if(e.data?.type==='evidence-done')doneResolve(e.data);};const ready=new Promise((res,rej)=>{readyResolve=res;setTimeout(()=>rej(Error('dense handshake timeout')),10000);});const done=new Promise((res,rej)=>{doneResolve=res;setTimeout(()=>rej(Error('dense render timeout')),90000);});n.port.postMessage({type:'topology',payload:topology});n.port.postMessage({type:'evidence-schedule',payload:{endFrame:480000,events:payloads.map(e=>({frame:e.frame,message:{type:'strike',payload:e.payload}}))}});await ready;const b=await c.startRendering();const d=await done;return{L:Array.from(b.getChannelData(0)),R:Array.from(b.getChannelData(1)),report:d};},{source,topology,payloads});
  if(rendered.report.strikes!==payloads.length || rendered.report.scheduled!==payloads.length || rendered.report.diagnostics?.physicsSteps<58000)throw new Error(`Dense replay invalid: ${JSON.stringify(rendered.report)}`);
  const L=Float32Array.from(rendered.L),R=Float32Array.from(rendered.R);const m=basicMetrics(L,R);if(m.nonFinite||m.clipping)throw Error(`${kind} capture has non-finite or clipped samples.`);await writeFile(resolve(dir,`${mode}-${kind}-154-164s.wav`),makeWav(L,R));const meta={mode,condition:kind,sourceWindowSeconds:[154,164],groups:groups.length,individualFeet:groups.reduce((sum,e)=>sum+(e.payload.contacts?.length||0),0),routedStrikeMessages:payloads.length,scheduleSha256:sha,workletSha256:workletSha,processor:rendered.report,volume:.35,finalGain:.245,metrics:m,file:`${mode}-${kind}-154-164s.wav`};await writeFile(resolve(dir,`${mode}-${kind}-metrics.json`),JSON.stringify(meta,null,2)+'\n');await page.close();
}
function basicMetrics(L,R){let rmsL=0,rmsR=0,peakL=0,peakR=0,nonFinite=0,clipping=0,blocksL=[],blocksR=[],sL=0,sR=0,n=0;const hop=2400;for(let i=0;i<L.length;i++){const l=L[i],r=R[i];if(!Number.isFinite(l)||!Number.isFinite(r)){nonFinite++;continue;}rmsL+=l*l;rmsR+=r*r;peakL=Math.max(peakL,Math.abs(l));peakR=Math.max(peakR,Math.abs(r));if(Math.abs(l)>=1)clipping++;if(Math.abs(r)>=1)clipping++;sL+=l*l;sR+=r*r;n++;if(n===hop||i===L.length-1){blocksL.push(Math.sqrt(sL/n));blocksR.push(Math.sqrt(sR/n));sL=sR=0;n=0;}}const stats=a=>{const v=[...a].sort((x,y)=>x-y),mean=a.reduce((x,y)=>x+y,0)/a.length;return{p10:v[Math.floor((v.length-1)*.1)],median:v[Math.floor((v.length-1)*.5)],coefficientVariation:Math.sqrt(a.reduce((q,x)=>q+(x-mean)**2,0)/a.length)/Math.max(mean,1e-30)};};const meanL=Math.sqrt(rmsL/L.length),meanR=Math.sqrt(rmsR/R.length);return{rmsL:meanL,rmsR:meanR,peakL,peakR,crestFactorL:peakL/Math.max(meanL,1e-30),crestFactorR:peakR/Math.max(meanR,1e-30),windowRms50ms:{L:stats(blocksL),R:stats(blocksR),interpretation:'fixed non-overlapping 50 ms RMS distribution; lower quantile reflects quieter intervals but does not alone prove audibility'},nonFinite,clipping};}
function makeWav(L,R){const b=Buffer.alloc(44+L.length*8);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);b.writeUInt16LE(2,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(48000*8,28);b.writeUInt16LE(8,32);b.writeUInt16LE(32,34);b.write('data',36);b.writeUInt32LE(L.length*8,40);for(let i=0,o=44;i<L.length;i++,o+=8){b.writeFloatLE(L[i],o);b.writeFloatLE(R[i],o+4);}return b;}
async function writeDecaySvg(path,data){const W=1200,H=760,pl=88,pr=30,pt=54,panelH=285,gap=55,maxT=data.at(-1).timeSeconds,x=t=>pl+t/maxT*(W-pl-pr);let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif" fill="#181818"><text x="${pl}" y="24" font-size="16">Isolated Plate strike · 50 ms RMS, 10 ms hop · fixed absolute dBFS axis −160…0</text>`;for(const panel of [{title:'Absolute RMS envelope (dBFS)',a:'energyDbfsL',b:'energyDbfsR',top:pt},{title:'Relative to each channel peak (measurement only)',a:'relativeDbL',b:'relativeDbR',top:pt+panelH+gap}]){const y=db=>panel.top+(0-Math.max(-160,Math.min(0,db)))/160*panelH;svg+=`<text x="${pl}" y="${panel.top-8}" font-size="13">${panel.title}</text>`;for(let db=0;db>=-160;db-=20){svg+=`<line x1="${pl}" x2="${W-pr}" y1="${y(db)}" y2="${y(db)}" stroke="#ddd"/><text x="${pl-10}" y="${y(db)+4}" text-anchor="end" font-size="10">${db}</text>`;}for(let t=0;t<=maxT;t+=5){svg+=`<line x1="${x(t)}" x2="${x(t)}" y1="${panel.top}" y2="${panel.top+panelH}" stroke="#eee"/>${panel===undefined?'':`<text x="${x(t)}" y="${panel.top+panelH+16}" text-anchor="middle" font-size="10">${t}</text>`}`;}for(const [key,color] of [[panel.a,'#181818'],[panel.b,'#888']]){const points=data.map(d=>`${x(d.timeSeconds).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');svg+=`<polyline fill="none" stroke="${color}" stroke-width="1" points="${points}"/>`;}svg+=`<line x1="${pl+12}" x2="${pl+42}" y1="${panel.top+18}" y2="${panel.top+18}" stroke="#181818"/><text x="${pl+48}" y="${panel.top+22}" font-size="10">L</text><line x1="${pl+75}" x2="${pl+105}" y1="${panel.top+18}" y2="${panel.top+18}" stroke="#888"/><text x="${pl+111}" y="${panel.top+22}" font-size="10">R</text>`;}svg+=`<text x="${W/2}" y="${H-6}" text-anchor="middle" font-size="12">Time after strike (s)</text></g></svg>`;await writeFile(path,svg);}
