import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { indexTrajectory } from './ant-social-null.js';

const WINDOWS = [1, 5, 20];
const SAMPLE_HZ = 60;
const BODY_DIAMETER = 0.012;
const GRID_SIZE = 0.03; // 2.5 archived body diameters; a descriptive spatial scale.
const RETURN_GAP_SECONDS = 1;
const EPSILON = 1e-12;
const TURN_BINS = [-Math.PI, -Math.PI / 2, -Math.PI / 6, 0, Math.PI / 6, Math.PI / 2, Math.PI];
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = resolve(ROOT, 'docs/ant/evidence/2026-10-07-social-graph/data');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const sha = value => createHash('sha256').update(value).digest('hex');
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

function describe(values) {
  if (!values.length) return { n: 0, mean: null, p50: null, p90: null };
  const sorted = [...values].sort((a, b) => a - b);
  const q = p => { const i = (sorted.length - 1) * p, lo = Math.floor(i); return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo); };
  return { n: values.length, mean: values.reduce((sum, value) => sum + value, 0) / values.length, p50: q(0.5), p90: q(0.9) };
}

export function analyzeWindow(points, sampleHz = SAMPLE_HZ, gridSize = GRID_SIZE) {
  assert.ok(points.length >= 2 && sampleHz > 0 && gridSize > 0);
  assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.heading)),
    'finite x/y/heading required for every point');
  const turns = [], segmentLengths = [];
  let pathLength = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    segmentLengths.push(length); pathLength += length;
    const turn = wrap(b.heading - a.heading);
    turns.push(turn);
  }
  const segmentAngles = [];
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x, dy = points[i].y - points[i - 1].y;
    segmentAngles.push(Math.hypot(dx, dy) > EPSILON ? Math.atan2(dy, dx) : null);
  }
  const pathTurns = segmentAngles.slice(1).map((angle, index) => angle === null || segmentAngles[index] === null ? null :
    wrap(angle - segmentAngles[index]));
  const first = points[0], last = points.at(-1);
  const netDisplacement = Math.hypot(last.x - first.x, last.y - first.y);
  const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const maxExcursion = Math.max(...points.map(point => Math.hypot(point.x - first.x, point.y - first.y)));
  const radiusOfGyration = Math.sqrt(points.reduce((sum, point) => sum + (point.x - cx) ** 2 + (point.y - cy) ** 2, 0) / points.length);
  const cells = points.map(point => `${Math.floor(point.x / gridSize)},${Math.floor(point.y / gridSize)}`);
  const runs = new Map();
  let longestResidenceSamples = 1;
  for (let i = 0; i < cells.length; i += 1) {
    const run = cells[i] === cells[i - 1] ? (runs.get(cells[i]) || 1) + 1 : 1;
    runs.set(cells[i], run); longestResidenceSamples = Math.max(longestResidenceSamples, run);
  }
  const visitRuns = [];
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] !== cells[i - 1]) visitRuns.push({ cell: cells[i], start: i, end: i });
    else visitRuns.at(-1).end = i;
  }
  const lastVisit = new Map(), visitCounts = new Map(); let approximateReturns = 0;
  for (const run of visitRuns) {
    visitCounts.set(run.cell, (visitCounts.get(run.cell) || 0) + 1);
    const previous = lastVisit.get(run.cell);
    if (previous && run.start - previous.end >= Math.ceil(sampleHz * RETURN_GAP_SECONDS)) approximateReturns += 1;
    lastVisit.set(run.cell, run);
  }
  const revisited = new Set([...visitCounts].filter(([, visits]) => visits > 1).map(([cell]) => cell));
  const revisitedCells = revisited.size;
  const turnMeasures = values => {
    const finiteTurns = values.filter(Number.isFinite);
    const signed = finiteTurns.reduce((sum, turn) => sum + turn, 0), absolute = finiteTurns.reduce((sum, turn) => sum + Math.abs(turn), 0);
    let longest = 0, run = 0, previousSign = 0;
    for (const turn of values) {
      if (!Number.isFinite(turn)) { run = 0; previousSign = 0; continue; }
      const sign = Math.sign(turn);
      run = sign && sign === previousSign ? run + 1 : sign ? 1 : 0;
      longest = Math.max(longest, run); previousSign = sign;
    }
    const histogram = Array(TURN_BINS.length - 1).fill(0);
    for (const turn of finiteTurns) {
      const bin = turn === Math.PI ? TURN_BINS.length - 2 :
        TURN_BINS.findIndex((edge, index) => index < TURN_BINS.length - 1 && turn >= edge && turn < TURN_BINS[index + 1]);
      histogram[Math.max(0, bin)] += 1;
    }
    return { signedAccumulatedRadians: signed, absoluteAccumulatedRadians: absolute,
      coherence: absolute > EPSILON ? Math.abs(signed) / absolute : null,
      signedTurnPerPathRadianPerUnit: pathLength > EPSILON ? signed / pathLength : null,
      longestSameSignRunSeconds: longest / sampleHz,
      signedStepRadians: describe(finiteTurns), absoluteStepRadians: describe(finiteTurns.map(Math.abs)),
      histogram: { edgesRadians: TURN_BINS, counts: histogram, sampleCount: finiteTurns.length } };
  };
  return {
    sampleCount: points.length, durationSeconds: (points.length - 1) / sampleHz,
    pathLength, netDisplacement, tortuosity: netDisplacement > EPSILON ? pathLength / netDisplacement : null,
    meanSegmentLength: pathLength / segmentLengths.length, bodyHeadingTurning: turnMeasures(turns),
    pathTurning: turnMeasures(pathTurns),
    maxExcursion, radiusOfGyration,
    grid: { cellSize: gridSize, uniqueCells: new Set(cells).size, revisitedCells,
      sampleFractionInRevisitedCells: cells.filter(cell => revisited.has(cell)).length / cells.length,
      longestResidenceSeconds: (longestResidenceSamples - 1) / sampleHz,
    approximateReturns, returnGapSeconds: RETURN_GAP_SECONDS }
  };
}

export function classifyWindow(metrics) {
  const excursionDiameters = metrics.maxExcursion / BODY_DIAMETER;
  if (metrics.grid.approximateReturns >= 1 && excursionDiameters <= 10) return 'confined-local-return';
  if (metrics.pathTurning.coherence >= 0.75 && metrics.pathTurning.absoluteAccumulatedRadians >= Math.PI / 2
    && metrics.pathTurning.longestSameSignRunSeconds >= metrics.durationSeconds / 2 && excursionDiameters > 10) return 'broad-sustained-turn';
  if (metrics.tortuosity !== null && metrics.tortuosity <= 1.25
    && metrics.pathTurning.absoluteAccumulatedRadians <= Math.PI / 2 && metrics.grid.approximateReturns === 0) return 'straight-gentle';
  return 'unclassified-remainder';
}

function trackFromLife(source, life) {
  return life.sampleOffsets.map((offset, index) => ({ frame: life.startFrame + index,
    x: source.bytes.readDoubleLE(offset + 4), y: source.bytes.readDoubleLE(offset + 12),
    heading: source.bytes.readDoubleLE(offset + 36) }));
}

export function analyzeSource(source, seed, sourceHashes = {}) {
  const recordingEndFrame = source.frames.length - 1;
  const out = WINDOWS.map(windowSeconds => {
    const stride = windowSeconds * SAMPLE_HZ, metrics = [];
    let leftCensored = 0, rightCensored = 0;
    for (const life of source.lives) {
      const track = trackFromLife(source, life), byFrame = new Map(track.map(point => [point.frame, point]));
      for (let startFrame = 0; startFrame <= recordingEndFrame; startFrame += stride) {
        const endFrame = startFrame + stride;
        const intersects = life.startFrame <= endFrame && life.endFrame >= startFrame;
        if (!intersects) continue;
        if (life.startFrame > startFrame) { leftCensored += 1; continue; }
        if (life.endFrame < endFrame || recordingEndFrame < endFrame) { rightCensored += 1; continue; }
        const points = Array.from({ length: stride + 1 }, (_, index) => byFrame.get(startFrame + index));
        assert.ok(points.every(Boolean), 'complete contiguous per-ant window');
        const measured = analyzeWindow(points);
        metrics.push({ antId: life.id, startSeconds: startFrame / SAMPLE_HZ, ...measured, category: classifyWindow(measured) });
      }
    }
    const keys = ['pathLength', 'netDisplacement', 'tortuosity', 'maxExcursion', 'radiusOfGyration'];
    const aggregates = Object.fromEntries(keys.map(key => [key, describe(metrics.map(item => item[key]).filter(Number.isFinite))]));
    aggregates.bodyHeadingSignedTurnRadians = describe(metrics.map(item => item.bodyHeadingTurning.signedAccumulatedRadians));
    aggregates.bodyHeadingTurnCoherence = describe(metrics.map(item => item.bodyHeadingTurning.coherence).filter(Number.isFinite));
    aggregates.meanSignedBodyHeadingStepRadians = describe(metrics.map(item => item.bodyHeadingTurning.signedStepRadians.mean).filter(Number.isFinite));
    aggregates.p90AbsoluteBodyHeadingStepRadians = describe(metrics.map(item => item.bodyHeadingTurning.absoluteStepRadians.p90).filter(Number.isFinite));
    aggregates.pathTangentSignedTurnRadians = describe(metrics.map(item => item.pathTurning.signedAccumulatedRadians));
    aggregates.pathTangentTurnCoherence = describe(metrics.map(item => item.pathTurning.coherence).filter(Number.isFinite));
    aggregates.pathTangentTurnPerPathRadianPerUnit = describe(metrics.map(item => item.pathTurning.signedTurnPerPathRadianPerUnit).filter(Number.isFinite));
    aggregates.longestSameSignPathTurnRunSeconds = describe(metrics.map(item => item.pathTurning.longestSameSignRunSeconds));
    aggregates.revisitedCellFraction = describe(metrics.map(item => item.grid.sampleFractionInRevisitedCells));
    aggregates.uniqueCells = describe(metrics.map(item => item.grid.uniqueCells));
    aggregates.revisitedCells = describe(metrics.map(item => item.grid.revisitedCells));
    aggregates.approximateReturns = describe(metrics.map(item => item.grid.approximateReturns));
    aggregates.longestResidenceSeconds = describe(metrics.map(item => item.grid.longestResidenceSeconds));
    aggregates.maxExcursionBodyDiameters = describe(metrics.map(item => item.maxExcursion / BODY_DIAMETER));
    aggregates.radiusOfGyrationBodyDiameters = describe(metrics.map(item => item.radiusOfGyration / BODY_DIAMETER));
    const categoryCounts = Object.fromEntries(['straight-gentle', 'broad-sustained-turn', 'confined-local-return', 'unclassified-remainder']
      .map(category => [category, metrics.filter(item => item.category === category).length]));
    const categoryPrevalence = Object.fromEntries(Object.entries(categoryCounts).map(([category, count]) =>
      [category, { count, fraction: metrics.length ? count / metrics.length : null }]));
    const ordered = [...metrics].sort((a, b) => (a.tortuosity ?? Infinity) - (b.tortuosity ?? Infinity));
    const finiteOrdered = ordered.filter(item => Number.isFinite(item.tortuosity));
    const representativeFor = subset => subset.length ? subset[Math.floor((subset.length - 1) / 2)] : null;
    const makeRepresentative = (representative, selection) => {
      if (!representative) return null;
      const life = source.lives.find(item => item.id === representative.antId), track = trackFromLife(source, life);
      const start = representative.startSeconds * SAMPLE_HZ, stride = windowSeconds * SAMPLE_HZ;
      const coordinates = track.slice(start - life.startFrame, start - life.startFrame + stride + 1);
      const step = Math.max(1, Math.ceil(coordinates.length / 120));
      return { category: representative.category, antId: representative.antId, startSeconds: representative.startSeconds,
        selection,
        metrics: representative, coordinates: coordinates.filter((_, index) => index % step === 0 || index === coordinates.length - 1)
          .map(({ x, y }) => [x, y]) };
    };
    const median = representativeFor(ordered);
    const maximumTortuosity = finiteOrdered.at(-1) || null;
    const byCategory = {};
    for (const category of Object.keys(categoryCounts)) {
      const subset = metrics.filter(item => item.category === category)
        .sort((a, b) => (a.tortuosity ?? Infinity) - (b.tortuosity ?? Infinity));
      const representative = makeRepresentative(representativeFor(subset), `Median tortuosity within ${category}; descriptive example.`);
      if (representative) byCategory[category] = representative;
    }
    const poolHistogram = key => {
      const counts = Array(TURN_BINS.length - 1).fill(0);
      for (const item of metrics) item[key].histogram.counts.forEach((count, index) => { counts[index] += count; });
      const sampleCount = counts.reduce((sum, value) => sum + value, 0);
      return { edgesRadians: TURN_BINS, counts, sampleCount, fractions: counts.map(count => sampleCount ? count / sampleCount : null) };
    };
    return { windowSeconds, completeWindowCount: metrics.length,
      lifecycleCensoring: { leftCensoredWindowCount: leftCensored, rightCensoredWindowCount: rightCensored,
        rule: 'Only globally aligned windows fully inside one contiguous recorded ant lifetime enter metrics; partial overlaps are counted and excluded.' },
      aggregates, categoryPrevalence, turningAngleHistograms: { bodyHeading: poolHistogram('bodyHeadingTurning'),
        pathTangent: poolHistogram('pathTurning') },
      representativeWindows: {
        medianTortuosity: makeRepresentative(median, 'Median tortuosity among all complete windows; descriptive example.'),
        maximumTortuosity: makeRepresentative(maximumTortuosity, 'Maximum finite tortuosity among complete windows; descriptive extreme, not a typical path.'),
        byCategory } };
  });
  return { seed, sourceHashes, recording: { sampleHz: SAMPLE_HZ, startSeconds: 0, endSeconds: recordingEndFrame / SAMPLE_HZ,
    frameCount: source.frames.length, antCount: source.lives.length }, windows: out };
}

export const definitions = {
  windowing: 'Globally anchored, nonoverlapping [start,start+W] intervals at 60 Hz; both endpoints sampled. Include only intervals wholly inside one contiguous recorded ant lifetime.',
  pathAndTortuosity: 'Path length sums adjacent Euclidean positions; net displacement is endpoint distance; tortuosity is path/net, null when net <= 1e-12.',
  turning: 'Body heading and path-tangent turns are separate. Both use signed adjacent differences wrapped to [-pi,pi], coherence=abs(sum signed turns)/sum absolute turns; path-tangent angles require two adjacent nonzero displacement segments, and zero-length segments break same-sign runs. Signed turn per path length and longest same-sign run are also reported. Histograms pool individual turn steps in bins [-pi,-pi/2,-pi/6,0,pi/6,pi/2,pi]. Body heading can rotate without travel; path turning estimates geometry.',
  excursion: 'Maximum distance from first position and radius of gyration around the window mean position; aggregate normalized values divide by archived body diameter 0.012.',
  grid: 'Floor(x/0.03), floor(y/0.03) cells; 0.03 is 2.5 archived body diameters. A cell is revisited only after departure into another cell. Residence is longest consecutive sample run. Approximate return additionally requires >=1 s since prior visit ended.',
  categories: 'Mutually exclusive analyst-defined labels in priority order: confined-local-return (>=1 approximate return and max excursion <=10 body diameters); broad-sustained-turn (path-tangent coherence >=0.75, absolute accumulated path turn >=pi/2, longest same-sign turn run >=half window, max excursion >10 body diameters); straight-gentle (tortuosity <=1.25, absolute path turn <=pi/2, no approximate return); unclassified-remainder (all other windows). Cutoffs are arbitrary descriptive thresholds, not biological types. The remainder can contain turns, bends, mixed movement, or cases outside chosen thresholds; its label cannot establish high curvature or absence of broad bends. Counts/fractions and median-tortuosity examples are reported per category.',
  interpretation: 'All measurements describe sampled movement only. Grid scale, return gap, bin edges, and category thresholds are analyst choices; cell recurrence does not establish a loop, destination, intent, or social role.'
};

async function main() {
  const output = resolve(process.argv[2] || 'test-results/morphology-movement');
  await mkdir(output, { recursive: true });
  const seeds = [];
  for (const seed of [20261005, 20261006, 20261007]) {
    const names = [`seed${seed}-trajectory.f64.gz`, `seed${seed}-summary.json`, 'manifest.json'];
    const buffers = Object.fromEntries(await Promise.all(names.map(async name => [name, await readFile(resolve(SOURCE, name))])));
    const summary = JSON.parse(buffers[`seed${seed}-summary.json`]);
    const trajectoryBytes = gunzipSync(buffers[`seed${seed}-trajectory.f64.gz`]);
    const source = indexTrajectory(trajectoryBytes, summary.runs.on.idDictionary);
    assert.equal(sha(trajectoryBytes), summary.trajectory.enabledHash, 'trajectory matches archived summary hash');
    const sourceHashes = Object.fromEntries(names.map(name => [name, sha(buffers[name])]));
    const packet = analyzeSource(source, seed, sourceHashes);
    packet.sourceUncompressedSha256 = sha(trajectoryBytes);
    seeds.push(packet);
  }
  await writeFile(resolve(output, 'summary.json'), json({ schemaVersion: 1, definitions, parameters: {
    seeds: seeds.map(item => item.seed), windowsSeconds: WINDOWS, sampleHz: SAMPLE_HZ,
    gridSize: GRID_SIZE, returnGapSeconds: RETURN_GAP_SECONDS
  }, seeds }));
  console.log(JSON.stringify({ output, seeds: seeds.map(item => item.seed), windowsSeconds: WINDOWS,
    completeWindows: seeds.map(item => ({ seed: item.seed, counts: item.windows.map(window => window.completeWindowCount) })) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
