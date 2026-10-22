import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-10-22-recruitment-founder-survey');
const VARIANTS = ['baseline', 'rotate90', 'reverse', 'isotropic'];
const SEEDS = [20261005, 20261006, 20261007];
const ORIGIN = { x: 0.5, y: 0.72 };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

async function main() {
  const receipts = [], sourceHashesByRun = {}, rawFileSha256ByRun = {}, flow = [];
  for (const seed of SEEDS) {
    const baseline = await loadRun('baseline', seed);
    flow.push(flowAvailability(baseline));
    for (const variant of VARIANTS) {
      const run = variant === 'baseline' ? baseline : await loadRun(variant, seed);
      receipts.push(summarizeRun(run, baseline));
      sourceHashesByRun[`${variant}-${seed}`] = run.manifest.sourceHashes;
      rawFileSha256ByRun[`${variant}-${seed}`] = run.files;
    }
  }
  const output = {
    schemaVersion: 1,
    scope: 'Stage A matched 600 s static heading controls; continuous descriptive analysis, not independent frame-level inference',
    timeAverageWindowSeconds: [300, 600],
    sourceHashesByRun,
    rawFileSha256ByRun,
    runs: receipts,
    baselineFlowAvailability1Hz: flow,
    limitations: [
      'Three seed-level runs per variant; 1 Hz frames are serially dependent and are not independent replications.',
      'RNG parity is reported only through the first mismatch; shared-stream parity is not assumed afterward.',
      'Flow availability is estimated from 1 Hz captured frames and approximate last-tick segment midpoints, not all 60 Hz tick segments or the declared policy q.',
      'The finite domain and asymmetric boundary exits constrain interpretation; population and recruitment timing are endogenous consequences.',
      'Raw gyrationRadius is RMS distance from nest, not dispersion about the colony centroid; this analysis derives dispersion from covariance trace without modifying raw files.'
    ]
  };
  const outDir = resolve(EVIDENCE, 'analysis');
  await mkdir(outDir, { recursive: true });
  const jsonPath = resolve(outDir, 'stage-a-receipt.json');
  await writeFile(jsonPath, JSON.stringify(output, null, 2) + '\n');
  const summary = makeSummary(output, sha256(await readFile(jsonPath)), sha256(await readFile(fileURLToPath(import.meta.url))));
  const summaryPath = resolve(outDir, 'stage-a-summary.md');
  await writeFile(summaryPath, summary);
  console.log(JSON.stringify({ receipt: jsonPath, receiptSha256: sha256(await readFile(jsonPath)), summary: summaryPath }));
}

async function loadRun(variant, seed) {
  const dir = resolve(EVIDENCE, 'controls', `${variant}-${seed}`);
  const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.seconds, 600, `${variant}-${seed}: incomplete run`);
  assert.equal(manifest.capture.frameCount, 601, `${variant}-${seed}: frame count`);
  const frames = gunzipSync(await readFile(resolve(dir, 'frames.jsonl.gz'))).toString('utf8')
    .trimEnd().split(/\r?\n/).map(line => JSON.parse(line));
  const rng = gunzipSync(await readFile(resolve(dir, 'rng-trace-u32le.gz')));
  assert.equal(frames.length, 601, `${variant}-${seed}: decoded frames`);
  assert.equal(rng.length, manifest.ticks * 8, `${variant}-${seed}: RNG trace bytes`);
  const names = ['manifest.json', 'frames.jsonl.gz', 'rng-trace-u32le.gz', 'snapshots.json.gz', 'births.json'];
  const files = Object.fromEntries(await Promise.all(names.map(async name =>
    [name, sha256(await readFile(resolve(dir, name)))])));
  return { variant, seed, dir, manifest, frames, rng, files };
}

function summarizeRun(run, baseline) {
  const spawn = run.manifest.spawns.map(item => item.initialHeading);
  const expected = { baseline: -Math.PI / 2, rotate90: 0, reverse: Math.PI / 2, isotropic: null }[run.variant];
  const head = circular(spawn);
  const firstRngMismatch = run.variant === 'baseline' ? null : firstMismatch(run.rng, baseline.rng);
  const spawnDifferences = run.variant === 'baseline' ? null : compareSpawns(run.manifest.spawns, baseline.manifest.spawns);
  return {
    variant: run.variant, seed: run.seed,
    acceptedSpawns: run.manifest.spawns.length,
    spawnManipulation: { expectedCenterRadians: expected, observedCircularMeanRadians: head.angle,
      resultantLength: head.resultant, absoluteCircularCenterErrorRadians: expected === null ? null : angleDistance(head.angle, expected),
      angleRangeRadians: [Math.min(...spawn), Math.max(...spawn)] },
    events: run.manifest.eventCounts,
    rng: { finalCalls: run.manifest.rng.calls, finalState: run.manifest.rng.finalState,
      firstMismatchFromBaseline: firstRngMismatch },
    spawnTiming: spawnDifferences || { firstCallOrScheduleDifference: null, firstTimingDifference: null, acceptedCountDelta: 0, firstLengthDifferenceIndex: null },
    windows: { late300to600: averageWindow(run.frames, 300, 600), fullRange: descriptorRanges(run.frames),
      lag1Autocorrelation: autocorrelationSummary(run.frames, 1) },
    baselineParity: run.manifest.baselineParity,
    rawFiles: run.files
  };
}

function averageWindow(frames, start, end) {
  const rows = frames.filter(frame => frame.timeSeconds >= start && frame.timeSeconds <= end);
  const keys = ['centroidX', 'centroidY', 'southFraction', 'dispersionRg', 'population', 'polarization', 'angularMomentumSigned', 'angularMomentumAbsolute'];
  return Object.fromEntries(keys.map(key => [key, mean(rows.map(frame => value(frame, key)).filter(Number.isFinite))]));
}
function descriptorRanges(frames) {
  const keys = ['centroidX', 'centroidY', 'southFraction', 'dispersionRg', 'population', 'polarization', 'angularMomentumSigned', 'angularMomentumAbsolute'];
  return Object.fromEntries(keys.map(key => {
    const values = frames.map(frame => value(frame, key)).filter(Number.isFinite);
    return [key, values.length ? { min: Math.min(...values), p05: quantile(values, .05), median: quantile(values, .5), p95: quantile(values, .95), max: Math.max(...values) } : null];
  }));
}
function value(frame, key) {
  const a = frame.descriptors.ants;
  return ({ centroidX: () => a.centroid?.x, centroidY: () => a.centroid?.y,
    southFraction: () => a.angularOccupancy?.south,
    dispersionRg: () => a.covariance ? Math.sqrt(Math.max(0, a.covariance.xx + a.covariance.yy)) : null,
    population: () => frame.population,
    polarization: () => a.velocityPolarization?.magnitude,
    angularMomentumSigned: () => a.angularMomentum?.signed,
    angularMomentumAbsolute: () => a.angularMomentum?.absolute })[key]();
}
function autocorrelationSummary(frames, lag) {
  return Object.fromEntries(['centroidX', 'centroidY', 'southFraction', 'dispersionRg', 'population', 'polarization', 'angularMomentumSigned', 'angularMomentumAbsolute']
    .map(key => [key, autocorrelation(frames.map(frame => value(frame, key)), lag)]));
}
function flowAvailability(run) {
  const samples = run.frames.filter(frame => frame.timeSeconds > 0).map(frame => {
    const eligible = frame.agents.filter(agent => Number.isFinite(agent.vx) && Number.isFinite(agent.vy)).filter(agent => {
      const mx = agent.x - agent.vx / 120, my = agent.y - agent.vy / 120;
      const ox = mx - ORIGIN.x, oy = my - ORIGIN.y, speed = Math.hypot(agent.vx, agent.vy);
      return Math.hypot(ox, oy) > 0.018 && Math.hypot(ox, oy) <= 0.085 && speed >= 0.008 && ox * agent.vx + oy * agent.vy > 0;
    });
    const n = eligible.length;
    if (!n) return { n, valid: false, R: null };
    const sx = eligible.reduce((s, a) => s + a.vx / Math.hypot(a.vx, a.vy), 0) / n;
    const sy = eligible.reduce((s, a) => s + a.vy / Math.hypot(a.vx, a.vy), 0) / n;
    const R = Math.hypot(sx, sy);
    return { n, valid: n >= 3 && R > 1e-9, R };
  });
  const valid = samples.filter(s => s.valid);
  const counts = Object.fromEntries([...new Set(samples.map(s => s.n))].sort((a, b) => a - b).map(n => [n, samples.filter(s => s.n === n).length]));
  return { seed: run.seed, frames: samples.length, validFrames: valid.length, validFraction: valid.length / samples.length,
    eligibleCountDistribution: counts, conditionalR: valid.length ? { min: Math.min(...valid.map(s => s.R)), median: quantile(valid.map(s => s.R), .5), p95: quantile(valid.map(s => s.R), .95), max: Math.max(...valid.map(s => s.R)) } : null,
    estimate: '1 Hz frame availability; vx/vy are the captured post-collision last-tick velocity; position minus velocity/(2*60) approximates that tick-segment midpoint; not all-tick policy q' };
}
function firstMismatch(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i += 8) {
    if (a.readUInt32LE(i) !== b.readUInt32LE(i) || a.readUInt32LE(i + 4) !== b.readUInt32LE(i + 4))
      return { preTickRowIndexZeroBased: i / 8, boundarySeconds: i / 8 / 60, firstTickStartingAfterBoundary: i / 8 + 1,
        variantState: a.readUInt32LE(i), baselineState: b.readUInt32LE(i), variantCalls: a.readUInt32LE(i + 4), baselineCalls: b.readUInt32LE(i + 4) };
  }
  return a.length === b.length ? null : { preTickRowIndexZeroBased: Math.min(a.length, b.length) / 8, boundarySeconds: Math.min(a.length, b.length) / 8 / 60 };
}
function compareSpawns(a, b) {
  const n = Math.min(a.length, b.length);
  let firstAny = null, firstTime = null;
  for (let i = 0; i < n; i += 1) {
    const fields = ['simulationTimeMs', 'rngCallsBefore', 'rngCallsAfter'].filter(key => a[i][key] !== b[i][key]);
    if (fields.length && firstAny === null) firstAny = { index: i, fields,
      variant: Object.fromEntries(fields.map(key => [key, a[i][key]])),
      baseline: Object.fromEntries(fields.map(key => [key, b[i][key]])) };
    if (a[i].simulationTimeMs !== b[i].simulationTimeMs && firstTime === null) firstTime = { index: i,
      variantSeconds: a[i].simulationTimeMs / 1000, baselineSeconds: b[i].simulationTimeMs / 1000 };
  }
  return { firstCallOrScheduleDifference: firstAny, firstTimingDifference: firstTime,
    acceptedCountDelta: a.length - b.length, firstLengthDifferenceIndex: a.length === b.length ? null : n };
}
function circular(angles) { const x = mean(angles.map(Math.cos)), y = mean(angles.map(Math.sin)); return { angle: Math.atan2(y, x), resultant: Math.hypot(x, y) }; }
function angleDistance(a, b) { return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))); }
function mean(values) { return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null; }
function quantile(values, p) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]; }
function autocorrelation(values, lag) {
  const pairs = values.slice(lag).map((v, i) => [v, values[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 2) return null;
  const mx = mean(pairs.map(p => p[0])), my = mean(pairs.map(p => p[1]));
  const numerator = pairs.reduce((s, [a, b]) => s + (a - mx) * (b - my), 0);
  const denomX = pairs.reduce((s, [a]) => s + (a - mx) ** 2, 0), denomY = pairs.reduce((s, [, b]) => s + (b - my) ** 2, 0);
  return denomX && denomY ? numerator / Math.sqrt(denomX * denomY) : null;
}
function makeSummary(output, receiptHash, analyzerHash) {
  const lines = ['# Stage A static heading controls — analysis receipt', '',
    'Descriptive matched-seed analysis only. The three seeds are the replication units; 1 Hz frames are serially dependent.', '',
    '| Variant | Seed | Late centroid (x,y) | South fraction | Centroid dispersion Rg | Population | Polarization | |angular momentum| | First RNG mismatch | First spawn time divergence | Spawns (Δ baseline) |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|'];
  for (const r of output.runs) {
    const w = r.windows.late300to600, rng = r.rng.firstMismatchFromBaseline, timing = r.spawnTiming.firstTimingDifference;
    lines.push(`| ${r.variant} | ${r.seed} | ${fmt(w.centroidX)}, ${fmt(w.centroidY)} | ${fmt(w.southFraction)} | ${fmt(w.dispersionRg)} | ${fmt(w.population)} | ${fmt(w.polarization)} | ${fmt(w.angularMomentumAbsolute)} | ${rng ? `${fmt(rng.boundarySeconds)} s (row ${rng.preTickRowIndexZeroBased})` : 'none / baseline'} | ${timing ? `spawn ${timing.index}: ${fmt(timing.variantSeconds)} vs ${fmt(timing.baselineSeconds)} s` : 'none / baseline'} | ${r.acceptedSpawns} (${r.spawnTiming.acceptedCountDelta ?? 0}) |`);
  }
  lines.push('', 'RNG row `i` stores state/calls immediately before zero-based simulation tick `i`, at boundary `i/60 s`; “first tick starting after boundary” is `i+1` in the receipt.', '',
    '## Spawn manipulation check', '', '| Variant | Seed | Circular center error (rad) | Heading resultant |', '|---|---:|---:|---:|');
  for (const r of output.runs) lines.push(`| ${r.variant} | ${r.seed} | ${r.spawnManipulation.absoluteCircularCenterErrorRadians === null ? 'n/a (isotropic)' : fmt(r.spawnManipulation.absoluteCircularCenterErrorRadians)} | ${fmt(r.spawnManipulation.resultantLength)} |`);
  lines.push('', '## 1 Hz baseline outgoing-flow availability screen', '', '| Seed | Valid frames | Fraction | Conditional R median [p95] | eligible count distribution |', '|---:|---:|---:|---:|---|');
  for (const f of output.baselineFlowAvailability1Hz) lines.push(`| ${f.seed} | ${f.validFrames}/${f.frames} | ${fmt(f.validFraction)} | ${f.conditionalR ? `${fmt(f.conditionalR.median)} [${fmt(f.conditionalR.p95)}]` : 'none'} | ${JSON.stringify(f.eligibleCountDistribution)} |`);
  lines.push('', `Receipt SHA-256: \`${receiptHash}\``, `Analyzer SHA-256: \`${analyzerHash}\``, '',
    'Flow availability uses captured post-collision vx/vy from the last tick at 1 Hz snapshots, with midpoint approximated as position − velocity/(2×60). It does not establish all-tick availability or the direct/slow policy q.', '',
    '## Limits', '', ...output.limitations.map(s => `- ${s}`), '');
  return lines.join('\n');
}
function fmt(x) { return Number.isFinite(x) ? x.toFixed(4) : '—'; }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

// Self-check: a constant series has undefined lag autocorrelation; a shifted linear ramp is perfectly correlated.
assert.equal(autocorrelation([1, 1, 1], 1), null);
assert.ok(Math.abs(autocorrelation([1, 2, 3, 4], 1) - 1) < 1e-12);
