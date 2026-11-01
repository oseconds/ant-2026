'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT = 'docs/ant/evidence/2026-11-01-bc-frozen-overlap-topology-audit';
const SEEDS = ['20261005', '20261006', '20261007'];
const GRID = 96;
const STEP = 1 / (GRID - 1);
const ENTRY = { x: 0.5, y: 0.72 };
const ENTRY_RADIUS = 0.15;
const PRODUCTION = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const PREVIOUS_PRODUCTION = '1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44';
const DIRS8 = [];
for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (dx || dy) DIRS8.push([dx, dy]);

const rel = value => path.posix.normalize(value.replaceAll('\\', '/'));
const abs = value => path.join(ROOT, ...rel(value).split('/'));
const bytes = value => Buffer.isBuffer(value) ? value : Buffer.from(value);
const hashBytes = value => crypto.createHash('sha256').update(bytes(value)).digest('hex');
const hashFile = value => hashBytes(fs.readFileSync(abs(value)));
const readJson = value => JSON.parse(fs.readFileSync(abs(value), 'utf8'));
const readGz = value => JSON.parse(zlib.gunzipSync(fs.readFileSync(abs(value))).toString('utf8'));
const writeJson = (value, data) => fs.writeFileSync(abs(value), JSON.stringify(data) + '\n');

function manifestMap(manifest) {
  return new Map((manifest.files || []).map(item => [rel(item.file), item]));
}

function verifyEntry(base, manifest, name) {
  const item = manifestMap(manifest).get(rel(name));
  assert.ok(item, 'manifest entry exists: ' + base + '/' + name);
  const target = rel(base + '/' + name);
  const actualBytes = fs.readFileSync(abs(target));
  const actual = hashBytes(actualBytes);
  assert.equal(actualBytes.length, item.bytes, 'source byte length: ' + target);
  assert.equal(actual, item.sha256, 'source SHA-256: ' + target);
  return { file: target, bytes: actualBytes.length, sha256: actual };
}

function unpackInt32(packed) {
  assert.equal(packed.type, 'Int32Array');
  assert.equal(packed.length, GRID * GRID);
  const raw = Buffer.from(packed.data, 'base64');
  assert.equal(raw.length, packed.length * 4);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const out = new Int32Array(packed.length);
  for (let i = 0; i < out.length; i += 1) out[i] = view.getInt32(i * 4, true);
  return out;
}

function xy(cell) {
  return { x: (cell % GRID) * STEP, y: Math.floor(cell / GRID) * STEP };
}

function intersectCount(left, right) {
  let i = 0, j = 0, count = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { count += 1; i += 1; j += 1; }
    else if (left[i] < right[j]) i += 1;
    else j += 1;
  }
  return count;
}

function setDifferenceCount(left, right) {
  let i = 0, j = 0, count = 0;
  while (i < left.length) {
    while (j < right.length && right[j] < left[i]) j += 1;
    if (j >= right.length || right[j] !== left[i]) count += 1;
    i += 1;
  }
  return count;
}

function sortedUnion(masks) {
  return [...new Set(masks.flat())].sort((a, b) => a - b);
}

function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function euclideanDiameter(cells) {
  if (cells.length < 2) return 0;
  const points = [...new Set(cells)].map(cell => ({ col: cell % GRID, row: Math.floor(cell / GRID) }))
    .sort((a, b) => a.col - b.col || a.row - b.row)
    .map(point => ({ x: point.col, y: point.row }));
  const lower = [], upper = [];
  for (const point of points) {
    while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let best = 0;
  for (let i = 0; i < hull.length; i += 1) for (let j = i + 1; j < hull.length; j += 1) {
    const dx = hull[i].x - hull[j].x, dy = hull[i].y - hull[j].y;
    best = Math.max(best, dx * dx + dy * dy);
  }
  return Math.sqrt(best) * STEP;
}

function maskGeometry(cells) {
  const unique = [...new Set(cells)].sort((a, b) => a - b);
  assert.ok(unique.length > 0);
  const cols = unique.map(cell => cell % GRID), rows = unique.map(cell => Math.floor(cell / GRID));
  const minCol = Math.min(...cols), maxCol = Math.max(...cols), minRow = Math.min(...rows), maxRow = Math.max(...rows);
  const points = unique.map(xy);
  const centroid = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
  const graphIndex = new Map(unique.map((cell, index) => [cell, index]));
  let largestGraphDistance = 0;
  let componentCount = 0;
  const seen = new Uint8Array(unique.length);
  for (let source = 0; source < unique.length; source += 1) {
    if (seen[source]) continue;
    componentCount += 1;
    const queue = new Int32Array(unique.length); let head = 0, tail = 0;
    queue[tail++] = source; seen[source] = 1;
    while (head < tail) {
      const current = queue[head++], cell = unique[current], col = cell % GRID, row = Math.floor(cell / GRID);
      for (const [dx, dy] of DIRS8) {
        const nextCol = col + dx, nextRow = row + dy;
        if (nextCol < 0 || nextCol >= GRID || nextRow < 0 || nextRow >= GRID) continue;
        const next = graphIndex.get(nextRow * GRID + nextCol);
        if (next === undefined || seen[next]) continue;
        seen[next] = 1; queue[tail++] = next;
      }
    }
  }
  if (componentCount === 1) for (let source = 0; source < unique.length; source += 1) {
    const distance = new Int32Array(unique.length); distance.fill(-1);
    const queue = new Int32Array(unique.length); let head = 0, tail = 0;
    queue[tail++] = source; distance[source] = 0;
    while (head < tail) {
      const current = queue[head++], cell = unique[current], col = cell % GRID, row = Math.floor(cell / GRID);
      for (const [dx, dy] of DIRS8) {
        const nextCol = col + dx, nextRow = row + dy;
        if (nextCol < 0 || nextCol >= GRID || nextRow < 0 || nextRow >= GRID) continue;
        const next = graphIndex.get(nextRow * GRID + nextCol);
        if (next === undefined || distance[next] >= 0) continue;
        distance[next] = distance[current] + 1;
        queue[tail++] = next;
      }
    }
    assert.equal(tail, unique.length, 'connected mask BFS covers every cell');
    for (let i = 0; i < distance.length; i += 1) largestGraphDistance = Math.max(largestGraphDistance, distance[i]);
  }
  const boundaryCells = unique.filter(cell => {
    const col = cell % GRID, row = Math.floor(cell / GRID);
    return col === 0 || col === GRID - 1 || row === 0 || row === GRID - 1;
  });
  const entryCells = unique.filter(cell => {
    const point = xy(cell); return Math.hypot(point.x - ENTRY.x, point.y - ENTRY.y) <= ENTRY_RADIUS;
  });
  const maxEntryRadius = Math.max(...points.map(point => Math.hypot(point.x - ENTRY.x, point.y - ENTRY.y)));
  const maxEntryBoundarySpan = boundaryCells.length
    ? Math.max(...boundaryCells.map(cell => { const point = xy(cell); return Math.hypot(point.x - ENTRY.x, point.y - ENTRY.y); }))
    : null;
  return {
    cells: unique.length,
    bounds: { minCol, maxCol, minRow, maxRow, width: (maxCol - minCol) * STEP, height: (maxRow - minRow) * STEP,
      diagonal: Math.hypot(maxCol - minCol, maxRow - minRow) * STEP },
    centroid,
    centroidDistanceFromEntry: Math.hypot(centroid.x - ENTRY.x, centroid.y - ENTRY.y),
    euclideanDiameter: euclideanDiameter(unique),
    connectedComponents8: componentCount,
    geodesicDiameter8Edges: componentCount === 1 ? largestGraphDistance : null,
    maxDistanceFromEntry: maxEntryRadius,
    entryRadiusCellCount: entryCells.length,
    touchesEntryRadius: entryCells.length > 0,
    boundaryCellCount: boundaryCells.length,
    touchesWorldBoundary: boundaryCells.length > 0,
    entryToBoundaryEuclideanSpan: entryCells.length && boundaryCells.length ? maxEntryBoundarySpan : null
  };
}

function distribution(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return { n: 0 };
  const at = p => sorted[Math.floor((sorted.length - 1) * p)];
  return { n: sorted.length, min: sorted[0], q10: at(0.1), median: at(0.5), q90: at(0.9), max: sorted[sorted.length - 1], mean: sorted.reduce((a, b) => a + b, 0) / sorted.length };
}

function relation(left, right) {
  const intersection = intersectCount(left, right), union = left.length + right.length - intersection;
  return { intersection, union, jaccard: union ? intersection / union : 1,
    symmetricDifference: left.length + right.length - 2 * intersection,
    leftOnly: left.length - intersection, rightOnly: right.length - intersection };
}

function partitions(nodes, edges) {
  const adjacency = new Map(nodes.map(node => [node.optionId, new Set()]));
  for (const [left, right] of edges) { adjacency.get(left).add(right); adjacency.get(right).add(left); }
  const seen = new Set(), out = [];
  for (const node of nodes) {
    if (seen.has(node.optionId)) continue;
    const stack = [node.optionId], group = []; seen.add(node.optionId);
    while (stack.length) {
      const current = stack.pop(); group.push(current);
      for (const next of adjacency.get(current)) if (!seen.has(next)) { seen.add(next); stack.push(next); }
    }
    out.push(group.sort());
  }
  return { adjacency, groups: out.sort((a, b) => a[0].localeCompare(b[0])) };
}

function exactGraph(nodes, edges) {
  const n = nodes.length;
  assert.ok(n <= 12, 'registered exact graph cap');
  const neighborMasks = new Array(n).fill(0);
  for (const [left, right] of edges) {
    const i = nodes.findIndex(node => node.optionId === left), j = nodes.findIndex(node => node.optionId === right);
    neighborMasks[i] |= 1 << j; neighborMasks[j] |= 1 << i;
  }
  let alpha = 0, cliqueNumber = 0, maximumIndependentSets = [], maximumCliques = [];
  for (let mask = 1; mask < (1 << n); mask += 1) {
    const indices = [];
    for (let i = 0; i < n; i += 1) if (mask & (1 << i)) indices.push(i);
    let independent = true, clique = true;
    for (let a = 0; a < indices.length; a += 1) for (let b = a + 1; b < indices.length; b += 1) {
      const linked = Boolean(neighborMasks[indices[a]] & (1 << indices[b]));
      if (linked) independent = false; else clique = false;
    }
    if (independent) {
      if (indices.length > alpha) { alpha = indices.length; maximumIndependentSets = []; }
      if (indices.length === alpha) maximumIndependentSets.push(indices.map(i => nodes[i].optionId));
    }
    if (clique) {
      if (indices.length > cliqueNumber) { cliqueNumber = indices.length; maximumCliques = []; }
      if (indices.length === cliqueNumber) maximumCliques.push(indices.map(i => nodes[i].optionId));
    }
  }
  return { alpha, cliqueNumber, maximumIndependentSets, maximumCliques, neighborMasks };
}

function median(values) { return distribution(values).median; }

function compareStringSets(left, right) {
  return JSON.stringify(left.map(x => x.slice().sort()).sort((a, b) => a[0].localeCompare(b[0])))
    === JSON.stringify(right.map(x => x.slice().sort()).sort((a, b) => a[0].localeCompare(b[0])));
}

function compareIdEdges(left, right) {
  const key = pair => pair.slice().sort().join('|');
  return JSON.stringify(left.map(key).sort()) === JSON.stringify(right.map(key).sort());
}

function channelComposition(nodes) {
  const bOnly = nodes.filter(node => node.composition === 'B-only').length;
  const cOnly = nodes.filter(node => node.composition === 'C-only').length;
  const dual = nodes.filter(node => node.composition === '{B,C}').length;
  const hasB = nodes.some(node => node.channels.includes('B'));
  const hasC = nodes.some(node => node.channels.includes('C'));
  return { BOnly: bOnly, COnly: cOnly, dual, class: hasB && hasC ? 'mixed-B/C' : hasB ? 'pure-B' : 'pure-C' };
}

function nodeEntryClass(node) {
  const states = node.candidates.map(candidate => candidate.entryDistance <= ENTRY_RADIUS ? 'entry' : 'non-entry');
  return new Set(states).size > 1 ? 'mixed' : states[0];
}

function profileIndependentSet(optionIds, nodeById) {
  const nodes = optionIds.map(id => nodeById.get(id));
  const comp = channelComposition(nodes);
  const entries = { entry: 0, nonEntry: 0, mixed: 0 };
  for (const node of nodes) entries[nodeEntryClass(node) === 'non-entry' ? 'nonEntry' : nodeEntryClass(node)] += 1;
  return { nodeCount: nodes.length, BOnly: comp.BOnly, COnly: comp.COnly, dual: comp.dual,
    BPresent: nodes.some(node => node.channels.includes('B')), CPresent: nodes.some(node => node.channels.includes('C')),
    mixedProvenance: comp.class === 'mixed-B/C', entry: entries.entry, nonEntry: entries.nonEntry, mixedEntry: entries.mixed,
    layerCells: nodes.reduce((sum, node) => sum + node.xCells.length, 0),
    uniqueCells: sortedUnion(nodes.map(node => node.xCells)).length };
}

function summarizeComponent(component, slot, seed, graphComponent, fData, cache) {
  const nodeById = new Map(slot.nodes.map(node => [node.optionId, node]));
  const nodes = component.memberOptionIds.map(id => nodeById.get(id));
  const unionCells = sortedUnion(nodes.map(node => node.xCells));
  assert.deepEqual(unionCells, component.unionCellIds.slice().sort((a, b) => a - b), 'registered component union independently reconstructed');
  const unionGeometry = maskGeometry(unionCells);
  const memberGeometries = nodes.map(node => {
    if (!cache.has(node.xSha256)) cache.set(node.xSha256, maskGeometry(node.xCells));
    return cache.get(node.xSha256);
  });
  const nuclei = nodes.flatMap(node => node.candidates.map(candidate => candidate.center));
  const maxNucleusToUnion = Math.max(...nuclei.flatMap(center => unionCells.map(cell => {
    const point = xy(cell); return Math.hypot(point.x - center.x, point.y - center.y);
  })));
  const memberSizes = nodes.map(node => node.xCells.length).sort((a, b) => a - b);
  const maxMemberEuclidean = Math.max(...memberGeometries.map(item => item.euclideanDiameter));
  const maxMemberGeodesic = Math.max(...memberGeometries.map(item => item.geodesicDiameter8Edges));
  const alphaGeometry = graphComponent.exact.alpha;
  const composition = channelComposition(nodes);
  assert.equal(unionGeometry.connectedComponents8, 1, 'overlap-component X union stays 8-connected');
  const fIds = [...new Set(nodes.flatMap(node => node.candidates.map(candidate => String(candidate.component))))].sort();
  const fSizes = fIds.map(id => fData.counts.get(Number(id)) || 0);
  assert.ok(fSizes.every(size => size > 0), 'frozen F component labels are present');
  return {
    seed, slotIndex: slot.slotIndex, anchorIndex: slot.anchorIndex, timeMs: slot.timeMs,
    componentId: component.componentId, optionIds: component.memberOptionIds,
    memberCount: nodes.length, alpha: alphaGeometry, cliqueNumber: graphComponent.exact.cliqueNumber,
    provenance: composition,
    memberXCellCount: { min: memberSizes[0], median: median(memberSizes), max: memberSizes[memberSizes.length - 1] },
    unionCellCount: unionCells.length, unionToLargestMemberRatio: unionCells.length / memberSizes[memberSizes.length - 1],
    unionGeometry, maxMemberEuclideanDiameter: maxMemberEuclidean,
    unionToMaxMemberEuclideanDiameterRatio: unionGeometry.euclideanDiameter / maxMemberEuclidean,
    maxMemberGeodesicDiameter8Edges: maxMemberGeodesic,
    unionToMaxMemberGeodesicDiameter8EdgesRatio: unionGeometry.geodesicDiameter8Edges / maxMemberGeodesic,
    maxDistanceFromAnyMemberNucleusToUnionCell: maxNucleusToUnion,
    fComponentIds: fIds.map(Number), fComponentCount: fIds.length,
    fComponentSizes: fSizes, maxXOverFrozenFComponentRatio: Math.max(...nodes.flatMap(node => node.candidates.map(candidate => node.xCells.length / (fData.counts.get(Number(candidate.component)) || 1)))),
    anyXEqualsEntireFComponent: nodes.some(node => node.candidates.some(candidate => node.xCells.length === fData.counts.get(Number(candidate.component)))),
    exactUnionCells: unionCells
  };
}

function enumerateIndependentAnalysis(component, slot, exact, seed, slotIndex, timeMs) {
  const nodeById = new Map(slot.nodes.map(node => [node.optionId, node]));
  const memberNodes = component.memberOptionIds.map(id => nodeById.get(id));
  const maxSets = exact.maximumIndependentSets;
  const appearances = new Map(memberNodes.map(node => [node.optionId, 0]));
  const profiles = new Map(), footprintCounts = [], footprintHashes = new Set();
  for (const set of maxSets) {
    for (const id of set) appearances.set(id, appearances.get(id) + 1);
    const profile = profileIndependentSet(set, nodeById);
    const key = [profile.BOnly, profile.COnly, profile.dual, profile.BPresent ? 1 : 0, profile.CPresent ? 1 : 0,
      profile.entry, profile.nonEntry, profile.mixedEntry].join('|');
    profiles.set(key, { ...(profiles.get(key) || { ...profile, count: 0 }), count: (profiles.get(key)?.count || 0) + 1 });
    footprintCounts.push(profile.uniqueCells);
    footprintHashes.add(hashBytes(JSON.stringify(sortedUnion(set.map(id => nodeById.get(id).xCells)))));
    assert.equal(profile.layerCells, profile.uniqueCells, 'maximum independent set masks are pairwise disjoint');
  }
  const compatibleNodes = memberNodes.filter(node => memberNodes.some(other => other.optionId !== node.optionId
    && intersectCount(node.xCells, other.xCells) === 0)).map(node => {
    const counterpartDeltas = memberNodes.filter(other => other.optionId !== node.optionId)
      .map(other => setDifferenceCount(node.xCells, other.xCells));
    const otherUnion = sortedUnion(memberNodes.filter(other => other.optionId !== node.optionId).map(other => other.xCells));
    return { optionId: node.optionId, composition: node.composition, entryClass: nodeEntryClass(node),
      xCellCount: node.xCells.length, entryDistance: median(node.candidates.map(candidate => candidate.entryDistance)),
      compatiblePartnerCount: memberNodes.filter(other => other.optionId !== node.optionId && intersectCount(node.xCells, other.xCells) === 0).length,
      appearsInAnyMaximumIndependentSet: appearances.get(node.optionId) > 0,
      appearsInEveryMaximumIndependentSet: appearances.get(node.optionId) === maxSets.length,
      cellsAbsentFromEachPossibleSingleOtherOption: distribution(counterpartDeltas),
      cellsAbsentFromAllOtherComponentOptions: setDifferenceCount(node.xCells, otherUnion) };
  });
  const nodesInAny = [...appearances].filter(([, count]) => count > 0).map(([id]) => id).sort();
  const nodesInEvery = [...appearances].filter(([, count]) => count === maxSets.length).map(([id]) => id).sort();
  return { seed, slotIndex, timeMs, componentId: component.componentId, optionIds: component.memberOptionIds,
    nodeCount: memberNodes.length, alpha: exact.alpha, maximumIndependentSetCount: maxSets.length,
    maximumIndependentSets: maxSets.map(set => set.slice().sort()),
    nodesAppearingInAnyMaximumSet: nodesInAny, nodesAppearingInEveryMaximumSet: nodesInEvery,
    provenanceProfiles: [...profiles.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    maximumSetUniqueCellCoverage: distribution(footprintCounts), distinctMaximumSetFootprints: footprintHashes.size,
    compatibleNodes: compatibleNodes.sort((a, b) => a.optionId.localeCompare(b.optionId)) };
}

function selectObjectiveCases(allComponents, pairs, independentAnalyses) {
  const ordered = (rows, compare) => rows.slice().sort(compare);
  const lexical = (a, b) => a.seed.localeCompare(b.seed) || a.slotIndex - b.slotIndex
    || String(a.componentId || a.BOptionId || a.optionId || '').localeCompare(String(b.componentId || b.BOptionId || b.optionId || ''))
    || String(a.COptionId || '').localeCompare(String(b.COptionId || ''));
  const exact = pairs.filter(pair => pair.relation === 'EXACT');
  const overlap = pairs.filter(pair => pair.relation === 'OVERLAP');
  const contested = allComponents.filter(item => item.memberCount > 1);
  const pure = channel => contested.filter(item => item.provenance.class === (channel === 'B' ? 'pure-B' : 'pure-C'));
  const choose = (name, rows, compare) => {
    const list = ordered(rows, compare || lexical);
    return list.length ? { category: name, selected: list[0] } : { category: name, selected: null };
  };
  const cases = [
    choose('exact same B/C', exact, (a, b) => a.nucleusDistance - b.nucleusDistance || lexical(a, b)),
    choose('near-offset highest-overlap B/C', overlap, (a, b) => b.jaccard - a.jaccard || a.nucleusDistance - b.nucleusDistance || lexical(a, b)),
    choose('largest-nucleus-offset positive-overlap B/C', overlap, (a, b) => b.nucleusDistance - a.nucleusDistance || a.jaccard - b.jaccard || lexical(a, b)),
    choose('pure B conflict', pure('B'), (a, b) => b.memberCount - a.memberCount || lexical(a, b)),
    choose('pure C conflict', pure('C'), (a, b) => b.memberCount - a.memberCount || lexical(a, b)),
    choose('alpha one contested union', contested.filter(item => item.alpha === 1), (a, b) => b.memberCount - a.memberCount || b.unionCellCount - a.unionCellCount || lexical(a, b)),
    choose('alpha greater than one transitive union', contested.filter(item => item.alpha > 1 && item.cliqueNumber < item.memberCount), (a, b) => b.memberCount - a.memberCount || b.unionCellCount - a.unionCellCount || lexical(a, b)),
    choose('largest union expansion', contested, (a, b) => b.unionToLargestMemberRatio - a.unionToLargestMemberRatio || lexical(a, b))
  ];
  for (const item of cases) if (item.selected && item.selected.BOptionId) {
    item.selected.leftOptionId = item.selected.BOptionId;
    item.selected.rightOptionId = item.selected.COptionId;
  }
  const misCases = independentAnalyses.slice().sort((a, b) => lexical(a, b));
  return { categories: cases, independentSetCaseReceipts: misCases };
}

function renderAtlas(cases, nodesBySlot) {
  const width = 1500, rowHeight = 185, height = 150 + cases.categories.length * rowHeight;
  const colors = { B: '#c65d57', C: '#4e91b8', both: '#8a6ab1', union: '#a7adb5' };
  const cellSize = 1.5, gridPx = GRID * cellSize;
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">';
  svg += '<rect width="100%" height="100%" fill="#f5f3ee"/><style>text{font-family:Arial,sans-serif;fill:#222} .small{font-size:12px}.title{font-size:19px;font-weight:700}</style>';
  svg += '<text x="24" y="30" class="title">Frozen B/C overlap and transitive-union geometry — equal-status diagnostic masks</text>';
  svg += '<text x="24" y="54" class="small">B red · C blue · combined exact B/C violet · gray shows transitive union · no candidate is selected</text>';
  for (let i = 0; i < cases.categories.length; i += 1) {
    const item = cases.categories[i], y = 74 + i * rowHeight, picked = item.selected;
    svg += '<line x1="18" y1="' + y + '" x2="1480" y2="' + y + '" stroke="#d6d3cc"/>';
    svg += '<text x="24" y="' + (y + 24) + '" class="title">' + escapeXml(item.category) + '</text>';
    if (!picked) { svg += '<text x="24" y="' + (y + 49) + '" class="small">none</text>'; continue; }
    const slotKey = picked.seed + ':' + picked.slotIndex;
    const nodes = nodesBySlot.get(slotKey) || [];
    let selectedNodes = [];
    if (picked.optionIds) selectedNodes = picked.optionIds.map(id => nodes.find(node => node.optionId === id)).filter(Boolean);
    else if (picked.leftOptionId) selectedNodes = [picked.leftOptionId, picked.rightOptionId].map(id => nodes.find(node => node.optionId === id)).filter(Boolean);
    const union = sortedUnion(selectedNodes.map(node => node.xCells));
    const gx = 24, gy = y + 34;
    svg += '<rect x="' + gx + '" y="' + gy + '" width="' + gridPx + '" height="' + gridPx + '" fill="#fff" stroke="#555" stroke-width=".7"/>';
    for (const node of selectedNodes) {
      const color = node.composition === '{B,C}' ? colors.both : node.composition === 'B-only' ? colors.B : colors.C;
      for (const cell of node.xCells) {
        const col = cell % GRID, row = Math.floor(cell / GRID);
        svg += '<rect x="' + (gx + col * cellSize) + '" y="' + (gy + row * cellSize) + '" width="' + cellSize + '" height="' + cellSize + '" fill="' + color + '" fill-opacity=".63"/>';
      }
    }
    const ux = 240;
    svg += '<text x="' + ux + '" y="' + (gy - 5) + '" class="small">union (' + union.length + ' cells)</text><rect x="' + ux + '" y="' + gy + '" width="' + gridPx + '" height="' + gridPx + '" fill="#fff" stroke="#555" stroke-width=".7"/>';
    for (const cell of union) {
      const col = cell % GRID, row = Math.floor(cell / GRID);
      svg += '<rect x="' + (ux + col * cellSize) + '" y="' + (gy + row * cellSize) + '" width="' + cellSize + '" height="' + cellSize + '" fill="' + colors.union + '"/>';
    }
    const textX = 445, lines = picked.leftOptionId
      ? ['seed ' + picked.seed + ' · slot ' + picked.slotIndex + ' · t=' + (picked.timeMs / 1000).toFixed(3) + ' s',
        'B option ' + picked.leftOptionId + ' · C option ' + picked.rightOptionId,
        'relation=' + picked.relation + ' · nucleus distance=' + picked.nucleusDistance.toFixed(4) + ' · J=' + picked.jaccard.toFixed(4),
        '|XB|=' + picked.xSizeB + ' · |XC|=' + picked.xSizeC + ' · |∩|=' + picked.intersection + ' · same F=' + picked.sameFComponent]
      : ['seed ' + picked.seed + ' · slot ' + picked.slotIndex + ' · t=' + (picked.timeMs / 1000).toFixed(3) + ' s',
        'options=' + picked.memberCount + ' · alpha=' + picked.alpha + ' · clique=' + picked.cliqueNumber,
        'union/max-X=' + picked.unionToLargestMemberRatio.toFixed(3) + ' · union diameter=' + picked.unionGeometry.euclideanDiameter.toFixed(3),
        'union geodesic8=' + picked.unionGeometry.geodesicDiameter8Edges + ' steps · provenance=' + picked.provenance.class];
    lines.forEach((line, lineIndex) => { svg += '<text x="' + textX + '" y="' + (gy + 18 + lineIndex * 24) + '" class="small">' + escapeXml(line) + '</text>'; });
  }
  svg += '</svg>\n';
  return svg;
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function main() {
  const paths = {
    opportunity: 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit',
    shadow: 'docs/ant/evidence/2026-10-31-materialization-production-shaped-x-shadow/analysis',
    conflict: 'docs/ant/evidence/2026-11-01-bc-local-conflict-decomposition',
    topology: 'docs/ant/evidence/2026-11-01-bc-local-conflict-topology-audit',
    capacity: 'docs/ant/evidence/2026-11-01-bc-material-capacity-necessity-audit',
    slot: 'docs/ant/evidence/2026-11-01-bc-commit-slot-ambiguity-audit',
    dual: 'docs/ant/evidence/2026-10-31-bc-dual-material-shadow',
    prototype: 'docs/ant/evidence/2026-10-31-bc-provenance-stratigraphy-prototype'
  };
  const manifests = {
    opportunity: readJson(paths.opportunity + '/manifest.json'),
    shadow: readJson(paths.shadow + '/manifest.json'),
    conflict: readJson(paths.conflict + '/manifest.json'),
    topology: readJson(paths.topology + '/manifest.json'),
    capacity: readJson(paths.capacity + '/manifest.json'),
    slot: readJson(paths.slot + '/manifest.json'),
    dual: readJson(paths.dual + '/manifest.json'),
    prototype: readJson(paths.prototype + '/manifest.json')
  };
  const manifestPaths = {
    opportunity: paths.opportunity + '/manifest.json', shadow: paths.shadow + '/manifest.json',
    conflict: paths.conflict + '/manifest.json', topology: paths.topology + '/manifest.json',
    capacity: paths.capacity + '/manifest.json', slot: paths.slot + '/manifest.json',
    dual: paths.dual + '/manifest.json', prototype: paths.prototype + '/manifest.json'
  };
  const manifestHashes = Object.fromEntries(Object.entries(manifestPaths).map(([name, file]) => [name, hashFile(file)]));
  assert.equal(manifests.opportunity.authority, PRODUCTION);
  assert.equal(manifests.conflict.productionAuthority, PRODUCTION);
  assert.equal(manifests.topology.productionAuthority, PRODUCTION);
  assert.equal(manifests.capacity.productionAuthority, PRODUCTION);
  assert.equal(manifests.slot.productionAuthority, PRODUCTION);
  assert.equal(manifests.topology.sourceConflictManifestSha256, manifestHashes.conflict);
  assert.equal(manifests.topology.sourceCapacityManifestSha256, manifestHashes.capacity);
  assert.equal(manifests.capacity.inputs.conflictManifestSha256, manifestHashes.conflict);
  assert.equal(manifests.capacity.inputs.slotAuditManifestSha256, manifestHashes.slot);
  assert.equal(manifests.capacity.inputs.dualManifestSha256, manifestHashes.dual);
  assert.equal(manifests.capacity.inputs.rawPrototypeManifestSha256, manifestHashes.prototype);
  assert.equal(manifests.capacity.inputs.worldManifestSha256, manifestHashes.opportunity);
  for (const [name, sums] of [['conflict', 'conflictSumsSha256'], ['slot', 'slotAuditSumsSha256'],
    ['dual', 'dualSumsSha256'], ['prototype', 'rawSumsSha256']]) {
    assert.equal(hashFile(paths[name] + '/SHA256SUMS.txt'), manifests.capacity.inputs[sums], name + ' source checksum manifest');
  }
  if (manifests.capacity.inputs.worldSumsSha256) {
    assert.equal(hashFile(paths.opportunity + '/SHA256SUMS.txt'), manifests.capacity.inputs.worldSumsSha256);
  }
  assert.equal(manifests.shadow.authority, PREVIOUS_PRODUCTION);

  const sourceInputs = [];
  const conflictBySeed = new Map(), topologyBySeed = new Map();
  for (const seed of SEEDS) {
    const conflictFile = 'analysis/conflict-slots-' + seed + '.json.gz';
    const conflictHash = verifyEntry(paths.conflict, manifests.conflict, conflictFile);
    const conflictData = readGz(paths.conflict + '/' + conflictFile);
    assert.equal(conflictData.seed, seed);
    assert.equal(conflictData.schema, 'ant-bc-x-overlap-conflict-slots-v1');
    const slotFile = 'analysis/commit-slots-' + seed + '.json.gz';
    const slotHash = verifyEntry(paths.slot, manifests.slot, slotFile);
    assert.equal(hashFile(paths.slot + '/' + slotFile), conflictData.sourceSlotFileSha256);
    sourceInputs.push(conflictHash, slotHash);
    conflictBySeed.set(seed, conflictData);

    const graphFile = 'analysis/graphs-' + seed + '.json.gz';
    const graphHash = verifyEntry(paths.topology, manifests.topology, graphFile);
    const graphData = readGz(paths.topology + '/' + graphFile);
    assert.equal(graphData.seed, seed);
    assert.equal(graphData.schema, 'ant-bc-local-conflict-topology-slots-v1');
    topologyBySeed.set(seed, graphData);
    sourceInputs.push(graphHash);
  }

  const shadowRuns = new Map(), frozenF = new Map(), actualPlates = new Map(), parity = [];
  for (const seed of SEEDS) {
    const shadowFile = 'seed-' + seed + '.json.gz';
    const shadowHash = verifyEntry(paths.shadow, manifests.shadow, shadowFile);
    sourceInputs.push(shadowHash);
    const run = readGz(paths.shadow + '/' + shadowFile);
    assert.equal(run.seed, seed);
    assert.equal(run.authority, PREVIOUS_PRODUCTION);
    const sourceBlobChecks = [];
    for (const [sourcePath, sourceInfo] of Object.entries(run.sourceHashes)) {
      assert.ok(sourcePath.startsWith('src/') || sourcePath.startsWith('static/'));
      const currentText = fs.readFileSync(abs(sourcePath), 'utf8').replace(/\r\n/g, '\n');
      assert.equal(hashBytes(currentText), sourceInfo.lfSha256, 'saved source matches checked-out production file: ' + sourcePath);
      sourceBlobChecks.push(sourcePath);
    }
    const anchorsByTime = new Map(run.anchors.map(anchor => [anchor.timeMs, anchor]));
    const wantedAnchorIndices = new Set(conflictBySeed.get(seed).slots.map(slot => slot.anchorIndex));
    const fComponentByAnchor = new Map(), shadowFByAnchor = new Map();
    let matchedAnchors = 0, fMismatch = 0;
    const oppBase = paths.opportunity + '/analysis';
    const oppFiles = manifests.opportunity.files;
    for (let chunk = 0; chunk < 60; chunk += 1) {
      const opportunityFile = 'seed-' + seed + '.opportunities-anchors-' + String(chunk).padStart(3, '0') + '.json.gz';
      const sourceItem = oppFiles.find(item => rel(item.file) === rel('analysis/' + opportunityFile));
      if (!sourceItem) continue;
      const oppHash = verifyEntry(paths.opportunity, manifests.opportunity, 'analysis/' + opportunityFile);
      sourceInputs.push(oppHash);
      const opportunityChunk = readGz(oppBase + '/' + opportunityFile);
      for (const anchor of opportunityChunk.anchors) {
        const shadow = anchorsByTime.get(anchor.timeMs);
        assert.ok(shadow, 'saved shadow has exact opportunity timestamp');
        matchedAnchors += 1;
        const labels = unpackInt32(anchor.components.labels);
        const fCells = [];
        const counts = new Map();
        for (let cell = 0; cell < labels.length; cell += 1) if (labels[cell] >= 0) {
          fCells.push(cell); counts.set(labels[cell], (counts.get(labels[cell]) || 0) + 1);
        }
        const shadowF = shadow.FIndices;
        if (fCells.length !== shadowF.length || fCells.some((cell, index) => cell !== shadowF[index])) fMismatch += 1;
        if (wantedAnchorIndices.has(anchor.index)) {
          fComponentByAnchor.set(anchor.index, { counts, labels, timeMs: anchor.timeMs });
          shadowFByAnchor.set(anchor.index, new Set(shadowF));
        }
      }
    }
    assert.equal(run.anchors.length, 599);
    assert.equal(matchedAnchors, 599);
    assert.equal(fMismatch, 0, 'all 599 frozen F masks match the saved production X-shadow packet');
    assert.equal(fComponentByAnchor.size, conflictBySeed.get(seed).slots.length);

    const localBirthFile = 'analysis/seed-' + seed + '.birth-context.json.gz';
    const localBirthHash = verifyEntry(paths.opportunity, manifests.opportunity, localBirthFile);
    sourceInputs.push(localBirthHash);
    const localBirths = readGz(paths.opportunity + '/' + localBirthFile).births;
    assert.equal(localBirths.length, run.births.length, 'actual Plate birth count agrees across frozen packets');
    let maxBirthTimeDeltaMs = 0;
    for (let index = 0; index < localBirths.length; index += 1) {
      const local = localBirths[index], shadow = run.births[index];
      assert.equal(local.id, shadow.id);
      maxBirthTimeDeltaMs = Math.max(maxBirthTimeDeltaMs, Math.abs(local.timeMs - shadow.timeSeconds * 1000));
    }
    assert.ok(maxBirthTimeDeltaMs <= 1e-6, 'saved production birth IDs/times match');
    const plateRows = [];
    for (const anchor of run.anchors) for (const birth of anchor.birthsAtBoundary || []) {
      assert.ok(Array.isArray(birth.maskIndices) && birth.maskIndices.length > 0);
      const geom = maskGeometry(birth.maskIndices);
      plateRows.push({ seed, id: birth.id, timeMs: birth.bornAtSimulationTimeMs,
        maskCells: birth.maskIndices.length, geometry: geom });
    }
    assert.equal(plateRows.length, run.births.length, 'every saved production Plate birth has a geometric mask');
    shadowRuns.set(seed, { shadowFByAnchor, sourceBlobCount: sourceBlobChecks.length });
    frozenF.set(seed, fComponentByAnchor);
    actualPlates.set(seed, plateRows);
    parity.push({ seed, frozenOpportunityAnchors: matchedAnchors, shadowAnchors: run.anchors.length,
      exactFMaskMatches: matchedAnchors - fMismatch, FMaskMismatches: fMismatch,
      actualPlateBirthCount: plateRows.length, productionBirthIdTimeMatches: localBirths.length,
      maxBirthTimeDeltaMs, savedSimulationSourceFilesMatchingLFHashes: sourceBlobChecks.length });
  }

  const componentRows = [], componentRowsBySeed = new Map(), misRows = [], pairRows = [], candidateFootprintRows = [],
    slotFootprints = [], nodesBySlot = new Map(), exactFConfinement = [], exactSameXCases = [], crossFConfinement = [],
    contestedComposition = [], verificationCounts = { slots: 0, options: 0, components: 0, contested: 0, edges: 0, graphMismatch: 0 };
  for (const seed of SEEDS) {
    const conflict = conflictBySeed.get(seed), graphPacket = topologyBySeed.get(seed);
    assert.equal(conflict.slots.length, seed === '20261005' ? 55 : 54);
    assert.equal(graphPacket.slots.length, conflict.slots.length);
    const seedComponentRows = [];
    const fDataByAnchor = frozenF.get(seed);
    const cache = new Map();
    for (let slotIndex = 0; slotIndex < conflict.slots.length; slotIndex += 1) {
      const slot = conflict.slots[slotIndex], graphSlot = graphPacket.slots[slotIndex];
      verificationCounts.slots += 1;
      assert.equal(slot.slotIndex, graphSlot.slotIndex);
      assert.equal(slot.timeMs, graphSlot.timeMs);
      assert.equal(slot.anchorIndex, graphSlot.anchorIndex);
      assert.equal(slot.nodes.length, slot.uniqueSpatialOptionCount);
      assert.equal(slot.components.length, slot.overlapComponentCount);
      const fData = fDataByAnchor.get(slot.anchorIndex);
      assert.ok(fData && fData.timeMs === slot.timeMs, 'slot maps to exact frozen F observation');
      const nodeById = new Map(slot.nodes.map(node => [node.optionId, node]));
      assert.equal(nodeById.size, slot.nodes.length);
      for (const node of slot.nodes) {
        assert.deepEqual(node.xCells, [...new Set(node.xCells)].sort((a, b) => a - b));
        assert.equal(node.xSha256, hashBytes(JSON.stringify(node.xCells)), 'registered unique-X mask hash');
        assert.equal(node.xNodeCount, node.xCells.length);
      }
      nodesBySlot.set(seed + ':' + slot.slotIndex, slot.nodes);
      verificationCounts.options += slot.nodes.length;
      const edgePairs = [];
      for (let i = 0; i < slot.nodes.length; i += 1) for (let j = i + 1; j < slot.nodes.length; j += 1) {
        if (intersectCount(slot.nodes[i].xCells, slot.nodes[j].xCells) > 0) edgePairs.push([slot.nodes[i].optionId, slot.nodes[j].optionId]);
      }
      const registeredEdges = slot.overlapEdges.map(edge => [edge.leftOptionId, edge.rightOptionId]);
      assert.ok(compareIdEdges(edgePairs, registeredEdges), 'exact overlap edge set reconstructed');
      const { groups } = partitions(slot.nodes, edgePairs);
      const registeredGroups = slot.components.map(component => component.memberOptionIds);
      assert.ok(compareStringSets(groups, registeredGroups), 'exact overlap components reconstructed');
      const graphGroups = graphSlot.components.map(component => component.memberOptionIds);
      assert.ok(compareStringSets(groups, graphGroups), 'topology graph components match reconstructed components');
      assert.equal(edgePairs.length, slot.overlapEdges.length);
      verificationCounts.edges += edgePairs.length;
      const calculatedGraphComponents = new Map();
      for (const component of slot.components) {
        const nodes = component.memberOptionIds.map(id => nodeById.get(id));
        const localEdges = edgePairs.filter(([left, right]) => component.memberOptionIds.includes(left) && component.memberOptionIds.includes(right));
        const exact = exactGraph(nodes, localEdges);
        const topologyComponent = graphSlot.components.find(item => item.componentId === component.componentId);
        assert.ok(topologyComponent);
        assert.equal(topologyComponent.cliqueNumber, exact.cliqueNumber);
        assert.equal(topologyComponent.independenceNumber, exact.alpha);
        assert.equal(topologyComponent.maximumIndependentSetCount, exact.maximumIndependentSets.length);
        assert.equal(topologyComponent.clique, exact.cliqueNumber === nodes.length);
        const topologyEdges = topologyComponent.edges.map(edge => edge.optionIds);
        assert.ok(compareIdEdges(localEdges, topologyEdges), 'topology receipt edge set reconstructed');
        calculatedGraphComponents.set(component.componentId, { exact, localEdges, topologyComponent });
        verificationCounts.components += 1;
        if (nodes.length > 1) {
          verificationCounts.contested += 1;
          const comp = channelComposition(nodes);
          contestedComposition.push({ seed, slotIndex, timeMs: slot.timeMs, componentId: component.componentId,
            size: nodes.length, BOnlyNodes: comp.BOnly, COnlyNodes: comp.COnly, dualNodes: comp.dual, composition: comp.class });
          if (exact.alpha > 1) misRows.push(enumerateIndependentAnalysis(component, slot, exact, seed, slotIndex, slot.timeMs));
        }
        const row = summarizeComponent(component, slot, seed, calculatedGraphComponents.get(component.componentId), fData, cache);
        seedComponentRows.push(row); componentRows.push(row);
      }
      for (const node of slot.nodes) for (const candidate of node.candidates) {
        const componentId = Number(candidate.component);
        const labels = fData.counts;
        assert.ok(labels.has(componentId), 'candidate F component has saved label');
        assert.ok(labels.get(componentId) > 0);
        assert.equal(fData.labels[candidate.centerIndex], componentId, 'candidate center has registered F-component label');
        assert.ok(node.xCells.every(cell => fData.labels[cell] === componentId), 'entire X mask lies in its frozen F component');
      }
      const optionCountsByF = new Map();
      for (const node of slot.nodes) {
        const compIds = [...new Set(node.candidates.map(candidate => Number(candidate.component)))];
        for (const id of compIds) optionCountsByF.set(id, (optionCountsByF.get(id) || 0) + 1);
      }
      const candidates = slot.nodes.flatMap(node => node.candidates.map(candidate => ({ seed, slotIndex, timeMs: slot.timeMs, node, candidate, xCells: node.xCells })));
      for (const candidate of candidates) {
        const centerLabel = Number(candidate.candidate.component);
        assert.equal(centerLabel, centerLabel | 0);
        const componentSize = fData.counts.get(centerLabel);
        const centerIndex = candidate.candidate.centerIndex;
        assert.ok(shadowRuns.get(seed).shadowFByAnchor.get(slot.anchorIndex).has(centerIndex), 'candidate nucleus remains on saved production F');
        assert.ok(componentSize >= candidate.xCells.length, 'candidate X is bounded by its F component');
      }
      const bCandidates = candidates.filter(item => item.candidate.channel === 'B');
      const cCandidates = candidates.filter(item => item.candidate.channel === 'C');
      assert.equal(bCandidates.length, slot.matureCandidateCounts.B);
      assert.equal(cCandidates.length, slot.matureCandidateCounts.C);
      for (const node of slot.nodes.filter(item => item.composition === '{B,C}')) {
        const b = node.candidates.filter(candidate => candidate.channel === 'B');
        const c = node.candidates.filter(candidate => candidate.channel === 'C');
        assert.equal(b.length, 1, 'each exact dual-X option has one registered B record');
        assert.equal(c.length, 1, 'each exact dual-X option has one registered C record');
        assert.equal(String(b[0].component), String(c[0].component));
        const fComponent = Number(b[0].component), fSize = fData.counts.get(fComponent);
        const otherSameF = slot.nodes.filter(other => other.optionId !== node.optionId
          && other.candidates.some(candidate => Number(candidate.component) === fComponent));
        const overlaps = otherSameF.filter(other => intersectCount(node.xCells, other.xCells) > 0);
        assert.equal(overlaps.length, 0, 'no exact dual-provenance node has a positive-overlap competitor');
        exactSameXCases.push({ seed, slotIndex, timeMs: slot.timeMs, optionId: node.optionId,
          BEventId: b[0].eventId, CEventId: c[0].eventId, xCellCount: node.xCells.length,
          fComponentId: fComponent, fComponentSize: fSize, xToFComponentRatio: node.xCells.length / fSize,
          XEqualsEntireFComponent: node.xCells.length === fSize,
          nucleusDistance: Math.hypot(b[0].center.x - c[0].center.x, b[0].center.y - c[0].center.y),
          otherMatureXOptionsInSameFComponent: otherSameF.length,
          overlappingOtherXOptionsInSameFComponent: overlaps.length,
          disjointOtherXOptionsInSameFComponent: otherSameF.length - overlaps.length });
      }
      const bUnion = sortedUnion(bCandidates.map(item => item.xCells)), cUnion = sortedUnion(cCandidates.map(item => item.xCells));
      slotFootprints.push({ seed, slotIndex, timeMs: slot.timeMs, bOptions: bCandidates.length, cOptions: cCandidates.length,
        BUnionCells: bUnion.length, CUnionCells: cUnion.length,
        BOnlyUnionCells: setDifferenceCount(bUnion, cUnion), COnlyUnionCells: setDifferenceCount(cUnion, bUnion),
        sharedUnionCells: intersectCount(bUnion, cUnion) });
      for (const item of bCandidates) candidateFootprintRows.push({ seed, slotIndex, channel: 'B', eventId: item.candidate.eventId,
        optionId: item.node.optionId, xCellCount: item.xCells.length, cellsUniqueAgainstAllC: setDifferenceCount(item.xCells, cUnion) });
      for (const item of cCandidates) candidateFootprintRows.push({ seed, slotIndex, channel: 'C', eventId: item.candidate.eventId,
        optionId: item.node.optionId, xCellCount: item.xCells.length, cellsUniqueAgainstAllB: setDifferenceCount(item.xCells, bUnion) });
      for (const b of bCandidates) for (const c of cCandidates) {
        const r = relation(b.xCells, c.xCells);
        const cCellSet = new Set(c.xCells);
        const independentIntersection = b.xCells.filter(cell => cCellSet.has(cell)).length;
        assert.equal(r.intersection, independentIntersection, 'cross-channel relation agrees with independent set-membership count');
        const type = r.jaccard === 1 ? 'EXACT' : r.intersection > 0 ? 'OVERLAP' : 'DISJOINT';
        const nucleusDistance = Math.hypot(b.candidate.center.x - c.candidate.center.x, b.candidate.center.y - c.candidate.center.y);
        const sameF = String(b.candidate.component) === String(c.candidate.component);
        if (r.intersection > 0) assert.ok(sameF, 'positive X overlap lies inside the same frozen F component');
        const fSize = sameF ? fData.counts.get(Number(b.candidate.component)) : null;
        const nearbyOptions = sameF ? (optionCountsByF.get(Number(b.candidate.component)) || 0) - 1 : null;
        const pair = { seed, slotIndex, timeMs: slot.timeMs, relation: type,
          BEventId: b.candidate.eventId, CEventId: c.candidate.eventId, BOptionId: b.node.optionId, COptionId: c.node.optionId,
          BCenter: b.candidate.center, CCenter: c.candidate.center, BNucleusDistanceFromEntry: b.candidate.entryDistance,
          CNucleusDistanceFromEntry: c.candidate.entryDistance, nucleusDistance, xSizeB: b.xCells.length, xSizeC: c.xCells.length,
          intersection: r.intersection, union: r.union, jaccard: r.jaccard, symmetricDifference: r.symmetricDifference,
          BOnlyCellsAgainstPair: r.leftOnly, COnlyCellsAgainstPair: r.rightOnly,
          entryPairClass: (b.candidate.entryDistance <= ENTRY_RADIUS ? 'entry' : 'non-entry') + '-' + (c.candidate.entryDistance <= ENTRY_RADIUS ? 'entry' : 'non-entry'),
          sameFComponent: sameF, fComponentB: Number(b.candidate.component), fComponentC: Number(c.candidate.component),
          fComponentSize: fSize, unionXToFComponentRatio: sameF ? r.union / fSize : null,
          largestXToFComponentRatio: sameF ? Math.max(b.xCells.length, c.xCells.length) / fSize : null,
          otherMatureXOptionsInSameFComponent: nearbyOptions };
        pairRows.push(pair);
        if (type === 'EXACT') exactFConfinement.push(pair);
        if (type === 'OVERLAP') crossFConfinement.push(pair);
      }
    }
    componentRowsBySeed.set(seed, seedComponentRows);
  }

  assert.equal(verificationCounts.slots, 163);
  assert.equal(verificationCounts.options, 1846);
  assert.equal(verificationCounts.components, 1352);
  assert.equal(verificationCounts.contested, 231);
  assert.equal(contestedComposition.reduce((sum, row) => sum + row.BOnlyNodes, 0), 463);
  assert.equal(contestedComposition.reduce((sum, row) => sum + row.COnlyNodes, 0), 262);
  assert.equal(contestedComposition.reduce((sum, row) => sum + row.dualNodes, 0), 0);
  assert.equal(exactSameXCases.length, pairRows.filter(row => row.relation === 'EXACT').length,
    'one registered B and one registered C candidate per exact dual-X node appearance');

  const compositionCensus = {
    contestedComponents: contestedComposition.length,
    nodes: { BOnly: contestedComposition.reduce((s, x) => s + x.BOnlyNodes, 0),
      COnly: contestedComposition.reduce((s, x) => s + x.COnlyNodes, 0),
      dual: contestedComposition.reduce((s, x) => s + x.dualNodes, 0) },
    componentClasses: Object.fromEntries(['pure-B', 'pure-C', 'mixed-B/C'].map(name => [name, contestedComposition.filter(row => row.composition === name).length])),
    size2PairTypes: { 'B-B': 0, 'C-C': 0, 'B-C': 0, 'dual-involved': 0 },
    bySeed: Object.fromEntries(SEEDS.map(seed => [seed, Object.fromEntries(['pure-B', 'pure-C', 'mixed-B/C'].map(name => [name, contestedComposition.filter(row => row.seed === seed && row.composition === name).length]))]))
  };
  for (const row of contestedComposition.filter(row => row.size === 2)) {
    const b = row.BOnlyNodes, c = row.COnlyNodes, d = row.dualNodes;
    if (d) compositionCensus.size2PairTypes['dual-involved'] += 1;
    else if (b === 2) compositionCensus.size2PairTypes['B-B'] += 1;
    else if (c === 2) compositionCensus.size2PairTypes['C-C'] += 1;
    else compositionCensus.size2PairTypes['B-C'] += 1;
  }

  const pairSummary = {};
  for (const label of ['EXACT', 'OVERLAP', 'DISJOINT']) {
    const rows = pairRows.filter(row => row.relation === label);
    pairSummary[label] = { count: rows.length,
      nucleusDistance: distribution(rows.map(row => row.nucleusDistance)),
      jaccard: distribution(rows.map(row => row.jaccard)),
      xSizeB: distribution(rows.map(row => row.xSizeB)), xSizeC: distribution(rows.map(row => row.xSizeC)),
      intersection: distribution(rows.map(row => row.intersection)), symmetricDifference: distribution(rows.map(row => row.symmetricDifference)),
      sameFComponentCount: rows.filter(row => row.sameFComponent).length,
      sameFComponentFraction: rows.length ? rows.filter(row => row.sameFComponent).length / rows.length : null,
      FComponentSize: distribution(rows.map(row => row.fComponentSize)),
      unionXToFComponentRatio: distribution(rows.map(row => row.unionXToFComponentRatio)),
      otherMatureXOptionsInSameFComponent: distribution(rows.map(row => row.otherMatureXOptionsInSameFComponent)),
      entryPairClasses: Object.fromEntries([...new Set(rows.map(row => row.entryPairClass))].sort().map(name => [name, rows.filter(row => row.entryPairClass === name).length])) };
  }
  const candidateFootprintSummary = Object.fromEntries(['B', 'C'].map(channel => {
    const rows = candidateFootprintRows.filter(row => row.channel === channel);
    const key = channel === 'B' ? 'cellsUniqueAgainstAllC' : 'cellsUniqueAgainstAllB';
    return [channel, { options: rows.length, uniqueCellsAgainstEntireOppositeChannel: distribution(rows.map(row => row[key])),
      optionsWithAnyUniqueCell: rows.filter(row => row[key] > 0).length }];
  }));
  const fConfinementSummary = { exactSameXCaseCount: exactSameXCases.length,
    exact: { fComponentSize: distribution(exactSameXCases.map(row => row.fComponentSize)), xToFComponentRatio: distribution(exactSameXCases.map(row => row.xToFComponentRatio)),
      otherMatureXOptions: distribution(exactSameXCases.map(row => row.otherMatureXOptionsInSameFComponent)),
      xEqualsEntireFComponentCount: exactSameXCases.filter(row => row.XEqualsEntireFComponent).length },
    positiveOverlap: { fComponentSize: pairSummary.OVERLAP.FComponentSize, unionXToFComponentRatio: pairSummary.OVERLAP.unionXToFComponentRatio,
      otherMatureXOptions: pairSummary.OVERLAP.otherMatureXOptionsInSameFComponent } };

  const geometryByAlpha = { 1: [], 2: [] };
  for (const row of componentRows) if (row.memberCount > 1) geometryByAlpha[row.alpha > 1 ? 2 : 1].push(row);
  const geometrySummary = {};
  for (const label of [1, 2]) {
    const rows = geometryByAlpha[label];
    geometrySummary[label === 1 ? 'alphaOne' : 'alphaGreaterThanOne'] = {
      count: rows.length, unionCellCount: distribution(rows.map(row => row.unionCellCount)),
      memberSizeMin: distribution(rows.map(row => row.memberXCellCount.min)), memberSizeMedian: distribution(rows.map(row => row.memberXCellCount.median)),
      memberSizeMax: distribution(rows.map(row => row.memberXCellCount.max)),
      unionToLargestMemberRatio: distribution(rows.map(row => row.unionToLargestMemberRatio)),
      unionEuclideanDiameter: distribution(rows.map(row => row.unionGeometry.euclideanDiameter)),
      maximumMemberEuclideanDiameter: distribution(rows.map(row => row.maxMemberEuclideanDiameter)),
      unionToMaxMemberEuclideanDiameterRatio: distribution(rows.map(row => row.unionToMaxMemberEuclideanDiameterRatio)),
      unionGeodesic8Edges: distribution(rows.map(row => row.unionGeometry.geodesicDiameter8Edges)),
      maxMemberGeodesic8Edges: distribution(rows.map(row => row.maxMemberGeodesicDiameter8Edges)),
      unionToMaxMemberGeodesic8EdgesRatio: distribution(rows.map(row => row.unionToMaxMemberGeodesicDiameter8EdgesRatio)),
      maxDistanceFromMemberNucleusToUnionCell: distribution(rows.map(row => row.maxDistanceFromAnyMemberNucleusToUnionCell)),
      touchesEntryRadius: rows.filter(row => row.unionGeometry.touchesEntryRadius).length,
      touchesWorldBoundary: rows.filter(row => row.unionGeometry.touchesWorldBoundary).length,
      entryToBoundaryPresent: rows.filter(row => row.unionGeometry.entryToBoundaryEuclideanSpan !== null).length,
      unionExpansionBySeed: Object.fromEntries(SEEDS.map(seed => [seed, distribution(rows.filter(row => row.seed === seed).map(row => row.unionToLargestMemberRatio))]))
    };
  }
  const plateRows = SEEDS.flatMap(seed => actualPlates.get(seed));
  const productionPlateGeometry = { count: plateRows.length,
    bySeed: Object.fromEntries(SEEDS.map(seed => {
      const rows = actualPlates.get(seed);
      return [seed, { count: rows.length, maskCells: distribution(rows.map(row => row.maskCells)),
        euclideanDiameter: distribution(rows.map(row => row.geometry.euclideanDiameter)),
        bboxDiagonal: distribution(rows.map(row => row.geometry.bounds.diagonal)),
        geodesic8Edges: distribution(rows.map(row => row.geometry.geodesicDiameter8Edges)),
        disconnectedMaskCount: rows.filter(row => row.geometry.connectedComponents8 !== 1).length,
        touchesWorldBoundary: rows.filter(row => row.geometry.touchesWorldBoundary).length }];
    })),
    pooled: { maskCells: distribution(plateRows.map(row => row.maskCells)), euclideanDiameter: distribution(plateRows.map(row => row.geometry.euclideanDiameter)),
      bboxDiagonal: distribution(plateRows.map(row => row.geometry.bounds.diagonal)),
      geodesic8Edges: distribution(plateRows.map(row => row.geometry.geodesicDiameter8Edges)),
      disconnectedMaskCount: plateRows.filter(row => row.geometry.connectedComponents8 !== 1).length,
      touchesWorldBoundary: plateRows.filter(row => row.geometry.touchesWorldBoundary).length } };

  const maxSetProfiles = misRows.flatMap(row => row.provenanceProfiles);
  const maxSetCount = profile => maxSetProfiles.filter(profile).reduce((sum, row) => sum + row.count, 0);
  const misSummary = {
    alphaGreaterThanOneComponentCount: misRows.length,
    totalMaximumIndependentSets: misRows.reduce((sum, row) => sum + row.maximumIndependentSetCount, 0),
    maximumSetProvenanceComposition: {
      containsB: maxSetCount(row => row.BPresent), containsC: maxSetCount(row => row.CPresent),
      containsBothBAndC: maxSetCount(row => row.BPresent && row.CPresent),
      BOnly: maxSetCount(row => row.BPresent && !row.CPresent),
      COnly: maxSetCount(row => !row.BPresent && row.CPresent),
      dualOnly: maxSetCount(row => row.dual > 0 && !row.BOnly && !row.COnly),
      containsEntry: maxSetCount(row => row.entry > 0), containsNonEntry: maxSetCount(row => row.nonEntry > 0),
      containsBothEntryAndNonEntry: maxSetCount(row => row.entry > 0 && row.nonEntry > 0)
    },
    bySeed: Object.fromEntries(SEEDS.map(seed => {
      const rows = misRows.filter(row => row.seed === seed);
      return [seed, { components: rows.length, maximumIndependentSets: rows.reduce((sum, row) => sum + row.maximumIndependentSetCount, 0),
        componentAlpha: distribution(rows.map(row => row.alpha)),
        nodeCount: distribution(rows.map(row => row.nodeCount)),
        possibleNodeAppearances: rows.reduce((sum, row) => sum + row.nodesAppearingInAnyMaximumSet.length, 0),
        forcedNodeAppearances: rows.reduce((sum, row) => sum + row.nodesAppearingInEveryMaximumSet.length, 0),
        footprintRangePerComponent: distribution(rows.map(row => row.maximumSetUniqueCellCoverage.max - row.maximumSetUniqueCellCoverage.min)) }];
    })),
    pooledFootprintRangePerComponent: distribution(misRows.map(row => row.maximumSetUniqueCellCoverage.max - row.maximumSetUniqueCellCoverage.min)),
    compositionProfileCount: misRows.reduce((sum, row) => sum + row.provenanceProfiles.length, 0),
    compatibleNodeCount: misRows.reduce((sum, row) => sum + row.compatibleNodes.length, 0),
    compatibleNodeAppearsInAnyMaximumSet: misRows.reduce((sum, row) => sum + row.compatibleNodes.filter(node => node.appearsInAnyMaximumIndependentSet).length, 0),
    compatibleNodeCellsAbsentFromAllOtherComponentOptions: distribution(misRows.flatMap(row => row.compatibleNodes.map(node => node.cellsAbsentFromAllOtherComponentOptions))),
    compatibleNodeCellsAbsentFromEachPossibleSingleOption: distribution(misRows.flatMap(row => row.compatibleNodes.map(node => node.cellsAbsentFromEachPossibleSingleOtherOption.min)))
  };

  const classForA3 = type => {
    const rows = type === 'EXACT' ? exactSameXCases : pairRows.filter(pair => pair.relation === type);
    return { observationCount: rows.length,
      nucleusDistance: distribution(rows.map(row => row.nucleusDistance)),
      fComponentSize: distribution(rows.map(row => row.fComponentSize)),
      xToFComponentRatio: distribution(rows.map(row => type === 'EXACT' ? row.xToFComponentRatio : row.union / row.fComponentSize)),
      otherMatureXOptions: distribution(rows.map(row => row.otherMatureXOptionsInSameFComponent)) };
  };
  const perSeed = Object.fromEntries(SEEDS.map(seed => {
    const comps = componentRows.filter(row => row.seed === seed);
    const pairs = pairRows.filter(row => row.seed === seed);
    const mis = misRows.filter(row => row.seed === seed);
    const plates = actualPlates.get(seed);
    return [seed, { slots: conflictBySeed.get(seed).slots.length,
      uniqueXAppearances: conflictBySeed.get(seed).slots.reduce((sum, slot) => sum + slot.nodes.length, 0),
      components: comps.length, contested: comps.filter(row => row.memberCount > 1).length,
      contestedProvenance: Object.fromEntries(['pure-B', 'pure-C', 'mixed-B/C'].map(name => [name, contestedComposition.filter(row => row.seed === seed && row.composition === name).length])),
      crossChannelPairs: Object.fromEntries(['EXACT', 'OVERLAP', 'DISJOINT'].map(name => [name, pairs.filter(row => row.relation === name).length])),
      unionToLargestMemberRatio: distribution(comps.filter(row => row.memberCount > 1).map(row => row.unionToLargestMemberRatio)),
      unionToMaxMemberEuclideanDiameterRatio: distribution(comps.filter(row => row.memberCount > 1).map(row => row.unionToMaxMemberEuclideanDiameterRatio)),
      unionToMaxMemberGeodesic8EdgesRatio: distribution(comps.filter(row => row.memberCount > 1).map(row => row.unionToMaxMemberGeodesicDiameter8EdgesRatio)),
      alphaGreaterThanOneComponents: mis.length, actualProductionPlates: plates.length,
      actualPlateDiameter: distribution(plates.map(row => row.geometry.euclideanDiameter)) }];
  }));

  const objective = selectObjectiveCases(componentRows, pairRows, misRows);
  const objectiveByGraph = [];
  for (const item of objective.categories) {
    if (!item.selected || !item.selected.optionIds) continue;
    const picked = item.selected;
    const graph = topologyBySeed.get(picked.seed).slots[picked.slotIndex].components.find(component => component.componentId === picked.componentId);
    const slot = conflictBySeed.get(picked.seed).slots[picked.slotIndex];
    const exact = exactGraph(picked.optionIds.map(id => slot.nodes.find(node => node.optionId === id)), graph.edges.map(edge => edge.optionIds));
    objectiveByGraph.push({ category: item.category, seed: picked.seed, slotIndex: picked.slotIndex, componentId: picked.componentId,
      oneDiagnosticMaximumIndependentSet: exact.maximumIndependentSets[0], note: 'diagnostic example only; not a winner set' });
  }
  objective.independentSetCaseReceipts = objectiveByGraph;
  const objectiveCases = objective.categories.map(item => {
    if (!item.selected) return { category: item.category, selected: null };
    const { exactUnionCells, ...selected } = item.selected;
    return { category: item.category, selected };
  });

  const summary = {
    schema: 'ant-frozen-overlap-bc-topology-summary-v1', productionAuthority: PRODUCTION,
    historicalReceipts: { slots: verificationCounts.slots, uniqueXAppearances: verificationCounts.options,
      overlapComponents: verificationCounts.components, contestedComponents: verificationCounts.contested,
      pairwiseSameSlotRelationSummary: 'reconstructed from exact X masks' },
    contestedProvenance: compositionCensus,
    crossChannelPairSummary: pairSummary,
    uniqueChannelFootprintByOption: candidateFootprintSummary,
    slotFootprintSummary: { count: slotFootprints.length,
      BOnlyUnionCells: distribution(slotFootprints.map(row => row.BOnlyUnionCells)),
      COnlyUnionCells: distribution(slotFootprints.map(row => row.COnlyUnionCells)),
      sharedUnionCells: distribution(slotFootprints.map(row => row.sharedUnionCells)) },
    exactSameXAndFConfinement: { exactCaseCount: exactSameXCases.length,
      exact: classForA3('EXACT'), positiveOverlap: classForA3('OVERLAP'),
      exactEntireFComponentCount: exactSameXCases.filter(row => row.XEqualsEntireFComponent).length,
      exactCasesWithOtherSameFOptions: exactSameXCases.filter(row => row.otherMatureXOptionsInSameFComponent > 0).length,
      exactCasesWithOverlappingOtherXOptions: exactSameXCases.filter(row => row.overlappingOtherXOptionsInSameFComponent > 0).length },
    unionGeometry: { pooled: Object.fromEntries(['unionCellCount','unionToLargestMemberRatio','maxMemberEuclideanDiameter','unionToMaxMemberEuclideanDiameterRatio',
      'unionToMaxMemberGeodesicDiameter8EdgesRatio','maxDistanceFromAnyMemberNucleusToUnionCell'].map(key => [key, distribution(componentRows.filter(row => row.memberCount > 1).map(row => key === 'unionCellCount' ? row.unionCellCount : row[key]))])),
      alphaGroups: geometrySummary, productionPlateGeometry },
    independentSetAnalysis: misSummary,
    perSeed,
    sourceParity: parity,
    productionPlateBirths: plateRows.length,
    noObserverRng: true,
    simulationOrReplay: false
  };

  const validation = {
    schema: 'ant-frozen-overlap-bc-topology-validation-v1',
    authorities: { production: PRODUCTION, masksPacket: PREVIOUS_PRODUCTION },
    manifests: manifestHashes,
    sourceFiles: sourceInputs.sort((a, b) => a.file.localeCompare(b.file)),
    sourceParity: parity,
    graphReconstruction: { slots: verificationCounts.slots, uniqueXAppearances: verificationCounts.options,
      components: verificationCounts.components, contestedComponents: verificationCounts.contested,
      registeredTopologyStatsRecomputed: true, exactIndependentSetsRecomputed: true },
    guards: { exactConflictEdges: true, exactComponentPartitions: true, sourceManifestLineage: true,
      FMaskParity599PerSeed: true, productionBirthIdTimeParity: true, allSavedSimulationLFSourceHashesMatch: true,
      productionSrcStaticDiffEmpty: true, observerRngCalls: 0, simulation: false, replay: false }
  };

  const outputFiles = [
    [OUT + '/analysis/summary.json', summary],
    [OUT + '/analysis/contested-provenance.json', { schema: 'ant-frozen-overlap-bc-contested-provenance-v1', components: contestedComposition, census: compositionCensus }],
    [OUT + '/analysis/bc-cross-channel-pairs.json', { schema: 'ant-frozen-overlap-bc-cross-channel-pairs-v1', relationSummary: pairSummary, pairs: pairRows,
      slotFootprints, candidateFootprints: candidateFootprintRows }],
    [OUT + '/analysis/exact-f-confinement.json', { schema: 'ant-frozen-overlap-bc-exact-f-confinement-v1', summary: fConfinementSummary,
      exactSameXCases, positiveOverlapPairs: crossFConfinement }],
    [OUT + '/analysis/contested-union-geometry.json', { schema: 'ant-frozen-overlap-bc-union-geometry-v1', pooled: summary.unionGeometry,
      components: componentRows.map(({ exactUnionCells, ...row }) => row), exactUnionCells: Object.fromEntries(componentRows.map(row => [row.seed + ':' + row.slotIndex + ':' + row.componentId, row.exactUnionCells])) }],
    [OUT + '/analysis/maximum-independent-sets.json', { schema: 'ant-frozen-overlap-bc-exact-mis-v1', summary: misSummary, components: misRows }],
    [OUT + '/analysis/production-plate-geometry.json', { schema: 'ant-frozen-overlap-bc-production-plate-geometry-v1', authority: PRODUCTION,
      compatibleSavedPacketAuthority: PREVIOUS_PRODUCTION, note: 'Saved mask packets match all 599 frozen F masks and actual birth IDs/times; all saved simulation source LF hashes match the current checkout. Git src/static comparison is documented separately.', plates: Object.fromEntries(SEEDS.map(seed => [seed, actualPlates.get(seed)])), summary: productionPlateGeometry }],
    [OUT + '/analysis/objective-cases.json', { schema: 'ant-frozen-overlap-bc-objective-cases-v1', selection: objectiveCases,
      diagnosticIndependentSets: objectiveByGraph }],
    [OUT + '/analysis/validation.json', validation]
  ];
  fs.mkdirSync(abs(OUT + '/analysis'), { recursive: true });
  fs.mkdirSync(abs(OUT + '/visual'), { recursive: true });
  for (const [file, data] of outputFiles) writeJson(file, data);
  const allPairs = pairRows;
  const objectiveForSvg = { ...objective, categories: objective.categories.map(item => {
    if (!item.selected) return item;
    if (item.selected.leftOptionId) return item;
    const graph = topologyBySeed.get(item.selected.seed).slots[item.selected.slotIndex].components.find(row => row.componentId === item.selected.componentId);
    const slot = conflictBySeed.get(item.selected.seed).slots[item.selected.slotIndex];
    const allCells = sortedUnion(item.selected.optionIds.map(id => slot.nodes.find(node => node.optionId === id).xCells));
    return { ...item, selected: { ...item.selected, exactUnionCells: allCells, _nodes: slot.nodes } };
  }) };
  const atlasCases = objectiveForSvg.categories.map(item => {
    if (!item.selected) return item;
    const selected = item.selected;
    if (selected.leftOptionId) {
      const pair = allPairs.find(row => row.seed === selected.seed && row.slotIndex === selected.slotIndex
        && row.BOptionId === selected.leftOptionId && row.COptionId === selected.rightOptionId);
      return { ...item, selected: { ...pair, leftOptionId: pair.BOptionId, rightOptionId: pair.COptionId } };
    }
    return item;
  });
  fs.writeFileSync(abs(OUT + '/visual/objective-atlas.svg'), renderAtlas({ categories: atlasCases }, nodesBySlot));
  process.stdout.write(JSON.stringify({ summary: {
    contestedProvenance: compositionCensus,
    crossChannelPairSummary: pairSummary,
    exactSameXAndFConfinement: summary.exactSameXAndFConfinement,
    unionAlphaGroups: Object.fromEntries(Object.entries(geometrySummary).map(([key, value]) => [key, {
      count: value.count, unionCells: value.unionCellCount, unionToX: value.unionToLargestMemberRatio,
      unionToXDiameter: value.unionToMaxMemberEuclideanDiameterRatio, unionToXGeodesic: value.unionToMaxMemberGeodesic8EdgesRatio } ])),
    MIS: misSummary, productionPlates: productionPlateGeometry.pooled,
    parity, outputs: outputFiles.length + 1
  }, objectiveCases: objectiveCases.map(item => ({ category: item.category,
    selected: item.selected && { seed: item.selected.seed, slotIndex: item.selected.slotIndex,
      componentId: item.selected.componentId, BOptionId: item.selected.BOptionId, COptionId: item.selected.COptionId,
      relation: item.selected.relation, jaccard: item.selected.jaccard, nucleusDistance: item.selected.nucleusDistance,
      memberCount: item.selected.memberCount, alpha: item.selected.alpha, unionToLargestMemberRatio: item.selected.unionToLargestMemberRatio } })) }, null, 2) + '\n');
}

main();
