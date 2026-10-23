import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const evidence=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repo=resolve(evidence,'../../../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const load=async path=>JSON.parse(await readFile(path));
const manifest=await load(resolve(evidence,'validation/packed-results.json'));
const inputs=new Map(manifest.results.map(x=>[x.raw,x.rawSha256]));
let frozenCopies=0,naturalRuns=0;
for(const entry of manifest.results){
  const bytes=await readFile(resolve(evidence,entry.raw));
  assert.equal(sha(bytes),entry.rawSha256);
  const run=JSON.parse(bytes);
  if(entry.raw==='movement/controlled-results.json')continue;
  naturalRuns++;
  for(const [name,expected]of Object.entries(run.sourceHashes)){
    const copy=resolve(evidence,dirname(entry.raw),'source-snapshot',name.replaceAll('/','__'));
    assert.equal(sha(await readFile(copy)),expected,copy);frozenCopies++;
    if(name.startsWith('src/'))assert.equal(sha(await readFile(resolve(repo,name))),expected,name);
  }
}
let summaries=0;
for(const group of ['baseline-final','natural-final','long-run-final']){
  const folder=resolve(evidence,'analysis/validated',group);
  for(const dir of await readdir(folder,{withFileTypes:true}))if(dir.isDirectory()){
    const summary=await load(resolve(folder,dir.name,'summary.json'));
    const relative=summary.inputPath.replaceAll('\\','/').split('/2026-10-22-spatial-dynamics/').at(-1);
    assert.equal(summary.inputSha256,inputs.get(relative),relative);
    for(const [path,expected]of Object.entries(summary.toolHashes))assert.equal(sha(await readFile(resolve(repo,path))),expected,path);
    summaries++;
  }
}
assert.equal(naturalRuns,15);assert.equal(summaries,15);
const visual=await load(resolve(evidence,'visual/manifest.json'));
for(const file of visual.outputs)assert.equal(sha(await readFile(resolve(evidence,'visual',file.path))),file.sha256);
const controlled=await load(resolve(evidence,'movement/controlled-results.json'));
assert.equal(sha(await readFile(resolve(evidence,'movement/source-snapshots/controlled-v1/ant-spatial-movement.js'))),controlled.sourceHashes['scripts/ant-spatial-movement.js']);
const result={rawResults:16,naturalRuns,frozenSourceCopies:frozenCopies,currentProductionSourcesMatch:true,
  validatedAnalysisSummaries:summaries,analysisToolsMatch:true,visualImages:visual.outputs.length,visualHashesMatch:true,
  controlledExecutedHelperCopyMatches:true};
const output=process.argv[2]?resolve(process.argv[2]):resolve(evidence,'validation/publication-integrity.json');
await writeFile(output,`${JSON.stringify(result,null,2)}\n`,{flag:'wx'});
console.log(JSON.stringify(result));
