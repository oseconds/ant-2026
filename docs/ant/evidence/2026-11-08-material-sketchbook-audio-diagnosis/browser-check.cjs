const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const root=__dirname;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://ant-audio.test/**',async route=>{
  const p=new URL(route.request().url()).pathname;
  let file=p==='/'?'material-sketchbook.html':p.slice(1);
  const full=path.join(root,'source',file);
  if(!fs.existsSync(full))return route.fulfill({status:404,body:'missing'});
  let body=fs.readFileSync(full,'utf8');
  // Native-module harness replaces only Vite's CSS import handling, not model/audio JS.
  if(file==='src/sketchbook/app.js')body=body.replace("import './styles.css';",'');
  if(file==='material-sketchbook.html')body=body.replace('</head>',`<style>${fs.readFileSync(path.join(root,'source/src/sketchbook/styles.css'),'utf8')}</style></head>`);
  await route.fulfill({status:200,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body});
 });
 await page.goto('http://ant-audio.test/');
 await page.waitForFunction(()=>Boolean(window.materialSketchbook));
 const results=await page.evaluate(async()=>{
  const api=window.materialSketchbook;
  const cases=[];
  const ctors=await Promise.all(['activity','memory','capacity'].map(x=>import(`/src/sketchbook/${x}.js`)));
  const {renderProbe}=await import('/src/sketchbook/response.js');
  for(const [i,model] of ['A','B','C'].entries()){
   const Ctor=Object.values(ctors[i])[0];const world=new Ctor(20261005);
   for(const time of [30,120]){
    while(world.tick<time*60)world.step();
    for(const [index,graph] of world.mechanics().entries()){
     const r=renderProbe(graph);const ctx=new OfflineAudioContext(2,r.left.length,r.sampleRate);
     const buffer=ctx.createBuffer(2,r.left.length,r.sampleRate);buffer.copyToChannel(r.left,0);buffer.copyToChannel(r.right,1);
     const source=ctx.createBufferSource();source.buffer=buffer;const gain=ctx.createGain();gain.gain.value=10**(36/20);source.connect(gain);gain.connect(ctx.destination);source.start();
     const output=await ctx.startRendering();let maxError=0,over=0;
     for(let c=0;c<2;c++){const raw=c?r.right:r.left,out=output.getChannelData(c);for(let n=0;n<raw.length;n++){maxError=Math.max(maxError,Math.abs(out[n]-raw[n]*gain.gain.value));if(Math.abs(out[n])>1)over++;}}
     const interleaved=new Float32Array(r.left.length*2);for(let n=0;n<r.left.length;n++){interleaved[2*n]=r.left[n];interleaved[2*n+1]=r.right[n];}
     let hash=2166136261;for(const b of new Uint8Array(interleaved.buffer))hash=Math.imul(hash^b,16777619)>>>0;
     let pcmBase64;
     if(model==='C'&&time===30){let binary='';for(const b of new Uint8Array(interleaved.buffer))binary+=String.fromCharCode(b);pcmBase64=btoa(binary);}
     cases.push({model,time,index,peak:r.metrics.peak,maxPlaybackError:maxError,overUnitySamples:over,pcmFnv32:hash.toString(16).padStart(8,'0'),pcmBase64});
    }
   }
  }
  return {cases,userAgent:navigator.userAgent};
 });
 await page.selectOption('#model','B');
 await page.evaluate(()=>window.materialSketchbook.advance(2400));
 await page.click('#probe');await page.click('#listen');
 results.liveUi=await page.evaluate(()=>({audioCreated:window.materialSketchbook.audioCreated(),status:document.getElementById('status').textContent,monitorGain:document.getElementById('monitor-gain').value}));
 for(const c of results.cases){
  const stem=c.model+(c.model==='B'?['-AB','-BA'][c.index]:'');const id=`${stem}-${String(c.time).padStart(3,'0')}s`;
  const raw=fs.readFileSync(path.join(root,'output',id+'.f32'));let hash=2166136261;for(const b of raw)hash=Math.imul(hash^b,16777619)>>>0;
  c.nodePcmFnv32=hash.toString(16).padStart(8,'0');c.exactNodeBrowserPcmMatch=c.nodePcmFnv32===c.pcmFnv32;
  if(c.pcmBase64){const bytes=Buffer.from(c.pcmBase64,'base64');fs.writeFileSync(path.join(root,'output',id+'-browser.f32'),bytes);let max=0,s=0,d=0;for(let n=0;n<raw.length;n+=4){const a=raw.readFloatLE(n),b=bytes.readFloatLE(n),delta=a-b;max=Math.max(max,Math.abs(delta));s+=a*a;d+=delta*delta;}c.nodeBrowserDifference={maxAbsolute:max,relativeL2:Math.sqrt(d/s)};delete c.pcmBase64;}
 }
 results.errors=errors;results.harness='Original source; native modules with CSS-only Vite import shim; no server, local route fulfillment. OfflineAudioContext checks BufferSource→Gain at +36 dB; live UI gesture smoke test does not record speaker output. Cross-engine bit identity is checked, not assumed; C30 full PCM difference is measured.';
 await page.screenshot({path:path.join(root,'output/browser-original-ui.png'),fullPage:true});
 await browser.close();fs.writeFileSync(path.join(root,'output/browser-validation.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results,null,2));
 if(errors.length||results.cases.some(x=>x.maxPlaybackError>1e-7||x.overUnitySamples))process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
