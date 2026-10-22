import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeCurvatureAtScale } from './ant-morphology-plates.js';
import { readNaturalCapture } from './ant-route-curvature-natural.js';

const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const q = p => sorted.length ? sorted[Math.round((sorted.length - 1) * p)] : null;
  return { n: sorted.length, mean: mean(sorted), p10: q(0.1), p50: q(0.5), p90: q(0.9) };
}

export function resamplePath(points, spacing = 0.03) {
  assert.ok(spacing > 0 && Number.isFinite(spacing));
  if (!points.length) return [];
  const samples = [{ ...points[0] }];
  let remainder = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i];
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    if (!distance) continue;
    for (let at = spacing - remainder; at <= distance + 1e-12; at += spacing) {
      const t = Math.min(1, at / distance);
      samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
        tick: a.tick + (b.tick - a.tick) * t });
    }
    remainder = (remainder + distance) % spacing;
    if (spacing - remainder < 1e-12) remainder = 0;
  }
  return samples;
}

export function analyzeFlow(tracks, { startTick = 18000, endTick = 36000, cellSize = 0.03 } = {}) {
  const cells = new Map();
  for (const [id, track] of tracks) {
    const path = resamplePath(track.filter(p => p.tick >= startTick && p.tick <= endTick));
    for (let i = 1; i + 1 < path.length; i += 1) {
      const a = path[i - 1], b = path[i], c = path[i + 1];
      const before = Math.atan2(b.y - a.y, b.x - a.x), after = Math.atan2(c.y - b.y, c.x - b.x);
      const turn = wrap(after - before), heading = before + turn / 2;
      const key = `${Math.floor(b.x / cellSize)},${Math.floor(b.y / cellSize)}`;
      const cell = cells.get(key) || { key, ids: new Set(), n: 0, cos: 0, sin: 0, turns: [], positions: [] };
      cell.ids.add(id); cell.n += 1; cell.cos += Math.cos(heading); cell.sin += Math.sin(heading);
      cell.turns.push(turn); cells.set(key, cell);
    }
  }
  const reused = [...cells.values()].filter(cell => cell.ids.size >= 3).map(cell => ({
    key: cell.key, distinctAnts: cell.ids.size, samples: cell.n,
    directedFlowCoherence: Math.hypot(cell.cos, cell.sin) / cell.n,
    meanSignedTurnPerDistance: mean(cell.turns) / 0.03,
    meanAbsoluteTurnPerDistance: mean(cell.turns.map(Math.abs)) / 0.03,
    signedToAbsolute: Math.abs(cell.turns.reduce((a, b) => a + b, 0))
      / (cell.turns.reduce((a, b) => a + Math.abs(b), 0) || 1)
  }));
  const coherent = reused.filter(row => row.directedFlowCoherence >= 0.8);
  return { startTick, endTick, cellSize, resampleSpacing: 0.03, minimumDistinctAnts: 3,
    caveat: 'Coincident cells and aligned tangents are descriptive reuse proxies; no ridge, identity of an exact route, sustained-arc classification or causal field attribution is inferred.',
    occupiedCells: cells.size, reusedCells: reused.length, directedCoherentReusedCells: coherent.length,
    coherentSignedTurn: distribution(coherent.map(row => row.meanSignedTurnPerDistance)),
    coherentAbsoluteTurn: distribution(coherent.map(row => row.meanAbsoluteTurnPerDistance)),
    coherentSignAgreement: distribution(coherent.map(row => row.signedToAbsolute)), cells: reused };
}

export function immediateDiagnostics(rows) {
  const previous = new Map(), bins = [[0, 0.25], [0.25, 0.75], [0.75, 1.000001]].map(([lo, hi]) =>
    ({ lo, hi, samples: 0, cap: 0, reversalPairs: 0, nonzeroPairs: 0, absOmega: 0, constrained: 0,
      crowdSamples: 0, crowdAbsOmega: 0, clearSamples: 0, clearAbsOmega: 0 }));
  for (const row of rows) {
    const bin = bins.find(b => row.trailAdherence >= b.lo && row.trailAdherence < b.hi);
    if (!bin) continue;
    bin.samples += 1; bin.cap += +row.turnCapSaturated; bin.absOmega += Math.abs(row.angularVelocity);
    bin.constrained += +(row.collisionScale < 0.999);
    const crowd = row.frontCrowding > 0.12;
    if (crowd) { bin.crowdSamples += 1; bin.crowdAbsOmega += Math.abs(row.angularVelocity); }
    else { bin.clearSamples += 1; bin.clearAbsOmega += Math.abs(row.angularVelocity); }
    const prior = previous.get(row.id);
    if (prior && row.tick === prior.tick + 1 && Math.abs(prior.angularVelocity) > 1e-6
      && Math.abs(row.angularVelocity) > 1e-6) {
      bin.nonzeroPairs += 1;
      bin.reversalPairs += +(prior.angularVelocity * row.angularVelocity < 0);
    }
    previous.set(row.id, row);
  }
  return bins.map(b => ({ ...b, capFraction: b.cap / (b.samples || 1),
    reversalFraction: b.reversalPairs / (b.nonzeroPairs || 1), meanAbsOmega: b.absOmega / (b.samples || 1),
    constrainedFraction: b.constrained / (b.samples || 1),
    meanAbsOmegaCrowded: b.crowdSamples ? b.crowdAbsOmega / b.crowdSamples : null,
    meanAbsOmegaClear: b.clearSamples ? b.clearAbsOmega / b.clearSamples : null }));
}

const pathSvg = points => points.map((p, i) => `${i ? 'L' : 'M'}${(p.x * 560).toFixed(2)},${(p.y * 560).toFixed(2)}`).join(' ');
function panel(title, content, x, y) {
  return `<g transform="translate(${x},${y})"><text x="0" y="18" font-size="16">${title}</text><g transform="translate(0,30)"><rect width="560" height="560" fill="#10151c"/>${content}</g></g>`;
}
function visual(tracks, checkpoint, seed) {
  const paths = [...tracks.values()].filter(t => t.at(-1).tick >= 18000).map(t => t.filter(p => p.tick >= 18000));
  const trajectory = paths.map((path, i) => `<path d="${pathSvg(path.filter((_, k) => k % 6 === 0))}" fill="none" stroke="hsl(${(i * 137.5) % 360},70%,65%)" stroke-width="0.65" opacity=".45"/>`).join('');
  const field = checkpoint.pheromone;
  const heat = field.values.map((value, i) => value > 0 ? `<rect x="${(i % field.width) * 560 / field.width}" y="${Math.floor(i / field.width) * 560 / field.height}" width="${560 / field.width}" height="${560 / field.height}" fill="#64d3ad" opacity="${Math.min(1, value / 0.2)}"/>` : '').join('');
  const plates = checkpoint.plates;
  const principal = plates.map((p, i) => {
    const nodes = new Map(p.centerline.map(n => [n.index, n]));
    return `<path d="${pathSvg(p.principalPath.map(index => nodes.get(index)))}" fill="none" stroke="hsl(${(i * 137.5) % 360},70%,65%)" stroke-width="1.2" opacity=".55"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1780" height="650" viewBox="0 0 1780 650"><rect width="1780" height="650" fill="white"/><g font-family="sans-serif" fill="#111"><text x="20" y="24" font-size="18">Seed ${seed}; diagnostic axes x/y = 0..1, same viewport. Not exhibition rendering.</text>${panel('Actual thorax paths, 300–600 s', trajectory, 20, 40)}${panel('Pheromone at 600 s (fixed 0..0.2)', heat, 610, 40)}${panel(`Born principal paths, ${plates.length} Plates`, principal, 1200, 40)}</g></svg>`;
}

async function main() {
  const root = resolve('docs/ant/evidence/2026-10-22-route-curvature-survey');
  const output = resolve(process.argv[2] || `${root}/readout`);
  await assert.rejects(access(output), 'Refuse to overwrite an existing evidence directory.');
  await mkdir(output, { recursive: true });
  const results = [];
  for (const seed of [20261005, 20261006, 20261007]) {
    const trajectoryPath = resolve(root, `natural/seed-${seed}-trajectory.f64.gz`);
    const trajectoryBytes = await readFile(trajectoryPath);
    const rows = await readNaturalCapture(trajectoryPath);
    const snapshotBytes = await readFile(resolve(root, `natural/seed-${seed}-snapshots.json.gz`));
    const checkpoints = JSON.parse(gunzipSync(snapshotBytes));
    const tracks = new Map();
    for (const row of rows) { const track = tracks.get(row.id) || []; track.push(row); tracks.set(row.id, track); }
    const checkpoint = checkpoints.find(c => c.tick === 36000);
    const plateCurvature = checkpoint.plates.map(p => {
      const nodes = new Map(p.centerline.map(n => [n.index, n]));
      const points = p.principalPath.map(index => nodes.get(index));
      const chord = Math.hypot(points.at(-1).x - points[0].x, points.at(-1).y - points[0].y);
      return { id: p.id, chord, scales: [0.03, 0.1].map(scale => analyzeCurvatureAtScale(points, scale)) };
    });
    const result = { seed, inputs: { trajectorySha256: sha(trajectoryBytes), snapshotsSha256: sha(snapshotBytes) },
      immediate: immediateDiagnostics(rows), flow: analyzeFlow(tracks), plateCurvature };
    results.push({ seed, immediate: result.immediate, flow: { ...result.flow, cells: undefined },
      plateCurvature: { count: plateCurvature.length, scales: [0.03, 0.1].map((scale, i) =>
        ({ scale, absoluteTurnPerDistance: distribution(plateCurvature.map(p => p.scales[i].meanAbsoluteTurnRadiansPerWorldUnit)) })) } });
    await writeFile(resolve(output, `seed-${seed}.json`), JSON.stringify(result, null, 2) + '\n');
    await writeFile(resolve(output, `seed-${seed}.svg`), visual(tracks, checkpoint, seed));
  }
  await writeFile(resolve(output, 'summary.json'), JSON.stringify({ sourceSha256: sha(await readFile(fileURLToPath(import.meta.url))),
    sharedScaleHelper: 'scripts/ant-morphology-plates.js analyzeCurvatureAtScale (unchanged)', results }, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
