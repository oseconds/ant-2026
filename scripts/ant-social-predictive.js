import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { decodeFrame, densityMetrics, componentMembers } from './ant-social-evidence.js';
import { sourceInputs, assertSourcesUnchanged, replay } from './ant-social-null.js';
import { DynamicSocialGraph } from '../src/lib/agents/ant/DynamicSocialGraph.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = resolve(ROOT, 'docs/ant/evidence/2026-10-07-social-graph');
export const SEEDS = [20261005, 20261006, 20261007];
export const BASELINE = ['population', 'instantEdgeCount', 'instantLargestComponentRatio', 'meanNeighborsSenseRadius', 'meanSpeed'];
export const SOCIAL = ['rollingEdgeCount', 'weightedDegreeMean', 'rollingLargestComponentRatio'];
const WINDOWS = [1, 0.25], CONTROL_SEED = 'ANT-S2c-2026-10-08-training-control-v1';
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;

export function eventTick(event) {
  const tick = Math.round(event.timeSeconds * 60);
  assert.ok(Number.isFinite(event.timeSeconds) && Math.abs(event.timeSeconds - tick / 60) < 1e-6);
  assert.equal(tick % 3, 0, 'event on existing 20 Hz topology cadence');
  return tick;
}

export function futureMergeLabels(ticks, events, finalTick) {
  const merges = events.filter(event => event.type === 'COMPONENT_MERGE').map(eventTick).sort((a, b) => a - b);
  assert.ok(merges.every(tick => tick >= 0 && tick <= finalTick));
  return ticks.map(tick => {
    assert.ok(Number.isInteger(tick) && tick >= 0 && tick + 60 <= finalTick, 'complete future horizon');
    return Number(merges.some(merge => merge > tick && merge <= tick + 60));
  });
}

/** Features have no event/lifetime argument. Archived snapshot fields are contemporaneous only. */
export function causalFeatures(agents, graph, topologies) {
  const members = componentMembers(agents, [...graph.activeEncounters.values()]);
  const population = agents.length, density = densityMetrics(agents);
  const baseline = [population, graph.activeEncounters.size,
    population ? Math.max(0, ...members.map(group => group.length)) / population : 0,
    density.meanNeighborsSenseRadius,
    population ? agents.reduce((sum, ant) => sum + Math.hypot(ant.vx, ant.vy), 0) / population : 0];
  const social = Object.fromEntries(WINDOWS.map(windowSeconds => {
    const saved = topologies.find(item => item.distanceMultiplier === 2 && item.windowSeconds === windowSeconds);
    assert.ok(saved, 'saved causal topology required');
    const m = saved.topology.metrics;
    assert.equal(m.nodeCount, population);
    return [windowSeconds, [m.edgeCount,
      population ? m.weightedDegrees.reduce((sum, degree) => sum + degree.weightSeconds, 0) / population : 0,
      m.largestComponentRatio]];
  }));
  assert.ok([...baseline, ...Object.values(social).flat()].every(Number.isFinite));
  return { baseline, social };
}

export function extractSamples(source, timeline) {
  const graph = new DynamicSocialGraph({ distanceMultiplier: 2 }), samples = [];
  for (let tick = 0; tick < source.frames.length; tick += 1) {
    const { at, length, timeSeconds } = source.frames[tick];
    const agents = decodeFrame(source.bytes.subarray(at, at + length), source.ids).agents;
    graph.observe(timeSeconds, agents);
    if (tick === 0 || tick % 60 !== 0 || tick + 60 > source.frames.length - 1) continue;
    const saved = timeline[tick / 60 - 1];
    assert.ok(Math.abs(saved.seconds - timeSeconds) < 1e-6);
    assert.equal(saved.population, agents.length);
    const instant = saved.instant.find(row => row.distanceMultiplier === 2);
    assert.equal(instant.edgeCount, graph.activeEncounters.size);
    const { meanNeighborsCloseRange, meanNeighborsSenseRadius, occupancy } = instant;
    assert.deepEqual(densityMetrics(agents), { meanNeighborsCloseRange, meanNeighborsSenseRadius, occupancy }, 'reuse exact archived density');
    for (const w of WINDOWS) assert.ok(Math.abs(saved.topologies.find(item => item.distanceMultiplier === 2
      && item.windowSeconds === w).topology.timeSeconds - timeSeconds) < 1e-6, 'predictor snapshot is at t');
    samples.push({ tick, timeSeconds, availableThroughTick: tick, ...causalFeatures(agents, graph, saved.topologies) });
  }
  return samples;
}

function sigmoid(value) { return value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value)); }
function softplus(value) { return Math.max(0, value) + Math.log1p(Math.exp(-Math.abs(value))); }
function dot(a, b) { return a.reduce((sum, value, i) => sum + value * b[i], 0); }

function solve(matrix, rhs) {
  const a = matrix.map((row, i) => [...row, rhs[i]]), n = rhs.length;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    assert.ok(Math.abs(a[col][col]) > 1e-12, 'invertible regularized Hessian');
    const divisor = a[col][col];
    for (let j = col; j <= n; j += 1) a[col][j] /= divisor;
    for (let row = 0; row < n; row += 1) if (row !== col) {
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map(row => row[n]);
}

export function fitLogistic(x, y) {
  assert.ok(x.length > 0 && x.length === y.length && y.includes(0) && y.includes(1), 'both training classes required');
  const width = x[0].length;
  assert.ok(x.every(row => row.length === width && row.every(Number.isFinite)) && y.every(v => v === 0 || v === 1));
  const mean = Array.from({ length: width }, (_, j) => x.reduce((sum, row) => sum + row[j], 0) / x.length);
  const scale = mean.map((m, j) => Math.sqrt(x.reduce((sum, row) => sum + (row[j] - m) ** 2, 0) / x.length) || 1);
  const design = x.map(row => [1, ...row.map((value, j) => (value - mean[j]) / scale[j])]);
  const prevalence = y.reduce((sum, v) => sum + v, 0) / y.length;
  let beta = [Math.log(prevalence / (1 - prevalence)), ...Array(width).fill(0)], iterations = 0, gradientMax;
  // Fixed total-loss L2 penalty 0.5*sum(slope^2); no class weights, grid or held-out tuning.
  const objective = coefficients => design.reduce((sum, row, i) => {
    const z = dot(row, coefficients); return sum + softplus(z) - y[i] * z;
  }, 0) + coefficients.slice(1).reduce((sum, b) => sum + b * b / 2, 0);
  let converged = false;
  for (; iterations < 100; iterations += 1) {
    const gradient = beta.map((b, j) => j === 0 ? 0 : b), hessian = beta.map(() => beta.map(() => 0));
    for (let i = 0; i < design.length; i += 1) {
      const row = design[i], p = sigmoid(dot(row, beta)), weight = p * (1 - p);
      for (let j = 0; j < beta.length; j += 1) {
        gradient[j] += row[j] * (p - y[i]);
        for (let k = 0; k < beta.length; k += 1) hessian[j][k] += row[j] * row[k] * weight;
      }
    }
    for (let j = 1; j < beta.length; j += 1) hessian[j][j] += 1;
    gradientMax = Math.max(...gradient.map(Math.abs));
    if (gradientMax < 1e-7) { converged = true; break; }
    const step = solve(hessian, gradient), old = objective(beta);
    let fraction = 1, next;
    do { next = beta.map((b, j) => b - fraction * step[j]);
      if (objective(next) <= old) break; fraction /= 2;
    } while (fraction >= 2 ** -30);
    assert.ok(fraction >= 2 ** -30, 'Newton line search');
    beta = next;
  }
  assert.ok(converged, 'logistic fit must converge');
  return { mean, scale, beta, trainingRows: x.length, trainingPrevalence: prevalence,
    iterations, gradientMax, converged, objective: objective(beta), slopeL2Penalty: 1 };
}

export function predict(model, x) {
  return x.map(row => {
    assert.ok(row.length === model.mean.length && row.every(Number.isFinite));
    return sigmoid(dot([1, ...row.map((v, j) => (v - model.mean[j]) / model.scale[j])], model.beta));
  });
}

export function metrics(y, probabilities) {
  assert.ok(y.length && y.length === probabilities.length && y.every(v => v === 0 || v === 1));
  assert.ok(probabilities.every(p => Number.isFinite(p) && p >= 0 && p <= 1));
  const positives = y.reduce((sum, value) => sum + value, 0), negatives = y.length - positives;
  const sorted = probabilities.map((p, i) => ({ p, y: y[i] })).sort((a, b) => b.p - a.p);
  let tp = 0, fp = 0, auc = 0, ap = 0, beforeFpr = 0, beforeRecall = 0;
  const curve = [{ threshold: null, recall: 0, falsePositiveRate: 0, precision: 1 }];
  for (let i = 0; i < sorted.length;) {
    const p = sorted[i].p;
    do { tp += sorted[i].y; fp += 1 - sorted[i].y; i += 1; } while (i < sorted.length && sorted[i].p === p);
    const recall = positives ? tp / positives : 0, fpr = negatives ? fp / negatives : 0, precision = tp / (tp + fp);
    auc += (fpr - beforeFpr) * (recall + beforeRecall) / 2;
    ap += (recall - beforeRecall) * precision;
    curve.push({ threshold: p, recall, falsePositiveRate: fpr, precision });
    beforeFpr = fpr; beforeRecall = recall;
  }
  const calibration = Array.from({ length: 10 }, (_, bin) => {
    const ids = probabilities.flatMap((p, i) => Math.min(9, Math.floor(p * 10)) === bin ? [i] : []);
    return { lower: bin / 10, upper: (bin + 1) / 10, n: ids.length,
      meanPrediction: ids.length ? ids.reduce((sum, i) => sum + probabilities[i], 0) / ids.length : null,
      eventFraction: ids.length ? ids.reduce((sum, i) => sum + y[i], 0) / ids.length : null };
  });
  return { n: y.length, positives, negatives, prevalence: positives / y.length,
    rocAuc: positives && negatives ? auc : null, averagePrecision: positives ? ap : null,
    brier: y.reduce((sum, value, i) => sum + (probabilities[i] - value) ** 2, 0) / y.length,
    meanPrediction: probabilities.reduce((sum, p) => sum + p, 0) / y.length, calibration, curve };
}

export function fold(packets, heldOut) {
  assert.deepEqual(packets.map(p => p.seed).sort(), [...SEEDS].sort());
  assert.ok(SEEDS.includes(heldOut));
  return { training: packets.filter(p => p.seed !== heldOut).flatMap(p => p.samples.map(s => ({ ...s, seed: p.seed }))),
    evaluation: packets.find(p => p.seed === heldOut).samples.map(s => ({ ...s, seed: heldOut })),
    trainingSeeds: packets.filter(p => p.seed !== heldOut).map(p => p.seed), heldOutSeed: heldOut };
}

export function controlTraining(rows, heldOut, windowSeconds) {
  const shifts = {};
  const result = rows.map(row => ({ ...row, social: { ...row.social } }));
  for (const seed of [...new Set(rows.map(row => row.seed))]) {
    assert.notEqual(seed, heldOut, 'control may never touch held-out seed');
    const indices = rows.flatMap((row, i) => row.seed === seed ? [i] : []);
    assert.ok(indices.length > 1);
    const digest = createHash('sha256').update(JSON.stringify([CONTROL_SEED, heldOut, seed, windowSeconds])).digest();
    const shift = 1 + digest.readUInt32LE(0) % (indices.length - 1); shifts[seed] = shift;
    indices.forEach((at, j) => { result[at].social[windowSeconds] = [...rows[indices[(j + shift) % indices.length]].social[windowSeconds]]; });
  }
  return { rows: result, shifts };
}

export function evaluate(packets) {
  return WINDOWS.flatMap(windowSeconds => SEEDS.map(heldOut => {
    const f = fold(packets, heldOut), y = f.training.map(row => row.target), truth = f.evaluation.map(row => row.target);
    const control = controlTraining(f.training, heldOut, windowSeconds);
    const runs = {};
    for (const name of ['baseline', 'baselinePlusSocial', 'trainingShiftControl']) {
      const training = name === 'trainingShiftControl' ? control.rows : f.training;
      const select = row => name === 'baseline' ? row.baseline : [...row.baseline, ...row.social[windowSeconds]];
      const model = fitLogistic(training.map(select), y), probabilities = predict(model, f.evaluation.map(select));
      runs[name] = { features: name === 'baseline' ? BASELINE : [...BASELINE, ...SOCIAL], model, probabilities, metrics: metrics(truth, probabilities) };
    }
    const differences = name => Object.fromEntries(['rocAuc', 'averagePrecision', 'brier'].map(key => [key,
      runs[name].metrics[key] === null || runs.baseline.metrics[key] === null ? null : runs[name].metrics[key] - runs.baseline.metrics[key]]));
    return { windowSeconds, heldOutSeed: heldOut, trainingSeeds: f.trainingSeeds, evaluationTicks: f.evaluation.map(row => row.tick),
      truth, controlShiftsSamples: control.shifts, runs, incremental: differences('baselinePlusSocial'), controlIncremental: differences('trainingShiftControl') };
  }));
}

async function analysis() {
  const packets = [];
  for (const seed of SEEDS) {
    const { source, sourceHashes, archive } = await sourceInputs(seed);
    // Confirms existing archived merge semantics rather than redefining/reconstructing events.
    replay(source, source.bytes, null, archive);
    const samples = extractSamples(source, archive.timeline);
    const topology = archive.raw.topology.find(item => item.distanceMultiplier === 2 && item.windowSeconds === 1);
    assert.ok(topology, 'committed primary merge stream required');
    const target = futureMergeLabels(samples.map(row => row.tick), topology.events, source.frames.length - 1);
    samples.forEach((row, i) => { row.target = target[i]; });
    assert.equal(samples.length, 599);
    await assertSourcesUnchanged(sourceHashes);
    packets.push({ seed, sourceHashes, sourceUncompressedSha256: sha(source.bytes), samples,
      eligibleSamples: samples.length, positiveSamples: target.reduce((sum, y) => sum + y, 0),
      primaryMergeEventCount: topology.events.filter(event => event.type === 'COMPONENT_MERGE').length,
      sourceBytesUnchanged: true, exactObservedReplay: true });
  }
  const results = evaluate(packets);
  return { schemaVersion: 1, question: 'Do simple temporal social-graph observables add predictive information beyond raw spatial/movement predictors?',
    parameters: { seeds: SEEDS, seconds: 600, trajectoryHz: 60, archivedTopologyHz: 20, predictorSamplingHz: 1,
      eligibleSeconds: [1, 599], target: 'Any archived k=2/W=1 COMPONENT_MERGE in (t,t+1s]; compare integer 60Hz ticks.',
      targetWindowSeconds: 1, predictorWindowsSeconds: WINDOWS, baselineFeatures: BASELINE, socialFeatures: SOCIAL,
      model: 'Standardized logistic regression; fixed total-loss slope L2 penalty=1; unpenalized intercept; Newton fitting.',
      scaling: 'Population mean/SD from two training seeds only; zero SD becomes one.',
      controlSeed: CONTROL_SEED, control: 'One nonzero circular social-vector shift per training seed/fold/view; baseline and target fixed, held-out data untouched.',
      metrics: 'ROC trapezoidal threshold curve with exact tie groups; noninterpolated average precision; Brier; ten fixed calibration bins.',
      evaluation: 'Leave one natural seed out; no frame shuffle, class reweighting, held-out tuning or null trajectory data.' },
    packets, results };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map(process.argv.slice(2).map(value => { const [key, ...rest] = value.split('='); return [key, rest.join('=') || true]; }));
  const output = resolve(String(args.get('--output') || 'test-results/ant-s2c-predictive')), within = relative(SOURCE, output);
  assert.ok(within === '..' || within.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(within), 'source package cannot be an output');
  await mkdir(output, { recursive: true });
  const report = await analysis(), bytes = Buffer.from(json(report));
  if (args.has('--verify')) {
    const saved = await readFile(resolve(output, 'analysis.json'));
    assert.ok(bytes.equals(saved), 'independent complete extraction/fitting/evaluation byte-identical');
    console.log(JSON.stringify({ deterministicAnalysis: true, naturalSeeds: SEEDS, folds: report.results.length, sourceBytesUnchanged: true }));
  } else {
    await writeFile(resolve(output, 'analysis.json'), bytes);
    await writeFile(resolve(output, 'analysis.json.gz'), gzipSync(bytes, { level: 9 }));
    const summary = { schemaVersion: 1, parameters: report.parameters,
      seeds: report.packets.map(({ samples, ...p }) => ({ ...p, prevalence: p.positiveSamples / p.eligibleSamples })),
      results: report.results.map(r => ({ windowSeconds: r.windowSeconds, heldOutSeed: r.heldOutSeed, trainingSeeds: r.trainingSeeds,
        controlShiftsSamples: r.controlShiftsSamples, incremental: r.incremental, controlIncremental: r.controlIncremental,
        runs: Object.fromEntries(Object.entries(r.runs).map(([name, run]) => {
          const { curve, ...m } = run.metrics; return [name, { features: run.features, model: run.model, metrics: m }];
        })) })) };
    await writeFile(resolve(output, 'summary.json'), json(summary));
    const rows = ['predictorWindowSeconds,heldOutSeed,model,n,positives,prevalence,rocAuc,averagePrecision,brier,meanPrediction,deltaRocAuc,deltaAveragePrecision,deltaBrier'];
    for (const result of report.results) for (const [name, run] of Object.entries(result.runs)) {
      const m = run.metrics, delta = name === 'baselinePlusSocial' ? result.incremental : name === 'trainingShiftControl' ? result.controlIncremental : {};
      rows.push([result.windowSeconds, result.heldOutSeed, name, m.n, m.positives, m.prevalence, m.rocAuc,
        m.averagePrecision, m.brier, m.meanPrediction, delta.rocAuc, delta.averagePrecision, delta.brier].map(v => v ?? '').join(','));
    }
    await writeFile(resolve(output, 'comparisons.csv'), rows.join('\n') + '\n');
    console.log(JSON.stringify({ seeds: summary.seeds.map(p => ({ seed: p.seed, n: p.eligibleSamples, positives: p.positiveSamples })),
      results: summary.results.map(r => ({ windowSeconds: r.windowSeconds, heldOutSeed: r.heldOutSeed, incremental: r.incremental, control: r.controlIncremental })) }));
  }
}
