import fs from 'node:fs';
import crypto from 'node:crypto';
import {ActivityWorld} from './source/src/sketchbook/activity.js';
import {MemoryWorld} from './source/src/sketchbook/memory.js';
import {CapacityWorld} from './source/src/sketchbook/capacity.js';
import {renderProbe} from './source/src/sketchbook/response.js';
const out=new URL('./output/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const times=[0,10,30,40,60,120,300];
const rows=[];
for(const [model,Ctor] of [['A',ActivityWorld],['B',MemoryWorld],['C',CapacityWorld]]){
 const world=new Ctor(20261005);
 for(const time of times){
  while(world.tick<time*60)world.step();
  const before=JSON.stringify(world.snapshot());
  for(const [index,graph] of world.mechanics().entries()){
   const id=`${model}${model==='B'?['-AB','-BA'][index]:''}-${String(time).padStart(3,'0')}s`;
   const result=renderProbe(graph);
   const pcm=new Float32Array(result.left.length*2);
   for(let n=0;n<result.left.length;n++){pcm[n*2]=result.left[n];pcm[n*2+1]=result.right[n];}
   fs.writeFileSync(new URL(id+'.f32',out),Buffer.from(pcm.buffer));
   fs.writeFileSync(new URL(id+'-graph.json',out),JSON.stringify(graph));
   const rerun=renderProbe(graph);
   if(!Buffer.from(result.left.buffer).equals(Buffer.from(rerun.left.buffer))||!Buffer.from(result.right.buffer).equals(Buffer.from(rerun.right.buffer)))throw Error('Non-deterministic '+id);
   let refinedMax=0,baseSq=0,diffSq=0;
   if([30,120,300].includes(time)){
    const ref=renderProbe(graph,{sampleRate:96000});
    for(let n=0;n<result.left.length;n++)for(const ch of ['left','right']){
     const a=result[ch][n],b=ref[ch][n*4+3];const d=a-b;
     refinedMax=Math.max(refinedMax,Math.abs(d));baseSq+=a*a;diffSq+=d*d;
    }
   }
   rows.push({id,model,sample:graph.label,time,sampleRate:result.sampleRate,frames:result.left.length,sha256:crypto.createHash('sha256').update(Buffer.from(pcm.buffer)).digest('hex'),probeMetrics:result.metrics,stats:world.view().stats,refinement:[30,120,300].includes(time)?{sampleRate:96000,maxAbsError:refinedMax,relativeL2:baseSq?Math.sqrt(diffSq/baseSq):null}:null});
  }
  if(JSON.stringify(world.snapshot())!==before)throw Error('Probe changed state');
  fs.writeFileSync(new URL(`${model}-${time}s-state.json`,out),before);
 }
 console.log('Rendered',model);
}
fs.writeFileSync(new URL('renders.json',out),JSON.stringify({sourceCommit:'58da743d94c18e10f3241f98da28a0d23af26211',seed:20261005,probe:'unmodified renderProbe',times,rows},null,2));
