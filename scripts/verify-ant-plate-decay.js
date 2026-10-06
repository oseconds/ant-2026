import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const start = '7f8ebf8d50752341383d1bd3d90e568fc2340fdd';
const dir = resolve('docs/ant/evidence/2026-10-06-plate-decay');
const sourcePath = 'static/worklets/surface-plate.worklet.js';
const oldRaw = execFileSync('git', ['show', `${start}:${sourcePath}`], { encoding: 'utf8' });
const newRaw = readFileSync(sourcePath, 'utf8');
const normal = text => text.replace(/\r\n/g, '\n');
const expected = normal(oldRaw).replace('const RATE = 6000;',
  'const RATE = 6000;\n// Shorten vibration, preserving the relative loss of each frozen material.\nconst PLATE_DAMPING_MULTIPLIER = 50;')
  .replace('damping = mats[mi + 3];', 'damping = mats[mi + 3] * PLATE_DAMPING_MULTIPLIER;');
assert.equal(normal(newRaw), expected, 'production worklet must differ only by the documented Plate damping mapping');
const protectedDiff = execFileSync('git', ['diff', '--name-only', start, '--', 'src', 'static/worklets',
  'scripts/audio-snapshot-renderer.js', 'scripts/stratigraphy-audio-overview.js'], { encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean);
assert.deepEqual(protectedDiff, [sourcePath]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = { baseline: hash(oldRaw), candidate: hash(newRaw) };
const cases = {};

function inspectPcm(bytes, seconds) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt16LE(20), 3);
  assert.equal(bytes.readUInt16LE(22), 2);
  const rate = bytes.readUInt32LE(24), n = bytes.readUInt32LE(40) / 8;
  assert.equal(rate, 48000); assert.equal(n, seconds * rate); assert.equal(bytes.length, 44 + 8*n);
  const channels = [new Float32Array(n), new Float32Array(n)];
  const result = { rms: [], peak: [], crossings: [], initialRms: [] };
  for (let c=0;c<2;c++) {
    const data=channels[c]; let sq=0, peak=0;
    for (let i=0;i<n;i++) { const v=data[i]=bytes.readFloatLE(44+8*i+4*c);
      assert.ok(Number.isFinite(v)); assert.ok(Math.abs(v)<1); sq+=v*v; peak=Math.max(peak,Math.abs(v)); }
    result.rms.push(Math.sqrt(sq/n)); result.peak.push(peak);
    if (seconds!==60) continue;
    const win=2400, hop=480, envelope=[];
    for(let s=0;s+win<=n;s+=hop) { let energy=0; for(let i=s;i<s+win;i++)energy+=data[i]*data[i]; envelope.push(Math.sqrt(energy/win)); }
    const max=Math.max(...envelope), ref=envelope.indexOf(max); assert.ok(max>0);
    result.initialRms.push(envelope[0]);
    const decay={referenceRms:max,referenceTimeSeconds:(ref*hop+win/2)/rate};
    for(const db of [20,40,60]) { let last=ref; for(let i=ref;i<envelope.length;i++)if(envelope[i]>max*10**(-db/20))last=i;
      decay[`T${db}Seconds`]=last+1+50<=envelope.length ? (last+1-ref)*hop/rate : null; }
    result.crossings.push(decay);
  }
  return result;
}

for (const mode of ['baseline','candidate']) for (const condition of ['isolated','dense','sparse']) {
  const isolated=condition==='isolated', stem=`${mode}-${condition}`;
  const meta=JSON.parse(readFileSync(resolve(dir, isolated?`${stem}-decay.json`:`${stem}-metrics.json`)));
  const filename=isolated?`${mode}-isolated-60s-48khz-f32.wav`:`${mode}-${condition}-154-164s.wav`;
  assert.equal(isolated?meta.outputFile:meta.file, filename);
  assert.equal(meta.volume,.35); assert.equal(meta.finalGain,.245);
  assert.equal(isolated?meta.workletSha256:meta.workletSha256, sourceHashes[mode]);
  const expectedStrikes=isolated?1:condition==='dense'?242:4;
  assert.equal(meta.processor.strikes,expectedStrikes); assert.equal(meta.processor.scheduled,expectedStrikes);
  const diag=meta.processor.diagnostics;
  assert.equal(diag.droppedRoutes,0); assert.equal(diag.nonFinite,0); assert.equal(diag.clipped,0);
  assert.equal(diag.contactPulseDurationMs,3); assert.equal(diag.contactPulseSteps,18);
  assert.equal(diag.contactRecoveryTimeMs,75); assert.equal(diag.contactReferenceDeltaV,.020);
  assert.equal(diag.contactMaximumComplianceLoss,.25); assert.equal(diag.couplingLinks,0); assert.equal(diag.noduleCount,0);
  const bytes=readFileSync(resolve(dir,filename)), measured=inspectPcm(bytes,isolated?60:10);
  const saved=isolated?meta.decay:meta.metrics;
  for(const [i,channel]of['L','R'].entries()) {
    assert.ok(Math.abs(measured.rms[i]-saved[`rms${channel}`])<1e-12);
    assert.ok(Math.abs(measured.peak[i]-saved[`peak${channel}`])<1e-12);
    if(isolated) for(const db of[20,40,60]) { const a=measured.crossings[i][`T${db}Seconds`], b=saved.crossings[channel][`T${db}Seconds`];
      assert.ok(a===null?b===null:Math.abs(a-b)<1e-9); }
  }
  cases[stem]={filename,wavSha256:hash(bytes),processorStrikes:expectedStrikes,...measured};
}
for(const condition of['dense','sparse']) {
  const a=JSON.parse(readFileSync(resolve(dir,`baseline-${condition}-metrics.json`)));
  const b=JSON.parse(readFileSync(resolve(dir,`candidate-${condition}-metrics.json`)));
  assert.equal(a.scheduleSha256,b.scheduleSha256);
  assert.equal(a.scheduleSha256,condition==='dense'?'8f56adf6f54ccd52143acc2d6c49c6026872df2fac4486776ae00dfb8ba291eb':'b6e9dfc182edc2fb9c24bf4e3718c42f7b86c4cd9f295ea383274711fb79a275');
  assert.equal(a.groups,b.groups); assert.equal(a.individualFeet,b.individualFeet);
  assert.equal(a.groups,condition==='dense'?648:10); assert.equal(a.individualFeet,condition==='dense'?1916:30);
  for(const metric of['requestedContactImpulseSquared','compliantContactImpulseSquared','contactPulseNodeSteps'])
    assert.equal(a.processor.diagnostics[metric],b.processor.diagnostics[metric]);
}
const report={status:'passed',startingHEAD:start,productionDelta:'one fixed multiplier on Plate velocity loss only',
  protectedSourceDiffPaths:protectedDiff,sourceHashes,nonFinite:0,clipping:0,cases};
writeFileSync(resolve(dir,'independent-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,cases:Object.keys(cases),productionDelta:report.productionDelta},null,2));
