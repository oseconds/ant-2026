import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOne } from './ant-retained-material-locomotion-ab.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SEEDS = [20261005, 20261006, 20261007];
const FIELDS = ['agentTrajectory', 'lifecycle', 'rng', 'pheromone', 'surfaceField', 'gait', 'bodyPose',
  'gasterDeposition', 'colonyActivation', 'localOccupancy', 'footContacts', 'materialBirthEvents',
  'trailPlateBirth', 'materialStratigraphy'];
const BASELINE = 'fc027dfc3d681d5dbcc205b9dbd3be3903103a54';
const SHADOW = 'docs/ant/evidence/2026-10-11-retained-material-experience-shadow-final';
const AB = 'docs/ant/evidence/2026-10-11-retained-material-locomotion-ab-final';
const CLI = new Map(process.argv.slice(2).map(arg => {
  const i = arg.indexOf('=');
  return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)];
}));
const OUTPUT = String(CLI.get('--output')
  || 'docs/ant/evidence/2026-10-12-retained-material-locomotion-adoption/conformance');

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

const out = resolve(ROOT, OUTPUT);
await mkdir(out, { recursive: true });
assert.equal((await readdir(out)).length, 0, 'conformance output directory must be empty');
git(['merge-base', '--is-ancestor', BASELINE, 'HEAD']);
assert.equal(git(['branch', '--show-current']), 'ant-retained-material-locomotion-adoption');

const runs = [];
for (const seed of SEEDS) {
  const oldShadow = JSON.parse(await readFile(resolve(ROOT, SHADOW, `seed-${seed}-summary.json`), 'utf8'));
  const oldControl = JSON.parse(await readFile(resolve(ROOT, AB, `seed-${seed}-Control-summary.json`), 'utf8'));
  const oldTreatment = JSON.parse(await readFile(resolve(ROOT, AB, `seed-${seed}-Treatment-summary.json`), 'utf8'));
  const explicitOff = await runOne({ seed, seconds: 600, condition: 'Control' });
  const defaultOn = await runOne({ seed, seconds: 600, condition: 'Default-On' });
  const explicitOn = await runOne({ seed, seconds: 600, condition: 'Treatment' });

  assert.deepEqual(explicitOff.summary.manipulation, oldControl.manipulation,
    `explicit-Off manipulation summary differs from prior A/B Control for seed ${seed}`);
  assert.deepEqual(defaultOn.summary.manipulation, explicitOn.summary.manipulation,
    `default-On manipulation summary differs from explicit-On for seed ${seed}`);
  assert.deepEqual(explicitOn.summary.manipulation, oldTreatment.manipulation,
    `explicit-On manipulation summary differs from prior A/B Treatment for seed ${seed}`);
  const exactFields = Object.fromEntries(FIELDS.map(field => [field, {
    explicitOffMatchesShadow: explicitOff.hashes[field] === oldShadow.parity.fields[field].baselineSha256,
    explicitOffMatchesPriorControl: explicitOff.hashes[field] === oldControl.hashChains[field],
    defaultOnMatchesExplicitOn: defaultOn.hashes[field] === explicitOn.hashes[field],
    explicitOnMatchesPriorTreatment: explicitOn.hashes[field] === oldTreatment.hashChains[field]
  }]));
  for (const [field, checks] of Object.entries(exactFields)) for (const [check, match] of Object.entries(checks)) {
    assert.equal(match, true, `${check} differs for seed ${seed}, field ${field}`);
  }
  assert.equal(defaultOn.summary.ticks, 36000);
  assert.equal(explicitOn.summary.ticks, 36000);
  assert.equal(explicitOff.summary.ticks, 36000);
  runs.push({
    seed, seconds: 600, fixedHz: 60,
    conditions: {
      explicitOff: 'materialLocomotionResistance=false',
      defaultOn: 'new AntController() with no materialLocomotionResistance option',
      explicitOn: 'materialLocomotionResistance=true'
    },
    exactFields,
    hashChains: { explicitOff: explicitOff.hashes, defaultOn: defaultOn.hashes, explicitOn: explicitOn.hashes },
    summaries: {
      explicitOff: explicitOff.summary,
      defaultOn: defaultOn.summary,
      explicitOn: explicitOn.summary
    }
  });
  console.log(JSON.stringify({ seed, conditions: 3, ticksPerRun: 36000, parity: 'exact across all 14 fields' }));
}

const result = {
  schemaVersion: 1,
  pass: 'retained-material-locomotion-production-adoption-conformance',
  baselineCommit: BASELINE,
  branch: git(['branch', '--show-current']),
  seeds: SEEDS,
  seconds: 600,
  dtSeconds: 1 / 60,
  fields: FIELDS,
  candidate: 'm(L) = 1 - 0.10 * (1 - exp(-L / 4))',
  timing: 'One public stratigraphy snapshot is read at tick entry; existing candidate integration remains once after movement decisions and before targetSpeed/accelerateToward.',
  exactParity: {
    explicitOffAgainstShadowAndPriorControl: true,
    defaultOnAgainstExplicitOn: true,
    explicitOnAgainstPriorAbTreatment: true
  },
  runs
};
await writeFile(resolve(out, 'adoption-conformance.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: OUTPUT, decision: 'all adoption conformance comparisons exact' }));
