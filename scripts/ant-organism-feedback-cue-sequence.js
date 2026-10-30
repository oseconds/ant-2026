import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { attachResponseTiming } from './ant-material-response-timing-probes.js';

const file = 'docs/ant/evidence/2026-10-30-organism-feedback-candidate-survey/data/probes/adherence-sequence.json';
function run(layers, enabled) {
  const ant = { id: 'matched-cue', trailAdherence: .8 }, layersByAnt = new Map([[ant, layers]]);
  const controller = { updateTrailAdherence: AntController.prototype.updateTrailAdherence };
  const hook = attachResponseTiming(controller, { kind: 'adherence', enabled, layersByAnt });
  const rows = [];
  for (let tick = 0; tick < 240; tick++) {
    // Two native fade times, then one rise segment; targets are matched in every arm.
    const target = tick < 216 ? 0 : 1;
    controller.updateTrailAdherence(ant, { strength: target, coherence: 1 }, 1 / 60);
    if ([59, 107, 215, 239].includes(tick)) rows.push({ seconds: (tick + 1) / 60, target, value: ant.trailAdherence });
  }
  hook.finish(); return rows;
}
const native = run(0, false), L0 = run(0, true), L4 = run(4, true);
assert.deepEqual(native, L0, 'L0 complete matched cue sequence is native');
assert(L4.slice(0, 3).every((x, i) => x.value > native[i].value), 'same zero cue has slower endogenous fade');
assert(Math.abs(native[2].value - .8 * Math.exp(-2)) < 1e-12, 'native two-tau response');
assert(Math.abs(L4[2].value - .8 * Math.exp(-3.6 / (1.8 * (1 + .5 * (1 - Math.exp(-1)))))) < 1e-12);
const output = { input: { initialAdherence: .8, dt: 1 / 60, cue: 'zero for3.6s, one for.4s', existingStateOnly: true },
  native, L0, L4, L0Exact: true, noFieldOrSourceManipulation: true,
  sourceSha256: Object.fromEntries(await Promise.all(['src/lib/agents/ant/AntController.js',
    'scripts/ant-material-response-timing-probes.js', 'scripts/ant-organism-feedback-cue-sequence.js']
    .map(async p => [p, createHash('sha256').update(await readFile(p)).digest('hex')])) ) };
const bytes = JSON.stringify(output, null, 2) + '\n';
if (process.argv.includes('--check')) assert.equal(await readFile(file, 'utf8'), bytes);
else await writeFile(file, bytes, { flag: 'wx' });
console.log('Matched native cue sequence PASS; no world simulation.');
