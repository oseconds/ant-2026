import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { fastWakeSource, denseLapSource, withoutZ } from '../scripts/ant-exhibition-variants.js';

const source = readFileSync(new URL('../static/worklets/surface-plate.worklet.js', import.meta.url), 'utf8');
function fixture() {
  const mask = new Array(96 * 96).fill(0);
  for (let y=44;y<=50;y++) for(let x=35;x<=62;x++) mask[y*96+x]=1;
  const plate = id => ({id,grid:{width:96,height:96},mask,edges:[],
    pickups:[{x:35/95,y:47/95},{x:62/95,y:47/95}],material:{stiffness:.9,density:1.1,damping:.35}});
  return compileSurfaceTopology({plates:[plate('lower'),plate('upper')],stratigraphy:{layerOrder:['lower','upper']}});
}
function make(code, topology, diagnostics=false) {
  let Processor;
  class Stub {constructor(){this.port={onmessage:null,postMessage(){}};}}
  vm.runInNewContext(code,{AudioWorkletProcessor:Stub,sampleRate:48000,Float32Array,Float64Array,Uint8Array,
    Uint16Array,Uint32Array,Int16Array,Int32Array,registerProcessor:(_,P)=>Processor=P});
  const p=new Processor();p.handleMessage({type:'topology',payload:topology});
  p.setSleepDiagnostics(diagnostics);
  for(let i=p.current.length-1;i>=0;i--){p.current[i]=Math.sin(i)*.0001;p.previous[i]=p.current[i]*.8;p.wakeNode(i);}
  assert.equal(new Set(p.active.subarray(0,p.activeCount)).size,p.current.length);
  return p;
}
function state(p) {
  return JSON.stringify({current:[...p.current],previous:[...p.previous],next:[...p.next],lap:[...p.lap],
    stamps:[...p.lapStamp],active:[...p.active],awake:[...p.awake],quiet:[...p.energyQuiet],
    pending:[...p.pendingNodes],pendingWake:[...p.pendingWake],sphere:[...p.sphereCurrent],
    telemetry:p.telemetry,diagnostics:p.getSleepDiagnosticsSummary()});
}
test('full-active Lap specialization and awake fast path preserve PCM, quiet resets and full state across epoch wrap',()=>{
  for(const diagnostics of [false,true]) for(const transform of [fastWakeSource,denseLapSource]) {
    const topology=fixture(),a=make(source,topology,diagnostics),b=make(transform(source),topology,diagnostics);
    a.epoch=b.epoch=0xfffffffc;
    a.energyQuiet[0]=b.energyQuiet[0]=500;
    a.wakeNode(0,2,.002);b.wakeNode(0,2,.002);assert.equal(b.energyQuiet[0],0);
    for(let k=0;k<20;k++) {
      const leftA=new Float32Array(128),rightA=new Float32Array(128),leftB=new Float32Array(128),rightB=new Float32Array(128);
      a.process([],[[leftA,rightA]]);b.process([],[[leftB,rightB]]);
      assert.deepEqual(leftB,leftA);assert.deepEqual(rightB,rightA);assert.equal(state(b),state(a));
    }
  }
});
test('Z removal preserves individual Plate geometry, materials and separate Sphere foundation fields',()=>{
  const topology=fixture(),lite=withoutZ(topology);assert.ok(topology.adjacentLinkNodes.length>0);
  assert.equal(lite.adjacentLinkNodes.length,0);assert.equal(lite.adjacentLinkCoefficients.length,0);
  for(const key of ['nodeOffsets','nodeGridIndices','neighborIndices','materialCoefficients','routingTopLayerByCell96',
    'noduleIds','noduleFoundationNodes','noduleCouplingWeights']) assert.equal(lite[key],topology[key]);
  const p=make(source,lite);assert.equal(p.linkNodes.length,0);assert.equal(p.telemetry.nonFinite,0);
});
