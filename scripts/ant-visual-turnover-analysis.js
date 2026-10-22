import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = path.resolve('docs/ant/evidence/2026-10-21-long-run-exhibition');
const output = path.resolve('docs/ant/evidence/2026-10-22-visual-turnover-survey/metrics/v2');
const labels = [0, 60, 300, 900, 1800, 3600, 7200];
const cohorts = [600, 1200];
const recentWindowSeconds = 120;
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const pct = (a, b) => b ? a / b : null;
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const quantiles = (xs) => {
  if (!xs.length) return { count: 0, min: null, median: null, p90: null, max: null };
  const sorted = [...xs].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  return { count: xs.length, min: sorted[0], median: at(0.5), p90: at(0.9), max: sorted.at(-1) };
};

export function maskArea(mask) { return mask.reduce((n, v) => n + (v ? 1 : 0), 0); }
export function maskIoU(a, b) {
  if (a.length !== b.length) throw new Error('mask lengths differ');
  let intersection = 0, union = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] || b[i]) union++; if (a[i] && b[i]) intersection++; }
  return union ? intersection / union : 1;
}
const observedIoU = (a, b) => maskArea(a) || maskArea(b) ? maskIoU(a, b) : null;
export function unionChange(previous, current) {
  if (previous.length !== current.length) throw new Error('mask lengths differ');
  let retained = 0, newCells = 0, lostCells = 0;
  for (let i = 0; i < previous.length; i++) {
    if (previous[i] && current[i]) retained++;
    else if (!previous[i] && current[i]) newCells++;
    else if (previous[i] && !current[i]) lostCells++;
  }
  return { retainedCells: retained, newCells, lostCells, netAreaChange: newCells - lostCells };
}
export function identityTurnover(previousIds, currentIds) {
  const previous = new Set(previousIds), current = new Set(currentIds);
  return { retainedIds: [...previous].filter((id) => current.has(id)),
    newIds: [...current].filter((id) => !previous.has(id)),
    retiredIds: [...previous].filter((id) => !current.has(id)) };
}
export function compareTopPartitions(a, b, width, height) {
  if (a.length !== b.length || a.length !== width * height) throw new Error('top-map dimensions differ');
  let commonOccupiedCells = 0, identityAgreementCells = 0;
  const contingency = new Map(), rows = new Map(), cols = new Map();
  for (let i = 0; i < a.length; i++) if (a[i] !== null && b[i] !== null) {
    commonOccupiedCells++;
    if (a[i] === b[i]) identityAgreementCells++;
    const key = `${a[i]}\u0000${b[i]}`;
    contingency.set(key, (contingency.get(key) ?? 0) + 1);
    rows.set(a[i], (rows.get(a[i]) ?? 0) + 1);
    cols.set(b[i], (cols.get(b[i]) ?? 0) + 1);
  }
  const empty = { commonOccupiedCells: 0, identityAgreementCells: 0, identityAgreementFraction: null,
    eligibleInternalEdges: 0, boundaryEdgesA: 0, boundaryEdgesB: 0, boundaryIntersectionEdges: 0,
    boundaryUnionEdges: 0, boundaryIoU: null, adjustedRandIndex: null,
    exterior: 'excluded from internal-edge comparison; union silhouette is reported separately' };
  if (!commonOccupiedCells) return empty;
  let eligibleInternalEdges = 0, boundaryEdgesA = 0, boundaryEdgesB = 0, boundaryIntersectionEdges = 0;
  const inspect = (i, j) => {
    if (a[i] === null || a[j] === null || b[i] === null || b[j] === null) return;
    eligibleInternalEdges++;
    const ba = a[i] !== a[j], bb = b[i] !== b[j];
    if (ba) boundaryEdgesA++;
    if (bb) boundaryEdgesB++;
    if (ba && bb) boundaryIntersectionEdges++;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (x + 1 < width) inspect(i, i + 1);
    if (y + 1 < height) inspect(i, i + width);
  }
  const choose2 = (n) => n * (n - 1) / 2;
  const sumPairs = (counts) => [...counts.values()].reduce((sum, n) => sum + choose2(n), 0);
  const pairCount = choose2(commonOccupiedCells);
  const together = sumPairs(contingency), expected = pairCount ? sumPairs(rows) * sumPairs(cols) / pairCount : 0;
  const denominator = (sumPairs(rows) + sumPairs(cols)) / 2 - expected;
  const adjustedRandIndex = pairCount === 0 ? null : denominator === 0 ? 1 : (together - expected) / denominator;
  const boundaryUnionEdges = boundaryEdgesA + boundaryEdgesB - boundaryIntersectionEdges;
  return { commonOccupiedCells, identityAgreementCells, identityAgreementFraction: pct(identityAgreementCells, commonOccupiedCells),
    eligibleInternalEdges, boundaryEdgesA, boundaryEdgesB, boundaryIntersectionEdges, boundaryUnionEdges,
    boundaryIoU: boundaryUnionEdges ? boundaryIntersectionEdges / boundaryUnionEdges : 1, adjustedRandIndex,
    exterior: 'excluded from internal-edge comparison; union silhouette is reported separately' };
}
export function birthOverlap(plates) {
  const covered = new Uint8Array(plates[0]?.mask.length ?? 0);
  return plates.map((plate) => {
    let area = 0, overlap = 0, newCells = 0;
    for (let i = 0; i < plate.mask.length; i++) if (plate.mask[i]) {
      area++;
      if (covered[i]) overlap++; else { newCells++; covered[i] = 1; }
    }
    return { id: plate.id, birthSeconds: plate.bornAtSimulationTimeMs / 1000, maskCells: area,
      preUnionOverlapCells: overlap, preUnionOverlapFraction: pct(overlap, area), newUnionCells: newCells };
  });
}
function gridSummary(plate) {
  const cells = [];
  for (let i = 0; i < plate.mask.length; i++) if (plate.mask[i]) cells.push(i);
  const width = plate.grid.width;
  const centroid = cells.length ? {
    x: mean(cells.map((i) => (i % width) / (width - 1))),
    y: mean(cells.map((i) => Math.floor(i / width) / (plate.grid.height - 1))),
  } : null;
  const angle = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const center = plate.centerline ?? [];
  const centerlineCentroid = center.length ? { x: mean(center.map((p) => p.x)), y: mean(center.map((p) => p.y)) } : null;
  const endpointAngle = plate.source && plate.target ? Math.atan2(plate.target.y - plate.source.y, plate.target.x - plate.source.x) : null;
  const centerlineAngle = center.length > 1 ? Math.atan2(center.at(-1).y - center[0].y, center.at(-1).x - center[0].x) : null;
  let centerlineInside = 0;
  for (const p of center) {
    const x = Math.min(width - 1, Math.max(0, Math.floor(p.x * width)));
    const y = Math.min(plate.grid.height - 1, Math.max(0, Math.floor(p.y * plate.grid.height)));
    centerlineInside += plate.mask[y * width + x] ? 1 : 0;
  }
  return { maskCells: cells.length, centroid, source: plate.source, target: plate.target,
    endpointOrientationRadians: endpointAngle,
    centerlineOrientationRadians: centerlineAngle,
    endpointCenterlineAngleDifferenceRadians: endpointAngle === null || centerlineAngle === null ? null : Math.abs(angle(endpointAngle, centerlineAngle)),
    centroidToCenterlineCentroidDistanceNormalizedWorldUnits: centroid && centerlineCentroid ? Math.hypot(centroid.x - centerlineCentroid.x, centroid.y - centerlineCentroid.y) : null,
    centerlinePointCount: center.length, centerlinePointsInsideMaskFraction: pct(centerlineInside, center.length) };
}
function unionMask(plates, length) {
  const out = new Uint8Array(length);
  for (const p of plates) for (let i = 0; i < length; i++) if (p.mask[i]) out[i] = 1;
  return out;
}
function cohortMetrics(plates, seconds, length, run) {
  const entries = [];
  for (const window of cohorts) {
    for (let start = 0; start <= seconds; start += window) {
      const chosen = plates.filter((p) => p.bornAtSimulationTimeMs / 1000 >= start && p.bornAtSimulationTimeMs / 1000 < start + window);
      if (!chosen.length) continue;
      const mask = unionMask(chosen, length);
      cohortMaskCache.set(`${run}:${seconds}:${window}:${start}`, mask);
      entries.push({ kind: 'fixed-birth-window', windowSeconds: window, startSeconds: start, endSeconds: start + window,
        plateIds: chosen.map((p) => p.id), plateCount: chosen.length, unionCells: maskArea(mask), mask: Array.from(mask) });
    }
  }
  const recent = plates.filter((p) => p.bornAtSimulationTimeMs / 1000 > seconds - recentWindowSeconds && p.bornAtSimulationTimeMs / 1000 <= seconds);
  const recentMask = unionMask(recent, length);
  entries.push({ kind: 'recent-fixed-time-window', windowSeconds: recentWindowSeconds,
    startSeconds: Math.max(0, seconds - recentWindowSeconds), endSeconds: seconds,
    plateIds: recent.map((p) => p.id), plateCount: recent.length, unionCells: maskArea(recentMask), mask: Array.from(recentMask) });
  return entries;
}
function readRun(name) {
  const dir = path.join(root, name);
  const manifestBytes = fs.readFileSync(path.join(dir, 'run-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const rows = [];
  const receipts = [];
  for (const seconds of labels) {
    const item = manifest.snapshots.find((s) => s.seconds === seconds);
    if (!item) { if (name === 'visual-capacity-1024' && seconds === 7200) continue; throw new Error(`${name}: missing ${seconds}s manifest row`); }
    const file = path.join(dir, item.file);
    const bytes = fs.readFileSync(file);
    const actualHash = hash(bytes);
    if (actualHash !== item.sha256 || bytes.length !== item.bytes) throw new Error(`source receipt mismatch: ${file}`);
    const snapshot = JSON.parse(bytes);
    if (snapshot.analysis.simulationTimeMs / 1000 + 0.02 < seconds) throw new Error(`source clock precedes label: ${file}`);
    const plates = snapshot.stratigraphy.plates;
    const strat = snapshot.stratigraphy.stratigraphy;
    const history = new Map(strat.plateHistory.map((p) => [p.id, p]));
    const gridLength = snapshot.stratigraphy.width * snapshot.stratigraphy.height;
    if (plates.some((p) => p.mask.length !== gridLength)) throw new Error(`mask dimensions mismatch: ${file}`);
    const topIds = strat.topLayerByCell.map((idx) => idx < 0 ? null : strat.layerOrder[idx] ?? null);
    maskCache.set(`${name}:${seconds}`, new Map(plates.map((p) => [p.id, p.mask])));
    unionCache.set(`${name}:${seconds}`, unionMask(plates, gridLength));
    const cohortsAtTime = cohortMetrics(plates, seconds, gridLength, name);
    const visibleSupport = new Map();
    for (const id of topIds) if (id !== null) visibleSupport.set(id, (visibleSupport.get(id) ?? 0) + 1);
    const row = { run: name, seconds, tick: Math.round(seconds / manifest.provenance.dtSeconds),
      simulationTimeMs: snapshot.analysis.simulationTimeMs, manifestWallSeconds: manifest.provenance.wallSeconds,
      plateCount: plates.length, birthIdentityCount: new Set(plates.map((p) => p.id)).size,
      unionCells: maskArea(unionMask(plates, gridLength)),
      perPlate: plates.map((p) => ({ id: p.id, bornAtSimulationTimeMs: p.bornAtSimulationTimeMs,
        birthSeconds: p.bornAtSimulationTimeMs / 1000, ageMsFromSourceHistory: history.get(p.id)?.ageMs ?? null,
        geometry: gridSummary(p) })),
      birthOrder: birthOverlap(plates),
      birthOverlapDistribution: quantiles(birthOverlap(plates).map((p) => p.preUnionOverlapFraction)),
      topIds,
      currentTopVisiblePlateSupport: [...visibleSupport].map(([id, cells]) => ({ id, cells,
        fractionOfOccupiedTop: pct(cells, [...visibleSupport.values()].reduce((a, b) => a + b, 0)) })),
      cohorts: cohortsAtTime.map(({ mask, ...summary }) => summary),
      layerCountByCell: strat.layerCountByCell,
      provenance: { sourceCommit: manifest.provenance.sourceCommit, sourceSha256: actualHash, sourceBytes: bytes.length,
        manifestPath: path.relative(root, path.join(dir, 'run-manifest.json')).replaceAll('\\', '/'),
        snapshotPath: path.relative(root, file).replaceAll('\\', '/'), historyCapacity: manifest.provenance.historyCapacity ?? 256 } };
    rows.push(row);
    receipts.push({ run: name, file: item.file, bytes: bytes.length, sha256: actualHash });
  }
  return { manifest: { sourceCommit: manifest.provenance.sourceCommit, seed: manifest.provenance.seed,
    dtSeconds: manifest.provenance.dtSeconds, targetSeconds: manifest.provenance.targetSeconds,
    historyCapacity: manifest.provenance.historyCapacity ?? 256, snapshots: receipts }, rows };
}
function withinRunTransitions(run) {
  return run.rows.slice(1).map((next, i) => {
    const previous = run.rows[i];
    const a = previous.topIds, b = next.topIds;
    const sameOccupied = a.reduce((n, id, c) => n + (id && id === b[c] ? 1 : 0), 0);
    const previousOccupied = a.filter(Boolean).length;
    const changed = a.reduce((n, id, c) => n + (id !== b[c] ? 1 : 0), 0);
    return { fromSeconds: previous.seconds, toSeconds: next.seconds,
      previousPlateCount: previous.plateCount, nextPlateCount: next.plateCount,
      ...identityTurnover(previous.perPlate.map((p) => p.id), next.perPlate.map((p) => p.id)),
      topMapOccupiedCellsAtStart: previousOccupied, persistentSameIdTopCells: sameOccupied,
      topMapIdentityPersistenceFraction: pct(sameOccupied, previousOccupied),
      cellwiseTopMapChanges: changed, topMapChangedFractionOfGrid: pct(changed, a.length),
      unionChange: unionChange(unionCache.get(`${previous.run}:${previous.seconds}`), unionCache.get(`${next.run}:${next.seconds}`)),
      unionGeometryIoU: observedIoU(readUnionMask(previous.seconds, run.manifest), readUnionMask(next.seconds, run.manifest)) };
  });
}
function comparisons(runs) {
  const [base, shadow] = runs;
  const out = [];
  for (const b of base.rows) {
    const s = shadow.rows.find((r) => r.seconds === b.seconds);
    if (!s) continue;
    const pA = new Map(b.perPlate.map((p) => [p.id, p]));
    const pB = new Map(s.perPlate.map((p) => [p.id, p]));
    const commonIds = [...pA.keys()].filter((id) => pB.has(id));
    const sameIdIou = commonIds.map((id) => ({ id, iou: maskIoU(
      readMask(id, b.seconds, base.manifest), readMask(id, s.seconds, shadow.manifest)) }));
    const commonOccupied = b.topIds.reduce((n, id, i) => n + (id && id === s.topIds[i] ? 1 : 0), 0);
    const changed = b.topIds.reduce((n, id, i) => n + (id !== s.topIds[i] ? 1 : 0), 0);
    const width = Math.sqrt(b.topIds.length);
    out.push({ seconds: b.seconds, basePlateCount: b.plateCount, shadowPlateCount: s.plateCount,
      commonPlateIds: commonIds, baseOnlyIds: [...pA.keys()].filter((id) => !pB.has(id)), shadowOnlyIds: [...pB.keys()].filter((id) => !pA.has(id)),
      commonIdRetentionOfBase: pct(commonIds.length, b.plateCount), sameIdGeometryIoU: quantiles(sameIdIou.map((x) => x.iou)),
      sameIdGeometryIoUById: sameIdIou, topMapCellCount: b.topIds.length,
      topMapChangedCells: changed, topMapIdentityAgreementFraction: pct(commonOccupied, b.topIds.filter(Boolean).length),
      topMapCellwiseDifferentFraction: pct(changed, b.topIds.length),
      topPartition: compareTopPartitions(b.topIds, s.topIds, width, width),
      unionGeometryIoU: observedIoU(readUnionMask(b.seconds, base.manifest), readUnionMask(s.seconds, shadow.manifest)),
      unionCellDifference: Math.abs(b.unionCells - s.unionCells),
      baseUnionCells: b.unionCells, shadowUnionCells: s.unionCells });
  }
  return out;
}
// Filled by readRun's lightweight source descriptors below.
function readMask(id, seconds, manifest) { return maskCache.get(`${manifest.run}:${seconds}`)?.get(id) ?? []; }
function readUnionMask(seconds, manifest) { return unionCache.get(`${manifest.run}:${seconds}`) ?? []; }
function cohortSpread(plates, ids, key) {
  const points = plates.filter((p) => ids.includes(p.id)).map((p) => p.geometry[key]).filter(Boolean);
  if (!points.length) return null;
  const center = { x: mean(points.map((p) => p.x)), y: mean(points.map((p) => p.y)) };
  return Math.sqrt(mean(points.map((p) => (p.x - center.x) ** 2 + (p.y - center.y) ** 2)));
}
const gridSpread = (plates, ids, key) => {
  const spread = cohortSpread(plates, ids, key);
  return spread === null ? null : spread * 95;
};
function cohortTransitions(run) {
  const out = [];
  for (let i = 1; i < run.rows.length; i++) {
    const a = run.rows[i - 1], b = run.rows[i];
    const keys = new Set([...a.cohorts, ...b.cohorts].filter((c) => c.kind === 'fixed-birth-window')
      .map((c) => `${c.windowSeconds}:${c.startSeconds}`));
    for (const token of keys) {
      const [windowSeconds, startSeconds] = token.split(':').map(Number);
      const old = a.cohorts.find((c) => c.kind === 'fixed-birth-window' && c.windowSeconds === windowSeconds && c.startSeconds === startSeconds);
      const current = b.cohorts.find((c) => c.kind === 'fixed-birth-window' && c.windowSeconds === windowSeconds && c.startSeconds === startSeconds);
      const length = a.topIds.length;
      const maskA = cohortMaskCache.get(`${run.manifest.run}:${a.seconds}:${windowSeconds}:${startSeconds}`) ?? new Uint8Array(length);
      const maskB = cohortMaskCache.get(`${run.manifest.run}:${b.seconds}:${windowSeconds}:${startSeconds}`) ?? new Uint8Array(length);
      const ids = current?.plateIds ?? old?.plateIds ?? [];
      if (!maskArea(maskA) && !maskArea(maskB)) continue;
      out.push({ fromSeconds: a.seconds, toSeconds: b.seconds, windowSeconds, startSeconds,
        endSeconds: startSeconds + windowSeconds, plateIds: ids,
        plateCount: current?.plateCount ?? 0, priorUnionCells: old?.unionCells ?? 0, currentUnionCells: current?.unionCells ?? 0,
        maskIoU: maskIoU(maskA, maskB), sourceEndpointSpreadGridUnits: gridSpread(b.perPlate, ids, 'source'),
        targetEndpointSpreadGridUnits: gridSpread(b.perPlate, ids, 'target'),
        plateMaskCentroidSpreadGridUnits: gridSpread(b.perPlate, ids, 'centroid') });
    }
  }
  return out;
}
function cohortSummaryLines(report) {
  const lines = [];
  for (const run of report.runs) for (const window of cohorts) {
    const rows = run.cohortTransitions.filter((x) => x.windowSeconds === window);
    if (!rows.length) continue;
    const pairs = [...new Set(rows.map((x) => `${x.fromSeconds}-${x.toSeconds}`))];
    for (const label of [...new Set([pairs[0], pairs.at(-1)])]) {
      const group = rows.filter((x) => `${x.fromSeconds}-${x.toSeconds}` === label);
      const ious = quantiles(group.map((x) => x.maskIoU));
      const spread = (key) => quantiles(group.map((x) => x[key]).filter(Number.isFinite)).median?.toFixed(3) ?? 'n/a';
      lines.push(`${run.manifest.historyCapacity}-cap ${window / 60}m birth-time bins ${label}s: bins=${ious.count}, bin union-mask IoU median=${ious.median.toFixed(3)} range=${ious.min.toFixed(3)}-${ious.max.toFixed(3)}, source/target/mask-centroid RMS spread median=${spread('sourceEndpointSpreadGridUnits')}/${spread('targetEndpointSpreadGridUnits')}/${spread('plateMaskCentroidSpreadGridUnits')} grid units`);
    }
  }
  return lines;
}
const maskCache = new Map(), unionCache = new Map(), cohortMaskCache = new Map();

export function runAnalysis() {
  const runs = ['visual', 'visual-capacity-1024'].map(readRun);
  for (const run of runs) run.manifest.run = run.rows[0]?.run;
  const report = { schemaVersion: 2, revision: 'v2; label-invariant partition and cohort summaries; raw snapshots unchanged', purpose: 'Descriptive visual responsibility survey; no production behavior or art-quality sufficiency claim.',
    method: { birthTimeWindowsSeconds: cohorts, recentFixedTimeWindowSeconds: recentWindowSeconds,
      sourceClock: 'snapshot.analysis.simulationTimeMs and Plate bornAtSimulationTimeMs; manifest seconds/ticks are simulation clock, manifest wallSeconds is capture wall duration.',
      sourceGrid: '96x96 immutable Plate masks and stratigraphy topLayerByCell mapped through layerOrder; centroid coordinates use grid point convention index/(dimension-1), while mask pixels count grid cells.',
      topPartition: 'Four-neighbor internal cell edges are counted once and eligible only when both adjacent cells are occupied in both maps. Exterior edges are excluded and union silhouette is separate. ARI uses common occupied cells and contingency counts.',
      controls: ['union silhouette', 'identity turnover', 'frozen same-ID masks', 'birth pre-union overlap', 'label-invariant top partition', 'current top-visible Plate support', 'fixed birth-time windows', 'recent fixed-time cohort'],
      limits: ['one seed per run', 'accelerated deterministic simulation snapshots', 'not a human visual judgment', 'geometry cannot establish perceived difference or artistic adequacy'] },
    runs: runs.map(({ manifest, rows }) => ({ manifest, rows, milestoneTransitions: withinRunTransitions({ manifest, rows }), cohortTransitions: cohortTransitions({ manifest, rows }) })),
    matchedRunComparisons: comparisons(runs) };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'visual-turnover-metrics.json'), `${JSON.stringify(report, null, 2)}\n`);
  const summary = report.matchedRunComparisons.map((x) => {
    const p = x.topPartition;
    return `${x.seconds}s: Plates ${x.basePlateCount}/${x.shadowPlateCount}, retention ${x.commonPlateIds.length}/${x.basePlateCount}, same-ID mask IoU median ${x.sameIdGeometryIoU.median?.toFixed(3) ?? 'n/a'}, union IoU ${x.unionGeometryIoU?.toFixed(3) ?? 'empty'}, top identity agreement ${p.identityAgreementCells}/${p.commonOccupiedCells}, internal boundary IoU ${p.boundaryIntersectionEdges}/${p.boundaryUnionEdges}=${p.boundaryIoU?.toFixed(3) ?? 'n/a'}, ARI ${p.adjustedRandIndex?.toFixed(3) ?? 'n/a'}`;
  }).join('\n');
  const cohortSummary = cohortSummaryLines(report).join('\n');
  fs.writeFileSync(path.join(output, 'summary.txt'), `${summary}\n\nFixed birth-time window summaries (mask IoU and centroid spreads compare each cohort bin across consecutive captured milestones):\n${cohortSummary}\n`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runAnalysis();
