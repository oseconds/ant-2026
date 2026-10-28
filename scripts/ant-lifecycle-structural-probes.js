import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { ColonyActivation } from '../src/lib/agents/ant/ColonyActivation.js';

const started = performance.now();
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = resolve(root, 'docs/ant/evidence/2026-10-28-open-world-lifecycle-architecture/data');
const source = resolve(root, 'docs/ant/evidence/2026-10-25-g-production-candidate-review/data');
const sha = b => createHash('sha256').update(b).digest('hex');
const checksums = JSON.parse(await readFile(resolve(source, 'SHA256SUMS.json'), 'utf8'));
const seeds = [20261005, 20261006, 20261007];
// Preserve metadata order even when independent file reads finish out of order.
const inputs = Object.fromEntries(seeds.map(seed => [`seed${seed}-G-raw.json.gz`, null]));
async function load(name) {
  const bytes = await readFile(resolve(source, name));
  assert.equal(sha(bytes), checksums[name], name); inputs[name] = sha(bytes);
  return JSON.parse(gunzipSync(bytes));
}
const archives = await Promise.all(seeds.map(seed => load(`seed${seed}-G-raw.json.gz`)));
const projected = await load('seed20261005-G-600s.json.gz');
assert.equal(projected.pheromone.width, 96, 'archived G600 map is a projection, not native source nodes');
const ledger = resolve(root, 'docs/ant/evidence/2026-10-27-g-formation-information-ledger/data');
const indexBytes = await readFile(resolve(ledger, 'checkpoint-arrays-index.json'));
const index = JSON.parse(indexBytes), compressed = await readFile(resolve(ledger, 'checkpoint-arrays.bin.gz'));
assert.equal(sha(compressed), index.compressedSha256);
assert.equal(sha(compressed), '04833aab8a335af9ec79ebbecbbdb54dfe9e389cc82fb268229601117d918a6d');
const bytes = gunzipSync(compressed), checkpoint = index.checkpoints.at(-1), spec = checkpoint.fields.A_native;
assert.equal(checkpoint.tick, 7141); assert.equal(spec.length, 316 ** 2);
const native = bytes.subarray(spec.offset, spec.offset + spec.byteLength);
assert.equal(sha(native), spec.sha256);
assert.equal(sha(native), 'fcbb425ff8003740f02b28599354bfc42475d850fcd42a13347ef1c2923a9645');
const frozen = { pheromone: { width: 316, height: 316,
  values: Array.from({ length: spec.length }, (_, i) => native.readFloatLE(i * 4)) } };
inputs.ledgerIndexSha256 = sha(indexBytes); inputs.ledgerCompressedSha256 = sha(compressed);
const sourceHashes = {};
for (const p of ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js']) {
  sourceHashes[p] = sha(await readFile(resolve(root, p)));
}
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
function localGaps(rows, grid) {
  const bins = Array.from({ length: grid * grid }, () => []);
  for (const row of rows) {
    const counts = new Uint16Array(bins.length);
    for (const a of row.agents) {
      assert.ok(Number.isFinite(a.x) && a.x >= 0 && a.x <= 1 && Number.isFinite(a.y) && a.y >= 0 && a.y <= 1);
      counts[Math.min(grid - 1, Math.floor(a.y * grid)) * grid + Math.min(grid - 1, Math.floor(a.x * grid))]++;
    }
    bins.forEach((b, i) => b.push(counts[i]));
  }
  return { grid, sampleSeconds: 1, referenceHalfLifeSeconds: 15,
    bins: bins.map((values, index) => {
      const runs = [];
      for (let i = 0; i < values.length;) {
        if (values[i]) { i++; continue; }
        const start = i; while (i < values.length && !values[i]) i++;
        runs.push({ firstSampleSecond: rows[start].seconds, lastSampleSecond: rows[i - 1].seconds,
          emptySamples: i - start, durationBracketSeconds: [Math.max(0, i - start - 1), i - start + 1],
          leftCensored: start === 0, rightCensored: i === values.length });
      }
      const complete = runs.filter(r => !r.leftCensored && !r.rightCensored);
      return { index, occupiedSamples: values.filter(Boolean).length,
        emptyFraction: values.filter(v => !v).length / values.length, maxEmptySamples: Math.max(0, ...runs.map(r => r.emptySamples)),
        completedEmptyRuns: complete.length, completedRunsAtLeast15EmptySamples: complete.filter(r => r.emptySamples >= 15).length, runs };
    }) };
}
function summarize(raw) {
  const rows = raw.positions.filter(p => p.seconds >= 301 && p.seconds <= 600);
  assert.equal(rows.length, 300);
  let prior = new Set(raw.positions.find(p => p.seconds === 300).agents.map(a => a.id));
  let appearances = 0, disappearances = 0;
  for (const row of rows) {
    const now = new Set(row.agents.map(a => a.id)); assert.equal(now.size, row.agents.length);
    appearances += [...now].filter(id => !prior.has(id)).length;
    disappearances += [...prior].filter(id => !now.has(id)).length; prior = now;
  }
  const populations = rows.map(p => p.agents.length), load = mean(populations), K = 28;
  assert.ok(load > 0 && load < K);
  const grids = [4, 8].map(g => localGaps(rows, g));
  return { seed: raw.seed, intervalSamples: '301..600 inclusive', meanPopulation: load,
    range: [Math.min(...populations), Math.max(...populations)], globalZeroSamples: populations.filter(n => n === 0).length,
    sampledAppearances: appearances, sampledDisappearances: disappearances,
    sampledAppearanceRate: appearances / 300, sampledDisappearanceRate: disappearances / 300,
    impliedOccupancyPerSampledAppearanceSeconds: load / (appearances / 300),
    meanSavedIndividualFeetPerSecond: mean(raw.contactsBySecond.filter(p => p.seconds >= 301 && p.seconds <= 600).map(p => p.feet)),
    stationaryNull: { assumptions: 'illustrative independent stationary exponential residence, not fitted ANT',
      offeredLoad: load, poissonEmptyProbability: Math.exp(-load), finiteIndependentPoolK: K,
      finitePoolActiveProbability: load / K, finitePoolEmptyProbability: (1 - load / K) ** K },
    grids };
}
const HIGH = 1 / .65;
const hazard = activation => HIGH * (1 - activation);
function sourceCueFixture(decay) {
  const p = frozen.pheromone;
  assert.equal(p.width, 316); assert.equal(p.height, 316);
  const field = new PheromoneField({ width: p.width, height: p.height, decayHalfLifeSeconds: 15 });
  field.values.set(p.values);
  assert.ok(field.values.every(v => Number.isFinite(v) && v >= 0 && v <= 8));
  const activation = new ColonyActivation(); activation.advance(field, 1);
  const initialCue = activation.evidence; activation.activation = initialCue;
  const rows = [];
  for (let seconds = 0; seconds <= 300; seconds++) {
    if (seconds) { if (decay) field.decay(1); activation.advance(field, 1); }
    const A = activation.activation, lambda = hazard(A);
    assert.ok(Number.isFinite(lambda) && lambda >= 0 && lambda <= HIGH);
    // Population is deliberately absent from this law; these are fixture labels, not worlds.
    const fixedCountHazards = [0, 20, 80].map(() => hazard(A));
    assert.ok(fixedCountHazards.every(x => x === lambda));
    rows.push({ seconds, evidence: activation.evidence, activation: A, hazardPerSecond: lambda,
      fixedCountHazards,
      rejectedCueContrastHighBaseline: HIGH * (1 - Math.max(0, activation.evidence - A)) });
  }
  if (!decay) assert.ok(rows.every(r => Math.abs(r.hazardPerSecond - rows[0].hazardPerSecond) < 1e-12));
  else assert.ok(rows.every((r, i) => !i || r.hazardPerSecond >= rows[i - 1].hazardPerSecond));
  return { decay, initialization: 'equilibrium at frozen measured cue, not natural saved activation', dtSeconds: 1,
    initialCue, finalFieldSha256: sha(new Uint8Array(field.values.buffer)), rows };
}
function selfChecks() {
  assert.deepEqual(Object.keys(inputs).slice(0, 3), seeds.map(seed => `seed${seed}-G-raw.json.gz`));
  const r = [{ seconds: 1, agents: [{ x: .1, y: .1 }] }, { seconds: 2, agents: [] },
    { seconds: 3, agents: [] }, { seconds: 4, agents: [{ x: .1, y: .1 }] }];
  const b = localGaps(r, 4).bins[0];
  assert.equal(b.completedEmptyRuns, 1); assert.equal(b.runs[0].emptySamples, 2);
  assert.deepEqual(b.runs[0].durationBracketSeconds, [1, 3]);
  assert.equal(localGaps(r, 4).bins[1].runs[0].leftCensored, true);
  assert.equal(localGaps(r, 4).bins[1].runs[0].rightCensored, true);
  assert.equal(hazard(1), 0); assert.equal(hazard(0), HIGH);
}
function run() {
  assert.ok(performance.now() - started < 30000, '30 s structural probe cost boundary');
  selfChecks();
  const before = sha(JSON.stringify([archives, frozen]));
  const result = { schema: 'ant-lifecycle-structural-probes-v1', baselineMain: 'aeefa12d8de9da400cb8a2a3d4b5080a21ba0292',
    researchParent: '12473f9ec8c7057ea033d9f72fa68c236c60bb50', inputs, sourceHashes,
    scope: { newNaturalRuns: 0, audio: 'none; inherited archives Audio Off', fieldFixtureDtSeconds: 1,
      cueSource: { tick: checkpoint.tick, simulationTimeMs: checkpoint.simulationTimeMs,
        width: 316, sha256: spec.sha256 },
      preflightReplacement: 'G600 saved 96-grid projection rejected; exact existing G119.016667 native checkpoint used' },
    archiveSummaries: archives.map(summarize), sourceFixtures: [false, true].map(sourceCueFixture) };
  assert.equal(sha(JSON.stringify([archives, frozen])), before);
  assert.ok(performance.now() - started < 30000, '30 s structural probe cost boundary');
  return JSON.stringify(result);
}
let first, second; const random = Math.random;
try { Math.random = () => { throw Error('structural probe RNG use'); }; first = run(); second = run(); }
finally { Math.random = random; }
assert.equal(first, second);
await mkdir(base, { recursive: true });
const target = resolve(base, 'structural-probes.json');
if (process.argv.includes('--check')) assert.equal(sha(await readFile(target)), sha(first + '\n'), 'saved output byte hash');
else {
  await assert.rejects(readFile(target), { code: 'ENOENT' });
  await writeFile(target, first + '\n');
  await writeFile(resolve(base, 'validation.json'), JSON.stringify({ resultSha256: sha(first + '\n'),
    runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))), deterministicDuplicate: true,
    inputUnchanged: true, mathRandomTripwire: true, selfChecks: true }, null, 2) + '\n');
}
const result = JSON.parse(first);
console.log(JSON.stringify({ archives: result.archiveSummaries.map(({ grids, ...s }) => ({ ...s,
  grids: grids.map(g => ({ grid: g.grid, visitedBins: g.bins.filter(b => b.occupiedSamples).length,
    binsWithCompletedEmptyRun: g.bins.filter(b => b.completedEmptyRuns).length,
    completedRunsAtLeast15EmptySamples: g.bins.reduce((n, b) => n + b.completedRunsAtLeast15EmptySamples, 0) })) })),
  sourceFixtures: result.sourceFixtures.map(f => ({ decay: f.decay, initialCue: f.initialCue,
    samples: f.rows.filter(r => [0, 15, 45, 90, 180, 300].includes(r.seconds)) })) }, null, 2));
