import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';

const source = readFileSync(new URL('../static/worklets/surface-plate.worklet.js', import.meta.url), 'utf8');
function plate(id='route', x0=30, x1=66, y0=47, y1=49) {
  const mask = new Array(96*96).fill(0);
  for (let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) mask[y*96+x]=1;
  return { id, grid:{width:96,height:96}, mask, edges:[],
    pickups:[{x:x0/95,y:((y0+y1)/2)/95},{x:x1/95,y:((y0+y1)/2)/95}],
    material:{stiffness:.9,density:1.1,damping:.35} };
}
function topology(...plates) { return compileSurfaceTopology({plates, stratigraphy:{layerOrder:plates.map(p=>p.id)}}); }
function instantiate(rate=48000) {
  let Processor; const messages=[];
  class AudioWorkletProcessor { constructor(){this.port={onmessage:null,postMessage:m=>messages.push(m)};} }
  vm.runInNewContext(source,{AudioWorkletProcessor,sampleRate:rate,Float32Array,Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,Array,Math,Number,Object,performance:globalThis.performance,registerProcessor:(_n,p)=>Processor=p});
  return {processor:new Processor(),messages};
}
function install(p,t) { p.handleMessage({type:'topology',payload:t}); }
function run(p,count=128) { const left=new Float32Array(count),right=new Float32Array(count); p.process([],[[left,right]]); return {left,right}; }
function energy(p) { let e=0; for(let i=0;i<p.current.length;i++) e+=p.current[i]**2+p.previous[i]**2; for(let i=0;i<p.sphereCurrent.length;i++)e+=p.sphereCurrent[i]**2+p.spherePrevious[i]**2; return e; }
function seedNode(p,node,amplitude=.01) { p.current[node]=amplitude; p.previous[node]=amplitude; p.wakeNode(node); }

test('compiled topology stays silent until contact, routes the exposed plate, and outputs stereo',()=>{
  const {processor}=instantiate();
  assert.ok([...run(processor).left].every(x=>x===0));
  const t=topology(plate()); install(processor,t);
  assert.equal(processor.topology,t); assert.equal(processor.activeCount,0);
  processor.handleMessage({type:'strike',payload:{plateId:'route',layerId:'route',position:{x:.5,y:.505},strength:.035,footprintRadius:.012}});
  assert.ok(processor.activeCount>0);
  let l=0,r=0; for(let i=0;i<8;i++){const out=run(processor); for(const x of out.left)l+=x*x;for(const x of out.right)r+=x*x;}
  assert.ok(l>0&&r>0); assert.notEqual(l,r); assert.equal(processor.telemetry.nonFinite,0);
});

test('same-point contact widths create measurably different spatial distributions at equal impulse energy',()=>{
  const t=topology(plate('route',24,72,24,72));
  const narrow=instantiate().processor,wide=instantiate().processor; install(narrow,t);install(wide,t);
  const start=t.nodeOffsets[0],end=t.nodeOffsets[1];
  for(const position of [{x:16/31,y:16/31},{x:.503,y:.487}]) {
    narrow.clearVibration();wide.clearVibration();
    for(const [p,r] of [[narrow,.009],[wide,.014]])p.handleMessage({type:'strike',payload:{plateId:'route',position,strength:.035,footprintRadius:r}});
    const stat=p=>{let e=0,m=0;for(let i=start;i<end;i++){const v=p.previous[i]**2,cell=t.nodeGridIndices[i],dx=cell%32-position.x*31,dy=Math.floor(cell/32)-position.y*31;e+=v;m+=v*(dx*dx+dy*dy);}return [e,m/e];};
    const [en,mn]=stat(narrow),[ew,mw]=stat(wide);
    assert.ok(Math.abs(en-ew)<1e-8); assert.ok(mw>mn*1.05,`${mn} -> ${mw}`);
  }
});

test('recompilation preserves vibration only for unchanged layer geometry and resets changed geometry',()=>{
  const p=instantiate().processor,a=plate('a'),b=plate('b');
  const first=topology(a,b);install(p,first);
  seedNode(p,first.pickupNodeIndices[0],.02);seedNode(p,first.pickupNodeIndices[2],.03);
  const revisedA=plate('a2',30,66,40,56);revisedA.id='a';const second=topology(revisedA,b);
  install(p,second);
  assert.ok([...p.current.subarray(second.nodeOffsets[0],second.nodeOffsets[1])].every(v=>v===0),
    'changed geometry must start without stale vibration');
  assert.ok(Math.abs(p.current[second.pickupNodeIndices[2]]-.03)<1e-7,
    'unchanged layer retains its state');
});

test('local reciprocal overlap transfers vibration without coupling merely co-binned 96-grid masks',()=>{
  const lower=plate('lower',30,62,44,50),upper=plate('upper',46,76,44,50);
  const t=topology(lower,upper),p=instantiate().processor;install(p,t);
  assert.ok(t.adjacentLinkNodes.length>0);
  const node=t.adjacentLinkNodes[0];seedNode(p,node,.03);
  for(let i=0;i<32;i++)run(p);
  const other=t.adjacentLinkNodes[1];assert.ok(Math.abs(p.current[other])>0);
  const disjoint=topology(plate('left',0,0,0,0),plate('right',1,1,0,0));
  assert.equal(disjoint.adjacentLinkNodes.length,0);
});

test('44100 Hz fractional phase and interpolated output are invariant across process quantum splits',()=>{
  const a=instantiate(44100).processor,b=instantiate(44100).processor,t=topology(plate());install(a,t);install(b,t);
  for(const p of [a,b]) { const n=t.pickupNodeIndices[0];seedNode(p,n,.02); }
  const all=[new Float32Array(256),new Float32Array(256)];a.process([],[[all[0],all[1]]]);
  const x=[new Float32Array(128),new Float32Array(128)],y=[new Float32Array(128),new Float32Array(128)];
  b.process([],[[x[0],x[1]]]);b.process([],[[y[0],y[1]]]);
  assert.deepEqual([...all[0]],[...x[0],...y[0]]);assert.deepEqual([...all[1]],[...x[1],...y[1]]);
  assert.equal(a.phase,b.phase);assert.equal(a.telemetry.physicsSteps,b.telemetry.physicsSteps);
});

test('quiet local nodes sleep after the tail threshold and later local contact wakes them',()=>{
  const t=topology(plate()),p=instantiate(48000).processor;install(p,t);
  const node=t.pickupNodeIndices[0];p.current[node]=1e-8;p.wakeNode(node);
  const frames=Math.ceil(48000*2.1/128);for(let i=0;i<frames;i++)run(p);
  assert.ok(p.telemetry.sleeps>0);assert.ok(p.telemetry.truncatedTailEnergy>=0);assert.ok(p.activeCount<t.nodeGridIndices.length);
  const wakes=p.telemetry.wakes;p.handleMessage({type:'strike',payload:{plateId:'route',position:{x:48/95,y:48/95},strength:.035,footprintRadius:.01}});
  assert.ok(p.telemetry.wakes>wakes);const hitCell=16*32+16;const hitNode=t.nodeGridIndices.findIndex(cell=>cell===hitCell);
  assert.ok(hitNode>=0&&p.awake[hitNode]);
});

test('a fresh contact resets an awake node quiet timer before it can be truncated',()=>{
  const t=topology(plate()),p=instantiate().processor;install(p,t);const node=t.pickupNodeIndices[0];
  p.wakeNode(node);p.energyQuiet[node]=23999;
  p.handleMessage({type:'strike',payload:{plateId:'route',position:{x:30/95,y:48/95},strength:1e-7,footprintRadius:.009}});
  assert.equal(p.energyQuiet[node],0);
  for(let i=0;i<8;i++)run(p);
  assert.equal(p.awake[node],1);assert.equal(p.telemetry.sleeps,0);
});

test('coupled layers and 12 buried-sphere modes remain finite and dissipate over two seconds',()=>{
  for(const rate of [44100,48000,96000]) {
    const a=plate('a'),b=plate('b');
    const nodule={id:'sphere',position:{x:.5,y:.5},physicalRadiusMeters:.024,material:{density:2000,youngModulus:800000,poisson:.3,damping:.35},burial:{buriedDepthMeters:.04},coupling:{plateId:'a',weight:.2,position:{x:.5,y:.5}}};
    const t=compileSurfaceTopology({plates:[a,b],nodules:[nodule],stratigraphy:{layerOrder:['a','b']}});
    const p=instantiate(rate).processor;install(p,t);
    assert.equal(p.sphereCurrent.length,12);
    const node=t.pickupNodeIndices[0];seedNode(p,node,.02);p.sphereCurrent[0]=.01;p.spherePrevious[0]=.009;
    const initial=energy(p);for(let i=0;i<Math.ceil(rate*2/128);i++)run(p);
    const final=energy(p);assert.ok(Number.isFinite(final)&&final<initial,`${rate}: ${initial} -> ${final}`);
    assert.equal(p.telemetry.nonFinite,0);
  }
});

test('limits topology to packed capacity and reports active/sleep/coupling telemetry',()=>{
  const {processor}=instantiate();
  const plates=[];for(let i=0;i<256;i++)plates.push(plate(`p${i}`,30,60,48,48));
  const t=topology(...plates);install(processor,t);
  assert.equal(processor.topology.layerIds.length,256);
  assert.equal(processor.getDiagnostics().mix,1/Math.sqrt(12));
  assert.equal(processor.getDiagnostics().layers,256);
  assert.equal(processor.getDiagnostics().activeNodes,0);
});

test('rejects malformed packed topology without replacing active solver state',()=>{
  const p=instantiate().processor,good=topology(plate());install(p,good);
  const node=good.pickupNodeIndices[0];seedNode(p,node,.01);
  const bad=topology(plate('bad'));bad.materialCoefficients[0]=-1;
  p.handleMessage({type:'topology',payload:bad});
  assert.equal(p.topology,good);assert.equal(p.current[node],Math.fround(.01));assert.equal(p.telemetry.dropped,1);
});
