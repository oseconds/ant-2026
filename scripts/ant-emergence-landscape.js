import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EMERGENCE_LANDSCAPE_ADJACENCY = 8;

/**
 * Build a deterministic 0-D superlevel merge tree for B restricted to E.
 * E is a row-major binary mask; B is a row-major numeric field.
 */
export function analyzeEmergenceLandscape({ width, height, E, B } = {}) {
  if (!Number.isSafeInteger(width) || width < 1
    || !Number.isSafeInteger(height) || height < 1
    || !Number.isSafeInteger(width * height)) {
    throw new RangeError('width and height must be positive safe integers');
  }
  const cellCount = width * height;
  if (!isVector(E) || E.length !== cellCount) {
    throw new RangeError(`E must be a row-major binary vector of length ${cellCount}`);
  }
  if (!isVector(B) || B.length !== cellCount) {
    throw new RangeError(`B must be a row-major numeric vector of length ${cellCount}`);
  }

  const indices = [];
  for (let index = 0; index < cellCount; index += 1) {
    if (E[index] !== 0 && E[index] !== 1) throw new TypeError(`E[${index}] must be 0 or 1`);
    if (!E[index]) continue;
    if (!Number.isFinite(B[index])) throw new TypeError(`B[${index}] must be finite inside E`);
    indices.push(index);
  }

  if (!indices.length) {
    return {
      width, height, adjacency: EMERGENCE_LANDSCAPE_ADJACENCY,
      domainCellCount: 0, domainComponentCount: 0,
      localPeakCount: 0, essentialPeakCount: 0, finitePeakCount: 0,
      peaks: [], selected: null
    };
  }

  indices.sort((left, right) => B[left] > B[right] ? -1 : B[left] < B[right] ? 1 : left - right);

  const parent = new Int32Array(cellCount); parent.fill(-1);
  const rank = new Uint8Array(cellCount);
  const active = new Uint8Array(cellCount);
  const peakForRoot = new Int32Array(cellCount); peakForRoot.fill(-1);
  const peaks = [];

  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (index !== root) {
      const next = parent[index]; parent[index] = root; index = next;
    }
    return root;
  };
  const union = (left, right) => {
    let rootLeft = find(left), rootRight = find(right);
    if (rootLeft === rootRight) return rootLeft;
    if (rank[rootLeft] < rank[rootRight]) [rootLeft, rootRight] = [rootRight, rootLeft];
    parent[rootRight] = rootLeft;
    if (rank[rootLeft] === rank[rootRight]) rank[rootLeft] += 1;
    return rootLeft;
  };

  for (let start = 0; start < indices.length;) {
    const level = B[indices[start]];
    let end = start + 1;
    while (end < indices.length && B[indices[end]] === level) end += 1;
    const batch = indices.slice(start, end);
    const localIndex = new Map(batch.map((index, local) => [index, local]));
    const oldRootSet = new Set();

    for (const index of batch) {
      forEachNeighbor(index, width, height, adjacent => {
        if (!localIndex.has(adjacent) && active[adjacent]) oldRootSet.add(find(adjacent));
      });
    }

    const oldRoots = [...oldRootSet].sort((left, right) => left - right);
    const oldRootLocal = new Map(oldRoots.map((root, offset) => [root, batch.length + offset]));
    const temporaryParent = Int32Array.from({ length: batch.length + oldRoots.length }, (_, index) => index);
    const temporaryRank = new Uint8Array(temporaryParent.length);
    const temporaryFind = index => {
      let root = index;
      while (temporaryParent[root] !== root) root = temporaryParent[root];
      while (index !== root) {
        const next = temporaryParent[index]; temporaryParent[index] = root; index = next;
      }
      return root;
    };
    const temporaryUnion = (left, right) => {
      let rootLeft = temporaryFind(left), rootRight = temporaryFind(right);
      if (rootLeft === rootRight) return;
      if (temporaryRank[rootLeft] < temporaryRank[rootRight]) [rootLeft, rootRight] = [rootRight, rootLeft];
      temporaryParent[rootRight] = rootLeft;
      if (temporaryRank[rootLeft] === temporaryRank[rootRight]) temporaryRank[rootLeft] += 1;
    };

    for (let local = 0; local < batch.length; local += 1) {
      const index = batch[local];
      forEachNeighbor(index, width, height, adjacent => {
        const sameLevel = localIndex.get(adjacent);
        if (sameLevel !== undefined) temporaryUnion(local, sameLevel);
        else if (active[adjacent]) temporaryUnion(local, oldRootLocal.get(find(adjacent)));
      });
    }

    const groupsByRoot = new Map();
    const groupFor = root => {
      let group = groupsByRoot.get(root);
      if (!group) { group = { cells: [], roots: [], winnerPeakId: -1 }; groupsByRoot.set(root, group); }
      return group;
    };
    for (let local = 0; local < batch.length; local += 1) {
      groupFor(temporaryFind(local)).cells.push(batch[local]);
    }
    for (const oldRoot of oldRoots) {
      groupFor(temporaryFind(oldRootLocal.get(oldRoot))).roots.push(oldRoot);
    }

    const groups = [...groupsByRoot.values()];
    for (const group of groups) {
      group.cells.sort((left, right) => left - right);
      group.roots.sort((left, right) => left - right);
      if (!group.roots.length) {
        const peakId = peaks.length;
        peaks.push({
          peakIndex: group.cells[0], peakCells: group.cells.slice(), birthLevel: level,
          essential: false, deathLevel: null, contrast: null,
          saddleLevel: null, saddleIndex: null, saddleIndices: []
        });
        group.winnerPeakId = peakId;
        continue;
      }

      const peakIds = group.roots.map(root => peakForRoot[root]);
      if (peakIds.some(peakId => peakId < 0)) throw new Error('active component has no peak record');
      let winnerPeakId = peakIds[0];
      for (const peakId of peakIds.slice(1)) {
        if (elderPreferred(peaks[peakId], peaks[winnerPeakId])) winnerPeakId = peakId;
      }
      group.winnerPeakId = winnerPeakId;

      if (group.roots.length > 1) {
        for (const peakId of peakIds) {
          if (peakId === winnerPeakId) continue;
          const peak = peaks[peakId];
          peak.deathLevel = level;
          peak.contrast = peak.birthLevel - level;
          peak.saddleLevel = level;
          peak.saddleIndex = group.cells[0];
          peak.saddleIndices = group.cells.slice();
        }
      }
    }

    for (const index of batch) {
      active[index] = 1;
      parent[index] = index;
    }
    for (const index of batch) {
      forEachNeighbor(index, width, height, adjacent => {
        if (active[adjacent]) union(index, adjacent);
      });
    }
    for (const group of groups) peakForRoot[find(group.cells[0])] = group.winnerPeakId;
    start = end;
  }

  const essentialIds = new Set();
  for (const index of indices) essentialIds.add(peakForRoot[find(index)]);
  for (const peakId of essentialIds) peaks[peakId].essential = true;

  let selectedPeakId = -1;
  for (let peakId = 0; peakId < peaks.length; peakId += 1) {
    const peak = peaks[peakId];
    if (peak.essential) continue;
    if (selectedPeakId < 0 || peak.contrast > peaks[selectedPeakId].contrast
      || (peak.contrast === peaks[selectedPeakId].contrast
        && peak.peakIndex < peaks[selectedPeakId].peakIndex)) selectedPeakId = peakId;
  }

  const peakRows = peaks.map(peak => ({
    peakIndex: peak.peakIndex,
    peakCells: peak.peakCells.slice(),
    birthLevel: peak.birthLevel,
    essential: peak.essential,
    deathLevel: peak.deathLevel,
    contrast: peak.contrast,
    saddleLevel: peak.saddleLevel,
    saddleIndex: peak.saddleIndex,
    saddleIndices: peak.saddleIndices.slice()
  }));
  let selected = null;
  if (selectedPeakId >= 0) {
    const peak = peaks[selectedPeakId];
    const premergeCells = strictSuperlevelComponent(peak.peakIndex, peak.deathLevel, E, B, width, height);
    selected = {
      peakIndex: peak.peakIndex,
      peakCells: peak.peakCells.slice(),
      birthLevel: peak.birthLevel,
      saddleLevel: peak.saddleLevel,
      saddleIndex: peak.saddleIndex,
      saddleIndices: peak.saddleIndices.slice(),
      contrast: peak.contrast,
      premergeRegion: { rule: 'E cells with B > saddleLevel connected to peak under 8-adjacency', cellIndices: premergeCells }
    };
  }

  const finitePeakCount = peaks.reduce((count, peak) => count + Number(!peak.essential), 0);
  return {
    width, height, adjacency: EMERGENCE_LANDSCAPE_ADJACENCY,
    domainCellCount: indices.length, domainComponentCount: essentialIds.size,
    localPeakCount: peaks.length, essentialPeakCount: essentialIds.size, finitePeakCount,
    peaks: peakRows, selected
  };
}

function strictSuperlevelComponent(start, level, E, B, width, height) {
  const seen = new Uint8Array(E.length);
  const result = [], queue = [start];
  seen[start] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    result.push(index);
    forEachNeighbor(index, width, height, adjacent => {
      if (!seen[adjacent] && E[adjacent] === 1 && B[adjacent] > level) {
        seen[adjacent] = 1;
        queue.push(adjacent);
      }
    });
  }
  result.sort((left, right) => left - right);
  return result;
}

function elderPreferred(candidate, incumbent) {
  return candidate.birthLevel > incumbent.birthLevel
    || (candidate.birthLevel === incumbent.birthLevel && candidate.peakIndex < incumbent.peakIndex);
}

function forEachNeighbor(index, width, height, visit) {
  const row = Math.floor(index / width), column = index % width;
  for (let dy = -1; dy <= 1; dy += 1) {
    const y = row + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = column + dx;
      if ((!dx && !dy) || x < 0 || x >= width) continue;
      visit(y * width + x);
    }
  }
}

function isVector(value) {
  return Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
}

function runSelfTests() {
  const twoPeaks = analyzeEmergenceLandscape({
    width: 7, height: 1,
    E: new Uint8Array(7).fill(1),
    B: new Float32Array([0, 8, 7, 2, 6, 5, 0])
  });
  assert.equal(twoPeaks.localPeakCount, 2);
  assert.equal(twoPeaks.essentialPeakCount, 1);
  assert.equal(twoPeaks.finitePeakCount, 1);
  assert.deepEqual({ peak: twoPeaks.selected.peakIndex, birth: twoPeaks.selected.birthLevel,
    saddle: twoPeaks.selected.saddleLevel, contrast: twoPeaks.selected.contrast },
  { peak: 4, birth: 6, saddle: 2, contrast: 4 });
  assert.deepEqual(twoPeaks.selected.premergeRegion.cellIndices, [4, 5]);
  assert.ok(twoPeaks.selected.premergeRegion.cellIndices.length < twoPeaks.domainCellCount);

  const plateau = analyzeEmergenceLandscape({
    width: 3, height: 3,
    E: new Uint8Array(9).fill(1),
    B: new Float32Array([0, 1, 1, 0, 1, 1, 0, 0, 0])
  });
  assert.equal(plateau.localPeakCount, 1);
  assert.deepEqual(plateau.peaks[0].peakCells, [1, 2, 4, 5]);
  assert.equal(plateau.selected, null);

  const equalHeight = analyzeEmergenceLandscape({
    width: 5, height: 1,
    E: new Uint8Array(5).fill(1),
    B: new Float32Array([0, 7, 1, 7, 0])
  });
  assert.equal(equalHeight.peaks.find(peak => peak.essential).peakIndex, 1);
  assert.equal(equalHeight.selected.peakIndex, 3);
  assert.equal(equalHeight.selected.contrast, 6);

  const simultaneous = analyzeEmergenceLandscape({
    width: 7, height: 1,
    E: new Uint8Array(7).fill(1),
    B: new Float32Array([0, 9, 0, 3, 0, 8, 0])
  });
  assert.equal(simultaneous.localPeakCount, 3);
  assert.deepEqual(simultaneous.peaks.filter(peak => !peak.essential)
    .map(peak => [peak.peakIndex, peak.deathLevel]).sort((a, b) => a[0] - b[0]), [[3, 0], [5, 0]]);
  assert.deepEqual(simultaneous.selected.saddleIndices, [0, 2, 4, 6]);
  const reflected = analyzeEmergenceLandscape({
    width: 7, height: 1,
    E: new Uint8Array(7).fill(1),
    B: new Float32Array([0, 8, 0, 3, 0, 9, 0])
  });
  assert.equal(reflected.selected.peakIndex, 1);
  assert.equal(reflected.selected.contrast, simultaneous.selected.contrast);
  assert.equal(reflected.selected.saddleLevel, simultaneous.selected.saddleLevel);
  assert.deepEqual(reflected.peaks.filter(peak => !peak.essential)
    .map(peak => [6 - peak.peakIndex, peak.deathLevel]).sort((a, b) => a[0] - b[0]),
  simultaneous.peaks.filter(peak => !peak.essential)
    .map(peak => [peak.peakIndex, peak.deathLevel]).sort((a, b) => a[0] - b[0]));

  const diagonal = analyzeEmergenceLandscape({
    width: 2, height: 2,
    E: new Uint8Array([1, 0, 0, 1]),
    B: new Float32Array([2, 0, 0, 1])
  });
  assert.equal(diagonal.domainComponentCount, 1);
  const noWrap = analyzeEmergenceLandscape({
    width: 3, height: 2,
    E: new Uint8Array([0, 0, 1, 1, 0, 0]),
    B: new Float32Array([0, 0, 5, 4, 0, 0])
  });
  assert.equal(noWrap.domainComponentCount, 2);
  assert.equal(noWrap.essentialPeakCount, 2);
  assert.equal(noWrap.selected, null);

  assert.throws(() => analyzeEmergenceLandscape({
    width: 2, height: 2, E: [1, 1, 1], B: [1, 1, 1, 1]
  }), RangeError);
  assert.throws(() => analyzeEmergenceLandscape({
    width: 1, height: 1, E: [1], B: [Number.NaN]
  }), TypeError);
  assert.throws(() => analyzeEmergenceLandscape({
    width: 1, height: 1, E: [2], B: [1]
  }), TypeError);
  const outsideDomainNaN = analyzeEmergenceLandscape({
    width: 2, height: 1, E: [1, 0], B: [1, Number.NaN]
  });
  assert.equal(outsideDomainNaN.localPeakCount, 1);
  assert.throws(() => analyzeEmergenceLandscape({
    width: 0, height: 1, E: [], B: []
  }), RangeError);

  console.log('ant-emergence-landscape self-test passed');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv[2] === '--self-test') runSelfTests();
  else {
    console.error('Usage: node scripts/ant-emergence-landscape.js --self-test');
    process.exitCode = 2;
  }
}
