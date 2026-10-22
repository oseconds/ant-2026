import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { compareTopPartitions, maskIoU } from './ant-visual-turnover-analysis.js';

const evidence = path.resolve('docs/ant/evidence/2026-10-21-long-run-exhibition');
const output = path.resolve('docs/ant/evidence/2026-10-22-visual-turnover-survey/metrics/geometry-supplement-v1');
const sampleSeconds = [900, 1800, 3600, 7200];
const birthWindows = [600, 1200];
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

function unionMask(plates, size) {
  const mask = new Uint8Array(size);
  for (const p of plates) for (let i = 0; i < size; i++) if (p.mask[i]) mask[i] = 1;
  return mask;
}
function centroid(mask, width, height, occupied = true) {
  let n = 0, x = 0, y = 0;
  for (let i = 0; i < mask.length; i++) if (Boolean(mask[i]) === occupied) {
    n++; x += (i % width) / (width - 1); y += Math.floor(i / width) / (height - 1);
  }
  return n ? { cells: n, x: x / n, y: y / n } : { cells: 0, x: null, y: null };
}
export function largestEmptyComponent(materialMask, width, height) {
  if (materialMask.length !== width * height) throw new Error('grid dimensions differ');
  const visited = new Uint8Array(materialMask.length);
  const queue = new Int32Array(materialMask.length);
  let largest = { areaCells: 0, centroid: null }, componentCount = 0;
  for (let start = 0; start < materialMask.length; start++) {
    if (materialMask[start] || visited[start]) continue;
    componentCount++;
    let head = 0, tail = 0, sx = 0, sy = 0;
    queue[tail++] = start; visited[start] = 1;
    while (head < tail) {
      const i = queue[head++], x = i % width, y = Math.floor(i / width);
      sx += x / (width - 1); sy += y / (height - 1);
      const neighbors = [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1,
        y > 0 ? i - width : -1, y + 1 < height ? i + width : -1];
      for (const j of neighbors) if (j >= 0 && !materialMask[j] && !visited[j]) { visited[j] = 1; queue[tail++] = j; }
    }
    if (tail > largest.areaCells) largest = { areaCells: tail, centroid: { x: sx / tail, y: sy / tail } };
  }
  return { emptyComponentCount: componentCount, largestEmptyComponent: largest };
}
function perPlateCentroid(p, width, height) {
  const points = [];
  for (let i = 0; i < p.mask.length; i++) if (p.mask[i]) points.push({ x: i % width / (width - 1), y: Math.floor(i / width) / (height - 1) });
  return points.length ? { x: mean(points.map((v) => v.x)), y: mean(points.map((v) => v.y)) } : null;
}
function spread(points, scale) {
  const valid = points.filter(Boolean);
  if (!valid.length) return null;
  const x = mean(valid.map((p) => p.x)), y = mean(valid.map((p) => p.y));
  return Math.sqrt(mean(valid.map((p) => (p.x - x) ** 2 + (p.y - y) ** 2))) * scale;
}
function cohortData(plates, seconds, width, height, windowSeconds) {
  const finalBin = Math.ceil(seconds / windowSeconds);
  const bins = [];
  for (let n = 0; n < finalBin; n++) {
    const start = n * windowSeconds, end = start + windowSeconds;
    if (end > seconds) continue;
    const members = plates.filter((p) => p.bornAtSimulationTimeMs / 1000 >= start && p.bornAtSimulationTimeMs / 1000 < end);
    if (!members.length) { bins.push({ startSeconds: start, endSeconds: end, plateIds: [], plateCount: 0, unionCells: 0, empty: true }); continue; }
    const mask = unionMask(members, width * height);
    bins.push({ startSeconds: start, endSeconds: end, plateIds: members.map((p) => p.id),
      birthSecondsById: members.map((p) => [p.id, p.bornAtSimulationTimeMs / 1000]), plateCount: members.length,
      unionCells: mask.reduce((n, v) => n + v, 0), centroid: centroid(mask, width, height),
      sourceEndpointSpreadGridUnits: spread(members.map((p) => p.source), width - 1),
      targetEndpointSpreadGridUnits: spread(members.map((p) => p.target), width - 1),
      plateMaskCentroidSpreadGridUnits: spread(members.map((p) => perPlateCentroid(p, width, height)), width - 1), mask });
  }
  const pairs = [];
  for (let i = 1; i < bins.length; i++) {
    const a = bins[i - 1], b = bins[i];
    if (a.empty || b.empty) continue;
    pairs.push({ fromBin: [a.startSeconds, a.endSeconds], toBin: [b.startSeconds, b.endSeconds],
      fromPlateIds: a.plateIds, toPlateIds: b.plateIds, fromPlateCount: a.plateCount, toPlateCount: b.plateCount,
      fromUnionCells: a.unionCells, toUnionCells: b.unionCells, unionMaskIoU: maskIoU(a.mask, b.mask),
      sourceEndpointSpreadGridUnits: [a.sourceEndpointSpreadGridUnits, b.sourceEndpointSpreadGridUnits],
      targetEndpointSpreadGridUnits: [a.targetEndpointSpreadGridUnits, b.targetEndpointSpreadGridUnits],
      plateMaskCentroidSpreadGridUnits: [a.plateMaskCentroidSpreadGridUnits, b.plateMaskCentroidSpreadGridUnits] });
  }
  return { windowSeconds, bins: bins.map(({ mask, ...bin }) => bin), emptyBinCount: bins.filter((b) => b.empty).length,
    nonemptyBinCount: bins.filter((b) => !b.empty).length, consecutiveNonemptyShapeComparisons: pairs };
}
function loadRun(name) {
  const dir = path.join(evidence, name), manifestBytes = fs.readFileSync(path.join(dir, 'run-manifest.json'));
  const manifest = JSON.parse(manifestBytes), snapshots = [];
  for (const seconds of sampleSeconds) {
    const entry = manifest.snapshots.find((s) => s.seconds === seconds);
    if (!entry) throw new Error(`${name}: missing ${seconds}s checkpoint`);
    const bytes = fs.readFileSync(path.join(dir, entry.file));
    if (bytes.length !== entry.bytes || hash(bytes) !== entry.sha256) throw new Error(`${name}/${entry.file}: source receipt mismatch`);
    const data = JSON.parse(bytes), width = data.stratigraphy.width, height = data.stratigraphy.height;
    const plates = data.stratigraphy.plates;
    const top = data.stratigraphy.stratigraphy;
    const topIds = top.topLayerByCell.map((i) => i < 0 ? null : top.layerOrder[i] ?? null);
    const support = new Map();
    for (const id of topIds) if (id !== null) support.set(id, (support.get(id) ?? 0) + 1);
    const material = unionMask(plates, width * height);
    const empty = Uint8Array.from(material, (v) => v ? 0 : 1);
    snapshots.push({ run: name, seconds, tick: entry.tick, simulationTimeMs: data.analysis.simulationTimeMs,
      plateCount: plates.length, unionCells: material.reduce((n, v) => n + v, 0), width, height,
      plateIds: plates.map((p) => p.id), currentTopVisiblePlateSupport: [...support].map(([id, cells]) => ({ id, cells })),
      topIds, materialMask: material, emptyMask: empty,
      negativeSpace: { emptyCells: empty.reduce((n, v) => n + v, 0), emptyCentroid: centroid(empty, width, height), ...largestEmptyComponent(material, width, height) },
      recent120: (() => { const ps = plates.filter((p) => p.bornAtSimulationTimeMs / 1000 > seconds - 120 && p.bornAtSimulationTimeMs / 1000 <= seconds); return { startSeconds: Math.max(0, seconds - 120), endSeconds: seconds, plateIds: ps.map((p) => p.id), plateCount: ps.length, unionCells: unionMask(ps, width * height).reduce((n, v) => n + v, 0), mask: unionMask(ps, width * height) }; })(),
      cohorts: birthWindows.map((w) => cohortData(plates, seconds, width, height, w)),
      source: { file: entry.file, bytes: bytes.length, sha256: hash(bytes) } });
  }
  return { name, capacity: manifest.provenance.historyCapacity ?? 256, seed: manifest.provenance.seed,
    sourceCommit: manifest.provenance.sourceCommit, snapshots };
}
const nonemptyIoU = (a, b) => a.reduce((n, v) => n + v, 0) || b.reduce((n, v) => n + v, 0) ? maskIoU(a, b) : null;
function summarizeRun(run) {
  const snapshots = run.snapshots;
  const temporal = snapshots.slice(1).map((b, i) => {
    const a = snapshots[i];
    return { fromSeconds: a.seconds, toSeconds: b.seconds, unionCells: [a.unionCells, b.unionCells],
      unionMaskIoU: nonemptyIoU(a.materialMask, b.materialMask), negativeSpaceCells: [a.negativeSpace.emptyCells, b.negativeSpace.emptyCells],
      negativeSpaceIoU: nonemptyIoU(a.emptyMask, b.emptyMask), largestEmptyComponents: [a.negativeSpace.largestEmptyComponent, b.negativeSpace.largestEmptyComponent],
      topPartition: compareTopPartitions(a.topIds, b.topIds, a.width, a.height) };
  });
  const recent = snapshots.slice(1).map((b, i) => {
    const a = snapshots[i];
    return { fromSeconds: a.seconds, toSeconds: b.seconds, fromIds: a.recent120.plateIds, toIds: b.recent120.plateIds,
      fromCount: a.recent120.plateCount, toCount: b.recent120.plateCount, fromUnionCells: a.recent120.unionCells,
      toUnionCells: b.recent120.unionCells, unionMaskIoU: nonemptyIoU(a.recent120.mask, b.recent120.mask) };
  });
  return { temporal, recent, finalBirthTimeWindows: snapshots.at(-1).cohorts };
}

function cohortIouSummary(window) {
  const pairs = window.consecutiveNonemptyShapeComparisons.map((x) => x.unionMaskIoU);
  return pairs.length ? { count: pairs.length, median: median(pairs), min: Math.min(...pairs), max: Math.max(...pairs) } : { count: 0, median: null, min: null, max: null };
}
function median(xs) { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; }
function runLines(run) {
  const s = run.summary;
  const lines = [`${run.capacity}-cap within-run top partitions:`];
  for (const p of s.temporal) lines.push(`  ${p.fromSeconds / 60}->${p.toSeconds / 60}m: top boundary IoU ${p.topPartition.boundaryIoU?.toFixed(3) ?? 'n/a'}, ARI ${p.topPartition.adjustedRandIndex?.toFixed(3) ?? 'n/a'}, common support ${p.topPartition.commonOccupiedCells}, material union IoU ${p.unionMaskIoU?.toFixed(3) ?? 'empty'}, negative-space IoU ${p.negativeSpaceIoU?.toFixed(3) ?? 'empty'}, largest empty components ${p.largestEmptyComponents.map((x) => x.areaCells).join('->')} cells`);
  for (const window of s.finalBirthTimeWindows) {
    const ioU = cohortIouSummary(window);
    lines.push(`  final ${window.windowSeconds / 60}m birth-time bins: completed=${window.bins.length}, nonempty=${window.nonemptyBinCount}, empty=${window.emptyBinCount}, consecutive nonempty-bin union IoU count/median/range=${ioU.count}/${ioU.median?.toFixed(3) ?? 'n/a'}/${ioU.min?.toFixed(3) ?? 'n/a'}-${ioU.max?.toFixed(3) ?? 'n/a'}`);
  }
  for (const r of s.recent) lines.push(`  recent 120s bins ${r.fromSeconds}->${r.toSeconds}s: ${r.fromCount}/${r.toCount} Plates, union cells ${r.fromUnionCells}/${r.toUnionCells}, mask IoU ${r.unionMaskIoU?.toFixed(3) ?? 'empty'}`);
  return lines;
}
export function runSupplement() {
  const runs = ['visual', 'visual-capacity-1024'].map(loadRun);
  const summaries = runs.map((run) => ({ ...run, summary: summarizeRun(run) }));
  const crossRun = sampleSeconds.map((seconds) => {
    const a = runs[0].snapshots.find((s) => s.seconds === seconds), b = runs[1].snapshots.find((s) => s.seconds === seconds);
    return { seconds, basePlateCount: a.plateCount, shadowPlateCount: b.plateCount, baseUnionCells: a.unionCells,
      shadowUnionCells: b.unionCells, materialUnionIoU: nonemptyIoU(a.materialMask, b.materialMask),
      negativeSpaceIoU: nonemptyIoU(a.emptyMask, b.emptyMask), topPartition: compareTopPartitions(a.topIds, b.topIds, a.width, a.height) };
  });
  const snapshotSummary = summaries.map((run) => ({ run: run.name, capacity: run.capacity, seed: run.seed, sourceCommit: run.sourceCommit,
    snapshots: run.snapshots.map(({ topIds, materialMask, emptyMask, recent120, ...s }) => ({ ...s, recent120: (({ mask, ...r }) => r)(recent120) })) ,
    summary: run.summary }));
  const ownHash = (file) => ({ path: file, sha256: hash(fs.readFileSync(file)) });
  const report = { schemaVersion: 1, purpose: 'Saved-snapshot geometry supplement; no simulation, renderer change, or artistic sufficiency claim.',
    method: { sourceGrid: '96x96 cell masks; centroid coordinates use index/(dimension-1). Negative space is the 4-neighbor complement of the material union inside the finite grid; it does not measure perceived blankness or pheromone gaps.',
      cohortComparison: 'Compare different completed consecutive birth-time windows at the 7200s endpoint. Empty bins are counted but excluded from cohort shape IoU. Recent 120s cohorts at 900/1800/3600/7200s are distinct cohorts.',
      topPartition: 'Within-run four-neighbor internal boundaries counted once over common occupied support; exterior edges excluded. ARI is contingency-based; union and negative-space IoUs are separate.',
      sourceVersionHashes: [ownHash(path.resolve('scripts/ant-visual-turnover-analysis.js')),
        ownHash(path.resolve('scripts/ant-visual-geometry-supplement.js')),
        ownHash(path.resolve('tests/ant-visual-turnover-analysis.test.js'))] },
    sourceRuns: runs.map((run) => ({ name: run.name, capacity: run.capacity, seed: run.seed, sourceCommit: run.sourceCommit,
      snapshots: run.snapshots.map((s) => ({ seconds: s.seconds, tick: s.tick, simulationTimeMs: s.simulationTimeMs, ...s.source })) })),
    runs: snapshotSummary, crossRun, negativeSpaceInterpretation: 'Grid complement is a geometric proxy only; it is not a perceptual blank-space judgment.' };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'geometry-supplement.json'), `${JSON.stringify(report, null, 2)}\n`);
  const summary = [...crossRun.map((x) => `${x.seconds / 60}m base/shadow ${x.basePlateCount}/${x.shadowPlateCount}: material union cells ${x.baseUnionCells}/${x.shadowUnionCells}, union IoU ${x.materialUnionIoU?.toFixed(3) ?? 'empty'}, negative-space IoU ${x.negativeSpaceIoU?.toFixed(3) ?? 'empty'}, top boundary IoU ${x.topPartition.boundaryIoU?.toFixed(3) ?? 'n/a'}, ARI ${x.topPartition.adjustedRandIndex?.toFixed(3) ?? 'n/a'}`), ...summaries.flatMap(runLines)];
  fs.writeFileSync(path.join(output, 'summary.txt'), `${summary.join('\n')}\n`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runSupplement();
