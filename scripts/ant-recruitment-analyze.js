import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createGunzip, gunzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-10-22-recruitment-founder-survey');
const VARIANTS = ['baseline', 'rotate90', 'reverse', 'isotropic'];
const SEEDS = [20261005, 20261006, 20261007];
const ORIGIN = { x: 0.5, y: 0.72 };
const CLI = new Set(process.argv.slice(2));

async function main() {
  const outDir = resolve(EVIDENCE, 'analysis');
  assert.ok(!(await exists(resolve(outDir, 'stage-a-receipt.json'))) && !(await exists(resolve(outDir, 'stage-a-summary.md'))),
    'Stage A outputs already exist; refusing to overwrite the frozen receipt');
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
  await mkdir(outDir, { recursive: true });
  const jsonPath = resolve(outDir, 'stage-a-receipt.json');
  await writeFile(jsonPath, JSON.stringify(output, null, 2) + '\n');
  const summary = makeSummary(output, sha256(await readFile(jsonPath)), sha256(await readFile(fileURLToPath(import.meta.url))));
  const summaryPath = resolve(outDir, 'stage-a-summary.md');
  await writeFile(summaryPath, summary);
  console.log(JSON.stringify({ receipt: jsonPath, receiptSha256: sha256(await readFile(jsonPath)), summary: summaryPath }));
}

async function mainStageB() {
  const outDir = resolve(EVIDENCE, 'analysis');
  const revision = CLI.has('--revision2') ? '-v2' : '';
  const receiptName = `stage-b${revision}-receipt.json`, summaryName = `stage-b${revision}-summary.md`;
  assert.ok(!(await exists(resolve(outDir, receiptName))) && !(await exists(resolve(outDir, summaryName))),
    'Stage B outputs already exist; refusing to overwrite the frozen receipt');
  const shortRuns = [], longRuns = [];
  for (const variant of ['pheromoneDirect', 'pheromoneSlow']) for (const seed of SEEDS)
    shortRuns.push(await loadStageBRun(`conditioning/${variant}-${seed}`, variant, seed, 600));
  for (const variant of ['baseline', 'isotropic', 'pheromoneDirect', 'pheromoneSlow'])
    longRuns.push(await loadStageBRun(`extension/${variant}-20261005`, variant, 20261005, 1800));

  const stageAReceiptPath = resolve(EVIDENCE, 'analysis/stage-a-receipt.json');
  const stageAReceiptBytes = await readFile(stageAReceiptPath);
  const stageAReceipt = JSON.parse(stageAReceiptBytes);
  const stageAHash = sha256(stageAReceiptBytes);
  assert.equal(stageAHash, 'a38c8adc22633f7d3123ab576bb31f9cb68d3629514d8607809401bb104a4fb6', 'Stage A receipt changed after its frozen analysis');
  const stageAPrefixChecks = [];
  for (const variant of ['baseline', 'isotropic']) {
    const oldRun = await loadStageBRun(`controls/${variant}-20261005`, variant, 20261005, 600);
    const long = longRuns.find(run => run.variant === variant);
    stageAPrefixChecks.push(await comparePrefix(oldRun, long, 600));
  }

  const stageAMaterial = [], stageAReferenceRuns = [];
  for (const variant of ['baseline', 'rotate90', 'reverse', 'isotropic']) for (const seed of SEEDS) {
    const run = await loadStageBRun(`controls/${variant}-${seed}`, variant, seed, 600);
    stageAReferenceRuns.push(run);
    stageAMaterial.push({ variant, seed, durationSeconds: 600, material: compactMaterial(materialSummary(JSON.parse(await readFile(resolve(run.dir, 'births.json'), 'utf8')).plates)) });
  }
  const comparisonRuns = [...shortRuns, ...longRuns, ...stageAReferenceRuns];
  const material = [];
  for (const run of [...shortRuns, ...longRuns]) {
    if (run.seconds === 600) {
      const births = JSON.parse(await readFile(resolve(run.dir, 'births.json'), 'utf8'));
      material.push({ variant: run.variant, seed: run.seed, durationSeconds: 600, material: compactMaterial(materialSummary(births.plates)) });
    } else {
      const snapshots = JSON.parse(gunzipSync(await readFile(resolve(run.dir, 'snapshots.json.gz'))).toString('utf8'));
      const at600 = findSnapshot(snapshots, 600).snapshot.surfacePlates.plates;
      const at1800 = findSnapshot(snapshots, 1800).snapshot.surfacePlates.plates;
      const first = materialSummary(at600), final = materialSummary(at1800);
      const earlyIds = new Set(at600.map(plate => plate.id));
      const late = at1800.filter(plate => !earlyIds.has(plate.id));
      const lateSummary = materialSummary(late);
      material.push({ variant: run.variant, seed: run.seed, durationSeconds: 600,
        material: { ...compactMaterial(first), cohort0to600: compactMaterial(first), cohort600to1800: compactMaterial(lateSummary),
          cohortUnionJaccard: setJaccard(first.coveredCells, lateSummary.coveredCells),
          newCellsAfter600: differenceCount(lateSummary.coveredCells, first.coveredCells), final1800: compactMaterial(final) } });
    }
  }
  const receipt = {
    schemaVersion: 1,
    scope: 'Stage B selected pheromone-sector conditioning; 600 s matched seeds and fixed seed-20261005 1800 s persistence screen',
    preregisteredPolicy: { variants: ['pheromoneDirect', 'pheromoneSlow'], sectors: 16, radii: [0.06, 0.09, 0.12],
      halfSaturation: 0.04, spread: 'pi-(pi-0.3)*R', slowTauSeconds: 45, zeroSignal: 'matched isotropic',
      tickLag: 'completed-tick field evidence is available to next tick; init has no evidence and is isotropic' },
    stageAReceiptSha256: stageAHash,
    ...(revision ? { supersedesStageBReceiptSha256: 'c01609b9e06447d52dd1b9f59f8c156ea280605f773cb3b936e5d48f578523bf',
      prefixComparisonRevision: '1 Hz timestamp labels are rounded to the nearest integer second; agent position/heading/velocity/population and canonical snapshot values are still compared exactly.' } : {}),
    stageAAnalyzerSha256: '5e2461eca17473f67e49bd758d57f0ab09dec074c675abc84972b934b93efbcf',
    sourceHashesByRun: Object.fromEntries([...shortRuns, ...longRuns].map(run => [run.key, run.manifest.sourceHashes])),
    rawFilesSha256ByRun: Object.fromEntries([...shortRuns, ...longRuns].map(run => [run.key, run.files])),
    shortRuns: shortRuns.map(run => stageBRunSummary(run, comparisonRuns)),
    longRuns: longRuns.map(run => stageBRunSummary(run, comparisonRuns)),
    stageAPrefixChecks,
    material: { stageA: stageAMaterial, stageB: material },
    limits: [
      'Three seed-level matched runs per short variant; 1 Hz samples are serially dependent and are not independent replications.',
      'The 1800 s extension uses one preselected seed and diagnoses persistence only; it is not multi-seed or hours-long validation.',
      'RNG coupling is reported only to the first mismatch; no later pairing is assumed.',
      'Policy and persistence diagnostics sampled at 1 Hz describe the recorded condition state, not every tick unless explicitly recorded in the manifest.',
      'Material descriptors are downstream summaries of unchanged birth masks; they do not establish perceptual success or motivate selector changes.'
    ]
  };
  const jsonPath = resolve(outDir, receiptName);
  await writeFile(jsonPath, JSON.stringify(receipt, null, 2) + '\n');
  const jsonHash = sha256(await readFile(jsonPath));
  const scriptHash = sha256(await readFile(fileURLToPath(import.meta.url)));
  const summaryPath = resolve(outDir, summaryName);
  await writeFile(summaryPath, stageBSummary(receipt, jsonHash, scriptHash));
  console.log(JSON.stringify({ receipt: jsonPath, receiptSha256: jsonHash, summary: summaryPath, stageAReceiptSha256: stageAHash }));
}

async function mainCorrectedWindows() {
  const outDir = resolve(EVIDENCE, 'analysis'), outputPath = resolve(outDir, 'matched-window-correction.json');
  assert.ok(!(await exists(outputPath)), 'Corrected window receipt already exists; refusing to overwrite it');
  const rows = [];
  for (const variant of VARIANTS) for (const seed of SEEDS) {
    const run = await loadRun(variant, seed);
    rows.push(correctedWindowRow('stage-a-control', run, 300, 600));
  }
  for (const variant of ['pheromoneDirect', 'pheromoneSlow']) for (const seed of SEEDS) {
    const run = await loadStageBRun(`conditioning/${variant}-${seed}`, variant, seed, 600);
    rows.push(correctedWindowRow('stage-b-conditioned', run, 300, 600));
  }
  for (const variant of ['baseline', 'isotropic', 'pheromoneDirect', 'pheromoneSlow']) {
    const run = await loadStageBRun(`extension/${variant}-20261005`, variant, 20261005, 1800);
    rows.push(correctedWindowRow('stage-b-extension', run, 300, 600), correctedWindowRow('stage-b-extension', run, 600, 1800));
  }
  const receipt = {
    schemaVersion: 1,
    scope: 'Single corrected descriptive receipt for every Stage A/B late 300–600 s comparison and 600–1800 s extension window; raw artifacts unchanged.',
    selection: { rule: 'select 1 Hz rows by Math.round(raw timeSeconds) in the inclusive integer-second range', windows: { primary: [300, 600], extension: [600, 1800] },
      expectedCounts: { primary: 301, extension: 1201 }, maxAllowedAbsoluteTimestampDeviationSeconds: 1e-6,
      reason: 'Floating accumulation labels nominal integer-second capture ticks just below/above boundaries; exact float comparisons dropped nominal endpoint ticks.' },
    stageAReceiptSha256: sha256(await readFile(resolve(EVIDENCE, 'analysis/stage-a-receipt.json'))),
    stageBFirstPassReceiptSha256: sha256(await readFile(resolve(EVIDENCE, 'analysis/stage-b-receipt.json'))),
    stageBV2ReceiptSha256: sha256(await readFile(resolve(EVIDENCE, 'analysis/stage-b-v2-receipt.json'))),
    runs: rows,
    limits: ['Each time sample is serially dependent; seeds/runs, not 1 Hz frames, are replication units.',
      'Stage B extension is one seed and describes persistence only; comparisons remain descriptive.',
      'Corrected nominal window selection does not alter or rewrite raw frame timestamps or any prior receipt.']
  };
  await writeFile(outputPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ receipt: outputPath, receiptSha256: sha256(await readFile(outputPath)), runWindowRows: rows.length }));
}

function correctedWindowRow(stage, run, start, end) {
  const selected = run.frames.filter(frame => {
    const nominal = Math.round(frame.timeSeconds);
    assert.ok(Math.abs(frame.timeSeconds - nominal) <= 1e-6, `${run.key ?? `${run.variant}-${run.seed}`}: unexpected 1 Hz timestamp ${frame.timeSeconds}`);
    return nominal >= start && nominal <= end;
  });
  const metrics = ['centroidX', 'centroidY', 'southFraction', 'dispersionRg', 'population', 'polarization', 'angularMomentumSigned', 'angularMomentumAbsolute'];
  return { stage, key: run.key ?? `${run.variant}-${run.seed}`, variant: run.variant, seed: run.seed, durationSeconds: run.seconds ?? 600,
    nominalWindowSeconds: [start, end], selectedFrameCount: selected.length,
    firstRawTimestampSeconds: selected[0]?.timeSeconds ?? null, lastRawTimestampSeconds: selected.at(-1)?.timeSeconds ?? null,
    maxAbsoluteTimestampDeviationSeconds: selected.length ? Math.max(...selected.map(frame => Math.abs(frame.timeSeconds - Math.round(frame.timeSeconds)))) : null,
    means: Object.fromEntries(metrics.map(key => [key, mean(selected.map(frame => value(frame, key)).filter(Number.isFinite))])),
    rawFrameFileSha256: run.files['frames.jsonl.gz'] };
}

async function loadStageBRun(relative, variant, seed, seconds) {
  const dir = resolve(EVIDENCE, relative), manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.variant, variant, `${relative}: variant`);
  assert.equal(manifest.seed, seed, `${relative}: seed`);
  assert.equal(manifest.seconds, seconds, `${relative}: complete run`);
  const frames = [], prefixDigest = createHash('sha256');
  let frameCount = 0;
  const lines = createInterface({ input: createReadStream(resolve(dir, 'frames.jsonl.gz')).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) {
    const row = JSON.parse(line);
    frameCount += 1;
    if (row.timeSeconds <= 600 + 1e-9) prefixDigest.update(JSON.stringify({ timeSeconds: Math.round(row.timeSeconds),
      agents: row.agents.map(a => [a.id, a.x, a.y, a.heading, a.vx, a.vy]), population: row.population }) + '\n');
    frames.push(slimFrame(row));
  }
  assert.equal(frameCount, seconds + 1, `${relative}: frames`);
  const rng = gunzipSync(await readFile(resolve(dir, 'rng-trace-u32le.gz')));
  assert.equal(rng.length, manifest.ticks * 8, `${relative}: RNG length`);
  const files = Object.fromEntries(await Promise.all(['manifest.json', 'frames.jsonl.gz', 'rng-trace-u32le.gz', 'snapshots.json.gz', 'births.json']
    .map(async name => [name, sha256(await readFile(resolve(dir, name)))])));
  const compactManifest = { variant: manifest.variant, seed: manifest.seed, seconds: manifest.seconds, ticks: manifest.ticks,
    sourceHashes: manifest.sourceHashes, spawns: manifest.spawns, rng: manifest.rng,
    finalPopulation: manifest.finalPopulation, eventCounts: manifest.eventCounts };
  return { key: relative.replaceAll('/', '\\'), dir, variant, seed, seconds, manifest: compactManifest, frames, rng, files,
    prefixFrameDigest: prefixDigest.digest('hex'), frameCount };
}

function slimFrame(frame) {
  const a = frame.descriptors.ants;
  return { timeSeconds: frame.timeSeconds, population: frame.population,
    conditioning: frame.conditioning,
    descriptors: { ants: { centroid: a.centroid, angularOccupancy: a.angularOccupancy, covariance: a.covariance,
      velocityPolarization: a.velocityPolarization, angularMomentum: a.angularMomentum } } };
}

function stageBRunSummary(run, allRuns) {
  const matches = allRuns.filter(other => other.seed === run.seed && (other.variant === 'baseline' || other.variant === 'isotropic'));
  const rngAgainst = Object.fromEntries(matches.filter(other => other.key !== run.key)
    .map(other => [`${other.variant}:${other.seconds}s`, compareRngPrefix(run.rng, other.rng)]));
  const spawns = run.manifest.spawns || [];
  const evidence = spawns.map(spawn => spawn.headingEvidence).filter(Boolean);
  const R = evidence.map(item => item.R).filter(Number.isFinite);
  const spawnCuePairs = evidence.map(item => ({
    qTotalWeight: item.input?.q?.totalWeight,
    qR: item.input?.q?.R,
    gMagnitude: item.input?.g ? Math.hypot(item.input.g.x, item.input.g.y) : null,
    appliedR: item.R
  })).filter(pair => Number.isFinite(pair.qTotalWeight) && Number.isFinite(pair.qR) && Number.isFinite(pair.appliedR));
  const headings = spawns.map(item => item.initialHeading).filter(Number.isFinite);
  const conditionFrames = run.frames.filter(frame => frame.conditioning);
  const lagMs = conditionFrames.map(frame => frame.conditioning.observationLagMs).filter(Number.isFinite);
  const cond = conditionFrames.map(frame => frame.conditioning);
  const series = {
    centroidX: run.frames.map(frame => value(frame, 'centroidX')),
    centroidY: run.frames.map(frame => value(frame, 'centroidY')),
    southFraction: run.frames.map(frame => value(frame, 'southFraction')),
    dispersionRg: run.frames.map(frame => value(frame, 'dispersionRg')),
    population: run.frames.map(frame => value(frame, 'population')),
    polarization: run.frames.map(frame => value(frame, 'polarization')),
    angularMomentumSigned: run.frames.map(frame => value(frame, 'angularMomentumSigned')),
    qx: cond.map(c => c.q?.x), qy: cond.map(c => c.q?.y), qR: cond.map(c => c.q?.R),
    qTotalWeight: cond.map(c => c.q?.totalWeight),
    gx: cond.map(c => c.g?.x), gy: cond.map(c => c.g?.y), gR: cond.map(c => c.g ? Math.hypot(c.g.x, c.g.y) : null)
  };
  const lags = [1, 10, 45, 60, 300];
  return { key: run.key, variant: run.variant, seed: run.seed, seconds: run.seconds,
    acceptedSpawns: spawns.length, finalPopulation: run.manifest.finalPopulation, events: run.manifest.eventCounts,
    rng: { finalCalls: run.manifest.rng.calls, finalState: run.manifest.rng.finalState, firstMismatchAgainst: rngAgainst },
    spawnEvidence: { evidenceCount: evidence.length, headingResultant: circular(headings), appliedR: R.length ? summarizeValues(R) : null,
      cueStrengthAndCoherence: summarizeCuePairs(spawnCuePairs),
      cueScatter: spawnCuePairs,
      zeroOrUndefinedFraction: evidence.length ? evidence.filter(item => !(item.R > 1e-9)).length / evidence.length : null,
      inputObservationLagMs: lagMs.length ? summarizeValues(lagMs) : null,
      headingRuleMaxAbsError: headingRuleError(spawns, run.variant) },
    windows: { early0to600: averageWindow(run.frames, 0, Math.min(600, run.seconds)),
      late300to600: averageWindow(run.frames, 300, Math.min(600, run.seconds)),
      late600toEnd: run.seconds > 600 ? averageWindow(run.frames, 600, run.seconds) : null,
      fullRange: descriptorRanges(run.frames),
      lagAutocorrelation: Object.fromEntries(Object.entries(series).map(([name, values]) => [name,
        Object.fromEntries(lags.map(lag => [lag, autocorrelation(values, lag)]))])) },
    conditioningState: summarizeConditioning(cond),
    rawFiles: run.files };
}

function summarizeConditioning(condition) {
  if (!condition.length) return null;
  const result = {};
  for (const key of ['qTotalWeight', 'qR', 'gR', 'qx', 'qy', 'gx', 'gy', 'lagMs']) {
    const values = condition.map(c => key === 'qTotalWeight' ? c.q?.totalWeight : key === 'qR' ? c.q?.R : key === 'gR' ? c.g ? Math.hypot(c.g.x, c.g.y) : null
      : key === 'qx' ? c.q?.x : key === 'qy' ? c.q?.y : key === 'gx' ? c.g?.x : key === 'gy' ? c.g?.y : c.observationLagMs).filter(Number.isFinite);
    result[key] = summarizeValues(values);
  }
  result.cueStrengthAndCoherence = summarizeCuePairs(condition.map(c => ({ qTotalWeight: c.q?.totalWeight,
    qR: c.q?.R, gMagnitude: c.g ? Math.hypot(c.g.x, c.g.y) : null,
    appliedMagnitude: c.vector ? Math.hypot(c.vector.x, c.vector.y) : null,
    appliedR: c.R })).filter(pair => Number.isFinite(pair.qTotalWeight) && Number.isFinite(pair.qR)));
  result.frames = condition.length;
  return result;
}

function summarizeCuePairs(pairs) {
  const fields = ['qTotalWeight', 'qR', 'gMagnitude', 'appliedMagnitude', 'appliedR'];
  const stats = Object.fromEntries(fields.map(field => [field, summarizeValues(pairs.map(pair => pair[field]).filter(Number.isFinite))]));
  const correlations = {};
  for (const right of ['qR', 'gMagnitude', 'appliedMagnitude', 'appliedR']) {
    correlations[`qTotalWeight:${right}`] = pearson(pairs.map(pair => [pair.qTotalWeight, pair[right]]));
  }
  return { count: pairs.length, stats, pearson: correlations };
}

function pearson(rows) {
  const pairs = rows.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 2) return null;
  const mx = mean(pairs.map(([x]) => x)), my = mean(pairs.map(([, y]) => y));
  const numerator = pairs.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0);
  const denomX = pairs.reduce((sum, [x]) => sum + (x - mx) ** 2, 0);
  const denomY = pairs.reduce((sum, [, y]) => sum + (y - my) ** 2, 0);
  return denomX && denomY ? numerator / Math.sqrt(denomX * denomY) : null;
}

async function comparePrefix(stageA, longRun, seconds) {
  const oldBytes = stageA.rng.subarray(0, seconds * 60 * 8), newBytes = longRun.rng.subarray(0, seconds * 60 * 8);
  const oldSnapshotSha256 = await snapshotSha256At(stageA, seconds);
  const newSnapshotSha256 = await snapshotSha256At(longRun, seconds);
  return { variant: stageA.variant, seed: stageA.seed, seconds,
    rngTraceExact: oldBytes.equals(newBytes), firstRngMismatch: firstMismatch(oldBytes, newBytes),
    sampledAgentFramesExact: stageA.prefixFrameDigest === longRun.prefixFrameDigest,
    stageAFrameDigest: stageA.prefixFrameDigest, longPrefixFrameDigest: longRun.prefixFrameDigest,
    snapshot600Exact: oldSnapshotSha256 === newSnapshotSha256,
    stageASnapshotSha256: oldSnapshotSha256, longPrefixSnapshotSha256: newSnapshotSha256,
    snapshotSerialization: 'arrays and all contiguous numeric-key objects are canonicalized recursively; numeric values remain exact' };
}

async function snapshotSha256At(run, seconds) {
  const snapshots = JSON.parse(gunzipSync(await readFile(resolve(run.dir, 'snapshots.json.gz'))).toString('utf8'));
  const snapshot = findSnapshot(snapshots, seconds).snapshot;
  const canonical = JSON.stringify(snapshot, function (key, value) {
    if (value && !Array.isArray(value) && typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length && keys.every((name, i) => name === String(i))) return keys.map(name => value[name]);
    }
    return value;
  });
  return sha256(canonical);
}

function findSnapshot(snapshots, timeSeconds) {
  const row = snapshots.find(item => Math.abs(item.timeSeconds - timeSeconds) <= 1e-6);
  assert.ok(row, `missing snapshot at ${timeSeconds}s`);
  return row;
}

function materialSummary(plates) {
  assert.ok(Array.isArray(plates), 'plate list must be an array');
  const covered = new Set(), orientations = [], endpointLengths = [];
  let grid = null;
  for (const plate of plates) {
    const width = plate.grid?.width, height = plate.grid?.height;
    assert.ok(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0, `${plate.id}: grid dimensions`);
    const mask = normalizeMask(plate.mask, width * height);
    assert.equal(width * height, mask.length, `${plate.id}: mask length`);
    if (grid) assert.deepEqual({ width, height }, grid, 'plate grids must match'); else grid = { width, height };
    const path = plate.principalPath || [];
    for (let i = 0; i < mask.length; i += 1) if (mask[i] > 0) covered.add(i);
    if (path.length >= 2) {
      const first = gridPoint(path[0], width, height), last = gridPoint(path.at(-1), width, height);
      const dx = last.x - first.x, dy = last.y - first.y;
      if (Math.hypot(dx, dy) > 0) { orientations.push(Math.atan2(dy, dx)); endpointLengths.push(Math.hypot(dx, dy)); }
    }
  }
  const cells = [...covered];
  return { plateCount: plates.length, grid, coveredCellCount: cells.length, coveredCells: cells,
    envelope: grid && cells.length ? { minX: Math.min(...cells.map(i => i % grid.width)), maxX: Math.max(...cells.map(i => i % grid.width)),
      minY: Math.min(...cells.map(i => Math.floor(i / grid.width))), maxY: Math.max(...cells.map(i => Math.floor(i / grid.width))),
      centroidX: mean(cells.map(i => (i % grid.width) / (grid.width - 1))),
      centroidY: mean(cells.map(i => Math.floor(i / grid.width) / (grid.height - 1))) } : null,
    endpointOrientation: orientations.length ? { count: orientations.length, meanAngle: circular(orientations).angle,
      resultantLength: circular(orientations).resultant, meanLengthNormalizedDomainUnits: mean(endpointLengths) } : null };
}
function compactMaterial({ coveredCells, ...summary }) { return summary; }

function normalizeMask(mask, length) {
  if (Array.isArray(mask)) { assert.equal(mask.length, length); assert.ok(mask.every(Number.isFinite), 'mask values must be finite'); return mask; }
  assert.ok(mask && typeof mask === 'object', 'mask must be array or numeric-key object');
  const keys = Object.keys(mask);
  assert.equal(keys.length, length, 'numeric-key mask must contain exactly width*height entries');
  for (let i = 0; i < length; i += 1) assert.ok(Object.hasOwn(mask, String(i)), `mask missing index ${i}`);
  const values = Array.from({ length }, (_, i) => mask[i]);
  assert.ok(values.every(Number.isFinite), 'mask values must be finite');
  return values;
}

function gridPoint(index, width, height) {
  assert.ok(Number.isInteger(index) && index >= 0 && index < width * height, 'principalPath index');
  return { x: (index % width) / (width - 1), y: Math.floor(index / width) / (height - 1) };
}
function setJaccard(a, b) { const A = new Set(a), B = new Set(b); let intersection = 0; for (const v of A) if (B.has(v)) intersection += 1; const union = A.size + B.size - intersection; return union ? intersection / union : null; }
function differenceCount(a, b) { const B = new Set(b); return new Set(a.filter(v => !B.has(v))).size; }
function summarizeValues(values) { return values.length ? { count: values.length, mean: mean(values), min: Math.min(...values), median: quantile(values, .5), p95: quantile(values, .95), max: Math.max(...values) } : null; }
function headingRuleError(spawns, variant) {
  const errors = [];
  for (const spawn of spawns) {
    const e = spawn.headingEvidence;
    if (!e) continue;
    const u = e.draw, input = e.input;
    const expected = variant === 'baseline' ? -Math.PI / 2 + (2 * u - 1) * .3
      : variant === 'isotropic' ? -Math.PI + u * 2 * Math.PI
        : !input || !(e.R > 1e-9) ? -Math.PI + u * 2 * Math.PI
          : policyWrap(input.angle + (2 * u - 1) * (Math.PI - (Math.PI - .3) * e.R));
    errors.push(Math.abs(Math.atan2(Math.sin(spawn.initialHeading - expected), Math.cos(spawn.initialHeading - expected))));
  }
  return errors.length ? Math.max(...errors) : null;
}
function policyWrap(a) { return ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; }

function stageBSummary(receipt, receiptHash, analyzerHash) {
  const lines = ['# Stage B pheromone-sector controls — analysis receipt', '',
    'Seed-level runs are the replication units; sampled times are serially dependent. The 1800 s extension is one-seed persistence evidence only.', '',
    '| Variant | Seed | Late centroid (x,y) | South | Dispersion Rg | Population | Spawn R median | Zero/undefined R | RNG mismatch baseline / isotropic |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---|'];
  for (const r of [...receipt.shortRuns, ...receipt.longRuns]) {
    const w = r.windows.late300to600, mm = r.spawnEvidence.appliedR?.median;
    lines.push(`| ${r.variant} | ${r.seed} | ${fmt(w.centroidX)}, ${fmt(w.centroidY)} | ${fmt(w.southFraction)} | ${fmt(w.dispersionRg)} | ${fmt(w.population)} | ${fmt(mm)} | ${fmt(r.spawnEvidence.zeroOrUndefinedFraction)} | ${JSON.stringify(r.rng.firstMismatchAgainst)} |`);
  }
  lines.push('', '## Stage A to 1800 s-run prefix check', '', '| Variant | RNG exact through 600 s | 1 Hz agent frames exact | Snapshot at 600 s exact |', '|---|---|---|---|');
  for (const p of receipt.stageAPrefixChecks) lines.push(`| ${p.variant} | ${p.rngTraceExact} | ${p.sampledAgentFramesExact} | ${p.snapshot600Exact} |`);
  lines.push('', '## 1 Hz conditioning persistence and absolute cue strength', '',
    'qR is normalized directional coherence; q totalWeight is absolute field weight. These are reported together because normalization can yield high qR at very small totalWeight. Spawn rows use recorded accepted-spawn evidence; 1 Hz rows are serially dependent.', '',
    '| Variant | Seed | q totalWeight mean/p95 | qR mean/p95 | g magnitude mean/p95 | corr(weight,qR) | corr(weight,g) | qR lag-1 autocorr | weight lag-1 autocorr | spawn weight mean/p95 | spawn applied R mean/p95 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of [...receipt.shortRuns, ...receipt.longRuns]) {
    const s = r.conditioningState?.cueStrengthAndCoherence, sp = r.spawnEvidence.cueStrengthAndCoherence;
    lines.push(`| ${r.variant} | ${r.seed} | ${fmt(r.conditioningState?.qTotalWeight?.mean)} / ${fmt(r.conditioningState?.qTotalWeight?.p95)} | ${fmt(r.conditioningState?.qR?.mean)} / ${fmt(r.conditioningState?.qR?.p95)} | ${fmt(r.conditioningState?.gR?.mean)} / ${fmt(r.conditioningState?.gR?.p95)} | ${fmt(s?.pearson?.['qTotalWeight:qR'])} | ${fmt(s?.pearson?.['qTotalWeight:gMagnitude'])} | ${fmt(r.windows.lagAutocorrelation.qR?.[1])} | ${fmt(r.windows.lagAutocorrelation.qTotalWeight?.[1])} | ${fmt(sp?.stats?.qTotalWeight?.mean)} / ${fmt(sp?.stats?.qTotalWeight?.p95)} | ${fmt(sp?.stats?.appliedR?.mean)} / ${fmt(sp?.stats?.appliedR?.p95)} |`);
  }
  lines.push('', 'The present policy uses normalized q coherence to set heading spread, with no absolute-strength gate. Correlation and scatter are descriptive joint measurements; they do not establish a causal strength threshold or rule out a weak residual cue.', '');
  lines.push('', '## Material downstream observation', '', '| Variant | Seed | Duration | Plates | Covered cells | Envelope bbox x/y | Endpoint mean angle / R | New cells after 600 s | Early/late union Jaccard |', '|---|---:|---:|---:|---:|---|---:|---:|---:|');
  for (const row of [...receipt.material.stageA, ...receipt.material.stageB]) {
    const m = row.material, e = m.envelope;
    lines.push(`| ${row.variant} | ${row.seed} | ${row.durationSeconds}s | ${m.plateCount} | ${m.coveredCellCount} | ${e ? `${e.minX}–${e.maxX}/${e.minY}–${e.maxY}` : '—'} | ${m.endpointOrientation ? `${fmt(m.endpointOrientation.meanAngle)} / ${fmt(m.endpointOrientation.resultantLength)}` : '—'} | ${m.newCellsAfter600 ?? '—'} | ${m.cohortUnionJaccard == null ? '—' : fmt(m.cohortUnionJaccard)} |`);
  }
  lines.push('', `Stage A receipt SHA-256: \`${receipt.stageAReceiptSha256}\``, `Stage B receipt SHA-256: \`${receiptHash}\``,
    `Stage B analyzer SHA-256: \`${analyzerHash}\``, '', 'Material coverage uses strict width×height mask validation; numeric-key objects must have contiguous indices.', '',
    ...(receipt.supersedesStageBReceiptSha256 ? [`This v2 receipt preserves the original Stage B first-pass artifact and supersedes its serialization-sensitive prefix-check fields. Superseded Stage B receipt SHA-256: \`${receipt.supersedesStageBReceiptSha256}\`.`, ''] : []),
    'No visual success or biological claim follows from these numerical descriptors.', '', '## Limits', '', ...receipt.limits.map(s => `- ${s}`), '');
  return lines.join('\n');
}

// Mask hydration guard: sparse numeric objects are rejected instead of silently becoming empty coverage.
assert.deepEqual(normalizeMask({ 0: 1, 1: 0, 2: 1, 3: 0 }, 4), [1, 0, 1, 0]);
assert.throws(() => normalizeMask({ 0: 1, 2: 1, 3: 0 }, 4), /exactly width\*height|missing index/);
assert.equal(materialSummary([{ id: 'check', grid: { width: 2, height: 2 }, mask: { 0: 1, 1: 0, 2: 0, 3: 1 }, principalPath: [0, 3] }]).coveredCellCount, 2);
assert.ok(headingRuleError([{ initialHeading: -Math.PI / 2, headingEvidence: { draw: .5 } }], 'baseline') < 1e-12);
assert.equal(summarizeCuePairs([{ qTotalWeight: 1e-12, qR: 1, gMagnitude: 1e-12, appliedMagnitude: 1e-12, appliedR: 1 }]).stats.qR.mean, 1);
assert.equal(pearson([[1, 2], [2, 4], [3, 6]]), 1);

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
function compareRngPrefix(a, b) {
  const commonBytes = Math.min(a.length, b.length);
  const mismatch = firstMismatch(a.subarray(0, commonBytes), b.subarray(0, commonBytes));
  return { variantTicks: a.length / 8, comparisonTicks: commonBytes / 8,
    exactThroughCommonPrefix: mismatch === null, firstMismatch: mismatch };
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
async function exists(path) { try { await access(path); return true; } catch { return false; } }

// Self-check: a constant series has undefined lag autocorrelation; a shifted linear ramp is perfectly correlated.
assert.equal(autocorrelation([1, 1, 1], 1), null);
assert.ok(Math.abs(autocorrelation([1, 2, 3, 4], 1) - 1) < 1e-12);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (CLI.has('--self-check')) console.log('analysis self-check passed');
  else if (CLI.has('--corrected-windows')) await mainCorrectedWindows();
  else if (CLI.has('--stage-b')) await mainStageB();
  else await main();
}
