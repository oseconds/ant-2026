import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { buildAudioSnapshot } from './audio-snapshot-renderer.js';

const dir=resolve('docs/ant/evidence/2026-10-06-plate-decay');
const cases=[
  {key:'baseline-isolated',file:'baseline-isolated-60s-48khz-f32.wav',label:'Isolated strike · A current damping · first 10 s'},
  {key:'candidate-isolated',file:'candidate-isolated-60s-48khz-f32.wav',label:'Isolated strike · B damping ×50 · first 10 s'},
  {key:'baseline-dense',file:'baseline-dense-154-164s.wav',label:'Dense natural contacts · A current damping'},
  {key:'candidate-dense',file:'candidate-dense-154-164s.wav',label:'Dense natural contacts · B damping ×50'},
  {key:'baseline-sparse',file:'baseline-sparse-154-164s.wav',label:'Sparse natural contacts · A current damping'},
  {key:'candidate-sparse',file:'candidate-sparse-154-164s.wav',label:'Sparse natural contacts · B damping ×50'}
];
const parsed={};
const metadata={};
for(const c of cases){
  const bytes=await readFile(resolve(dir,c.file)); parsed[c.key]=parse(bytes);
  const suffix=c.key.endsWith('isolated')?'isolated-decay.json':c.key.endsWith('sparse')?'sparse-metrics.json':'dense-metrics.json';
  const prefix=c.key.startsWith('baseline')?'baseline':'candidate';
  metadata[c.key]=JSON.parse(await readFile(resolve(dir,`${prefix}-${suffix}`),'utf8'));
  const m=parsed[c.key].metrics;
  if(m.sampleRate!==48000||Math.abs(m.durationSeconds-(c.key.endsWith('isolated')?60:10))>1/48000||m.nonFinite||m.clipping)
    throw new Error(`Invalid PCM for ${c.key}: ${JSON.stringify(m)}`);
  const reportedFile=metadata[c.key].file||metadata[c.key].outputFile;
  if(reportedFile!==c.file)throw new Error(`Metadata WAV path mismatch for ${c.key}: ${reportedFile}`);
  const reported=metadata[c.key].metrics||metadata[c.key].decay;
  for(const field of ['rmsL','rmsR','peakL','peakR'])if(Math.abs(m[field]-reported[field])>1e-8)throw new Error(`Independent PCM metric mismatch ${c.key}/${field}: ${m[field]} vs ${reported[field]}`);
  if(!c.key.endsWith('isolated')&&metadata[c.key].processor.strikes!==metadata[c.key].routedStrikeMessages)throw new Error(`Accepted route count mismatch for ${c.key}.`);
}

for(const condition of ['dense','sparse']){const a=metadata[`baseline-${condition}`],b=metadata[`candidate-${condition}`];
  if(a.scheduleSha256!==b.scheduleSha256||a.routedStrikeMessages!==b.routedStrikeMessages||a.groups!==b.groups||a.individualFeet!==b.individualFeet||a.processor.strikes!==b.processor.strikes)
    throw new Error(`${condition} A/B route stream/count parity failed.`);
  const expected=condition==='dense'?'8f56adf6f54ccd52143acc2d6c49c6026872df2fac4486776ae00dfb8ba291eb':'b6e9dfc182edc2fb9c24bf4e3718c42f7b86c4cd9f295ea383274711fb79a275';
  if(a.scheduleSha256!==expected)throw new Error(`${condition} route stream hash differs from the preserved source stream.`);
  const required=condition==='dense'?{groups:648,individualFeet:1916,routed:242}:{groups:10,individualFeet:30,routed:4};
  if(a.groups!==required.groups||a.individualFeet!==required.individualFeet||a.routedStrikeMessages!==required.routed)throw new Error(`${condition} source event counts do not match prior evidence.`);
}
const strikeA=metadata['baseline-isolated'].isolatedStrike,strikeB=metadata['candidate-isolated'].isolatedStrike;
if(JSON.stringify(strikeA)!==JSON.stringify(strikeB))throw new Error('Isolated A/B strike payload differs.');

// Re-measure terminal silent windows from PCM to expose automatic sleep cutoffs.
for(const key of ['baseline-isolated','candidate-isolated']){
  const {L,R}=parsed[key],rate=48000,window=2400,hop=480,levels=[];
  for(let start=0;start+window<=L.length;start+=hop){let x=0,y=0;for(let i=start;i<start+window;i++){x+=L[i]*L[i];y+=R[i]*R[i];}levels.push({timeSeconds:(start+window/2)/rate,rmsL:Math.sqrt(x/window),rmsR:Math.sqrt(y/window)});}
  let terminal=-1;for(let i=0;i<levels.length;i++){let all=true;for(let j=i;j<levels.length;j++)if(levels[j].rmsL!==0||levels[j].rmsR!==0){all=false;break;}if(all){terminal=i;break;}}
  metadata[key].decay.terminalExactSilenceStartSeconds=terminal<0?null:levels[terminal].timeSeconds;
  metadata[key].decay.terminalSilenceNote=terminal<0?'No exact silent 50 ms window persisted to the observed render end.':'Exact zero PCM persisted after this point; compare this timestamp with processor sleep diagnostics before interpreting late threshold crossings.';
  metadata[key].decay.firstSleepAudioTimeSeconds=metadata[key].processor.firstSleepFrame===null?null:metadata[key].processor.firstSleepFrame/48000;
  metadata[key].decay.lastSleepAudioTimeSeconds=metadata[key].processor.lastSleepFrame===null?null:metadata[key].processor.lastSleepFrame/48000;
  await writeFile(resolve(dir,`${key}-decay.json`),JSON.stringify(metadata[key],null,2)+'\n');
  await writeFile(resolve(dir,`${key}-decay-envelope.csv`),`timeSeconds,rmsL,rmsR,absoluteDbfsL,absoluteDbfsR,relativeDbL_measurementOnly,relativeDbR_measurementOnly,remainingEnergyFractionL,remainingEnergyFractionR\n${metadata[key].decay.envelope.map(row=>`${row.timeSeconds.toFixed(3)},${row.rmsL.toExponential(8)},${row.rmsR.toExponential(8)},${row.energyDbfsL.toFixed(3)},${row.energyDbfsR.toFixed(3)},${row.relativeDbL.toFixed(3)},${row.relativeDbR.toFixed(3)},${row.energyDecayFractionL.toExponential(8)},${row.energyDecayFractionR.toExponential(8)}`).join('\n')}\n`);
}

// Fixed renderer FFT settings are also used for a conservative modal-band check.
// This is a spectrogram-derived observation, not a second decay renderer.
for(const key of ['baseline-isolated','candidate-isolated']){
  const {L,R}=parsed[key],sampleCount=Math.min(L.length,8*48000);
  const left=buildAudioSnapshot(L.subarray(0,sampleCount),{sampleRate:48000}).spectrogram;
  const right=buildAudioSnapshot(R.subarray(0,sampleCount),{sampleRate:48000}).spectrogram;
  const ranked=[];
  for(let bin=1;bin<left.frequencyBins-1;bin++){
    let sum=0,n=0;
    for(let frame=Math.ceil(.1*48000/256);frame<Math.min(left.frameCount,Math.floor(1*48000/256));frame++){
      sum+=left.dbfs[frame*left.frequencyBins+bin]+right.dbfs[frame*right.frequencyBins+bin];n+=2;
    }
    ranked.push({bin,frequencyHz:bin*48000/1024,meanEarlyDbfs:sum/Math.max(n,1)});
  }
  ranked.sort((a,b)=>b.meanEarlyDbfs-a.meanEarlyDbfs);
  const bins=ranked.slice(0,8).map(x=>x.bin);
  const tracks=bins.map(bin=>{
    const frames=Math.min(left.frameCount,right.frameCount),series=[];
    for(let frame=0;frame<frames;frame++)series.push({timeSeconds:frame*256/48000,
      L:left.dbfs[frame*left.frequencyBins+bin],R:right.dbfs[frame*right.frequencyBins+bin]});
    return{frequencyHz:bin*48000/1024,bin,absoluteDbfsSeries:series,
      note:'FFT 1024/Hann/hop 256; bins at/below -100 dBFS are at the fixed display floor and cannot support a reliable decay-time estimate.'};
  });
  metadata[key].decay.spectralPeaks={preset:{fftSize:1024,window:'Hann',hopSize:256,frequencyHz:[0,8000],dBfs:[-100,0]},
    rankingWindowSeconds:[0.1,1],topEightBins:tracks.map(({frequencyHz,bin})=>({frequencyHz,bin})),tracks,
    interpretation:'Strongest early FFT bins are reported without claiming individual physical modes. Beating and the fixed -100 dBFS floor limit mode-specific decay inference.'};
  await writeFile(resolve(dir,`${key}-decay.json`),JSON.stringify(metadata[key],null,2)+'\n');
}

const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});let browser;
try{
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`,{waitUntil:'domcontentloaded'});
  const rows=cases.map(c=>({label:c.label,wavBase64:first10WavBase64(parsed[c.key].wavBytes)}));
  const image=await page.evaluate(async rows=>{const{buildStratigraphyAudioSnapshot,renderStratigraphyAudioComparison}=await import('/scripts/audio-snapshot-renderer.js');const{decodeStereoFloatWav}=await import('/scripts/stratigraphy-audio-overview.js');const prepared=[];for(const row of rows){const binary=atob(row.wavBase64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);const pcm=decodeStereoFloatWav(bytes);prepared.push({label:row.label,snapshot:buildStratigraphyAudioSnapshot({left:pcm.channels.left,right:pcm.channels.right},{sampleRate:pcm.sampleRate,sourceDurationSeconds:10})});}const canvas=document.createElement('canvas');renderStratigraphyAudioComparison(canvas,prepared);return canvas.toDataURL('image/png').split(',')[1];},rows);
  await writeFile(resolve(dir,'decay-ab-comparison-10s-fixed-scale.png'),Buffer.from(image,'base64'));await page.close();
  const overviewPage=await browser.newPage();await overviewPage.goto(`http://127.0.0.1:${server.httpServer.address().port}`,{waitUntil:'domcontentloaded'});
  for(const [mode,file]of[['baseline','baseline-isolated-60s-48khz-f32.wav'],['candidate','candidate-isolated-60s-48khz-f32.wav']]){
    const wavBase64=(await readFile(resolve(dir,file))).toString('base64');
    const png=await overviewPage.evaluate(async({wavBase64})=>{const{decodeStereoFloatWav,buildStratigraphyAudioOverview,renderStratigraphyAudioOverview}=await import('/scripts/stratigraphy-audio-overview.js');const binary=atob(wavBase64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);const pcm=decodeStereoFloatWav(bytes);const overview=buildStratigraphyAudioOverview({channels:pcm.channels,sampleRate:pcm.sampleRate,simulationDurationSeconds:60,clockAnchors:[{simulationTimeMs:0,audioSampleIndex:0},{simulationTimeMs:60000,audioSampleIndex:pcm.sampleCount}],events:[]});const canvas=document.createElement('canvas');renderStratigraphyAudioOverview(canvas,overview);return canvas.toDataURL('image/png').split(',')[1];},{wavBase64});
    await writeFile(resolve(dir,`${mode}-isolated-60s-fixed-overview.png`),Buffer.from(png,'base64'));
  }
  await overviewPage.close();
}finally{await browser?.close();await server.close();}

await writeFile(resolve(dir,'dense-ab-summary.json'),JSON.stringify({status:'verified-real-chrome-offline-audioworklet-ab',sampleRate:48000,volume:.35,finalGain:.245,
  fixedPreset:{id:'ant-surface-stratigraphy-v1',waveformScale:[-1,1],waveformBackgroundLuminance:255,waveformLineLuminance:24,waveformAxisLuminance:180,waveformLineWidth:1,
    fftSize:1024,window:'Hann',hopSize:256,frequencyHz:[0,8000],spectrogramDbfs:[-100,0],spectrogramGamma:1,grayscale:true,normalization:'none'},
  contactStreams:Object.fromEntries(['dense','sparse'].map(condition=>{const x=metadata[`baseline-${condition}`],y=metadata[`candidate-${condition}`];return[condition,{sourceSimulationSeconds:[154,164],groups:x.groups,individualFeet:x.individualFeet,routedStrikeMessages:x.routedStrikeMessages,scheduleSha256:x.scheduleSha256,acceptedA:x.processor.strikes,acceptedB:y.processor.strikes,parity:true}]})),
  files:{comparison:'decay-ab-comparison-10s-fixed-scale.png',baselineOverview:'baseline-isolated-60s-fixed-overview.png',candidateOverview:'candidate-isolated-60s-fixed-overview.png',decayPlot:'decay-ab-absolute-envelope.svg',isolatedBaseline:'baseline-isolated-60s-48khz-f32.wav',isolatedCandidate:'candidate-isolated-60s-48khz-f32.wav',denseBaseline:metadata['baseline-dense'].file,denseCandidate:metadata['candidate-dense'].file,sparseBaseline:metadata['baseline-sparse'].file,sparseCandidate:metadata['candidate-sparse'].file}},null,2)+'\n');
await writeDecayComparisonSvg(resolve(dir,'decay-ab-absolute-envelope.svg'),metadata['baseline-isolated'].decay.envelope,metadata['candidate-isolated'].decay.envelope);
const envelopeBrowser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try {
  const envelopePage=await envelopeBrowser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  await envelopePage.setContent(await readFile(resolve(dir,'decay-ab-absolute-envelope.svg'),'utf8'));
  await envelopePage.locator('svg').screenshot({path:resolve(dir,'decay-ab-absolute-envelope.png')});
} finally {await envelopeBrowser.close();}
console.log(JSON.stringify({denseParity:true,sparseParity:true,isolatedStrikeParity:true,comparison:'decay-ab-comparison-10s-fixed-scale.png',denseA:metadata['baseline-dense'].metrics,denseB:metadata['candidate-dense'].metrics,sparseA:metadata['baseline-sparse'].metrics,sparseB:metadata['candidate-sparse'].metrics,baselineDecay:metadata['baseline-isolated'].decay.crossings,candidateDecay:metadata['candidate-isolated'].decay.crossings,sleep:{A:metadata['baseline-isolated'].processor.diagnostics.sleeps,B:metadata['candidate-isolated'].processor.diagnostics.sleeps,firstCandidateSeconds:metadata['candidate-isolated'].decay.firstSleepAudioTimeSeconds,lastCandidateSeconds:metadata['candidate-isolated'].decay.lastSleepAudioTimeSeconds},terminalSilence:{A:metadata['baseline-isolated'].decay.terminalExactSilenceStartSeconds,B:metadata['candidate-isolated'].decay.terminalExactSilenceStartSeconds}},null,2));

function writeDecaySvg(path,data,title){const W=1200,H=760,pl=88,pr=30,pt=54,panelH=285,gap=55,maxT=data.at(-1).timeSeconds,x=t=>pl+t/maxT*(W-pl-pr);let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif" fill="#181818"><text x="${pl}" y="24" font-size="16">${title} · 50 ms RMS, 10 ms hop · fixed absolute dBFS axis −160…0</text>`;for(const p of[{title:'Absolute RMS envelope (dBFS)',a:'energyDbfsL',b:'energyDbfsR',top:pt},{title:'Relative to channel peak (measurement only)',a:'relativeDbL',b:'relativeDbR',top:pt+panelH+gap}]){const y=db=>p.top+(0-Math.max(-160,Math.min(0,db)))/160*panelH;svg+=`<text x="${pl}" y="${p.top-8}" font-size="13">${p.title}</text>`;for(let db=0;db>=-160;db-=20)svg+=`<line x1="${pl}" x2="${W-pr}" y1="${y(db)}" y2="${y(db)}" stroke="#ddd"/><text x="${pl-10}" y="${y(db)+4}" text-anchor="end" font-size="10">${db}</text>`;for(let t=0;t<=maxT;t+=5)svg+=`<line x1="${x(t)}" x2="${x(t)}" y1="${p.top}" y2="${p.top+panelH}" stroke="#eee"/><text x="${x(t)}" y="${p.top+panelH+16}" text-anchor="middle" font-size="10">${t}</text>`;for(const[k,c]of[[p.a,'#181818'],[p.b,'#888']])svg+=`<polyline fill="none" stroke="${c}" stroke-width="1" points="${data.map(d=>`${x(d.timeSeconds).toFixed(1)},${y(d[k]).toFixed(1)}`).join(' ')}"/>`;}svg+=`<text x="${W/2}" y="${H-6}" text-anchor="middle" font-size="12">Time after strike (s)</text></g></svg>`;return writeFile(path,svg);}
function writeDecayComparisonSvg(path,A,B){const W=1200,H=430,pl=88,pr=30,pt=40,pb=50,maxT=Math.max(A.at(-1).timeSeconds,B.at(-1).timeSeconds),x=t=>pl+t/maxT*(W-pl-pr),y=db=>pt+(0-Math.max(-160,Math.min(0,db)))/160*(H-pt-pb);let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif" fill="#181818"><text x="${pl}" y="24" font-size="16">Isolated Plate decay · absolute 50 ms RMS dBFS · fixed −160…0 dBFS</text>`;for(let db=0;db>=-160;db-=20)svg+=`<line x1="${pl}" x2="${W-pr}" y1="${y(db)}" y2="${y(db)}" stroke="#ddd"/><text x="${pl-10}" y="${y(db)+4}" text-anchor="end" font-size="10">${db}</text>`;for(let t=0;t<=maxT;t+=5)svg+=`<line x1="${x(t)}" x2="${x(t)}" y1="${pt}" y2="${H-pb}" stroke="#eee"/><text x="${x(t)}" y="${H-24}" text-anchor="middle" font-size="10">${t}s</text>`;for(const[data,prefix]of[[A,'#181818'],[B,'#888']])for(const[channel,key]of[['L','energyDbfsL'],['R','energyDbfsR']])svg+=`<polyline fill="none" stroke="${prefix}" ${channel==='R'?'stroke-dasharray="4 3"':''} stroke-width="1.2" points="${data.map(d=>`${x(d.timeSeconds).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ')}"/>`;svg+=`<text x="${pl+12}" y="${H-4}" font-size="10">A dark, B light; L solid, R dashed. Fixed dBFS scale, no curve normalization.</text></g></svg>`;return writeFile(path,svg);}

function parse(wavBytes){const b=Buffer.from(wavBytes);if(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'||b.readUInt16LE(20)!==3||b.readUInt16LE(22)!==2)throw Error('Expected stereo IEEE float WAV');const n=b.readUInt32LE(40)/8,L=new Float32Array(n),R=new Float32Array(n);let nonFinite=0,clip=0,peakL=0,peakR=0,sqL=0,sqR=0;for(let i=0,o=44;i<n;i++,o+=8){L[i]=b.readFloatLE(o);R[i]=b.readFloatLE(o+4);if(!Number.isFinite(L[i])||!Number.isFinite(R[i])){nonFinite++;continue;}peakL=Math.max(peakL,Math.abs(L[i]));peakR=Math.max(peakR,Math.abs(R[i]));if(Math.abs(L[i])>=1)clip++;if(Math.abs(R[i])>=1)clip++;sqL+=L[i]*L[i];sqR+=R[i]*R[i];}return{wavBytes:b,L,R,metrics:{sampleRate:b.readUInt32LE(24),durationSeconds:n/b.readUInt32LE(24),rmsL:Math.sqrt(sqL/n),rmsR:Math.sqrt(sqR/n),peakL,peakR,nonFinite,clipping:clip}};}
function first10WavBase64(bytes){const frames=Math.min(480000,bytes.readUInt32LE(40)/8),size=44+frames*8,short=Buffer.alloc(size);bytes.copy(short,0,0,size);short.writeUInt32LE(size-8,4);short.writeUInt32LE(frames*8,40);return short.toString('base64');}
