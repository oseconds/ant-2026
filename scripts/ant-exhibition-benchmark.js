import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { cpus } from 'node:os';
import { chromium } from 'playwright';
import { fastWakeSource, denseLapSource, withoutZ, serializable } from './ant-exhibition-variants.js';
import { filterStrikeEvents } from './ant-exhibition-excitation.js';
import { forceCacheSource, transformSleepForceCache, instrumentSleepForceWork } from './ant-exhibition-force-cache.js';
import { encodeStereoFloatWav, sha256 } from './ant-sonic-shadow-render.js';

const DIR = 'docs/ant/evidence/2026-10-21-exhibition-audio-runtime';
const inputPath = process.argv[2] || `${DIR}/capture-inputs.v8.gz`;
const selected = process.env.ANT_VARIANTS?.split(',') || ['full', 'fast-wake', 'dense-lap', 'z-off', 'plate-gate', 'cell-gate'];
assert.ok(selected.every(id=>['full','fast-wake','dense-lap','force-cache','plate-cache','sphere-cache',
  'z-off','z-off-dense-lap','plate-gate','cell-gate'].includes(id)), 'unknown benchmark variant');
const source = await readFile('static/worklets/surface-plate.worklet.js', 'utf8');
const bytes = await readFile(inputPath), inputs = deserialize(gunzipSync(bytes));
await mkdir(DIR, { recursive: true });
const wavDir = process.env.ANT_LABEL ? `${DIR}/${process.env.ANT_LABEL}` : DIR;
await mkdir(wavDir,{recursive:true});
const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>ANT exhibition benchmark</title>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const results = [];
  for (const item of inputs.cases) {
    if (process.env.ANT_PLATES && !process.env.ANT_PLATES.split(',').includes(String(item.plateCount))) continue;
    for (const id of selected) {
      assert.ok(item.events.every((event,i) => Number.isSafeInteger(event.frame) && event.frame>=0
        && event.frame<item.frames && (!i || event.frame>=item.events[i-1].frame)), 'frozen events must be sorted by frame');
      const gate = id === 'plate-gate' || id === 'cell-gate'
        ? filterStrikeEvents(item.events, { mode: id === 'plate-gate' ? 'plate' : 'cell' }) : null;
      const code = id === 'fast-wake' ? fastWakeSource(source) : id === 'dense-lap' ? denseLapSource(source)
        : id === 'force-cache' ? forceCacheSource(source)
        : id === 'plate-cache' ? transformSleepForceCache(source,{plateCache:true}).source
        : id === 'sphere-cache' ? transformSleepForceCache(source,{sphereCache:true}).source
        : id === 'z-off-dense-lap' ? denseLapSource(source) : source;
      const topology = id.startsWith('z-off') ? withoutZ(item.topology) : item.topology;
      const events = (gate?.events || item.events).map(row => id.startsWith('z-off') && row.message.type === 'topology'
        ? { ...row, message: { type: 'topology', payload: withoutZ(row.message.payload) } } : row);
      const frames = process.env.ANT_SECONDS ? Math.round(Number(process.env.ANT_SECONDS) * 48000) : item.frames;
      const countForces = process.env.ANT_FORCE_COUNTS === '1';
      console.log(JSON.stringify({ stage: 'start', plateCount: item.plateCount, id, seconds: frames / 48000 }));
      const result = await page.evaluate(async ({ source, topology: packedTopology, events: packedEvents, frames, counterFunction }) => {
        const revive = value => {
          if (!value || typeof value !== 'object') return value;
          if (value.__typedArray) return new globalThis[value.__typedArray](value.data);
          if (Array.isArray(value)) return value.map(revive);
          return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]));
        };
        const topology = revive(packedTopology), events = revive(packedEvents).filter(e => e.frame < frames);
        // Scheduling is identical across variants; dispatch before each sample.
        const anchor = '    for (let frame = 0; frame < left.length; frame++) {';
        if (source.split(anchor).length !== 2) throw Error('schedule anchor');
        const extension = `
const Raw = SurfacePlateProcessor;
class Bench extends Raw {
  constructor(options) { super(); this.events = options.processorOptions.events; this.frame = 0; this.cursor = 0;
    this.costMs = 0; this.blocks = 0; this.maxMs = 0; this.hist = new Uint32Array(256); this.activity = [];
    this.handleMessage({type:'topology',payload:options.processorOptions.topology});
    ${counterFunction ? `this.forceWork=(${counterFunction})(this).counts;` : ''} }
  process(inputs, outputs) {
    const start = Date.now(); const live = super.process(inputs, outputs); const ms = Date.now() - start;
    this.costMs += ms; this.blocks++; this.maxMs = Math.max(this.maxMs,ms); this.hist[Math.min(255,ms)]++;
    if (this.frame >= ${frames}) {
      const arrays=Object.entries(this).filter(([k,v])=>ArrayBuffer.isView(v)&&!k.startsWith('__')&&k!=='hist');
      const scalars=Object.entries(this).filter(([k,v])=>typeof v==='number'&&!['costMs','blocks','maxMs'].includes(k));
      const stateBytes=new Uint8Array(arrays.reduce((s,[,v])=>s+v.byteLength,0)+scalars.length*8);
      let at=0;for(const [,value] of arrays){stateBytes.set(new Uint8Array(value.buffer,value.byteOffset,value.byteLength),at);at+=value.byteLength;}
      const scalarView=new DataView(stateBytes.buffer);for(const [,value] of scalars){scalarView.setFloat64(at,value,true);at+=8;}
      this.port.postMessage({done:true, costMs:this.costMs,blocks:this.blocks,maxMs:this.maxMs,
      hist:Array.from(this.hist),activity:this.activity,diagnostics:this.getDiagnostics(), active:this.activeCount,
      stateBytes,forceWork:this.forceWork||null,stateLayout:{arrays:arrays.map(([k,v])=>[k,v.constructor.name,v.length]),scalars:scalars.map(([k])=>k)}});
    }
    return live;
  }
}`;
        let module = source.replace(anchor, `${anchor}
      while (this.cursor < this.events.length && this.events[this.cursor].frame === this.frame)
        this.handleMessage(this.events[this.cursor++].message);
      this.frame++;
      if (this.frame % 48000 === 0) this.activity.push({seconds:this.frame/48000,active:this.activeCount,
        total:this.current.length,sleeps:this.telemetry.sleeps,wakes:this.telemetry.wakes});`);
        module = module.replace("registerProcessor('surface-plate-processor', SurfacePlateProcessor);",
          extension + "\nregisterProcessor('surface-plate-processor', Bench);");
        const context = new OfflineAudioContext(2, frames, 48000);
        const url = URL.createObjectURL(new Blob([module], {type:'text/javascript'}));
        await context.audioWorklet.addModule(url); URL.revokeObjectURL(url);
        const node = new AudioWorkletNode(context, 'surface-plate-processor', {numberOfInputs:0,
          numberOfOutputs:1,outputChannelCount:[2],processorOptions:{topology,events}});
        let done;
        const receipt = new Promise(resolve => node.port.onmessage = e => { if(e.data.done) resolve(e.data); });
        node.connect(context.destination);
        const start = performance.now(), audio = await context.startRendering(), wallMs = performance.now()-start;
        done = await receipt;
        const raw = new Uint8Array(frames * 8), view = new DataView(raw.buffer);
        for(let i=0;i<frames;i++) {view.setFloat32(i*8,audio.getChannelData(0)[i],true);view.setFloat32(i*8+4,audio.getChannelData(1)[i],true);}
        let binary='';for(let o=0;o<raw.length;o+=32768)binary+=String.fromCharCode(...raw.subarray(o,o+32768));
        node.disconnect(); node.port.close();
        let stateBinary='';const stateBytes=done.stateBytes;delete done.stateBytes;
        for(let o=0;o<stateBytes.length;o+=32768)stateBinary+=String.fromCharCode(...stateBytes.subarray(o,o+32768));
        return {...done,stateBase64:btoa(stateBinary),wallMs,pcm:btoa(binary),sampleRate:audio.sampleRate};
      }, { source: code, topology: serializable(topology), events: serializable(events), frames,
        counterFunction:countForces ? instrumentSleepForceWork.toString() : null });
      const pcm = Buffer.from(result.pcm, 'base64'); delete result.pcm;
      const left = new Float32Array(frames), right = new Float32Array(frames);
      let sum=0, peak=0; const startFrame = Math.min(frames-1, 2*48000);
      for(let i=0;i<frames;i++) {left[i]=pcm.readFloatLE(i*8);right[i]=pcm.readFloatLE(i*8+4);
        assert.ok(Number.isFinite(left[i]) && Number.isFinite(right[i]));
        if(i>=startFrame){sum+=left[i]**2+right[i]**2;peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));}}
      const stateSha256 = sha256(Buffer.from(result.stateBase64,'base64'));delete result.stateBase64;
      const row = {plateCount:item.plateCount,id,frames,inputSha256:sha256(bytes),sourceSha256:sha256(code),
        forceCountInstrumentation:countForces,
        topologyNodes:topology.nodeGridIndices.length,zLinks:topology.adjacentLinkCoefficients.length,
        sphereCount:topology.noduleIds.length,gate:gate?.report||null,...result,pcmSha256:sha256(pcm),stateSha256,
        rms:Math.sqrt(sum/((frames-startFrame)*2)),peak,throughput:frames/48000/(result.wallMs/1000),
        processCostRatio:result.costMs/(frames/48)};
      assert.equal(row.diagnostics.nonFinite,0);
      assert.equal(row.diagnostics.droppedRoutes,0);
      assert.equal(row.diagnostics.strikes,events.filter(e=>e.frame<frames&&e.message.type==='strike').length,
        'every scheduled strike must be delivered once');
      if(['fast-wake','dense-lap','force-cache','plate-cache','sphere-cache'].includes(id)) {const baseline=results.find(x=>x.plateCount===row.plateCount&&x.id==='full');
        if(baseline){assert.equal(row.pcmSha256,baseline.pcmSha256);assert.equal(row.stateSha256,baseline.stateSha256);
          assert.deepEqual(row.stateLayout,baseline.stateLayout);
          assert.deepEqual(row.diagnostics,baseline.diagnostics);}}
      row.wavPath=`${wavDir}/${item.plateCount}-${id}.wav`;
      await writeFile(row.wavPath,encodeStereoFloatWav({left,right}));
      results.push(row);
      await writeFile(`${DIR}/benchmark${process.env.ANT_LABEL ? '-'+process.env.ANT_LABEL : ''}.json`,JSON.stringify({
        date:new Date().toISOString(),browser:browser.version(),cpu:cpus()[0]?.model,node:process.version,
        inputPath,inputSha256:sha256(bytes),timing:'Chrome OfflineAudioContext wall throughput; actual process Date.now sum (1ms quantization); scheduling/observation included',results},null,2)+'\n');
      console.log(JSON.stringify({stage:'complete',plateCount:row.plateCount,id,wallMs:row.wallMs,
        throughput:row.throughput,processCostRatio:row.processCostRatio,active:row.active,rms:row.rms,
        pcmSha256:row.pcmSha256,stateSha256}));
    }
  }
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
