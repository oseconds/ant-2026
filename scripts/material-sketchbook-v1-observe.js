import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SubtractiveWorld } from '../src/sketchbook-v1/subtractive.js';
import { LocalTimeWorld } from '../src/sketchbook-v1/local-time.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/ant/evidence/2026-11-09-material-sketchbook-v1/data');
const SEEDS = [20261005, 20261006];
const PATTERNS = ['wander', 'stationary'];
const CHECKPOINTS = [0, 1200, 2400, 7200, 18000];
const sourceFiles = ['src/sketchbook/common.js', 'src/sketchbook-v1/input.js', 'src/sketchbook-v1/subtractive.js', 'src/sketchbook-v1/local-time.js'];
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value);
const close = (a, b, epsilon = 1e-12) => Math.abs(a - b) <= epsilon;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const finite = value => {
  if (typeof value === 'number') assert(Number.isFinite(value), 'non-finite state');
  else if (Array.isArray(value)) value.forEach(finite);
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
};
const safeName = value => value.replaceAll(/[^a-z0-9-]/gi, '-').toLowerCase();

function metric(world, snapshot) {
  if (snapshot.model === 'subtractive-v1') return snapshot.samples.map(sample => ({
    label: sample.label, meanBond: sample.stats.meanBond, removedEdges: sample.stats.removedEdges,
    components: sample.stats.components, largestComponent: sample.stats.largestComponent,
    energy: sample.stats.energy, energyBalanceError: sample.stats.energyBalanceError,
    meanDisplacement: sample.displacement.reduce((a, b) => a + b, 0) / sample.displacement.length
  }));
  return snapshot.samples.map(sample => ({
    label: sample.label, energy: sample.stats.energy, meanPhase: sample.stats.meanPhase,
    meanAge: sample.stats.meanAge, minAge: sample.stats.minAge, maxAge: sample.stats.maxAge,
    minRate: sample.stats.minRate, maxRate: sample.stats.maxRate
  })).concat([{ phaseL2: world.view().stats.phaseL2, ageSpread: world.view().stats.ageSpread }]);
}

function validate(world, snapshot, previous) {
  finite(snapshot);
  assert(snapshot.tick === world.tick, 'snapshot tick mismatch');
  if (snapshot.model === 'subtractive-v1') {
    assert(snapshot.positions.length === 144 && snapshot.edges.length === 264, 'subtractive geometry changed');
    assert(snapshot.samples.every(sample => sample.bond.every((b, i) => b >= 0 && b <= 1 && (!previous || b <= previous.samples.find(p => p.label === sample.label).bond[i]))), 'bond non-monotonicity');
    assert(close(snapshot.input.dose.reduce((a, b) => a + b, 0), snapshot.config.pattern === 'none' ? 0 : Math.min(snapshot.tick, 2400) * 2 / 60, 1e-9), 'activity total dose mismatch');
    for (const sample of snapshot.samples) assert(Math.abs(sample.stats.energyBalanceError) < 1e-9, 'subtractive energy accounting drift');
  } else {
    assert(snapshot.config.size === 12 && snapshot.samples.every(s => s.phase.length === 144 && s.age.length === 144), 'local-time geometry changed');
    assert(snapshot.samples.every(s => s.phase.every(p => p >= 0 && p <= 1)), 'phase escaped [0,1]');
    assert(snapshot.q.every(q => q >= 0 && q <= 1), 'condition escaped [0,1]');
    assert(snapshot.samples.every(s => s.rate.every(r => r >= 0.2 - 1e-12 && r <= 1 + 1e-12)), 'rate escaped [0.2,1]');
    assert(snapshot.input.last.length === 144 && snapshot.input.tick === snapshot.tick, 'local-time input receipt mismatch');
    assert(close(snapshot.samples[0].stats.meanAge, snapshot.samples[1].stats.meanAge, 1e-9), 'paired mean ages differ');
    if (previous) for (let i = 0; i < snapshot.samples.length; i++) assert(snapshot.samples[i].stats.energy <= previous.samples[i].stats.energy + 1e-12, 'local-time energy increased');
    assert(close(snapshot.input.dose.reduce((a, b) => a + b, 0), snapshot.input.pattern === 'none' ? 0 : Math.min(snapshot.tick, 2400) * 2 / 60, 1e-9), 'activity total dose mismatch');
  }
}

async function runCase({ id, model, seed, pattern, options = {}, checkpointList = CHECKPOINTS, checks = [] }) {
  const world = model === 'S' ? new SubtractiveWorld(seed, { pattern, ...options }) : new LocalTimeWorld(seed, { pattern, ...options });
  let last = null, previous = null;
  const states = [];
  for (const tick of checkpointList) {
    while (world.tick < tick) world.step();
    const state = world.snapshot();
    validate(world, state, previous);
    const digest = sha(json(state));
    states.push({ tick, digest, metrics: metric(world, state), state });
    previous = state; last = digest;
  }
  return { id, model: model === 'S' ? 'subtractive-v1' : 'local-time-v1', seed, pattern, options, checks, checkpoints: states };
}

function deterministic(captured, replay) {
  assert(captured.checkpoints.map(x => x.digest).join() === replay.checkpoints.map(x => x.digest).join(), `non-deterministic replay: ${captured.id}`);
}

async function main() {
  const record = process.argv.includes('--record');
  if (process.argv.some(arg => arg.startsWith('--') && arg !== '--record')) throw new Error('Only --record is supported');
  const cases = [];
  for (const seed of SEEDS) for (const pattern of PATTERNS) {
    cases.push(await runCase({ id: `S-${seed}-${pattern}`, model: 'S', seed, pattern }));
    cases.push(await runCase({ id: `T-${seed}-${pattern}`, model: 'T', seed, pattern }));
  }
  for (const seed of SEEDS) cases.push(await runCase({ id: `T-${seed}-none`, model: 'T', seed, pattern: 'none', checks: ['local and mean-matched samples remain exactly equal with no input'] }));
  cases.push(await runCase({ id: 'S-20261005-wander-fatigue-stop-2400', model: 'S', seed: 20261005, pattern: 'wander', options: { fatigueStopTick: 2400 }, checks: ['continuation preserves default trajectory through tick 2400; fatigue disabled from tick 2400 onward'] }));
  cases.push(await runCase({ id: 'T-20261005-wander-coupling-off', model: 'T', seed: 20261005, pattern: 'wander', options: { coupling: false }, checks: ['D=0 ablation'] }));

  const byId = new Map(cases.map(item => [item.id, item]));
  for (const item of cases) {
    const replay = await runCase({ id: item.id, model: item.model === 'subtractive-v1' ? 'S' : 'T', seed: item.seed, pattern: item.pattern, options: item.options });
    deterministic(item, replay);
  }
  for (const seed of SEEDS) {
    const noInput = byId.get(`T-${seed}-none`);
    assert(noInput.checkpoints.every(cp => cp.state.q.every(q => q === 0) && cp.state.samples[0].phase.every((v, i) => v === cp.state.samples[1].phase[i]) && cp.state.samples[0].age.every((v, i) => v === cp.state.samples[1].age[i]) && cp.state.samples[0].rate.every((v, i) => v === cp.state.samples[1].rate[i])), `no-input pair differs for ${seed}`);
  }
  const baseline = byId.get('S-20261005-wander'), stop = byId.get('S-20261005-wander-fatigue-stop-2400');
  assert(baseline.checkpoints.filter(cp => cp.tick <= 2400).every((cp, i) => {
    const x = cp.state, y = stop.checkpoints[i].state;
    return json(x.samples.map(s => [s.bond, s.displacement])) === json(y.samples.map(s => [s.bond, s.displacement]));
  }), 'fatigue continuation physical state diverged before stop tick');
  const tBase = byId.get('T-20261005-wander'), tOff = byId.get('T-20261005-wander-coupling-off');
  const couplingComparison = CHECKPOINTS.map((tick, i) => ({ tick, phaseL2Default: tBase.checkpoints[i].metrics.at(-1).phaseL2, phaseL2D0: tOff.checkpoints[i].metrics.at(-1).phaseL2 }));
  const fatigueComparison = CHECKPOINTS.filter(t => t >= 2400).map(t => {
    const a = baseline.checkpoints.find(cp => cp.tick === t).metrics[0];
    const b = stop.checkpoints.find(cp => cp.tick === t).metrics[0];
    return { tick: t, defaultRemovedEdges: a.removedEdges, stopRemovedEdges: b.removedEdges, defaultComponents: a.components, stopComponents: b.components, defaultMeanBond: a.meanBond, stopMeanBond: b.meanBond };
  });
  const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, sha(await readFile(path.join(ROOT, file)))])));
  const manifest = {
    schema: 'material-sketchbook-v1-observations', recordedAt: new Date().toISOString(), node: process.version,
    sourceHashes, seeds: SEEDS, patterns: PATTERNS, checkpoints: CHECKPOINTS,
    runCount: cases.length, stateHashes: Object.fromEntries(cases.map(item => [item.id, item.checkpoints.map(cp => [cp.tick, cp.digest])])),
    diagnostics: { fatigueComparison, couplingComparison }, cases: cases.map(({ id, model, seed, pattern, options, checks }) => ({ id, model, seed, pattern, options, checks, metrics: cases.find(c => c.id === id).checkpoints.map(cp => ({ tick: cp.tick, digest: cp.digest, metrics: cp.metrics })) }))
  };
  if (!record) {
    const saved = JSON.parse(await readFile(path.join(OUT, 'manifest.json'), 'utf8'));
    assert(json(saved.stateHashes) === json(manifest.stateHashes), 'saved state hashes differ; run with --record only for an authorized fresh capture');
    assert(json(saved.sourceHashes) === json(sourceHashes), 'saved source hashes differ');
    for (const item of cases) {
      const savedCase = JSON.parse(await readFile(path.join(OUT, `${safeName(item.id)}.json`), 'utf8'));
      assert(savedCase.id === item.id && savedCase.checkpoints.length === item.checkpoints.length, `saved case missing or malformed: ${item.id}`);
      for (let i = 0; i < item.checkpoints.length; i++) {
        const point = savedCase.checkpoints[i], expected = item.checkpoints[i];
        assert(point.tick === expected.tick && point.digest === expected.digest && sha(json(point.state)) === point.digest, `saved state payload hash mismatch: ${item.id} tick ${expected.tick}`);
      }
    }
    console.log(`Verified ${cases.length} cases, ${cases.reduce((n, c) => n + c.checkpoints.length, 0)} checkpoints; exact deterministic state hashes match.`);
    return;
  }
  await mkdir(OUT, { recursive: true });
  for (const item of cases) await writeFile(path.join(OUT, `${safeName(item.id)}.json`), `${JSON.stringify(item, null, 2)}\n`);
  await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Recorded ${cases.length} cases, ${cases.reduce((n, c) => n + c.checkpoints.length, 0)} checkpoints in ${OUT}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
