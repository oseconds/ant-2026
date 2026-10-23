import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeAnalysis } from '../../../../../scripts/ant-spatial-analysis.js';

const evidence = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2] || resolve(evidence, 'analysis'));
await mkdir(output, { recursive: true });
const seeds = [20261005, 20261006, 20261007];
const baseline = seeds.map(seed => `baseline/seed-${seed}/result.json`);
const natural = [
  ...seeds.map(seed => `movement/natural/dtFeedback-${seed}/result.json`),
  'movement/natural/dampingOff-20261005/result.json',
  ...seeds.flatMap(seed => ['isotropic', 'flow'].map(policy => `recruitment/natural/${policy}-${seed}/result.json`))
];
const checks = [];
for (const [name, inputs, prior] of [['baseline-final', baseline, 'baseline-candidate-corrected'],
  ['natural-final', natural, 'natural-candidate-corrected']]) {
  const results = await writeAnalysis(inputs.map(path => resolve(evidence, path)), resolve(output, name));
  assert.equal(results.length, inputs.length);
  for (const result of results) {
    const current = JSON.parse(await readFile(resolve(result.output, 'summary.json')));
    const folder = result.output.split(/[\\/]/).at(-1);
    let previous = null;
    try { previous = JSON.parse(await readFile(resolve(evidence, 'analysis', prior, folder, 'summary.json'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous) {
      const oldWindows=previous.fixedWindows.map(({pheromoneOrientationCoherence,...rest})=>rest);
      const newWindows=current.fixedWindows.map(({pheromoneOrientationCoherence,...rest})=>rest);
      assert.deepEqual(newWindows,oldWindows);
      for (const key of ['withinRunDynamics','temporal']) assert.deepEqual(current[key],previous[key]);
    }
    checks.push({ input: current.inputPath, inputSha256: current.inputSha256,
      toolHashes: current.toolHashes, previousTemporalAndWindowValuesMatchExceptRepairedDirectionCos2: previous ? true : null });
  }
}
await writeFile(resolve(output, 'short-analysis-parity.json'), `${JSON.stringify(checks, null, 2)}\n`, { flag: 'wx' });
console.log(`PASS: ${checks.length} short analyses rebuilt; ${checks.filter(x => x.previousTemporalAndWindowValuesMatchExceptRepairedDirectionCos2).length} prior values checked excluding the repaired direction column`);
