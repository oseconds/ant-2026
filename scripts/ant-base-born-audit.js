import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve, relative, sep } from 'node:path';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { sha256 } from './ant-sonic-shadow-render.js';
import { transformSurface, rateAwareSurface } from './ant-base-born-shadow.js';

const evidence='docs/ant/evidence/2026-10-14-base-born-causal-decomposition';
const output='test-results/ant-base-born-causal-decomposition-20261014';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(git('rev-parse','origin/main'),'d45823d40c9a87c1b333fa9872f3c897ee9ab01b');
assert.equal(git('branch','--show-current'),'codex/ant-base-born-causal-decomposition-20261014');
git('diff','--exit-code','origin/main','--','src','static','tests/fixtures','package.json','package-lock.json');
git('diff','--check');
assert.equal(git('check-ignore',output),output);
const stash=git('stash','list','--format=%H');
assert.equal(stash,'243e7453c962dedfa99aeeef2caaec8472af02f3');
const index=JSON.parse(await readFile(`${output}/render-index.json`,'utf8'));
const inputs=JSON.parse(gunzipSync(await readFile(index.inputPath)));
assert.equal(sha256(await readFile(index.inputPath)),index.inputSha256);
assert.equal(index.rows.length,39);
const source=await readFile('static/worklets/surface-plate.worklet.js','utf8');
const generic=await readFile('static/worklets/plate.worklet.js','utf8');
const packed=t=>sha256(JSON.stringify(t,(_k,v)=>ArrayBuffer.isView(v)?Array.from(v):v));
const definitions=[];
for(const row of index.rows) {
  const descriptor=inputs.selected.find(r=>r.key===row.plateKey);
  assert.equal(sha256(JSON.stringify(descriptor.plate)),descriptor.descriptorSha256);
  const native=compileSurfaceTopology({plates:[descriptor.plate]});
  assert.equal(native.adjacentLinkCoefficients.length,0);assert.equal(native.noduleIds.length,0);
  assert.equal(row.schedule.length,1);assert.equal(row.schedule[0].frame,480);
  assert.equal(sha256(JSON.stringify(row.schedule)),row.scheduleSha256);
  if(row.isBaseReference) {
    assert.equal(row.sourceSha256,sha256(generic));assert.equal(row.nodeCount,177);
    assert.ok(Math.abs(row.coefficients.loss-.000178)<1e-15);assert.equal(row.seed,20261014);
    assert.equal(row.telemetry.nonFinite,0);assert.equal(row.telemetry.limiter.clipped,0);
    definitions.push({id:row.id,validated:'actual generic source/reference, distinct circular geometry; exact seeded schedule'});
    continue;
  }
  let transformed={source,topology:native};
  if(['instant','spatial-grid','spatial-world-width','jitter','loss-frequency','pulse-1ms'].includes(row.condition)) {
    transformed={...transformSurface(source,{
      pulseSteps:row.definition.pulseSteps,spatial:row.definition.spatial,
      ...(row.definition.jitterSeed===null?{}:{jitterSeed:row.definition.jitterSeed}),frequencyLoss:row.definition.frequencyLoss}),topology:native};
  } else if(row.condition==='loss-uniform') {
    transformed.topology={...native,materialCoefficients:native.materialCoefficients.slice()};
    transformed.topology.materialCoefficients[3]=(1-(1-.000178)**8)/50;
  } else if(['rate-aware-48','instant-48','base-elastic-48','base-elastic-instant-48'].includes(row.condition)) {
    transformed=rateAwareSurface(source,native,{baseElastic:row.definition.baseElastic,instant:row.definition.instant});
  } else assert.equal(row.condition,'baseline');
  assert.equal(sha256(transformed.source),row.sourceSha256);
  assert.equal(packed(transformed.topology),row.topologySha256);
  for(const property of ['nodeGridIndices','neighborIndices','pickupNodeIndices','routingTopLayerByCell96'])
    assert.deepEqual(transformed.topology[property],native[property]);
  assert.deepEqual(Array.from(transformed.topology.materialCoefficients),row.coefficients);
  assert.equal(row.telemetry.nonFinite,0);assert.equal(row.telemetry.clipped,0);assert.equal(row.telemetry.dropped,0);
  const baseline=index.rows.find(r=>r.id===`${row.plateKey}-baseline`);
  const impulseScale=row.physicsRate===48000?64:1;
  assert.ok(Math.abs(row.telemetry.requestedContactImpulseSquared*impulseScale-baseline.telemetry.requestedContactImpulseSquared)<1e-8);
  definitions.push({id:row.id,sourceAndTopologyReconstructed:true,geometryPickupsRoutingUnchanged:true,
    requestedImpulseSquaredScale:impulseScale,declaredResponsibility:row.definition,sourceSha256:row.sourceSha256});
}
const manifests=await Promise.all(['render-manifest.json','analysis-manifest.json','listening-manifest.json'].map(async name=>JSON.parse(await readFile(`${evidence}/${name}`,'utf8'))));
const entries=manifests.flatMap(m=>m.artifacts.map(a=>({...a,generationCommand:a.generationCommand||m.command}))), checked=new Map();
entries.push({path:`${output}/metrics.json`,role:'complete regenerable metrics JSON',bytes:(await stat(`${output}/metrics.json`)).size,
  sha256:manifests[1].metricsSha256,generationCommand:'python scripts/ant-base-born-metrics.py test-results/ant-base-born-causal-decomposition-20261014/render-index.json test-results/ant-base-born-causal-decomposition-20261014/metrics.json'});
for(const entry of entries) {
  const file=resolve(entry.path), b=await readFile(file);
  assert.equal(b.length,entry.bytes,entry.path);assert.equal(sha256(b),entry.sha256,entry.path);
  assert.ok(entry.role&&entry.generationCommand,entry.path);
  if(file.endsWith('.f32le')) {
    const values=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);
    assert.ok(values.every(Number.isFinite),`${entry.path}: finite raw observations`);
  }
  checked.set(file,{...entry,path:relative(process.cwd(),file).split(sep).join('/')});
}
async function filesBelow(directory) {
  const result=[];
  for(const item of await readdir(directory,{withFileTypes:true})) {
    const path=resolve(directory,item.name);
    if(item.isDirectory())result.push(...await filesBelow(path));else result.push(path);
  }
  return result;
}
const rawFiles=await filesBelow(output);
assert.deepEqual(rawFiles.filter(path=>!checked.has(path)),[]);
const sourceToolHashes={},gitBlobHashes={};
for(const path of [...Object.keys(manifests[0].sourceToolHashes),...Object.keys(manifests[1].sourceToolHashes),
  'scripts/ant-base-born-listening.js','scripts/ant-base-born-validation.js','scripts/ant-base-born-audit.js','tests/ant-base-born-shadow.test.js']) {
  sourceToolHashes[path]=sha256(await readFile(path));gitBlobHashes[path]=git('hash-object',path);
}
const captureHashChanges=Object.keys(manifests[0].sourceToolHashes).filter(path=>sourceToolHashes[path]!==manifests[0].sourceToolHashes[path]);
assert.deepEqual(captureHashChanges,['scripts/ant-base-born-metrics.py']);
const metrics=JSON.parse(await readFile(`${output}/metrics.json`,'utf8'));
const residuals=metrics.cases.map(c=>c.metrics.limiterContribution.softInterpolationToSavedPCM.relativeL2);
assert.ok(residuals.every(v=>Number.isFinite(v)&&v<1e-6));
const browser=JSON.parse(await readFile(`${evidence}/browser-parity.json`,'utf8'));
assert.equal(browser.checks.length,4);assert.ok(browser.checks.every(c=>c.exactChromeVmPcm&&c.exactRepeatPcm));
await writeFile(`${evidence}/omitted-artifacts.json`,JSON.stringify({root:resolve(output),ignoredVerified:true,
  sourceToolHashes,artifacts:rawFiles.map(path=>checked.get(path))},null,2)+'\n');
const result={branch:git('branch','--show-current'),researchBaseline:'2a65dc892f96fef2254afdb3c0621e3023e67c0b',
  originMain:git('rev-parse','origin/main'),productionCodeChanged:false,selectorStashCommitUnchanged:stash,
  worktrees:git('worktree','list','--porcelain'),command:'node scripts/ant-base-born-audit.js',
  checks:{focusedTestCommand:'node --test tests/ant-base-born-shadow.test.js tests/ant-sonic-shadow-render.test.js tests/surface-plate-worklet.test.js tests/compile-surface-topology.test.js tests/surface-audio-bridge.test.js',
    focusedTests:{tests:51,pass:51,fail:0,source:'parent observed completed TAP receipt'},cases:index.rows.length,
    completeOperatorStabilityChecked:'modal-audit.json',allRawFloatObservationsFinite:true,noClipping:true,
    baselineRepeatPcmAndFields:3,exactChromeVmPcmAndRepeat:browser.checks.length,forwardLimiterQueueMaxRelativeL2:Math.max(...residuals)},
  artifactAudit:{manifestEntries:entries.length,uniquePaths:checked.size,omittedRawFiles:rawFiles.length,
    omittedRawBytes:rawFiles.reduce((s,p)=>s+checked.get(p).bytes,0),reusedBaselineBytes:manifests[0].reusedBaselineBytes,
    unmanifestedRawFiles:[],maxTrackedArtifactBytes:Math.max(...entries.filter(e=>e.path.startsWith('docs/')).map(e=>e.bytes))},
  sourceToolHashes,gitBlobHashes,captureHashChanges:{files:captureHashChanges,explanation:'Capture manifest preserves its analyzer snapshot; final analysis adds the offline readout8 control and clarified A/B direction. No worklet, schedule, topology, PCM or field changes.'},
  archiveBoundaryException:'Two filenames accidentally enumerated by an early subagent; no archive content opened/read/used; later discovery scoped explicitly.',
  definitions};
await writeFile(`${evidence}/validation.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({cases:index.rows.length,rawFiles:rawFiles.length,rawBytes:result.artifactAudit.omittedRawBytes,uniquePaths:checked.size}));
