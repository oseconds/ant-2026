import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';

const source = readFileSync(new URL('../static/worklets/surface-plate.worklet.js', import.meta.url), 'utf8');
const instantaneousSource = readFileSync(new URL('./fixtures/surface-plate.instantaneous-2d9430b.js', import.meta.url), 'utf8');
function plate(id='route', x0=30, x1=66, y0=47, y1=49) {
  const mask = new Array(96*96).fill(0);
  for (let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) mask[y*96+x]=1;
  return { id, grid:{width:96,height:96}, mask, edges:[],
    pickups:[{x:x0/95,y:((y0+y1)/2)/95},{x:x1/95,y:((y0+y1)/2)/95}],
    material:{stiffness:.9,density:1.1,damping:.35} };
}
function topology(...plates) { return compileSurfaceTopology({plates, stratigraphy:{layerOrder:plates.map(p=>p.id)}}); }
function instantiate(rate=48000, workletSource=source) {
  let Processor; const messages=[];
  class AudioWorkletProcessor { constructor(){this.port={onmessage:null,postMessage:m=>messages.push(m)};} }
  vm.runInNewContext(workletSource,{AudioWorkletProcessor,sampleRate:rate,Float32Array,Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,Array,Math,Number,Object,performance:globalThis.performance,registerProcessor:(_n,p)=>Processor=p});
  return {processor:new Processor(),messages};
}
function install(p,t) { p.handleMessage({type:'topology',payload:t}); }
function run(p,count=128) { const left=new Float32Array(count),right=new Float32Array(count); p.process([],[[left,right]]); return {left,right}; }
function energy(p) { let e=0; for(let i=0;i<p.current.length;i++) e+=p.current[i]**2+p.previous[i]**2; for(let i=0;i<p.sphereCurrent.length;i++)e+=p.sphereCurrent[i]**2+p.spherePrevious[i]**2; return e; }
function seedNode(p,node,amplitude=.01) { p.current[node]=amplitude; p.previous[node]=amplitude; p.wakeNode(node); }
function pendingImpulse(p,node) { let value=0;for(let step=0;step<18;step++)value+=p.contactForces[step*p.current.length+node];return value; }
function impulseEnergy(p) { let value=0;for(let node=0;node<p.current.length;node++)value+=pendingImpulse(p,node)**2;return value; }

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
    const stat=p=>{let e=0,m=0;for(let i=start;i<end;i++){const v=pendingImpulse(p,i)**2,cell=t.nodeGridIndices[i],dx=cell%32-position.x*31,dy=Math.floor(cell/32)-position.y*31;e+=v;m+=v*(dx*dx+dy*dy);}return [e,m/e];};
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
  assert.ok(p.telemetry.sleeps>0);assert.ok(p.telemetry.truncatedTailEnergy>=0);
  assert.ok(p.telemetry.truncatedTailEnergy<1e-14, 'sub-threshold sleep truncates only the controlled negligible tail');
  assert.ok(p.activeCount<t.nodeGridIndices.length);
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

test('rejects pickup or stencil indices that cross physical layer boundaries',()=>{
  const p=instantiate().processor,good=topology(plate('a'),plate('b'));install(p,good);
  const badPickup=topology(plate('a'),plate('b'));
  badPickup.pickupNodeIndices[0]=badPickup.nodeOffsets[1];
  p.handleMessage({type:'topology',payload:badPickup});
  assert.equal(p.topology,good);
  const badStencil=topology(plate('a'),plate('b'));
  badStencil.neighborIndices[0]=badStencil.nodeOffsets[1];
  p.handleMessage({type:'topology',payload:badStencil});
  assert.equal(p.topology,good);assert.equal(p.telemetry.dropped,2);
});

test('stop clears output and destroy halts integration without replaying queued output',()=>{
  const p=instantiate(44100).processor,t=topology(plate());install(p,t);
  seedNode(p,t.pickupNodeIndices[0],.02);run(p);
  p.handleMessage({type:'stop',payload:{}});
  assert.equal(p.activeCount,0);assert.equal(p.queueLength,0);
  assert.ok([...run(p).left].every(value=>value===0));
  p.handleMessage({type:'destroy',payload:{}});
  const count=p.telemetry.physicsSteps,left=new Float32Array(128).fill(1),right=new Float32Array(128).fill(1);
  assert.equal(p.process([],[[left,right]]),false);
  assert.ok([...left,...right].every(value=>value===0));assert.equal(p.telemetry.physicsSteps,count);
});

test('an isolated finite half-sine contact spans 18 steps and preserves baseline per-node impulse',()=>{
  const t=topology(plate('route',24,72,24,72));
  const baseline=instantiate(48000,instantaneousSource).processor,p=instantiate().processor;
  install(baseline,t);install(p,t);
  const strike={type:'strike',payload:{plateId:'route',position:{x:.503,y:.487},strength:.035,footprintRadius:.012}};
  baseline.handleMessage(strike);p.handleMessage(strike);
  assert.ok(p.previous.every(value=>value===0),'force is not an immediate velocity jump');
  const shape=[];
  for(let step=0;step<18;step++) {
    const before=p.previous.slice();p.applyContactForces();
    shape.push(p.previous.reduce((sum,value,node)=>sum+Math.abs(value-before[node]),0));
  }
  assert.ok(shape.every(value=>value>0));assert.ok(shape[8]>shape[0]*8);
  assert.ok(Math.abs(shape[0]-shape[17])<1e-8);
  for(let node=0;node<p.previous.length;node++)assert.ok(Math.abs(p.previous[node]-baseline.previous[node])<1e-8);
  const after=p.previous.slice();p.applyContactForces();assert.deepEqual(p.previous,after);
  assert.equal(p.contactForces.some(value=>value!==0),false);
  assert.equal(p.getDiagnostics().contactPulseDurationMs,3);
  assert.equal(p.getDiagnostics().contactRecoveryTimeMs,75);
});

test('local compliance attenuates rapid repeated contact, recovers, and leaves a distant contact fresh',()=>{
  const t=topology(plate('route',20,76,20,76));
  const p=instantiate().processor,fresh=instantiate().processor;
  install(p,t);install(fresh,t);
  const at=position=>({type:'strike',payload:{plateId:'route',position,strength:.035,footprintRadius:.012}});
  const here={x:.4,y:.4},there={x:.65,y:.65};
  p.handleMessage(at(here));const first=impulseEnergy(p);
  for(let i=0;i<18;i++)p.applyContactForces();
  p.handleMessage(at(here));const repeat=impulseEnergy(p);
  assert.ok(repeat<first*.90&&repeat>=first*.75**2-1e-9,`${first} -> ${repeat}`);
  for(let i=0;i<18;i++)p.applyContactForces();
  p.handleMessage(at(there));fresh.handleMessage(at(there));
  assert.ok(Math.abs(impulseEnergy(p)-impulseEnergy(fresh))<1e-9,'other region is fully expressive');
  for(let i=0;i<18;i++)p.applyContactForces();
  // Recovery advances using actual physics steps, with no wall-clock timer.
  run(p,48000*.4);
  p.handleMessage(at(here));assert.ok(impulseEnergy(p)>first*.99);
  assert.equal(p.telemetry.strikes,4);assert.equal(p.telemetry.droppedRoutes,0);
});

test('every valid overlapping contact is scheduled without a global gate and remains within its impulse budget',()=>{
  const p=instantiate().processor;install(p,topology(plate()));
  for(let i=0;i<60;i++)p.handleMessage({type:'strike',payload:{plateId:'route',position:{x:.5,y:48/95},strength:.02,footprintRadius:.01}});
  assert.equal(p.telemetry.strikes,60);assert.equal(p.telemetry.dropped,0);assert.equal(p.telemetry.droppedRoutes,0);
  assert.ok(p.telemetry.compliantContactImpulseSquared<=p.telemetry.requestedContactImpulseSquared);
  assert.ok(p.telemetry.compliantContactImpulseSquared>=p.telemetry.requestedContactImpulseSquared*.75**2-1e-8);
  assert.ok(impulseEnergy(p)>0);
  run(p,48000);assert.equal(p.telemetry.nonFinite,0);
});

test('same-geometry topology recompiles retain pulse phase and local recovery while changed geometry starts fresh',()=>{
  const a=plate('a',24,72,24,72),p=instantiate().processor;install(p,topology(a));
  p.handleMessage({type:'strike',payload:{plateId:'a',position:{x:.5,y:.5},strength:.035,footprintRadius:.012}});
  run(p,24);const cursor=p.contactCursor,queued=p.contactForces.slice(),memory=p.contactMemory.slice();
  install(p,topology(a));assert.equal(p.contactCursor,cursor);
  assert.deepEqual(p.contactForces,queued);assert.deepEqual(p.contactMemory,memory);
  const oldNodes=p.current.length;install(p,topology(a,plate('new',20,76,1,2)));
  assert.equal(p.contactCursor,cursor);
  for(let step=0;step<18;step++)for(let node=0;node<oldNodes;node++)
    assert.equal(p.contactForces[step*p.current.length+node],queued[step*oldNodes+node]);
  assert.deepEqual(p.contactMemory.slice(0,oldNodes),memory);
  install(p,topology(plate('a',24,72,40,50)));
  assert.ok(p.contactForces.every(value=>value===0));assert.ok(p.contactMemory.every(value=>value===0));
});

test('stop removes all pending force and contact compliance without later replay',()=>{
  const p=instantiate().processor;install(p,topology(plate()));
  p.handleMessage({type:'strike',payload:{plateId:'route',position:{x:.5,y:48/95},strength:.035}});
  assert.ok(p.contactForces.some(value=>value!==0));assert.ok(p.contactMemory.some(value=>value!==0));
  p.handleMessage({type:'stop',payload:{}});
  assert.ok(p.contactForces.every(value=>value===0));assert.ok(p.contactMemory.every(value=>value===0));
  assert.ok(run(p,1024).left.every(value=>value===0));
});

test('finite contacts remain sample-rate and quantum-split invariant with no non-finite or clipped output',()=>{
  const t=topology(plate());
  for(const rate of [44100,48000,96000]) {
    const a=instantiate(rate).processor,b=instantiate(rate).processor;install(a,t);install(b,t);
    const strike={type:'strike',payload:{plateId:'route',position:{x:.5,y:48/95},strength:.035,footprintRadius:.012}};
    a.handleMessage(strike);b.handleMessage(strike);
    const full=run(a,4096),split=[];
    for(const count of [1,127,37,91,512,256,3072])split.push(...run(b,count).left);
    assert.deepEqual([...full.left],split);assert.equal(a.telemetry.nonFinite,0);assert.equal(a.telemetry.clipped,0);
  }
});

test('without direct contact, historical Plate/Z/Sphere recurrence matches the committed baseline exactly',()=>{
  const a=plate('a'),b=plate('b');
  const nodule={id:'sphere',position:{x:.5,y:.5},physicalRadiusMeters:.024,material:{density:2000,youngModulus:800000,poisson:.3,damping:.35},burial:{buriedDepthMeters:.04},coupling:{plateId:'a',weight:.2,position:{x:.5,y:.5}}};
  const t=compileSurfaceTopology({plates:[a,b],nodules:[nodule],stratigraphy:{layerOrder:['a','b']}});
  const p=instantiate().processor,baseline=instantiate(48000,instantaneousSource).processor;
  for(const model of [p,baseline]) {install(model,t);seedNode(model,t.pickupNodeIndices[0],.02);model.sphereCurrent[0]=.01;model.spherePrevious[0]=.009;}
  assert.deepEqual(run(p,8192),run(baseline,8192));
  assert.deepEqual(p.current,baseline.current);assert.deepEqual(p.sphereCurrent,baseline.sphereCurrent);
  assert.equal(p.telemetry.sleeps,baseline.telemetry.sleeps);assert.equal(p.telemetry.wakes,baseline.telemetry.wakes);
});
