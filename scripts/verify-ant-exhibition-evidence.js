import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const dir='docs/ant/evidence/2026-10-21-exhibition-audio-runtime';
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const receipt=await json(`${dir}/capture-receipt.json`);
assert.equal(hash(await readFile(`${dir}/capture-inputs.v8.gz`)),receipt.sha256);
assert.equal(receipt.parity.equal,true);assert.equal(receipt.parity.firstMismatch,null);
const bench=await json(`${dir}/benchmark.json`);
assert.equal(bench.results.length,12);
for(const row of bench.results){
  assert.equal(row.inputSha256,receipt.sha256);
  const wav=await readFile(row.wavPath||`${dir}/${row.plateCount}-${row.id}.wav`);
  assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.length,44+row.frames*8);
  assert.equal(hash(wav.subarray(44)),row.pcmSha256);
  assert.equal(row.diagnostics.nonFinite,0);assert.equal(row.diagnostics.droppedRoutes,0);
}
const cache=await json(`${dir}/benchmark-force-cache.json`);
assert.equal(cache.results.length,12);assert.equal(cache.invalidReason,undefined);
for(const count of [8,20,30]){
  const rows=cache.results.filter(r=>r.plateCount===count),base=rows.find(r=>r.id==='full');
  assert.equal(rows.length,4);
  for(const row of rows){assert.equal(row.forceCountInstrumentation,false);
    assert.equal(row.pcmSha256,base.pcmSha256);assert.equal(row.stateSha256,base.stateSha256);
    assert.deepEqual(row.stateLayout,base.stateLayout);assert.deepEqual(row.diagnostics,base.diagnostics);
    const wav=await readFile(row.wavPath);assert.equal(hash(wav.subarray(44)),row.pcmSha256);}
}
const stems=await json(`${dir}/stems-summary.json`);
assert.equal(stems.benchmarkSha256,hash(await readFile(`${dir}/benchmark.json`)));
assert.equal(stems.captureInputSha256,receipt.sha256);assert.equal(stems.perRun.length,4);
for(const row of stems.perRun){const expected=bench.results.find(r=>r.plateCount===row.plateCount&&r.id===row.variant);
  assert.equal(row.pcmSha256,expected.pcmSha256);assert.deepEqual(row.strikeDiagnostics,expected.diagnostics);}
const acoustic=await json(`${dir}/acoustic-analysis.json`);
assert.equal(acoustic.benchmark.sha256,stems.benchmarkSha256);
assert.equal(acoustic.perPlateStemSummary.sha256,hash(await readFile(`${dir}/stems-summary.json`)));

const runtime=[];
for(const entry of await readdir(dir,{withFileTypes:true})){
  if(!entry.isDirectory()||!entry.name.startsWith('runtime-'))continue;
  const row=await json(`${dir}/${entry.name}/runtime.json`);
  if(!row.preroll.prerollWorldSha256){
    assert.equal(entry.name,'runtime-2026-10-21T01-30-46-670Z-8-full','only the documented earlier smoke may lack a pairing hash');
    continue;
  }
  assert.equal(row.pageError,null);assert.equal(row.processorDiagnostics.processorErrors.length,0);
  assert.equal(row.derived.canvasPixelsChanged,true);
  assert.equal(row.sample.simulationErrors,null);
  const cfg=row.configuration;
  assert.ok(row.derived.wallSeconds>=cfg.measuredSecondsRequested);
  assert.ok(row.derived.simulationPerWall>0.98&&row.derived.simulationPerWall<1.02);
  if(cfg.audio){
    const diagnostics=row.processorDiagnostics.messages.filter(m=>m.data?.type==='diagnostics').at(-1)?.data.payload;
    assert.ok(diagnostics,'audio runtime must return processor diagnostics');
    assert.equal(diagnostics.nonFinite,0);assert.equal(diagnostics.droppedRoutes,0);assert.equal(diagnostics.dropped,0);
    assert.equal(row.processorDiagnostics.bridge.processorErrors,0);
    assert.ok(row.cdpRealtime.some(sample=>Number.isFinite(sample.realtimeData?.currentTime)), 'CDP audio data required');
  }else{
    assert.equal(row.derived.audioSeconds,null);assert.equal(row.start.contextState,null);
  }
  if(cfg.audio&&cfg.workletVariant.startsWith('z-off')){
    assert.equal(row.start.topology.zCouplingEnabled,false);assert.equal(row.start.topology.couplingLinks,0);
    assert.equal(row.sample.topology.zCouplingEnabled,false);assert.equal(row.sample.topology.couplingLinks,0);
  }
  runtime.push({path:`${dir}/${entry.name}/runtime.json`,...row});
}
for(const count of [8,20,30]){
  const rows=runtime.filter(r=>r.configuration.targetPlates===count);
  assert.ok(rows.some(r=>r.configuration.audio&&r.configuration.workletVariant==='full'));
  assert.ok(rows.some(r=>r.configuration.audio&&r.configuration.workletVariant==='z-off'));
  assert.equal(new Set(rows.map(r=>r.preroll.prerollWorldSha256)).size,1,`Chrome ${count}-Plate starting worlds must match`);
  assert.equal(new Set(rows.map(r=>`${r.preroll.ticks}:${r.preroll.rngState}:${r.preroll.rngCalls}`)).size,1);
}
const required=[
  [0,'full',true,15],[8,'full',true,15],[20,'full',true,15],[30,'full',true,15],
  [8,'z-off',true,120],[20,'z-off',true,15],[30,'z-off',true,15],
  [8,'dense-lap',true,15],[8,'z-off-dense-lap',true,15],[30,'full',false,120]
];
for(const [count,variant,audio,seconds] of required){
  assert.ok(runtime.some(r=>r.configuration.targetPlates===count&&r.configuration.workletVariant===variant
    &&r.configuration.audio===audio&&r.configuration.measuredSecondsRequested>=seconds
    &&r.derived.wallSeconds>=seconds), `missing ${count} ${variant} audio=${audio} ${seconds}s runtime`);
}
const empty=runtime.find(r=>r.configuration.targetPlates===0);
assert.ok(empty.derived.audioPerWall>0.95&&empty.derived.audioPerWall<1.05,'empty audio host clock calibration');
const summary=runtime.map(r=>({path:r.path,configuration:r.configuration,
  preroll:{ticks:r.preroll.ticks,plates:r.preroll.plates,nodules:r.preroll.nodules,
    worldSha256:r.preroll.prerollWorldSha256},derived:r.derived,
  finalPlates:r.sample.plates,finalNodules:r.sample.nodules,
  processor:r.processorDiagnostics.messages.filter(m=>m.data?.type==='diagnostics').at(-1)?.data.payload??null,
  cdpRealtime:r.cdpRealtime}));
await writeFile(`${dir}/runtime-summary.json`,JSON.stringify({schemaVersion:1,verified:true,
  scope:'Within-Chrome matched starting worlds; separate from the Node frozen-topology workload.',runs:summary},null,2)+'\n');
console.log(JSON.stringify({verified:true,inputSha256:receipt.sha256,abRows:bench.results.length,
  cacheRows:cache.results.length,stemRows:stems.perRun.length,runtimeRuns:runtime.length,
  summary:`${dir}/runtime-summary.json`},null,2));
