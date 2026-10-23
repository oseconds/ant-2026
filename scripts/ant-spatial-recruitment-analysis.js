import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_INPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-22-spatial-dynamics/recruitment/natural');
const FIELD_HASH = 'fb6d5caeafcbc009b1b373edb681d9e8505454d05924284822c4682fea261364';
const TAU = 2 * Math.PI;
const WINDOWS = [{ name: 'first300', first: 1, last: 300 }, { name: 'last300', first: 301, last: 600 }];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const METRICS = [
  'population', 'centroidRadial', 'centroidRelX', 'centroidRelY', 'gyrationRadius',
  'rmsRadiusFromNest', 'meanSpeed', 'velocityPolarization', 'angularMomentumSigned',
  'angularMomentumAbs', 'angularEntropy', 'angularMaxSector', 'pheromoneMass',
  'pheromoneCentroidRadial', 'pheromoneActivation', 'pheromoneAxisConcentration',
  'pheromoneAxisX', 'pheromoneAxisY'
];

/** Summarize the frozen six-run comparison without thresholding time-series states. */
export async function analyzeRecruitmentCases({ inputRoot = DEFAULT_INPUT } = {}) {
  const manifestPath = resolve(inputRoot, 'run-manifest.json');
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  assert.deepEqual(manifest.seeds, [20261005, 20261006, 20261007]);
  assert.deepEqual(manifest.policies, ['isotropic', 'flow']);
  assert.equal(manifest.seconds, 600);
  assert.equal(manifest.dtSeconds, 1 / 60);
  assert.equal(manifest.sourceHashes['scripts/ant-spatial-field.js'], FIELD_HASH);

  const cases = [];
  const caseFiles = [];
  for (const entry of manifest.cases) {
    const resultPath = resolve(ROOT, entry.output);
    const resultBytes = await readFile(resultPath);
    const result = JSON.parse(resultBytes);
    assert.equal(result.seed, entry.seed);
    assert.equal(result.label, entry.label);
    assert.equal(result.seconds, 600);
    assert.deepEqual(result.sourceHashes, manifest.sourceHashes);
    assert.equal(result.receipt.runDriverSha256, manifest.runDriverSha256);
    assert.equal(result.sourceHashes['scripts/ant-spatial-field.js'], FIELD_HASH);
    assert.equal(sha256(await readFile(resolve(dirnameOf(resultPath), 'source-snapshot', 'scripts__ant-spatial-recruitment-runs.js'))),
      manifest.runDriverSha256, 'case driver snapshot differs from the recorded execution hash');
    validateHeadingLaw(result, entry.recruitment);
    const row = { ...entry, result, inputSha256: sha256(resultBytes) };
    cases.push(row);
    caseFiles.push({ seed: entry.seed, recruitment: entry.recruitment, result: entry.output,
      sha256: row.inputSha256 });
  }
  assert.equal(cases.length, 6);

  const seedRows = [];
  const phasePortraits = [];
  for (const seed of manifest.seeds) {
    const isotropic = cases.find(row => row.seed === seed && row.recruitment === 'isotropic');
    const flow = cases.find(row => row.seed === seed && row.recruitment === 'flow');
    assert.ok(isotropic && flow, `missing paired cases for ${seed}`);
    assert.equal(isotropic.result.frames.length, 600);
    assert.equal(flow.result.frames.length, 600);
    seedRows.push(summarizePair(seed, isotropic.result, flow.result));
    for (let index = 0; index < 600; index += 1) {
      const isoFrame = isotropic.result.frames[index], flowFrame = flow.result.frames[index];
      phasePortraits.push({ seed, second: index + 1,
        isotropic: phasePoint(isoFrame), flow: phasePoint(flowFrame) });
    }
  }

  const report = {
    schemaVersion: 1,
    design: { seeds: manifest.seeds, seconds: manifest.seconds, dtSeconds: manifest.dtSeconds,
      windows: WINDOWS, comparison: 'production movement; exact isotropic heading versus actual current-tick outgoing-flow-conditioned heading',
      fieldHelperSha256: FIELD_HASH, runDriverSha256: manifest.runDriverSha256,
      sourceHashes: manifest.sourceHashes, manifestSha256: sha256(manifestBytes), caseFiles,
      interpretationLimit: 'Three paired natural seeds; descriptive trajectory summaries, not an inferential test or a regime classifier.' },
    cases: cases.map(row => ({ seed: row.seed, recruitment: row.recruitment,
      input: row.output, inputSha256: row.inputSha256,
      rngCalls: row.result.rngCalls, final: row.result.final,
      flowStats: row.result.flowStats, spawnFlowStats: row.result.spawnFlowStats,
      postInitSpawnInvalidFlowReasons: reasonCounts(row.result.spawnObservations.filter(event => event.tick > 0 && event.flow?.valid !== true)),
      initialFounderFlowReason: row.result.spawnObservations.find(event => event.tick === 0)?.flow?.reason ?? null,
      headingValidation: headingSummary(row.result, row.recruitment) })),
    pairedSummary: summarizeAcrossSeeds(seedRows),
    seedRows,
    continuousPhasePortraits: phasePortraits
  };

  const analysisDir = resolve(inputRoot, 'analysis');
  await mkdir(resolve(analysisDir, 'source-snapshot'), { recursive: true });
  const selfBytes = await readFile(fileURLToPath(import.meta.url));
  const selfHash = sha256(selfBytes);
  const selfSnapshot = resolve(analysisDir, 'source-snapshot', 'scripts__ant-spatial-recruitment-analysis.js');
  await writeFile(selfSnapshot, selfBytes);
  assert.equal(sha256(await readFile(selfSnapshot)), selfHash);
  report.analysisSource = { path: 'scripts/ant-spatial-recruitment-analysis.js', sha256: selfHash,
    frozenCopy: 'analysis/source-snapshot/scripts__ant-spatial-recruitment-analysis.js' };
  const jsonPath = resolve(analysisDir, 'paired-comparison.json');
  const markdownPath = resolve(analysisDir, 'ANALYSIS.md');
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, renderMarkdown(report));
  assert.equal(sha256(await readFile(fileURLToPath(import.meta.url))), selfHash,
    'analysis source changed during output generation');
  return { jsonPath, markdownPath, report };
}

function summarizePair(seed, iso, flow) {
  const windows = {};
  for (const window of WINDOWS) {
    const isoFrames = iso.frames.filter(frame => frame.second >= window.first && frame.second <= window.last);
    const flowFrames = flow.frames.filter(frame => frame.second >= window.first && frame.second <= window.last);
    const isotropic = summarizeFrames(isoFrames), flowDirected = summarizeFrames(flowFrames);
    const deltas = Object.fromEntries(METRICS.map(metric => [metric,
      finiteDelta(flowDirected[metric].mean, isotropic[metric].mean)]));
    windows[window.name] = { boundsSeconds: [window.first, window.last], isotropic, flow: flowDirected, deltaFlowMinusIsotropic: deltas,
      sectorOccupancy: { isotropic: meanSectors(isoFrames), flow: meanSectors(flowFrames),
        deltaFlowMinusIsotropic: subtractVectors(meanSectors(flowFrames), meanSectors(isoFrames)) },
      pheromoneSectorActivation: { isotropic: meanPheromoneSectors(isoFrames), flow: meanPheromoneSectors(flowFrames),
        deltaFlowMinusIsotropic: subtractVectors(meanPheromoneSectors(flowFrames), meanPheromoneSectors(isoFrames)) } };
  }
  return { seed, cases: {
    isotropic: { label: iso.label, spawnFlowStats: iso.spawnFlowStats, flowStats: iso.flowStats,
      rngCalls: iso.rngCalls, final: iso.final, spawnEventDivergence: null },
    flow: { label: flow.label, spawnFlowStats: flow.spawnFlowStats, flowStats: flow.flowStats,
      rngCalls: flow.rngCalls, final: flow.final, spawnEventDivergence: firstSpawnDivergence(iso, flow) }
  }, windows };
}

function summarizeFrames(frames) {
  const result = {};
  for (const metric of METRICS) result[metric] = summarizeSeries(frames.map(frame => metricValue(frame, metric)));
  return result;
}

function metricValue(frame, metric) {
  const ants = frame.ants, centroid = ants.centroid?.relativeToNest;
  switch (metric) {
    case 'population': return ants.count;
    case 'centroidRadial': return centroid ? Math.hypot(centroid.x, centroid.y) : null;
    case 'centroidRelX': return centroid?.x ?? null;
    case 'centroidRelY': return centroid?.y ?? null;
    case 'gyrationRadius': return ants.gyrationRadius;
    case 'rmsRadiusFromNest': return ants.rmsRadiusFromNest;
    case 'meanSpeed': return ants.meanSpeed;
    case 'velocityPolarization': return ants.velocityPolarization?.magnitude ?? null;
    case 'angularMomentumSigned': return ants.angularMomentum?.signed ?? null;
    case 'angularMomentumAbs': return ants.angularMomentum?.absolute ?? null;
    case 'angularEntropy': return entropy(ants.angularOccupancy?.sectors || []);
    case 'angularMaxSector': return Math.max(...(ants.angularOccupancy?.sectors || [0]));
    case 'pheromoneMass': return frame.pheromone.mass;
    case 'pheromoneCentroidRadial': {
      const point = frame.pheromone.centroid;
      return point ? Math.hypot(point.x - 0.5, point.y - 0.72) : null;
    }
    case 'pheromoneActivation': return frame.pheromone.activation;
    case 'pheromoneAxisConcentration': return frame.pheromone.orientation?.concentration ?? null;
    case 'pheromoneAxisX': return frame.pheromone.orientation ? Math.cos(frame.pheromone.orientation.angle) : null;
    case 'pheromoneAxisY': return frame.pheromone.orientation ? Math.sin(frame.pheromone.orientation.angle) : null;
    default: throw new Error(`unknown metric: ${metric}`);
  }
}

function summarizeSeries(values) {
  const valid = values.filter(Number.isFinite);
  const mean = valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  let variance = null;
  if (valid.length > 1) variance = valid.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (valid.length - 1);
  let cov = 0, pairCount = 0;
  if (valid.length > 1) {
    for (let index = 1; index < values.length; index += 1) {
      if (Number.isFinite(values[index]) && Number.isFinite(values[index - 1])) {
        cov += (values[index - 1] - mean) * (values[index] - mean);
        pairCount += 1;
      }
    }
  }
  const rho = variance > 0 && pairCount ? (cov / pairCount) / variance : null;
  return { count: valid.length, mean, sd: variance === null ? null : Math.sqrt(variance), lag1Autocorrelation: rho };
}

function meanSectors(frames) {
  const sectors = Array(16).fill(0), count = frames.length;
  if (!count) return sectors;
  for (const frame of frames) for (let i = 0; i < sectors.length; i += 1) sectors[i] += frame.ants.angularOccupancy.sectors[i] / count;
  return sectors;
}

function meanPheromoneSectors(frames) {
  const sectors = Array(16).fill(0), count = frames.length;
  if (!count) return sectors;
  for (const frame of frames) for (let i = 0; i < sectors.length; i += 1) sectors[i] += frame.pheromone.sectors[i] / count;
  return sectors;
}

function firstSpawnDivergence(iso, flow) {
  const count = Math.min(iso.spawnObservations.length, flow.spawnObservations.length);
  for (let index = 0; index < count; index += 1) {
    const a = iso.spawnObservations[index], b = flow.spawnObservations[index];
    const row = { index, isotropic: spawnPoint(a), flow: spawnPoint(b) };
    if (a.tick !== b.tick || a.id !== b.id || circularError(a.heading, b.heading) > 1e-12) return row;
  }
  if (iso.spawnObservations.length !== flow.spawnObservations.length) return {
    index: count, isotropic: spawnPoint(iso.spawnObservations[count] || null), flow: spawnPoint(flow.spawnObservations[count] || null)
  };
  return null;
}

function spawnPoint(row) {
  if (!row) return null;
  return { tick: row.tick, time: row.time, id: row.id, x: row.x, y: row.y,
    heading: row.heading, U: row.U, policy: row.policy, flowValid: row.flow?.valid === true,
    N: row.flow?.count ?? 0, R: row.flow?.R ?? 0, phi: row.flow?.phi ?? null };
}

function validateHeadingLaw(result, policy) {
  assert.equal(result.spawnObservations.length, result.spawnFlowStats.acceptedCount);
  assert.ok(result.spawnObservations.every(row => Number.isFinite(row.U) && row.U >= 0 && row.U < 1));
  const receipt = result.receipt;
  assert.equal(receipt.recruitment, policy);
  assert.equal(receipt.changes.length, 1, 'only recruitment heading substitution is expected');
  let maxError = 0, validFlowApplied = 0, invalidFallback = 0, initCount = 0;
  for (const row of result.spawnObservations) {
    let expected;
    if (policy === 'isotropic' || (policy === 'flow' && row.flow?.valid !== true)) {
      expected = -Math.PI + TAU * row.U;
      if (policy === 'flow') invalidFallback += 1;
    } else {
      const spread = Math.PI - (Math.PI - 0.3) * row.flow.R;
      expected = wrapAngle(row.flow.phi + (2 * row.U - 1) * spread);
      validFlowApplied += 1;
    }
    if (row.tick === 0) initCount += 1;
    maxError = Math.max(maxError, circularError(expected, row.heading));
  }
  assert.ok(maxError <= 1e-12, `heading law mismatch (${policy}): ${maxError}`);
  assert.equal(initCount, 1, 'each fresh controller must have one init spawn');
  if (policy === 'flow') assert.equal(validFlowApplied, result.spawnFlowStats.postInitFlowValidCount);
  return { policy, acceptedRows: result.spawnObservations.length, initialFounderCount: initCount,
    exactOneUniformRecordedPerAcceptedSpawn: true, validFlowHeadingsApplied: validFlowApplied,
    invalidExactIsotropicFallbacks: invalidFallback, maxCircularHeadingErrorRadians: maxError,
    rngCallsTotal: result.rngCalls, receiptChanges: receipt.changes };
}

function headingSummary(result, policy) {
  const valid = result.spawnObservations.filter(row => row.flow?.valid === true);
  const applied = result.spawnObservations.map(row => policy === 'isotropic' ? Math.PI
    : row.flow?.valid === true ? Math.PI - (Math.PI - 0.3) * row.flow.R : Math.PI);
  const spreadSummary = summarizeDistribution(applied);
  const validSpread = summarizeDistribution(valid.map(row => Math.PI - (Math.PI - 0.3) * row.flow.R));
  const validation = validateHeadingLaw(result, policy);
  return { ...validation, allAcceptedAppliedHalfSpread: spreadSummary,
    validFlowSpawnHalfSpread: validSpread, validFlowSpawnMeanR: valid.length
      ? valid.reduce((sum, row) => sum + row.flow.R, 0) / valid.length : null };
}

function summarizeAcrossSeeds(seedRows) {
  const summary = {};
  for (const window of WINDOWS) {
    summary[window.name] = {};
    for (const metric of METRICS) {
      const differences = seedRows.map(row => row.windows[window.name].deltaFlowMinusIsotropic[metric]).filter(Number.isFinite);
      summary[window.name][metric] = { seedDeltas: differences,
        meanSeedDelta: differences.length ? average(differences) : null,
        sdAcrossSeedDeltas: standardDeviation(differences), positiveSeeds: differences.filter(value => value > 0).length,
        negativeSeeds: differences.filter(value => value < 0).length, zeroSeeds: differences.filter(value => value === 0).length };
    }
  }
  return summary;
}

function phasePoint(frame) {
  const centroid = frame.ants.centroid?.relativeToNest;
  return { population: frame.ants.count, centroidRelX: centroid?.x ?? null, centroidRelY: centroid?.y ?? null,
    centroidRadial: centroid ? Math.hypot(centroid.x, centroid.y) : null,
    gyrationRadius: frame.ants.gyrationRadius,
    angularMomentumSigned: frame.ants.angularMomentum?.signed ?? null,
    angularEntropy: entropy(frame.ants.angularOccupancy.sectors),
    pheromoneMass: frame.pheromone.mass,
    pheromoneAxisAngle: frame.pheromone.orientation?.angle ?? null,
    pheromoneAxisConcentration: frame.pheromone.orientation?.concentration ?? null };
}

function renderMarkdown(report) {
  const caseRows = report.cases.map(row => {
    const spawn = row.spawnFlowStats, flow = row.flowStats, heading = row.headingValidation;
    return `| ${row.seed} | ${row.recruitment} | ${flow.validTicks}/${flow.totalTicks} (${percent(flow.validTicks / flow.totalTicks)}) | ${spawn.postInitFlowValidCount}/${spawn.postInitAcceptedCount} (${percent(spawn.postInitFlowValidFraction)}) | ${format(spawn.meanValidR)} | ${format(heading.allAcceptedAppliedHalfSpread.mean)} | ${format(spawn.potentialFlowHalfSpread.mean)} | ${row.rngCalls} | ${row.final.totalSpawned} / ${row.final.totalRetired} |`;
  }).join('\n');
  const metricRows = ['population', 'centroidRadial', 'gyrationRadius', 'meanSpeed', 'velocityPolarization',
    'angularMomentumSigned', 'angularEntropy', 'pheromoneMass', 'pheromoneAxisConcentration'].map(metric => {
    const perSeed = report.seedRows.map(row => format(row.windows.last300.deltaFlowMinusIsotropic[metric])).join(' / ');
    const summary = report.pairedSummary.last300[metric];
    return `| ${metric} | ${perSeed} | ${format(summary.meanSeedDelta)} | ${summary.positiveSeeds}-${summary.negativeSeeds}-${summary.zeroSeeds} |`;
  }).join('\n');
  const invalidRows = report.cases.map(row => `| ${row.seed} | ${row.recruitment} | ${formatReasons(row.flowStats.invalidReasons)} | ${formatReasons(row.postInitSpawnInvalidFlowReasons)} | ${row.initialFounderFlowReason || 'none'} |`).join('\n');
  const seedWindowRows = report.seedRows.flatMap(row => ['first300', 'last300'].map(window => {
    const iso = row.windows[window].isotropic, flow = row.windows[window].flow;
    return `| ${row.seed} | ${window} | ${format(iso.centroidRadial.mean)} ± ${format(iso.centroidRadial.sd)}; ρ₁ ${format(iso.centroidRadial.lag1Autocorrelation)} | ${format(flow.centroidRadial.mean)} ± ${format(flow.centroidRadial.sd)}; ρ₁ ${format(flow.centroidRadial.lag1Autocorrelation)} | ${format(row.windows[window].deltaFlowMinusIsotropic.centroidRadial)} |`;
  })).join('\n');
  const divergences = report.seedRows.map(row => {
    const event = row.cases.flow.spawnEventDivergence;
    const iso = row.cases.isotropic, flow = row.cases.flow;
    return `| ${row.seed} | ${event ? `${event.index} (${format(event.isotropic?.time)} s vs ${format(event.flow?.time)} s; U ${format(event.isotropic?.U)} / ${format(event.flow?.U)}; flow valid ${event.flow?.flowValid}; N=${event.flow?.N}, R=${format(event.flow?.R)}, phi=${format(event.flow?.phi)}; headings ${format(event.isotropic?.heading)} / ${format(event.flow?.heading)})` : 'none in shared events'} | ${iso.rngCalls} | ${flow.rngCalls} | ${iso.final.totalSpawned} | ${flow.final.totalSpawned} |`;
  }).join('\n');
  const sourceHashes = Object.entries(report.design.sourceHashes).map(([path, hash]) => `| \`${path}\` | \`${hash}\` |`).join('\n');
  return `# Direct outgoing-flow recruitment vs isotropic recruitment

## Design and provenance

Six fresh natural simulations compare production movement with the exact isotropic heading law or the preregistered current-tick outgoing-flow heading law. Each ran for 600 simulated seconds at 60 Hz, with seeds ${report.design.seeds.join(', ')}. This is a three-seed descriptive comparison; per-seed traces, not a statistical significance claim, are the evidence. The availability gate had already passed before these candidate runs.

Flow is measured from completed postcollision segments from the current tick before the accepted end-of-tick heading. Eligible segments use midpoint annulus ` + '`0.018 < r <= 0.085`' + `, speed at least ` + '`0.008`' + `, positive radial travel, one segment per distinct ant, and equal-weight unit displacement vectors. ` + '`N < 3`' + ` or zero resultant falls back to the exact isotropic heading ` + '`-π + 2πU`' + `. For valid flow, ` + '`theta = wrap(phi + (2U−1) * (π−(π−0.3)R))`' + `. No position remapping or additional random draw is used. Initialization is isotropic in both candidate arms because it has no completed movement; the old production north founder is not included in this pair.

Each run contains a source snapshot; the run driver hash is ` + `\`${report.design.runDriverSha256}\`` + `, and the field-helper hash is ` + `\`${report.design.fieldHelperSha256}\`` + `. The runner checked live source hashes before and after each run. Result-file hashes are in ` + '`paired-comparison.json`' + `.

| Seed | Policy | Valid all-tick flow | Accepted post-init spawns with valid flow | Mean R at valid flow spawns | Actual applied half-spread mean, all accepted (radians) | Flow-law spread mean at valid opportunities (radians) | Total RNG calls | Spawned / retired |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
${caseRows}

For isotropic cases, the all-accepted applied spread is ` + '`π`' + `, while the final spread column is a hypothetical flow-law spread computed at measured valid-flow spawn opportunities. For flow cases, the final column is the spread actually applied at valid-flow opportunities; all invalid-flow spawns remain isotropic. The accepted valid-flow count/fraction in the table is the fraction of post-init spawns that received the flow-directed heading in a flow case.

Invalid flow reason counts use each condition's own outcome history. The tick column covers all 36,000 ticks; the spawn column covers post-init accepted-spawn opportunities. The initialization founder has no completed travel and is listed separately.

| Seed | Policy | Invalid tick-flow reasons | Invalid post-init spawn-flow reasons | Initial founder flow reason |
|---:|---|---|---|---|
${invalidRows}

Applied heading validation reconstructed each accepted heading from its recorded ` + '`U`' + ` and flow record. Across all six runs, each accepted spawn has exactly one recorded heading uniform; isotropic headings and invalid-flow fallbacks match ` + '`-π + 2πU`' + `, and valid-flow headings match the fixed formula. Maximum circular reconstruction error was at most ` + '`1e-12 rad`' + `. The first accepted spawn is one isotropic initialization founder in every case. Later random-call totals and event times can diverge after different headings alter the natural simulation; equal initial seeds do not preserve downstream random streams.

## Continuous outcomes

The primary fixed window is seconds 301–600; seconds 1–300 is reported as a time-order comparison. Values below are paired mean differences (flow minus isotropic), one mean per run and then descriptive across three seeds. The full 600 one-second paired points per seed are retained as ` + '`continuousPhasePortraits`' + ` in the JSON output; these are continuous trajectories, not state or mode counts. Within-run SD and lag-one autocorrelation are shown separately for centroid radius.

| Metric | Per-seed last-300 s deltas (05 / 06 / 07) | Mean of three seed deltas | Positive-negative-zero seeds |
|---|---:|---:|---:|
${metricRows}

| Seed | Window | Isotropic centroid radius: mean ± SD; lag-1 ρ | Flow centroid radius: mean ± SD; lag-1 ρ | Flow − isotropic mean |
|---:|---|---:|---:|---:|
${seedWindowRows}

The paired centroids and continuous descriptors should be read alongside each seed’s time series. These summaries do not call a persistent spatial regime, biological role, or material improvement. Pheromone axis is the runner’s directional resultant from its 16 sampled radial-sector activations; null angles are excluded from its angle-derived metrics, and the valid count is recorded by ` + '`count`' + ` in each JSON series summary.

## Divergence and limits

| Seed | First event-order difference (index; isotropic vs flow time; headings) | Isotropic RNG calls | Flow RNG calls | Isotropic spawned | Flow spawned |
|---:|---|---:|---:|---:|---:|
${divergences}

Event-order indices in the table are zero-based within each accepted-spawn record. The flow policy conditions only accepted-spawn heading on a signed local transport estimate. Valid-flow exposure is reported separately at every tick and at accepted spawn times; invalid ticks use isotropic headings. These runs do not isolate the flow estimator from endogenous availability changes after trajectories diverge. No pheromone-conditioned recruitment, movement alternative, combined mechanism, or longer extension is included. Material remains a downstream readout of unchanged production selection/history and should not be interpreted as renewed empty space or as evidence of a biological process.

The run outputs, snapshots, continuous frame traces, spawn event records, source hashes, and exact ` + '`U`' + ` values remain in the six sibling case folders. This pass makes no production adoption decision.
`;
}

function entropy(values) {
  const nonzero = values.filter(value => value > 0);
  return nonzero.length ? -nonzero.reduce((sum, value) => sum + value * Math.log(value), 0) / Math.log(16) : 0;
}
function subtractVectors(a, b) { return a.map((value, index) => value - b[index]); }
function finiteDelta(a, b) { return Number.isFinite(a) && Number.isFinite(b) ? a - b : null; }
function average(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function standardDeviation(values) {
  if (values.length < 2) return null;
  const mean = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}
function summarizeDistribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, mean: null, p50: null, p90: null };
  const quantile = p => sorted[Math.round((sorted.length - 1) * p)];
  return { count: sorted.length, mean: average(sorted), p50: quantile(0.5), p90: quantile(0.9) };
}
function reasonCounts(rows) {
  return rows.reduce((counts, row) => {
    const reason = row.flow?.reason || 'missing-or-invalid';
    counts[reason] = (counts[reason] || 0) + 1;
    return counts;
  }, {});
}
function formatReasons(reasons) {
  const entries = Object.entries(reasons || {});
  return entries.length ? entries.map(([reason, count]) => `${reason}: ${count}`).join(', ') : 'none';
}
function wrapAngle(value) { return ((value + Math.PI) % TAU + TAU) % TAU - Math.PI; }
function circularError(a, b) { return Math.abs(wrapAngle(a - b)); }
function percent(value) { return Number.isFinite(value) ? `${(100 * value).toFixed(2)}%` : 'n/a'; }
function format(value) { return Number.isFinite(value) ? value.toFixed(4) : 'n/a'; }
function dirnameOf(path) { return path.slice(0, path.lastIndexOf('/') >= 0 ? path.lastIndexOf('/') : path.lastIndexOf('\\')); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map(process.argv.slice(2).map(value => {
    const at = value.indexOf('=');
    return at < 0 ? [value, true] : [value.slice(0, at), value.slice(at + 1)];
  }));
  const inputRoot = args.has('--input-root') ? resolve(String(args.get('--input-root'))) : DEFAULT_INPUT;
  const { jsonPath, markdownPath } = await analyzeRecruitmentCases({ inputRoot });
  console.log(JSON.stringify({ jsonPath, markdownPath }));
}
