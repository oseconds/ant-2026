import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeEmergenceLandscape } from './ant-emergence-landscape.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-10-29-peak-saddle-domain-reproducibility');
const INPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-29-proposal-emergence-exploration/data/frozen-inputs.json.gz');
const PARENT = resolve(ROOT, 'docs/ant/evidence/2026-10-29-proposal-emergence-exploration/analysis.json');
const SOURCE = resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js');
const OUTPUT = resolve(EVIDENCE, 'data/domain-audit.json.gz');
const ATLAS = resolve(EVIDENCE, 'domain-atlas.svg');
const EXPECTED = {
  inputSha256: '6ff3ec3d6fb8bc0fa1f323532361ab9d19ecc0e75353b1b9ce3d6875c440842d',
  sourceSha256LF: 'cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67',
  sourceBlob: '238cc365f2602dc6a22091d69237b88962825a13',
  parentSha: '3a3eb22def8c6b89983458f9e5ffb73b0ec5d1db',
  mainSha: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785',
  roles: ['START', '+10s', 'COMMIT−2s', 'COMMIT−1s', 'COMMIT']
};

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function canonicalLf(text) { return text.replace(/\r\n/g, '\n'); }
function blobSha(text) {
  const bytes = Buffer.from(canonicalLf(text), 'utf8');
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex');
}
function float32Bytes(values) {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
}
function stats(values) {
  if (!values.length) return { count: 0, min: null, p10: null, median: null, p90: null, max: null, valuesSorted: [] };
  const sorted = values.slice().sort((a, b) => a - b);
  const quantile = p => sorted[Math.floor((sorted.length - 1) * p)];
  const middle = sorted.length >> 1;
  return {
    count: sorted.length, min: sorted[0], p10: quantile(0.1),
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p90: quantile(0.9), max: sorted[sorted.length - 1], valuesSorted: sorted
  };
}
function neighbors(index, width, height, adjacency, visit) {
  const row = Math.floor(index / width), column = index % width;
  for (let dy = -1; dy <= 1; dy += 1) {
    const y = row + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      if ((!dx && !dy) || (adjacency === 4 && Math.abs(dx) + Math.abs(dy) !== 1)) continue;
      const x = column + dx;
      if (x >= 0 && x < width) visit(y * width + x);
    }
  }
}
function elderPreferred(candidate, incumbent) {
  return candidate.birthLevel > incumbent.birthLevel
    || (candidate.birthLevel === incumbent.birthLevel && candidate.peakIndex < incumbent.peakIndex);
}
function connectedCells(start, E, B, level, width, height, adjacency, strict) {
  const seen = new Uint8Array(E.length), queue = [start], cells = [];
  seen[start] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    cells.push(index);
    neighbors(index, width, height, adjacency, adjacent => {
      if (seen[adjacent] || E[adjacent] !== 1) return;
      if (strict ? B[adjacent] <= level : B[adjacent] < level) return;
      seen[adjacent] = 1;
      queue.push(adjacent);
    });
  }
  return cells.sort((a, b) => a - b);
}
function domainBounds(cells, width) {
  let minX = width, minY = Infinity, maxX = -1, maxY = -1;
  for (const index of cells) {
    const x = index % width, y = Math.floor(index / width);
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function analyzeDomains({ width, height, E, B }, adjacency, eventId, stateIndex) {
  assert.ok(adjacency === 4 || adjacency === 8);
  const cellCount = width * height;
  assert.equal(E.length, cellCount);
  assert.equal(B.length, cellCount);
  const indices = [];
  for (let index = 0; index < cellCount; index += 1) {
    if (E[index] !== 0 && E[index] !== 1) throw new TypeError(`E[${index}] must be 0 or 1`);
    if (!E[index]) continue;
    if (!Number.isFinite(B[index])) throw new TypeError(`B[${index}] must be finite inside E`);
    indices.push(index);
  }
  indices.sort((left, right) => B[left] > B[right] ? -1 : B[left] < B[right] ? 1 : left - right);

  const parent = new Int32Array(cellCount); parent.fill(-1);
  const rank = new Uint8Array(cellCount), active = new Uint8Array(cellCount);
  const peakForRoot = new Int32Array(cellCount); peakForRoot.fill(-1);
  const peaks = [];
  const find = index => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (index !== root) { const next = parent[index]; parent[index] = root; index = next; }
    return root;
  };
  const union = (left, right) => {
    let a = find(left), b = find(right);
    if (a === b) return a;
    if (rank[a] < rank[b]) [a, b] = [b, a];
    parent[b] = a;
    if (rank[a] === rank[b]) rank[a] += 1;
    return a;
  };

  for (let start = 0; start < indices.length;) {
    const level = B[indices[start]];
    let end = start + 1;
    while (end < indices.length && B[indices[end]] === level) end += 1;
    const batch = indices.slice(start, end), localIndex = new Map(batch.map((index, local) => [index, local]));
    const oldRootSet = new Set();
    for (const index of batch) neighbors(index, width, height, adjacency, adjacent => {
      if (!localIndex.has(adjacent) && active[adjacent]) oldRootSet.add(find(adjacent));
    });
    const oldRoots = [...oldRootSet].sort((a, b) => a - b);
    const oldRootLocal = new Map(oldRoots.map((root, offset) => [root, batch.length + offset]));
    const temporaryParent = Int32Array.from({ length: batch.length + oldRoots.length }, (_, i) => i);
    const temporaryRank = new Uint8Array(temporaryParent.length);
    const temporaryFind = index => {
      let root = index;
      while (temporaryParent[root] !== root) root = temporaryParent[root];
      while (index !== root) { const next = temporaryParent[index]; temporaryParent[index] = root; index = next; }
      return root;
    };
    const temporaryUnion = (left, right) => {
      let a = temporaryFind(left), b = temporaryFind(right);
      if (a === b) return;
      if (temporaryRank[a] < temporaryRank[b]) [a, b] = [b, a];
      temporaryParent[b] = a;
      if (temporaryRank[a] === temporaryRank[b]) temporaryRank[a] += 1;
    };
    for (let local = 0; local < batch.length; local += 1) {
      const index = batch[local];
      neighbors(index, width, height, adjacency, adjacent => {
        const sameLevel = localIndex.get(adjacent);
        if (sameLevel !== undefined) temporaryUnion(local, sameLevel);
        else if (active[adjacent]) temporaryUnion(local, oldRootLocal.get(find(adjacent)));
      });
    }
    const groupsByRoot = new Map();
    const groupFor = root => {
      let group = groupsByRoot.get(root);
      if (!group) { group = { cells: [], roots: [], elderPeakId: -1, mergePeakIds: [] }; groupsByRoot.set(root, group); }
      return group;
    };
    for (let local = 0; local < batch.length; local += 1) groupFor(temporaryFind(local)).cells.push(batch[local]);
    for (const oldRoot of oldRoots) groupFor(temporaryFind(oldRootLocal.get(oldRoot))).roots.push(oldRoot);
    for (const group of groupsByRoot.values()) {
      group.cells.sort((a, b) => a - b);
      group.roots.sort((a, b) => a - b);
      if (!group.roots.length) {
        const id = peaks.length;
        peaks.push({ peakIndex: group.cells[0], peakCells: group.cells.slice(), birthLevel: level,
          essential: false, deathLevel: null, contrast: null, saddleLevel: null,
          saddleIndices: [], elderPeakIndex: null, mergePeakIndices: [] });
        group.elderPeakId = id;
        continue;
      }
      const peakIds = group.roots.map(root => peakForRoot[root]);
      if (peakIds.some(id => id < 0)) throw new Error('active component has no peak record');
      let elderPeakId = peakIds[0];
      for (const id of peakIds.slice(1)) if (elderPreferred(peaks[id], peaks[elderPeakId])) elderPeakId = id;
      group.elderPeakId = elderPeakId;
      group.mergePeakIds = peakIds.slice().sort((a, b) => peaks[a].peakIndex - peaks[b].peakIndex);
      if (group.roots.length > 1) {
        for (const id of peakIds) {
          if (id === elderPeakId) continue;
          const peak = peaks[id];
          peak.deathLevel = level;
          peak.contrast = peak.birthLevel - level;
          peak.saddleLevel = level;
          peak.saddleIndices = group.cells.slice();
          peak.elderPeakIndex = peaks[elderPeakId].peakIndex;
          peak.mergePeakIndices = group.mergePeakIds.map(peakId => peaks[peakId].peakIndex);
        }
      }
    }
    for (const index of batch) { active[index] = 1; parent[index] = index; }
    for (const index of batch) neighbors(index, width, height, adjacency, adjacent => {
      if (active[adjacent]) union(index, adjacent);
    });
    for (const group of groupsByRoot.values()) peakForRoot[find(group.cells[0])] = group.elderPeakId;
    start = end;
  }

  const essentialIds = new Set(), supportByPeak = new Map();
  for (const index of indices) {
    const id = peakForRoot[find(index)];
    essentialIds.add(id);
    if (!supportByPeak.has(id)) supportByPeak.set(id, []);
    supportByPeak.get(id).push(index);
  }
  for (const id of essentialIds) peaks[id].essential = true;
  const census = peaks.map((peak, peakId) => {
    const base = { ...peak, peakCells: peak.peakCells.slice(), saddleIndices: peak.saddleIndices.slice() };
    if (peak.essential) {
      const supportCellIndices = (supportByPeak.get(peakId) || []).slice().sort((a, b) => a - b);
      const componentMinimumLevel = supportCellIndices.reduce((minimum, cell) => Math.min(minimum, B[cell]), Infinity);
      return { ...base, id: `P${eventId}-S${stateIndex + 1}-A${adjacency}-P${peak.peakIndex}`,
        kind: 'essential', finite: false, supportCellIndices, supportCellCount: supportCellIndices.length,
        essentialPersistence: { status: 'no internal death in this E component', componentMinimumLevel,
          observedSuperlevelSpanToComponentMinimum: peak.birthLevel - componentMinimumLevel },
        domainCellIndices: null, domainCellCount: null, bbox: null, contrast: null,
        deathLevel: null, saddleLevel: null, elderPeakIndex: null, mergePeakIndices: [] };
    }
    const domainCellIndices = connectedCells(peak.peakIndex, E, B, peak.deathLevel, width, height, adjacency, true);
    return { ...base, id: `P${eventId}-S${stateIndex + 1}-A${adjacency}-P${peak.peakIndex}`,
      kind: 'finite', finite: true, supportCellIndices: null, supportCellCount: null,
      domainCellIndices, domainCellCount: domainCellIndices.length, bbox: domainBounds(domainCellIndices, width) };
  }).sort((a, b) => a.peakIndex - b.peakIndex);

  const finite = census.filter(peak => peak.finite);
  const strongestEssential = census.filter(peak => peak.essential)
    .slice().sort((a, b) => b.birthLevel - a.birthLevel || a.peakIndex - b.peakIndex)[0] || null;
  const winner = finite.slice().sort((a, b) => b.contrast - a.contrast || a.peakIndex - b.peakIndex)[0] || null;
  return {
    adjacency, domainCellCount: indices.length, domainComponentCount: essentialIds.size,
    localPeakCount: census.length, essentialPeakCount: essentialIds.size, finitePeakCount: finite.length,
    winnerPeakIndex: winner?.peakIndex ?? null, winnerContrast: winner?.contrast ?? null,
    strongestEssential: strongestEssential ? { peakIndex: strongestEssential.peakIndex,
      birthLevel: strongestEssential.birthLevel, supportCellCount: strongestEssential.supportCellCount,
      componentMinimumLevel: strongestEssential.essentialPersistence.componentMinimumLevel,
      observedSuperlevelSpanToComponentMinimum: strongestEssential.essentialPersistence.observedSuperlevelSpanToComponentMinimum } : null,
    finiteDomainSize: stats(finite.map(peak => peak.domainCellCount)),
    contrast: stats(finite.map(peak => peak.contrast)),
    essentialSupportSize: stats(census.filter(peak => peak.essential).map(peak => peak.supportCellCount)),
    peaks: census
  };
}

function compareSets(sourceItems, targetItems, cellsKey, cellCount) {
  const targetAtCell = Array.from({ length: cellCount }, () => []);
  targetItems.forEach((item, targetIndex) => {
    for (const cell of item[cellsKey]) targetAtCell[cell].push(targetIndex);
  });
  const sourceMaps = sourceItems.map(item => {
    const counts = new Map();
    for (const cell of item[cellsKey]) for (const targetIndex of targetAtCell[cell]) {
      counts.set(targetIndex, (counts.get(targetIndex) || 0) + 1);
    }
    return counts;
  });
  const targetDegrees = new Uint32Array(targetItems.length);
  const pairs = [];
  for (let sourceIndex = 0; sourceIndex < sourceItems.length; sourceIndex += 1) {
    for (const [targetIndex, intersection] of sourceMaps[sourceIndex]) {
      const source = sourceItems[sourceIndex], target = targetItems[targetIndex];
      const union = source[cellsKey].length + target[cellsKey].length - intersection;
      pairs.push({ sourcePeakIndex: source.peakIndex, targetPeakIndex: target.peakIndex,
        intersection, sourceSize: source[cellsKey].length, targetSize: target[cellsKey].length,
        union, jaccard: intersection / union });
      targetDegrees[targetIndex] += 1;
    }
  }
  const byPeak = (a, b) => a.peakIndex - b.peakIndex;
  const chooseIntersection = (a, b, otherKey) => b.intersection - a.intersection
    || b.jaccard - a.jaccard || a[otherKey] - b[otherKey];
  const chooseJaccard = (a, b, otherKey) => b.jaccard - a.jaccard
    || b.intersection - a.intersection || a[otherKey] - b[otherKey];
  const sourceOptions = sourceItems.map(source => pairs.filter(pair => pair.sourcePeakIndex === source.peakIndex));
  const targetOptions = targetItems.map(target => pairs.filter(pair => pair.targetPeakIndex === target.peakIndex));
  const sourceBestOverlap = new Map(), sourceBestJaccard = new Map();
  const targetBestOverlap = new Map(), targetBestJaccard = new Map();
  sourceItems.forEach((source, i) => {
    sourceBestOverlap.set(source.peakIndex, sourceOptions[i].slice().sort((a, b) => chooseIntersection(a, b, 'targetPeakIndex'))[0] || null);
    sourceBestJaccard.set(source.peakIndex, sourceOptions[i].slice().sort((a, b) => chooseJaccard(a, b, 'targetPeakIndex'))[0] || null);
  });
  targetItems.forEach((target, i) => {
    targetBestOverlap.set(target.peakIndex, targetOptions[i].slice().sort((a, b) => chooseIntersection(a, b, 'sourcePeakIndex'))[0] || null);
    targetBestJaccard.set(target.peakIndex, targetOptions[i].slice().sort((a, b) => chooseJaccard(a, b, 'sourcePeakIndex'))[0] || null);
  });
  for (const pair of pairs) {
    pair.reciprocalBestIntersection = sourceBestOverlap.get(pair.sourcePeakIndex)?.targetPeakIndex === pair.targetPeakIndex
      && targetBestOverlap.get(pair.targetPeakIndex)?.sourcePeakIndex === pair.sourcePeakIndex;
    pair.reciprocalBestJaccard = sourceBestJaccard.get(pair.sourcePeakIndex)?.targetPeakIndex === pair.targetPeakIndex
      && targetBestJaccard.get(pair.targetPeakIndex)?.sourcePeakIndex === pair.sourcePeakIndex;
  }
  pairs.sort((a, b) => a.sourcePeakIndex - b.sourcePeakIndex || a.targetPeakIndex - b.targetPeakIndex);
  return {
    possiblePairCount: sourceItems.length * targetItems.length,
    nonzeroPairCount: pairs.length,
    pairs,
    source: sourceItems.map((item, index) => ({
      peakIndex: item.peakIndex, nonzeroSuccessorCount: sourceOptions[index].length,
      bestByIntersection: sourceBestOverlap.get(item.peakIndex),
      bestByJaccard: sourceBestJaccard.get(item.peakIndex)
    })).sort(byPeak),
    target: targetItems.map((item, index) => ({
      peakIndex: item.peakIndex, nonzeroPredecessorCount: targetOptions[index].length,
      bestByIntersection: targetBestOverlap.get(item.peakIndex),
      bestByJaccard: targetBestJaccard.get(item.peakIndex)
    })).sort(byPeak),
    zeroOverlapSourcePeakIndices: sourceItems.filter(item => !sourceBestOverlap.get(item.peakIndex)).map(item => item.peakIndex).sort((a, b) => a - b),
    zeroOverlapTargetPeakIndices: targetItems.filter(item => !targetBestOverlap.get(item.peakIndex)).map(item => item.peakIndex).sort((a, b) => a - b),
    splitSourceCount: sourceItems.filter(item => sourceBestOverlap.get(item.peakIndex)
      && sourceOptions[sourceItems.indexOf(item)].length > 1).length,
    mergeTargetCount: targetItems.filter(item => targetBestOverlap.get(item.peakIndex)
      && targetOptions[targetItems.indexOf(item)].length > 1).length,
    reciprocalBestIntersectionCount: pairs.filter(pair => pair.reciprocalBestIntersection).length,
    reciprocalBestJaccardCount: pairs.filter(pair => pair.reciprocalBestJaccard).length
  };
}

function enrichDomainPairs(matrix, sourceCensus, targetCensus, width) {
  const sourceByIndex = new Map(sourceCensus.peaks.map(peak => [peak.peakIndex, peak]));
  const targetByIndex = new Map(targetCensus.peaks.map(peak => [peak.peakIndex, peak]));
  return matrix.pairs.map(pair => {
    const source = sourceByIndex.get(pair.sourcePeakIndex), target = targetByIndex.get(pair.targetPeakIndex);
    const sourceX = source.peakIndex % width, sourceY = Math.floor(source.peakIndex / width);
    const targetX = target.peakIndex % width, targetY = Math.floor(target.peakIndex / width);
    const peakPlateauIntersection = source.peakCells.filter(cell => target.peakCells.includes(cell)).length;
    const saddleCellIntersection = source.saddleIndices.filter(cell => target.saddleIndices.includes(cell)).length;
    return { ...pair, peakPlateauIntersection,
      peakPlateauJaccard: peakPlateauIntersection / (source.peakCells.length + target.peakCells.length - peakPlateauIntersection),
      peakCellDisplacementPx: Math.hypot(targetX - sourceX, targetY - sourceY),
      birthLevelDelta: target.birthLevel - source.birthLevel,
      deathLevelDelta: target.deathLevel - source.deathLevel,
      saddleCellIntersection,
      saddleJaccard: saddleCellIntersection / (source.saddleIndices.length + target.saddleIndices.length - saddleCellIntersection),
      saddleLevelDelta: target.saddleLevel - source.saddleLevel,
      elderPeakIndexFrom: source.elderPeakIndex,
      elderPeakIndexTo: target.elderPeakIndex,
      elderParentChanged: source.elderPeakIndex !== target.elderPeakIndex };
  });
}

function comparePeaks(sourceCensus, targetCensus, cellCount) {
  const sourcePeaks = sourceCensus.peaks.map(peak => ({ ...peak, cellsForMatch: peak.peakCells }));
  const targetPeaks = targetCensus.peaks.map(peak => ({ ...peak, cellsForMatch: peak.peakCells }));
  const matrix = compareSets(sourcePeaks, targetPeaks, 'cellsForMatch', cellCount);
  const sourceByIndex = new Map(sourcePeaks.map(peak => [peak.peakIndex, peak]));
  const targetByIndex = new Map(targetPeaks.map(peak => [peak.peakIndex, peak]));
  matrix.pairs = matrix.pairs.map(pair => {
    const source = sourceByIndex.get(pair.sourcePeakIndex), target = targetByIndex.get(pair.targetPeakIndex);
    return { ...pair, sourceKind: source.kind, targetKind: target.kind,
      finiteEssentialFlip: source.finite !== target.finite,
      birthLevelDelta: target.birthLevel - source.birthLevel };
  });
  matrix.finiteEssentialFlipPairs = matrix.pairs.filter(pair => pair.finiteEssentialFlip);
  matrix.sourceWithoutPeakPlateauOverlap = matrix.zeroOverlapSourcePeakIndices;
  matrix.targetWithoutPeakPlateauOverlap = matrix.zeroOverlapTargetPeakIndices;
  return matrix;
}

function compareDomains(sourceState, targetState, adjacency, width, cellCount) {
  const sourceCensus = sourceState.adjacencies[String(adjacency)];
  const targetCensus = targetState.adjacencies[String(adjacency)];
  const sourceFinite = sourceCensus.peaks.filter(peak => peak.finite);
  const targetFinite = targetCensus.peaks.filter(peak => peak.finite);
  const matrix = compareSets(sourceFinite, targetFinite, 'domainCellIndices', cellCount);
  const pairMetrics = enrichDomainPairs(matrix, sourceCensus, targetCensus, width);
  const metricsByKey = new Map(pairMetrics.map(pair => [`${pair.sourcePeakIndex}:${pair.targetPeakIndex}`, pair]));
  const bestIntersectionMetrics = matrix.source.map(row => row.bestByIntersection
    ? metricsByKey.get(`${row.peakIndex}:${row.bestByIntersection.targetPeakIndex}`) : null).filter(Boolean);
  const peakPlateauCorrespondence = comparePeaks(sourceCensus, targetCensus, cellCount);
  const peakFlips = peakPlateauCorrespondence.finiteEssentialFlipPairs;
  return {
    adjacency, sourceDomainCount: sourceFinite.length, targetDomainCount: targetFinite.length,
    domainPairs: pairMetrics,
    source: matrix.source, target: matrix.target,
    zeroOverlapSourcePeakIndices: matrix.zeroOverlapSourcePeakIndices,
    zeroOverlapTargetPeakIndices: matrix.zeroOverlapTargetPeakIndices,
    splitSourceCount: matrix.splitSourceCount, mergeTargetCount: matrix.mergeTargetCount,
    reciprocalBestIntersectionCount: matrix.reciprocalBestIntersectionCount,
    reciprocalBestJaccardCount: matrix.reciprocalBestJaccardCount,
    possiblePairCount: matrix.possiblePairCount, nonzeroPairCount: matrix.nonzeroPairCount,
    sourceWithNonzeroSuccessorOverlapCount: sourceFinite.length - matrix.zeroOverlapSourcePeakIndices.length,
    targetWithNonzeroPredecessorOverlapCount: targetFinite.length - matrix.zeroOverlapTargetPeakIndices.length,
    bestIntersectionCounterpartMetrics: {
      jaccard: stats(bestIntersectionMetrics.map(pair => pair.jaccard)),
      peakPlateauJaccard: stats(bestIntersectionMetrics.map(pair => pair.peakPlateauJaccard)),
      peakCellDisplacementPx: stats(bestIntersectionMetrics.map(pair => pair.peakCellDisplacementPx)),
      saddleJaccard: stats(bestIntersectionMetrics.map(pair => pair.saddleJaccard)),
      saddleLevelDelta: stats(bestIntersectionMetrics.map(pair => pair.saddleLevelDelta))
    },
    finiteEssentialFlipPairs: peakFlips,
    finiteToEssentialFlipCount: peakFlips.filter(pair => pair.sourceKind === 'finite' && pair.targetKind === 'essential').length,
    essentialToFiniteFlipCount: peakFlips.filter(pair => pair.sourceKind === 'essential' && pair.targetKind === 'finite').length,
    peakPlateauCorrespondence
  };
}

function compareAdjacency(state, width, cellCount) {
  const census8 = state.adjacencies['8'], census4 = state.adjacencies['4'];
  const domains8 = census8.peaks.filter(peak => peak.finite), domains4 = census4.peaks.filter(peak => peak.finite);
  const peakCorrespondence = comparePeaks(census8, census4, cellCount);
  const domainMatrix = compareSets(domains8, domains4, 'domainCellIndices', cellCount);
  const finiteByIndex8 = new Map(domains8.map(peak => [peak.peakIndex, peak]));
  const finiteByIndex4 = new Map(domains4.map(peak => [peak.peakIndex, peak]));
  const finiteFlipPeakPairs = peakCorrespondence.finiteEssentialFlipPairs;
  const winner8 = getWinner(census8), winner4 = getWinner(census4);
  const winnerDomainPair = winner8 && winner4 ? domainMatrix.pairs.find(pair => pair.sourcePeakIndex === winner8.peakIndex
    && pair.targetPeakIndex === winner4.peakIndex) || null : null;
  const bestIntersectionMetrics = domainMatrix.source.map(row => row.bestByIntersection
    ? domainMatrix.pairs.find(pair => pair.sourcePeakIndex === row.peakIndex
      && pair.targetPeakIndex === row.bestByIntersection.targetPeakIndex) : null).filter(Boolean);
  return {
    stateKey: state.key, timeMs: state.timeMs,
    counts: { adjacency8: { finite: census8.finitePeakCount, essential: census8.essentialPeakCount },
      adjacency4: { finite: census4.finitePeakCount, essential: census4.essentialPeakCount } },
    finiteDomainPairs: domainMatrix.pairs.map(pair => {
      const source = finiteByIndex8.get(pair.sourcePeakIndex), target = finiteByIndex4.get(pair.targetPeakIndex);
      return { ...pair,
        peakPlateauIntersection: source.peakCells.filter(cell => target.peakCells.includes(cell)).length,
        sizeDelta4Minus8: target.domainCellCount - source.domainCellCount,
        contrastDelta4Minus8: target.contrast - source.contrast };
    }),
    finiteDomainSource: domainMatrix.source, finiteDomainTarget: domainMatrix.target,
    finiteDomains8WithoutOverlap: domainMatrix.zeroOverlapSourcePeakIndices,
    finiteDomains4WithoutOverlap: domainMatrix.zeroOverlapTargetPeakIndices,
    peakPlateauCorrespondence: peakCorrespondence,
    finiteEssentialFlipPairs: finiteFlipPeakPairs,
    finiteToEssentialFlipCount: finiteFlipPeakPairs.filter(pair => pair.sourceKind === 'finite' && pair.targetKind === 'essential').length,
    essentialToFiniteFlipCount: finiteFlipPeakPairs.filter(pair => pair.sourceKind === 'essential' && pair.targetKind === 'finite').length,
    noPeakPlateauOverlap8: peakCorrespondence.sourceWithoutPeakPlateauOverlap,
    noPeakPlateauOverlap4: peakCorrespondence.targetWithoutPeakPlateauOverlap,
    winner8, winner4, winnerPeakIndexSame: winner8?.peakIndex === winner4?.peakIndex,
    winnerDomainOverlap8To4: winnerDomainPair,
    domainSplit8To4SourceCount: domainMatrix.splitSourceCount,
    domainMerge8To4TargetCount: domainMatrix.mergeTargetCount,
    reciprocalBestIntersectionCount: domainMatrix.reciprocalBestIntersectionCount,
    reciprocalBestJaccardCount: domainMatrix.reciprocalBestJaccardCount,
    bestIntersectionCounterpartJaccard: stats(bestIntersectionMetrics.map(pair => pair.jaccard)),
    allNonzeroDomainPairJaccard: stats(domainMatrix.pairs.map(pair => pair.jaccard)),
    possibleDomainPairCount: domainMatrix.possiblePairCount,
    nonzeroDomainPairCount: domainMatrix.nonzeroPairCount
  };
}

function getWinner(census) {
  const peak = census.peaks.find(item => item.peakIndex === census.winnerPeakIndex) || null;
  if (!peak) return null;
  const rankByContrast = census.peaks.filter(item => item.finite)
    .slice().sort((a, b) => b.contrast - a.contrast || a.peakIndex - b.peakIndex)
    .findIndex(item => item.peakIndex === peak.peakIndex) + 1;
  return { peakIndex: peak.peakIndex, contrast: peak.contrast, domainCellCount: peak.domainCellCount, rankByContrast };
}

function transitionWinnerControl(sourceState, targetState, comparison, adjacency) {
  const oldWinner = getWinner(sourceState.adjacencies[String(adjacency)]);
  const newWinner = getWinner(targetState.adjacencies[String(adjacency)]);
  if (!oldWinner || !newWinner) return { oldWinner, newWinner, winnerChanged: oldWinner?.peakIndex !== newWinner?.peakIndex };
  const oldOptions = comparison.source.find(row => row.peakIndex === oldWinner.peakIndex);
  const oldBest = oldOptions?.bestByIntersection || null;
  const winnerPair = comparison.domainPairs.find(pair => pair.sourcePeakIndex === oldWinner.peakIndex
    && pair.targetPeakIndex === newWinner.peakIndex) || null;
  const oldBestCounterpartRank = oldBest
    ? targetState.adjacencies[String(adjacency)].peaks.filter(peak => peak.finite).slice()
      .sort((a, b) => b.contrast - a.contrast || a.peakIndex - b.peakIndex)
      .findIndex(peak => peak.peakIndex === oldBest.targetPeakIndex) + 1
    : null;
  const newWinnerPredecessors = comparison.target.find(row => row.peakIndex === newWinner.peakIndex);
  return {
    oldWinner, newWinner,
    winnerChanged: oldWinner.peakIndex !== newWinner.peakIndex,
    oldWinnerHasAnySpatialOverlap: Boolean(oldOptions?.nonzeroSuccessorCount),
    oldWinnerNonzeroSuccessorCount: oldOptions?.nonzeroSuccessorCount || 0,
    oldWinnerBestByIntersection: oldBest,
    oldWinnerBestCounterpartRankByTargetContrast: oldBestCounterpartRank,
    oldWinnerToNewWinnerOverlap: winnerPair,
    newWinnerPredecessorCount: newWinnerPredecessors?.nonzeroPredecessorCount || 0,
    newWinnerBestByIntersectionPredecessor: newWinnerPredecessors?.bestByIntersection || null,
    winnerSwitchWithPriorWinnerSpatialOverlap: oldWinner.peakIndex !== newWinner.peakIndex
      && Boolean(oldOptions?.nonzeroSuccessorCount),
    rankingCrossoverObservedDescriptively: oldWinner.peakIndex !== newWinner.peakIndex
      && Boolean(oldOptions?.nonzeroSuccessorCount)
      && oldBest?.targetPeakIndex !== newWinner.peakIndex
      && newWinnerPredecessors?.bestByIntersection?.sourcePeakIndex !== oldWinner.peakIndex
  };
}

function buildAudit() {
  const inputBytes = readFileSync(INPUT), input = JSON.parse(gunzipSync(inputBytes).toString('utf8'));
  const parent = JSON.parse(readFileSync(PARENT, 'utf8'));
  const sourceText = readFileSync(SOURCE, 'utf8'), sourceLf = canonicalLf(sourceText);
  const inputHash = sha256(inputBytes), sourceHash = sha256(Buffer.from(sourceLf, 'utf8'));
  assert.equal(inputHash, EXPECTED.inputSha256, 'frozen gzip hash mismatch');
  assert.equal(sourceHash, EXPECTED.sourceSha256LF, 'TrailPlateBirth LF hash mismatch');
  assert.equal(blobSha(sourceText), EXPECTED.sourceBlob, 'TrailPlateBirth source blob mismatch');
  assert.equal(input.main, EXPECTED.mainSha);
  assert.equal(input.rawGzipSha256, '909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc');
  assert.equal(parent.inputSha256, EXPECTED.inputSha256);
  assert.equal(parent.sourceSha256LF, EXPECTED.sourceSha256LF);
  assert.equal(input.events.length, 2);
  const width = 96, height = 96, cellCount = width * height;
  const states = [];
  for (const event of input.events) {
    assert.equal(event.anchors.length, EXPECTED.roles.length);
    for (let stateIndex = 0; stateIndex < event.anchors.length; stateIndex += 1) {
      const anchor = event.anchors[stateIndex];
      const E = Uint8Array.from(anchor.maps.E_qualified);
      const B = Float32Array.from(anchor.maps.B_memory);
      assert.equal(E.length, cellCount); assert.equal(B.length, cellCount);
      const state = {
        key: `P${event.id}-S${stateIndex + 1}`, event: `P${event.id}`,
        eventId: event.id, stateIndex, role: EXPECTED.roles[stateIndex],
        timeMs: anchor.timeMs, timeSeconds: anchor.timeMs / 1000,
        grid: { width, height, rowMajor: true },
        mapHashes: { E_qualified: sha256(Buffer.from(E)), B_memoryFloat32LE: sha256(float32Bytes(B)) },
        adjacencies: {}
      };
      for (const adjacency of [8, 4]) {
        const census = analyzeDomains({ width, height, E, B }, adjacency, event.id, stateIndex);
        state.adjacencies[String(adjacency)] = census;
        if (adjacency === 8) {
          const parentLandscape = parent.events.find(row => row.id === event.id).anchors[stateIndex].candidates.B.landscape;
          const ownByIndex = new Map(census.peaks.map(peak => [peak.peakIndex, peak]));
          assert.equal(parentLandscape.localPeakCount, census.localPeakCount, `${state.key}: parent peak count`);
          assert.equal(parentLandscape.essentialPeakCount, census.essentialPeakCount, `${state.key}: parent essential count`);
          assert.equal(parentLandscape.finitePeakCount, census.finitePeakCount, `${state.key}: parent finite count`);
          for (const oldPeak of parentLandscape.peaks) {
            const peak = ownByIndex.get(oldPeak.peakIndex);
            assert.ok(peak, `${state.key}: missing parent peak ${oldPeak.peakIndex}`);
            for (const field of ['birthLevel', 'essential', 'deathLevel', 'contrast', 'saddleLevel'])
              assert.equal(peak[field], oldPeak[field], `${state.key} peak ${peak.peakIndex} ${field}`);
            assert.deepEqual(peak.peakCells, oldPeak.peakCells, `${state.key} peak plateau ${peak.peakIndex}`);
            assert.deepEqual(peak.saddleIndices, oldPeak.saddleIndices, `${state.key} saddle cells ${peak.peakIndex}`);
          }
          const parentWinner = parentLandscape.selected?.peakIndex ?? null;
          assert.equal(census.winnerPeakIndex, parentWinner, `${state.key}: parent winner`);
          if (parentWinner !== null) {
            const parentDomain = parentLandscape.selected.premergeRegion.cellIndices;
            assert.deepEqual(ownByIndex.get(parentWinner).domainCellIndices, parentDomain,
              `${state.key}: parent finite domain`);
          }
          state.parentBParity = 'exact peaks, levels, contrasts, winner and winner domain';
        }
      }
      states.push(state);
    }
  }

  const temporalTransitions = [], adjacencyComparisons = [];
  for (const event of input.events) {
    const eventStates = states.filter(state => state.eventId === event.id);
    for (const adjacency of [8, 4]) {
      for (let index = 0; index < eventStates.length - 1; index += 1) {
        const source = eventStates[index], target = eventStates[index + 1];
        const comparison = compareDomains(source, target, adjacency, width, cellCount);
        const gapSeconds = (target.timeMs - source.timeMs) / 1000;
        temporalTransitions.push({ event: source.event, adjacency, from: source.key, to: target.key,
          fromRole: source.role, toRole: target.role, fromTimeMs: source.timeMs, toTimeMs: target.timeMs,
          gapMs: target.timeMs - source.timeMs, gapSeconds,
          adjacentOneSecondSavedStates: Math.abs(gapSeconds - 1) < 1e-9,
          ...comparison, winnerControl: transitionWinnerControl(source, target, comparison, adjacency) });
      }
    }
  }
  for (const state of states) adjacencyComparisons.push(compareAdjacency(state, width, cellCount));
  const lateTransitions = temporalTransitions.filter(transition => transition.adjacency === 8 && transition.adjacentOneSecondSavedStates);
  const wholeSequence = Object.fromEntries([8, 4].map(adjacency => {
    const censuses = states.map(state => state.adjacencies[String(adjacency)]);
    const finite = censuses.flatMap(census => census.peaks.filter(peak => peak.finite));
    const essential = censuses.flatMap(census => census.peaks.filter(peak => peak.essential));
    return [String(adjacency), { finiteLobeCount: finite.length, essentialPeakCount: essential.length,
      finiteDomainSize: stats(finite.map(peak => peak.domainCellCount)),
      finiteContrast: stats(finite.map(peak => peak.contrast)),
      essentialSupportSize: stats(essential.map(peak => peak.supportCellCount)) }];
  }));
  const audit = {
    schema: 'ant-peak-saddle-domain-audit-v1',
    provenance: {
      productionMainSha: EXPECTED.mainSha, researchParentSha: EXPECTED.parentSha,
      frozenInputPath: 'docs/ant/evidence/2026-10-29-proposal-emergence-exploration/data/frozen-inputs.json.gz',
      frozenInputSha256: inputHash, upstreamRawPacket: input.rawRef,
      upstreamRawGzipSha256: input.rawGzipSha256, upstreamRawJsonSha256: input.rawJsonSha256,
      sourcePath: 'src/lib/agents/ant/TrailPlateBirth.js', sourceBlob: EXPECTED.sourceBlob,
      sourceSha256LF: sourceHash, noReplay: true, noRng: true, productionFilesChanged: false
    },
    method: {
      width, height, statesUsed: states.map(state => ({ key: state.key, role: state.role, timeMs: state.timeMs })),
      adjacencyPrimary: 8, adjacencySensitivityOnly: 4,
      domainRule: 'For each finite nonessential peak: the strict-superlevel E component B > its death level under the same adjacency.',
      plateauRule: 'Equal-valued cells activate atomically; each connected maximum plateau is one peak.',
      elderRule: 'Greater birth level, then lower row-major peak index.',
      winnerRule: 'Greatest finite contrast; ties use lower row-major peak index.',
      distributionRule: 'Report full sorted values; p10/p90 use floor((n−1)×p) index, and even-count median averages the two middle values.',
      essentialRule: 'Count and retain final E-component support, with no internal death; never convert to a finite lobe.',
      correspondenceRule: 'Full sparse nonzero-overlap pairs; no identity threshold. Best ties: intersection, then Jaccard, then lower counterpart peak index.',
      noFiltersOrTuning: true,
      fieldMeaning: 'B_memory is a chemical/history readout; its peak–saddle domains are mathematical organizations, not physical material domains.'
    },
    states, temporalTransitions, adjacentOneSecondTransitions: lateTransitions.map(row => ({ adjacency: 8, from: row.from, to: row.to })),
    adjacencyComparisons,
    wholeSequenceSummary: wholeSequence,
    sequenceSummary: {
      stateCount: states.length, transitionCount: temporalTransitions.length,
      adjacentOneSecondTransitionCount: lateTransitions.length,
      winnerChangeCountByAdjacency: Object.fromEntries([8, 4].map(adjacency => [adjacency,
        temporalTransitions.filter(row => row.adjacency === adjacency && row.winnerControl.winnerChanged).length])),
      winnerSwitchWithPriorWinnerSpatialOverlapCountByAdjacency: Object.fromEntries([8, 4].map(adjacency => [adjacency,
        temporalTransitions.filter(row => row.adjacency === adjacency && row.winnerControl.winnerSwitchWithPriorWinnerSpatialOverlap).length])),
      descriptiveRankingCrossoverCountByAdjacency: Object.fromEntries([8, 4].map(adjacency => [adjacency,
        temporalTransitions.filter(row => row.adjacency === adjacency && row.winnerControl.rankingCrossoverObservedDescriptively).length])),
      lateAdjacent: lateTransitions.map(row => ({ adjacency: row.adjacency, from: row.from, to: row.to,
        sourceFinite: row.sourceDomainCount, targetFinite: row.targetDomainCount,
        sourceWithNonzeroSuccessorOverlap: row.sourceDomainCount - row.zeroOverlapSourcePeakIndices.length,
        targetWithNonzeroPredecessorOverlap: row.targetDomainCount - row.zeroOverlapTargetPeakIndices.length,
        reciprocalBestIntersectionCount: row.reciprocalBestIntersectionCount,
        splitSourceCount: row.splitSourceCount, mergeTargetCount: row.mergeTargetCount,
        winnerChanged: row.winnerControl.winnerChanged,
        oldWinnerHasAnySpatialOverlap: row.winnerControl.oldWinnerHasAnySpatialOverlap,
        oldWinnerBestByIntersection: row.winnerControl.oldWinnerBestByIntersection,
        oldWinnerToNewWinnerOverlap: row.winnerControl.oldWinnerToNewWinnerOverlap,
        rankingCrossoverObservedDescriptively: row.winnerControl.rankingCrossoverObservedDescriptively }))
    }
  };
  return audit;
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function hue(key) {
  let hash = 2166136261;
  for (const char of key) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % 360;
}
function boundaryPath(cells, width) {
  const set = new Set(cells), parts = [];
  for (const index of cells) {
    const x = index % width, y = Math.floor(index / width);
    if (!set.has(index - width)) parts.push(`M${x},${y}h1`);
    if (x === width - 1 || !set.has(index + 1)) parts.push(`M${x + 1},${y}v1`);
    if (!set.has(index + width)) parts.push(`M${x + 1},${y + 1}h-1`);
    if (x === 0 || !set.has(index - 1)) parts.push(`M${x},${y + 1}v-1`);
  }
  return parts.join('');
}
function statePanel(state, adjacency, x, y, audit) {
  const size = 144, scale = size / audit.method.width;
  const census = state.adjacencies[String(adjacency)];
  const input = JSON.parse(gunzipSync(readFileSync(INPUT)).toString('utf8'));
  const event = input.events.find(row => row.id === state.eventId);
  const E = event.anchors[state.stateIndex].maps.E_qualified;
  const parts = [`<g transform="translate(${x},${y})">`, `<rect width="${size}" height="${size}" fill="#fff" stroke="#40464f"/>`];
  const eCells = [];
  for (let index = 0; index < E.length; index += 1) if (E[index]) eCells.push(index);
  parts.push(`<path d="${eCells.map(index => `M${index % audit.method.width},${Math.floor(index / audit.method.width)}h1v1h-1z`).join('')}" fill="#e4e7eb" transform="scale(${scale})"/>`);
  for (const peak of census.peaks.filter(row => row.finite)) {
    const color = `hsl(${hue(`${state.key}|${adjacency}|${peak.peakIndex}`)} 68% 42%)`;
    parts.push(`<g fill="none" stroke="${color}" stroke-width="0.45" vector-effect="non-scaling-stroke"><title>${escapeXml(`peak ${peak.peakIndex}; finite domain; ${peak.domainCellCount} cells; contrast ${peak.contrast}`)}</title><path d="${boundaryPath(peak.domainCellIndices, audit.method.width)}" transform="scale(${scale})"/></g>`);
  }
  const winner = census.peaks.find(row => row.peakIndex === census.winnerPeakIndex);
  if (winner) parts.push(`<circle cx="${(winner.peakIndex % audit.method.width + 0.5) * scale}" cy="${(Math.floor(winner.peakIndex / audit.method.width) + 0.5) * scale}" r="3.4" fill="#ffd43b" stroke="#111" stroke-width="1"><title>${escapeXml(`greatest finite contrast control: peak ${winner.peakIndex}`)}</title></circle>`);
  parts.push(`</g><text x="${x}" y="${y + size + 14}" class="small">${escapeXml(`${state.key} ${state.role} · A${adjacency} · ${census.finitePeakCount} finite / ${census.essentialPeakCount} essential`)}</text>`);
  return parts.join('');
}
function occupancyOverlay(state, x, y, audit) {
  const w = audit.method.width, h = audit.method.height, size = 144, scale = size / w;
  const eight = new Set(state.adjacencies['8'].peaks.filter(peak => peak.finite).flatMap(peak => peak.domainCellIndices));
  const four = new Set(state.adjacencies['4'].peaks.filter(peak => peak.finite).flatMap(peak => peak.domainCellIndices));
  const parts = [`<g transform="translate(${x},${y}) scale(${scale})">`, `<rect width="${w}" height="${h}" fill="#fff" stroke="#40464f" vector-effect="non-scaling-stroke"/>`];
  const both = [], only8 = [], only4 = [];
  for (const cell of eight) (four.has(cell) ? both : only8).push(cell);
  for (const cell of four) if (!eight.has(cell)) only4.push(cell);
  const pathFor = cells => cells.map(index => `M${index % w},${Math.floor(index / w)}h1v1h-1z`).join('');
  parts.push(`<path d="${pathFor(only8)}" fill="#1397c5"/>`, `<path d="${pathFor(only4)}" fill="#c04eb5"/>`, `<path d="${pathFor(both)}" fill="#555"/>`, '</g>');
  parts.push(`<text x="${x}" y="${y + size + 14}" class="small">${state.key} target occupancy · 8-only ${only8.length} · 4-only ${only4.length} · both ${both.length}</text>`);
  return parts.join('');
}
function overlapMatrixPanel(transition, x, y, width, height) {
  const rows = transition.source.map(row => row.peakIndex), cols = transition.target.map(row => row.peakIndex);
  const cellW = width / Math.max(1, cols.length), cellH = height / Math.max(1, rows.length);
  const rowIndex = new Map(rows.map((peak, i) => [peak, i])), colIndex = new Map(cols.map((peak, i) => [peak, i]));
  const parts = [`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#fff" stroke="#40464f"/>`];
  for (const pair of transition.domainPairs) {
    const cx = colIndex.get(pair.targetPeakIndex), ry = rowIndex.get(pair.sourcePeakIndex);
    const opacity = 0.18 + 0.82 * pair.jaccard;
    parts.push(`<rect x="${x + cx * cellW}" y="${y + ry * cellH}" width="${Math.max(0.35, cellW)}" height="${Math.max(0.35, cellH)}" fill="#1875ad" fill-opacity="${opacity}"/>`);
  }
  parts.push(`<text x="${x}" y="${y - 5}" class="tiny">rows: ${rows.length} source peaks (${rows[0] ?? 'none'}…${rows.at(-1) ?? 'none'}) · cols: ${cols.length} target peaks (${cols[0] ?? 'none'}…${cols.at(-1) ?? 'none'})</text>`);
  return parts.join('');
}
function winnerText(transition, x, y) {
  const w = transition.winnerControl, lines = [
    `from winner p${w.oldWinner?.peakIndex ?? '—'} · c=${w.oldWinner?.contrast ?? '—'} · ${w.oldWinner?.domainCellCount ?? '—'} cells`,
    `to winner p${w.newWinner?.peakIndex ?? '—'} · c=${w.newWinner?.contrast ?? '—'} · ${w.newWinner?.domainCellCount ?? '—'} cells`,
    `winner changed: ${w.winnerChanged}`,
    `old winner has overlap successor: ${w.oldWinnerHasAnySpatialOverlap}`,
    `old winner best intersection: ${w.oldWinnerBestByIntersection ? `p${w.oldWinnerBestByIntersection.targetPeakIndex}, n=${w.oldWinnerBestByIntersection.intersection}, J=${w.oldWinnerBestByIntersection.jaccard}` : 'none'}`,
    `old → new winner: ${w.oldWinnerToNewWinnerOverlap ? `n=${w.oldWinnerToNewWinnerOverlap.intersection}, J=${w.oldWinnerToNewWinnerOverlap.jaccard}` : 'zero overlap'}`,
    `descriptive ranking crossover: ${w.rankingCrossoverObservedDescriptively}`
  ];
  return lines.map((line, index) => `<text x="${x}" y="${y + index * 18}" class="small">${escapeXml(line)}</text>`).join('');
}
function makeAtlas(audit) {
  const late = audit.temporalTransitions.filter(row => row.adjacency === 8 && row.adjacentOneSecondSavedStates);
  const col = { source: 16, target: 188, matrix: 360, adjacency: 622, winner: 796 };
  const width = 1080, top = 90, rowH = 184, mapY = 23, mapSize = 144;
  const height = top + rowH * late.length + 35;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<style>text{font-family:Arial,sans-serif;fill:#20242a}.title{font-size:20px;font-weight:700}.head{font-size:12px;font-weight:700}.small{font-size:9px}.tiny{font-size:7px}.row{font-size:11px;font-weight:700}</style>',
    '<rect width="100%" height="100%" fill="#fafbfc"/>',
    '<text x="16" y="27" class="title">Finite peak–saddle domain correspondence · frozen 96×96 B|E</text>',
    '<text x="16" y="48" class="small">Boundary outlines are finite domains only; pale gray is E. Colors identify lobes within a panel, not across time. Gold dot marks greatest-contrast control.</text>',
    '<text x="16" y="65" class="small">Matrices include every nonzero domain overlap; axes include every finite lobe. Pair values remain exact in domain-audit.json.gz.</text>'];
  for (const [label, x] of [['t finite domains · 8-adj', col.source], ['t+1 finite domains · 8-adj', col.target], ['Overlap matrix · source rows × target cols', col.matrix], ['t+1 occupancy · 8 vs 4', col.adjacency], ['Winner ranking control', col.winner]])
    parts.push(`<text x="${x}" y="82" class="head">${escapeXml(label)}</text>`);
  for (let index = 0; index < late.length; index += 1) {
    const transition = late[index], y = top + index * rowH;
    const source = audit.states.find(state => state.key === transition.from);
    const target = audit.states.find(state => state.key === transition.to);
    parts.push(`<line x1="8" y1="${y}" x2="1066" y2="${y}" stroke="#cbd0d6"/>`);
    parts.push(`<text x="8" y="${y + 12}" class="row">${escapeXml(`${transition.event} · ${transition.fromRole} → ${transition.toRole} · ${transition.gapSeconds.toFixed(9)} s`)}</text>`);
    parts.push(statePanel(source, 8, col.source, y + mapY, audit));
    parts.push(statePanel(target, 8, col.target, y + mapY, audit));
    parts.push(overlapMatrixPanel(transition, col.matrix, y + mapY, 230, mapSize));
    parts.push(occupancyOverlay(target, col.adjacency, y + mapY, audit));
    parts.push(winnerText(transition, col.winner, y + mapY + 10));
  }
  parts.push('<text x="16" y="' + (height - 10) + '" class="small">No lobe-size/prominence filtering, smoothing, fitted scale or BODY generation. Chemical-memory organization only.</text></svg>');
  return parts.join('');
}

function runSelfTests() {
  const fixture = (width, height, cells, values, adjacency = 8) => analyzeDomains({ width, height,
    E: Uint8Array.from(cells), B: Float32Array.from(values) }, adjacency, 1, 0);
  const assertEightParity = (width, height, cells, values) => {
    const E = Uint8Array.from(cells), B = Float32Array.from(values);
    const actual = analyzeDomains({ width, height, E, B }, 8, 1, 0);
    const expected = analyzeEmergenceLandscape({ width, height, E, B });
    assert.equal(actual.localPeakCount, expected.localPeakCount);
    assert.equal(actual.essentialPeakCount, expected.essentialPeakCount);
    assert.equal(actual.finitePeakCount, expected.finitePeakCount);
    for (const oldPeak of expected.peaks) {
      const peak = actual.peaks.find(item => item.peakIndex === oldPeak.peakIndex);
      assert.ok(peak);
      for (const field of ['birthLevel', 'essential', 'deathLevel', 'contrast', 'saddleLevel']) assert.equal(peak[field], oldPeak[field]);
      assert.deepEqual(peak.peakCells, oldPeak.peakCells);
      assert.deepEqual(peak.saddleIndices, oldPeak.saddleIndices);
    }
    assert.equal(actual.winnerPeakIndex, expected.selected?.peakIndex ?? null);
    if (expected.selected) assert.deepEqual(actual.peaks.find(peak => peak.peakIndex === expected.selected.peakIndex).domainCellIndices,
      expected.selected.premergeRegion.cellIndices);
  };
  const diagonal = fixture(2, 2, [1, 0, 0, 1], [2, 0, 0, 1]);
  assert.equal(analyzeEmergenceLandscape({ width: 2, height: 2,
    E: Uint8Array.from([1, 0, 0, 1]), B: Float32Array.from([2, 0, 0, 1]) }).domainComponentCount, 1);
  assert.equal(diagonal.domainComponentCount, 1);
  assert.equal(fixture(2, 2, [1, 0, 0, 1], [2, 0, 0, 1], 4).domainComponentCount, 2);
  const plateau = fixture(3, 2, [1, 1, 1, 1, 1, 1], [0, 1, 1, 0, 1, 1]);
  assert.deepEqual(plateau.peaks[0].peakCells, [1, 2, 4, 5]);
  const tie = fixture(5, 1, [1, 1, 1, 1, 1], [0, 7, 1, 7, 0]);
  assert.equal(tie.peaks.find(peak => peak.essential).peakIndex, 1);
  assert.equal(tie.peaks.find(peak => peak.peakIndex === 3).elderPeakIndex, 1);
  assert.deepEqual(fixture(3, 2, [0, 0, 1, 1, 0, 0], [0, 0, 5, 4, 0, 0]).peaks.map(p => p.peakIndex), [2, 3]);
  assertEightParity(2, 2, [1, 0, 0, 1], [2, 0, 0, 1]);
  assertEightParity(3, 2, [1, 1, 1, 1, 1, 1], [0, 1, 1, 0, 1, 1]);
  assertEightParity(5, 1, [1, 1, 1, 1, 1], [0, 7, 1, 7, 0]);
  assertEightParity(7, 1, [1, 1, 1, 1, 1, 1, 1], [0, 9, 0, 3, 0, 8, 0]);
  assertEightParity(3, 2, [0, 0, 1, 1, 0, 0], [0, 0, 5, 4, 0, 0]);
  console.log('ant-peak-saddle-domain-audit self-test passed');
}

function main() {
  const mode = process.argv[2];
  if (mode === '--self-test') return runSelfTests();
  if (!['--write', '--check'].includes(mode)) {
    console.error('Usage: node scripts/ant-peak-saddle-domain-audit.js --self-test|--write|--check');
    process.exitCode = 2; return;
  }
  const audit = buildAudit();
  const auditText = `${JSON.stringify(audit, null, 2)}\n`;
  const auditGzip = gzipSync(Buffer.from(auditText, 'utf8'), { level: 9, mtime: 0 });
  const atlasText = `${makeAtlas(audit)}\n`;
  if (mode === '--write') {
    if (existsSync(OUTPUT) || existsSync(ATLAS)) throw new Error('refusing to overwrite existing audit output');
    mkdirSync(dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, auditGzip);
    writeFileSync(ATLAS, atlasText, 'utf8');
    console.log(`wrote ${OUTPUT}`);
    console.log(`wrote ${ATLAS}`);
    console.log(`states=${audit.states.length}; transitions=${audit.temporalTransitions.length}; late=${JSON.stringify(audit.adjacentOneSecondTransitions)}`);
    return;
  }
  assert.deepEqual(readFileSync(OUTPUT), auditGzip, 'compressed domain census / correspondence rerun differs');
  assert.equal(readFileSync(ATLAS, 'utf8'), atlasText, 'atlas rerun differs');
  console.log('domain census, temporal/adjacency correspondence and atlas rerun exact');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
