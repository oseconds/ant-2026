import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CONFLICT = resolve(ROOT, 'docs/ant/evidence/2026-11-01-bc-local-conflict-decomposition');
const CAPACITY = resolve(ROOT, 'docs/ant/evidence/2026-11-01-bc-material-capacity-necessity-audit');
const OUT = resolve(ROOT, 'docs/ant/evidence/2026-11-01-bc-local-conflict-topology-audit');
const SEEDS = ['20261005', '20261006', '20261007'];
const GRID = 96, CELLS = GRID * GRID;
const PRODUCTION = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const CONFLICT_COMMIT = '86f0b57bb67bc2b60794108ce5e04dc5e761d45a';
const CAPACITY_COMMIT = 'ebd1f34c5d2322bd5d3c3d6c8b83bad5a8fd7b6e';
const SLOT_AUDIT = 'e960d135afec30e7c9f35722359e15f0f2d39ce3';
const DUAL = '248da39a4d7d342022a27a5b9ec183cad9b160e2';
const PROTOTYPE = 'a80a613be68ede94fce89008a076fbe582178f41';
const hash = data => createHash('sha256').update(data).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const codeCompare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const setKey = values => JSON.stringify([...values].sort(codeCompare));
const edgeKey = (a, b) => JSON.stringify(codeCompare(a, b) < 0 ? [a, b] : [b, a]);
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const readGzip = async path => JSON.parse(gunzipSync(await readFile(path)));
const q = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
};

async function verifyPackage(dir) {
  const manifestBytes = await readFile(resolve(dir, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const sumsText = await readFile(resolve(dir, 'SHA256SUMS.txt'), 'utf8');
  const sums = new Map(sumsText.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const [digest, file] = line.trim().split(/\s{2,}/, 2);
    return [file, digest.toLowerCase()];
  }));
  assert.equal(sums.get('manifest.json'), hash(manifestBytes), `${dir} manifest hash`);
  for (const row of manifest.files) {
    const data = await readFile(resolve(dir, row.file));
    assert.equal(data.length, row.bytes, `${dir}/${row.file} bytes`);
    assert.equal(hash(data), row.sha256, `${dir}/${row.file} hash`);
    assert.equal(sums.get(row.file), row.sha256, `${dir}/${row.file} checksum row`);
  }
  return { manifest, manifestSha256: hash(manifestBytes), sumsSha256: hash(Buffer.from(sumsText)) };
}

function intersectionCount(left, right) {
  let i = 0, j = 0, count = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { count++; i++; j++; }
    else if (left[i] < right[j]) i++;
    else j++;
  }
  return count;
}

function bfsComponents(adjacency) {
  const seen = new Set(), result = [];
  for (let start = 0; start < adjacency.length; start++) {
    if (seen.has(start)) continue;
    const queue = [start], part = [];
    seen.add(start);
    for (let at = 0; at < queue.length; at++) {
      const node = queue[at]; part.push(node);
      for (let other = 0; other < adjacency.length; other++) {
        if (adjacency[node][other] && !seen.has(other)) { seen.add(other); queue.push(other); }
      }
    }
    result.push(part.sort((a, b) => a - b));
  }
  return result;
}

function cellOwnerEdges(nodes) {
  const owners = new Map(), edges = new Set();
  for (let i = 0; i < nodes.length; i++) {
    for (const cell of nodes[i].xCells) {
      const prior = owners.get(cell) || [];
      for (const j of prior) edges.add(edgeKey(nodes[i].optionId, nodes[j].optionId));
      prior.push(i); owners.set(cell, prior);
    }
  }
  return edges;
}

function independent(mask, adjacencyMasks) {
  for (let i = 0; i < adjacencyMasks.length; i++) {
    if ((mask & (1 << i)) && (adjacencyMasks[i] & mask)) return false;
  }
  return true;
}

function clique(mask, adjacencyMasks, n) {
  for (let i = 0; i < n; i++) {
    if (!(mask & (1 << i))) continue;
    for (let j = i + 1; j < n; j++) {
      if ((mask & (1 << j)) && !(adjacencyMasks[i] & (1 << j))) return false;
    }
  }
  return true;
}

function popcount(mask) {
  let n = 0;
  while (mask) { mask &= mask - 1; n++; }
  return n;
}

function recursiveExtrema(adjacencyMasks, n, invert = false) {
  const masks = adjacencyMasks.map((mask, i) => {
    const all = ((1 << n) - 1) & ~(1 << i);
    return invert ? all & ~mask : mask;
  });
  let best = -1;
  const solutions = [];
  function visit(remaining, chosen) {
    if (popcount(chosen) + popcount(remaining) < best) return;
    if (!remaining) {
      const size = popcount(chosen);
      if (size > best) { best = size; solutions.length = 0; }
      if (size === best) solutions.push(chosen);
      return;
    }
    let pick = -1, maxDegree = -1;
    for (let i = 0; i < n; i++) if (remaining & (1 << i)) {
      const degree = popcount(masks[i] & remaining);
      if (degree > maxDegree) { pick = i; maxDegree = degree; }
    }
    const bit = 1 << pick;
    visit(remaining & ~bit & ~masks[pick], chosen | bit);
    visit(remaining & ~bit, chosen);
  }
  visit((1 << n) - 1, 0);
  return { size: best, masks: [...new Set(solutions)].sort((a, b) => a - b) };
}

function countComponents(adjacency, omitNode = -1, omittedEdge = null) {
  const n = adjacency.length, seen = new Set();
  let count = 0;
  for (let start = 0; start < n; start++) {
    if (start === omitNode || seen.has(start)) continue;
    count++;
    const stack = [start]; seen.add(start);
    while (stack.length) {
      const node = stack.pop();
      for (let other = 0; other < n; other++) {
        if (other === omitNode || seen.has(other) || !adjacency[node][other]) continue;
        if (omittedEdge && ((node === omittedEdge[0] && other === omittedEdge[1]) || (node === omittedEdge[1] && other === omittedEdge[0]))) continue;
        seen.add(other); stack.push(other);
      }
    }
  }
  return count;
}

function profileFor(mask, nodes) {
  let bOnly = 0, cOnly = 0, dual = 0, hasB = false, hasC = false;
  const optionIds = [];
  for (let i = 0; i < nodes.length; i++) if (mask & (1 << i)) {
    const node = nodes[i]; optionIds.push(node.optionId);
    if (node.composition === 'B-only') { bOnly++; hasB = true; }
    else if (node.composition === 'C-only') { cOnly++; hasC = true; }
    else { dual++; hasB = true; hasC = true; }
  }
  let className;
  if (dual && !bOnly && !cOnly) className = 'dual-only';
  else if (hasB && hasC) className = dual ? 'mixed-with-dual' : 'mixed-B/C';
  else if (hasB) className = 'B-only';
  else className = 'C-only';
  return { bOnly, cOnly, dual, hasB, hasC, className, optionIds };
}

function graphMetrics(nodes, edgeIds) {
  const ordered = [...nodes].sort((a, b) => codeCompare(a.optionId, b.optionId));
  const n = ordered.length;
  assert.ok(n > 0 && n <= 12, `contested component size ${n} exceeds exact bound`);
  const index = new Map(ordered.map((node, i) => [node.optionId, i]));
  const adjacency = Array.from({ length: n }, () => Array(n).fill(false));
  const adjacencyMasks = Array(n).fill(0);
  const edges = [];
  for (const key of edgeIds) {
    const [left, right] = JSON.parse(key), i = index.get(left), j = index.get(right);
    if (i === undefined || j === undefined) continue;
    adjacency[i][j] = adjacency[j][i] = true;
    adjacencyMasks[i] |= 1 << j; adjacencyMasks[j] |= 1 << i;
    edges.push({ optionIds: [ordered[i].optionId, ordered[j].optionId] });
  }
  const degrees = adjacency.map(row => row.reduce((sum, value) => sum + Number(value), 0));
  const edgeCount = edges.length, possibleEdges = n * (n - 1) / 2;
  const bruteMaxIndependent = [], bruteMaxClique = [], maximalSizes = {};
  let alpha = -1, omega = -1;
  for (let mask = 1; mask < (1 << n); mask++) {
    const size = popcount(mask);
    if (independent(mask, adjacencyMasks)) {
      if (size > alpha) { alpha = size; bruteMaxIndependent.length = 0; }
      if (size === alpha) bruteMaxIndependent.push(mask);
      let maximal = true;
      for (let i = 0; i < n && maximal; i++) if (!(mask & (1 << i)) && !(adjacencyMasks[i] & mask)) maximal = false;
      if (maximal) maximalSizes[size] = (maximalSizes[size] || 0) + 1;
    }
    if (clique(mask, adjacencyMasks, n)) {
      if (size > omega) { omega = size; bruteMaxClique.length = 0; }
      if (size === omega) bruteMaxClique.push(mask);
    }
  }
  const recursiveAlpha = recursiveExtrema(adjacencyMasks, n, false);
  const recursiveOmega = recursiveExtrema(adjacencyMasks, n, true);
  assert.equal(alpha, recursiveAlpha.size, 'independent alpha reconstruction');
  assert.deepEqual([...bruteMaxIndependent].sort((a, b) => a - b), recursiveAlpha.masks, 'maximum independent sets exact reconstruction');
  assert.equal(omega, recursiveOmega.size, 'clique omega reconstruction');
  assert.deepEqual([...bruteMaxClique].sort((a, b) => a - b), recursiveOmega.masks, 'maximum clique sets exact reconstruction');

  const maxProfiles = new Map();
  for (const mask of bruteMaxIndependent) {
    const profile = profileFor(mask, ordered);
    const key = `${profile.className}|B${profile.bOnly}|C${profile.cOnly}|D${profile.dual}`;
    const row = maxProfiles.get(key) || { ...profile, count: 0 };
    row.count++;
    maxProfiles.set(key, row);
  }
  const labels = [
    ...new Set(maxProfiles.values().map(row => row.className))
  ].sort(codeCompare);
  const lexicalMaxIndependentMasks = [...bruteMaxIndependent].sort((left, right) => {
    const a = profileFor(left, ordered).optionIds, b = profileFor(right, ordered).optionIds;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const order = codeCompare(a[i], b[i]);
      if (order) return order;
    }
    return a.length - b.length;
  });
  const articulationPoints = [];
  for (let i = 0; i < n; i++) if (countComponents(adjacency, i) > 1) articulationPoints.push(ordered[i].optionId);
  const bridges = [];
  for (const edge of edges) {
    const [left, right] = edge.optionIds;
    if (countComponents(adjacency, -1, [index.get(left), index.get(right)]) > 1) bridges.push(edge.optionIds);
  }
  const connectedComponents = bfsComponents(adjacency);
  const degreeHistogram = {};
  for (const degree of degrees) degreeHistogram[degree] = (degreeHistogram[degree] || 0) + 1;
  const universalVertices = ordered.filter((_, i) => degrees[i] === n - 1).map(node => node.optionId);
  const hasBCCompatibleSet = bruteMaxIndependent.some(mask => {
    const profile = profileFor(mask, ordered);
    return profile.hasB && profile.hasC;
  });
  return {
    nodeCount: n,
    edgeCount,
    edgeDensity: possibleEdges ? edgeCount / possibleEdges : 0,
    degreeHistogram,
    nodes: ordered.map((node, i) => ({ optionId: node.optionId, xSha256: node.xSha256,
      xNodeCount: node.xCells.length, composition: node.composition, channels: node.channels, degree: degrees[i],
      centerIndices: node.centerIndices || [], centers: node.centers || [] })),
    edges,
    connectedness: { componentCount: connectedComponents.length, connected: connectedComponents.length === 1,
      connectedOptionIds: connectedComponents.map(part => part.map(i => ordered[i].optionId)) },
    clique: edgeCount === possibleEdges,
    cliqueNumber: omega,
    independenceNumber: alpha,
    maximumIndependentSetCount: bruteMaxIndependent.length,
    maximalIndependentSetSizeDistribution: Object.fromEntries(Object.entries(maximalSizes).sort((a, b) => Number(a[0]) - Number(b[0]))),
    maximumIndependentSetProvenance: {
      profileCounts: [...maxProfiles.entries()].sort((a, b) => codeCompare(a[0], b[0])).map(([profileKey, row]) => ({
        profileKey, className: row.className, BOnlyNodes: row.bOnly, COnlyNodes: row.cOnly,
        dualNodes: row.dual, channelBPresent: row.hasB, channelCPresent: row.hasC, maximumSetCount: row.count,
        exampleOptionIds: row.optionIds
      })),
      possibleClasses: labels,
      anyBOnly: [...maxProfiles.values()].some(row => row.className === 'B-only'),
      anyCOnly: [...maxProfiles.values()].some(row => row.className === 'C-only'),
      anyDual: [...maxProfiles.values()].some(row => row.dual > 0),
      anyMixedBC: hasBCCompatibleSet
    },
    universalVertices,
    articulationVertices: articulationPoints,
    bridges,
    exactBruteMaximumIndependentSetMasks: bruteMaxIndependent,
    diagnosticMaximumIndependentSetOptionIds: profileFor(lexicalMaxIndependentMasks[0], ordered).optionIds,
    _adjacency: adjacency,
    _adjacencyMasks: adjacencyMasks,
    _orderedNodes: ordered
  };
}

function isomorphicGraphs(left, right) {
  const n = left.nodeCount;
  if (n !== right.nodeCount || left.edgeCount !== right.edgeCount) return false;
  const buildAdjacency = graph => {
    const indices = new Map(graph.nodes.map((node, i) => [node.optionId, i]));
    const matrix = Array.from({ length: n }, () => Array(n).fill(false));
    for (const edge of graph.edges) {
      const i = indices.get(edge.optionIds[0]), j = indices.get(edge.optionIds[1]);
      matrix[i][j] = matrix[j][i] = true;
    }
    return matrix;
  };
  const a = buildAdjacency(left), b = buildAdjacency(right);
  const da = a.map(row => row.reduce((s, v) => s + Number(v), 0));
  const db = b.map(row => row.reduce((s, v) => s + Number(v), 0));
  if (setKey(da.slice().sort((x, y) => x - y)) !== setKey(db.slice().sort((x, y) => x - y))) return false;
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => db[j] - db[i] || codeCompare(right.nodes[i].optionId, right.nodes[j].optionId));
  const targets = Array.from({ length: n }, (_, i) => i).sort((i, j) => da[j] - da[i] || codeCompare(left.nodes[i].optionId, left.nodes[j].optionId));
  const map = Array(n).fill(-1), used = new Set();
  function visit(depth) {
    if (depth === n) return true;
    const j = order[depth];
    for (const i of targets) {
      if (used.has(i) || da[i] !== db[j]) continue;
      let valid = true;
      for (let priorDepth = 0; priorDepth < depth && valid; priorDepth++) {
        const otherJ = order[priorDepth], otherI = map[otherJ];
        if (a[i][otherI] !== b[j][otherJ]) valid = false;
      }
      if (!valid) continue;
      map[j] = i; used.add(i);
      if (visit(depth + 1)) return true;
      used.delete(i); map[j] = -1;
    }
    return false;
  }
  return visit(0);
}

function graphFixture(tag, size, edges) {
  return { nodeCount: size, edgeCount: edges.length,
    nodes: Array.from({ length: size }, (_, i) => ({ optionId: `${tag}-${i}` })),
    edges: edges.map(([a, b]) => ({ optionIds: [`${tag}-${a}`, `${tag}-${b}`] })) };
}

function checkIsomorphismHelper() {
  const cycle = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]];
  const permutation = [3, 0, 5, 1, 4, 2];
  const relabeledCycle = cycle.map(([a, b]) => [permutation[a], permutation[b]]);
  const triangles = [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3]];
  assert.equal(isomorphicGraphs(graphFixture('cycle', 6, cycle), graphFixture('rotated', 6, relabeledCycle)), true);
  assert.equal(isomorphicGraphs(graphFixture('cycle', 6, cycle), graphFixture('triangles', 6, triangles)), false);
}

function stripInternal(graph) {
  const { _adjacency, _adjacencyMasks, _orderedNodes, exactBruteMaximumIndependentSetMasks, ...receipt } = graph;
  return receipt;
}

async function loadInputs() {
  const conflictPackage = await verifyPackage(CONFLICT);
  const capacityPackage = await verifyPackage(CAPACITY);
  const conflictManifest = conflictPackage.manifest;
  const capacityManifest = capacityPackage.manifest;
  assert.equal(conflictManifest.branch, 'codex/ant-bc-local-conflict-decomposition-20261101');
  assert.equal(conflictManifest.productionAuthority, PRODUCTION);
  assert.equal(conflictManifest.sourceCommitSlotAuditCommit, SLOT_AUDIT);
  assert.equal(conflictManifest.dualHistoryCommit, DUAL);
  assert.equal(conflictManifest.provenancePrototypeCommit, PROTOTYPE);
  assert.equal(capacityManifest.branch, 'codex/ant-bc-material-capacity-necessity-audit-20261101');
  assert.equal(capacityManifest.productionAuthority, PRODUCTION);
  assert.equal(capacityManifest.inputs.conflict, CONFLICT_COMMIT);
  assert.equal(capacityManifest.inputs.conflictManifestSha256, conflictPackage.manifestSha256);
  assert.equal(capacityManifest.inputs.conflictSumsSha256, conflictPackage.sumsSha256);
  const capacityReport = await readFile(resolve(CAPACITY, 'REPORT.md'), 'utf8');
  assert.ok(capacityReport.includes('CAPACITY LAW NOT YET JUSTIFIED'));
  const conflictSummary = await readJson(resolve(CONFLICT, 'analysis/summary.json'));
  const conflictValidation = await readJson(resolve(CONFLICT, 'analysis/validation.json'));
  assert.equal(conflictSummary.totalSlots, 163);
  assert.equal(conflictSummary.totalOptions, 1846);
  assert.equal(conflictSummary.totalComponents, 1352);
  assert.equal(conflictValidation.productionAuthority, PRODUCTION);
  assert.equal(conflictValidation.observerRngCalls, 0);

  const seeds = [];
  let totalSlots = 0, totalOptions = 0, totalComponents = 0;
  const componentRows = [];
  const sourceFiles = [];
  for (const seed of SEEDS) {
    const rel = `analysis/conflict-slots-${seed}.json.gz`;
    const row = conflictManifest.files.find(file => file.file === rel);
    assert.ok(row, `registered frozen conflict packet ${seed}`);
    const bytes = await readFile(resolve(CONFLICT, rel));
    assert.equal(bytes.length, row.bytes); assert.equal(hash(bytes), row.sha256);
    const packet = JSON.parse(gunzipSync(bytes));
    assert.equal(packet.schema, 'ant-bc-x-overlap-conflict-slots-v1');
    assert.equal(packet.seed, seed);
    const built = [];
    for (const slot of packet.slots) {
      const graphSlot = reconstructSlot(slot);
      built.push(graphSlot);
      for (const component of graphSlot.components) {
        componentRows.push({ seed, slotIndex: slot.slotIndex, timeMs: slot.timeMs, componentId: component.componentId, ...component });
      }
    }
    assert.equal(built.length, seed === '20261005' ? 55 : 54);
    assert.equal(built.reduce((sum, slot) => sum + slot.nodes.length, 0), seed === '20261005' ? 576 : seed === '20261006' ? 665 : 605);
    assert.equal(built.reduce((sum, slot) => sum + slot.components.length, 0), seed === '20261005' ? 422 : seed === '20261006' ? 486 : 444);
    totalSlots += built.length;
    totalOptions += built.reduce((sum, slot) => sum + slot.nodes.length, 0);
    totalComponents += built.reduce((sum, slot) => sum + slot.components.length, 0);
    sourceFiles.push({ file: rel, sha256: row.sha256, bytes: row.bytes });
    seeds.push({ seed, slots: built, sourceHash: row.sha256, sourceBytes: row.bytes });
  }
  assert.equal(totalSlots, 163); assert.equal(totalOptions, 1846); assert.equal(totalComponents, 1352);

  const continuity = [];
  let adjacentPairCount = 0, registeredContinuations = 0;
  for (const seed of SEEDS) {
    const rel = `analysis/persistent-conflicts-${seed}.json.gz`;
    const row = conflictManifest.files.find(file => file.file === rel);
    assert.ok(row);
    const bytes = await readFile(resolve(CONFLICT, rel));
    assert.equal(hash(bytes), row.sha256); assert.equal(bytes.length, row.bytes);
    const packet = JSON.parse(gunzipSync(bytes));
    assert.equal(packet.seed, seed);
    const registered = packet.transitions.reduce((sum, transition) => sum + transition.oneToOneContestedContinuations, 0);
    registeredContinuations += registered;
    const seedPairs = [];
    for (const track of packet.contestedTracks) {
      const observations = track.observations;
      for (let i = 0; i < observations.length; i++) {
        const observation = observations[i];
        const slot = seeds.find(row => row.seed === seed).slots[observation.slotIndex];
        assert.ok(slot);
        const graph = slot.components.find(item => item.componentId === observation.componentId);
        assert.ok(graph && graph.nodeCount > 1);
        assert.deepEqual(graph.nodes.map(node => node.optionId).sort(codeCompare), [...observation.memberOptionIds].sort(codeCompare));
        assert.deepEqual(graph.nodes.map(node => node.xSha256).sort(codeCompare), [...observation.memberXHashes].sort(codeCompare));
        if (i === 0) continue;
        const prior = observations[i - 1];
        assert.equal(observation.slotIndex, prior.slotIndex + 1, `registered track ${track.trackId} must use adjacent slots`);
        const priorSlot = seeds.find(row => row.seed === seed).slots[prior.slotIndex];
        const priorGraph = priorSlot.components.find(item => item.componentId === prior.componentId);
        assert.ok(priorGraph);
        const iso = isomorphicGraphs(priorGraph, graph);
        const pair = { seed, trackId: track.trackId, from: {
          slotIndex: prior.slotIndex, anchorIndex: prior.anchorIndex, timeMs: prior.timeMs, componentId: prior.componentId,
          nodeCount: priorGraph.nodeCount, edgeCount: priorGraph.edgeCount, edgeDensity: priorGraph.edgeDensity,
          clique: priorGraph.clique, alpha: priorGraph.independenceNumber, degreeHistogram: priorGraph.degreeHistogram
        }, to: {
          slotIndex: observation.slotIndex, anchorIndex: observation.anchorIndex, timeMs: observation.timeMs, componentId: observation.componentId,
          nodeCount: graph.nodeCount, edgeCount: graph.edgeCount, edgeDensity: graph.edgeDensity,
          clique: graph.clique, alpha: graph.independenceNumber, degreeHistogram: graph.degreeHistogram
        }, isomorphicTopology: iso,
          transitionClass: `${priorGraph.clique ? 'clique' : 'partial'} -> ${graph.clique ? 'clique' : 'partial'}` };
        seedPairs.push(pair); continuity.push(pair); adjacentPairCount++;
      }
    }
    assert.equal(seedPairs.length, registered, `one-to-one continuation count for ${seed}`);
    sourceFiles.push({ file: rel, sha256: row.sha256, bytes: row.bytes });
  }
  assert.equal(adjacentPairCount, registeredContinuations);
  return { seeds, componentRows, sourceFiles, conflictPackage, capacityPackage,
    upstream: { conflictSummary, conflictValidation }, continuity,
    totals: { totalSlots, totalOptions, totalComponents, contestedComponents: componentRows.filter(row => row.nodeCount > 1).length,
      adjacentPersistentRegionTransitions: adjacentPairCount, registeredPersistentContinuations: registeredContinuations } };
}

function reconstructSlot(slot) {
  const nodes = [...slot.nodes].sort((a, b) => codeCompare(a.optionId, b.optionId));
  const idSet = new Set(nodes.map(node => node.optionId));
  assert.equal(idSet.size, nodes.length);
  const graph = Array.from({ length: nodes.length }, () => Array(nodes.length).fill(false));
  const directEdges = new Set();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    assert.ok(node.xCells.length > 0);
    assert.deepEqual(node.xCells, [...node.xCells].sort((a, b) => a - b));
    assert.equal(new Set(node.xCells).size, node.xCells.length);
    assert.ok(node.xCells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < CELLS));
    assert.equal(hash(Buffer.from(JSON.stringify(node.xCells))), node.xSha256);
    assert.deepEqual(node.channels, [...new Set(node.candidates.map(candidate => candidate.channel))].sort(codeCompare));
    for (let j = i + 1; j < nodes.length; j++) if (intersectionCount(node.xCells, nodes[j].xCells)) {
      graph[i][j] = graph[j][i] = true;
      directEdges.add(edgeKey(node.optionId, nodes[j].optionId));
    }
  }
  const cellEdges = cellOwnerEdges(nodes);
  assert.deepEqual([...directEdges].sort(codeCompare), [...cellEdges].sort(codeCompare), 'independent X mask edge reconstruction');
  const registeredEdges = slot.overlapEdges.map(edge => edgeKey(edge.leftOptionId, edge.rightOptionId)).sort(codeCompare);
  assert.deepEqual([...directEdges].sort(codeCompare), registeredEdges, 'exact registered overlap edges');
  const bfs = bfsComponents(graph).map(part => part.map(index => nodes[index].optionId).sort(codeCompare).sort(codeCompare)).map(setKey).sort(codeCompare);
  const registeredComponents = slot.components.map(component => setKey(component.memberOptionIds)).sort(codeCompare);
  assert.deepEqual(bfs, registeredComponents, 'registered overlap component partition');
  const unionParent = Array.from({ length: nodes.length }, (_, i) => i);
  const find = i => unionParent[i] === i ? i : (unionParent[i] = find(unionParent[i]));
  const union = (i, j) => { const a = find(i), b = find(j); if (a !== b) unionParent[b] = a; };
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (graph[i][j]) union(i, j);
  const ufSets = new Map();
  for (let i = 0; i < nodes.length; i++) { const root = find(i); const list = ufSets.get(root) || []; list.push(nodes[i].optionId); ufSets.set(root, list); }
  assert.deepEqual([...ufSets.values()].map(setKey).sort(codeCompare), registeredComponents, 'independent union-find partition');

  const components = [];
  for (const registered of slot.components) {
    const members = registered.memberOptionIds.map(id => nodes.find(node => node.optionId === id));
    assert.ok(members.every(Boolean));
    const memberIds = new Set(registered.memberOptionIds);
    const edges = [...directEdges].filter(key => JSON.parse(key).every(id => memberIds.has(id)));
    const metrics = graphMetrics(members, edges);
    assert.equal(metrics.connectedness.connected, true);
    assert.equal(metrics.nodeCount, registered.memberXCount);
    if (metrics.nodeCount > 1) assert.equal(metrics.clique, metrics.edgeCount === metrics.nodeCount * (metrics.nodeCount - 1) / 2);
    components.push({ componentId: registered.componentId, memberOptionIds: registered.memberOptionIds,
      memberXHashes: registered.memberXHashes, provenanceTags: registered.provenanceTags,
      BOnlyNodes: registered.BOnlyNodes, COnlyNodes: registered.COnlyNodes, dualProvenanceNodes: registered.dualProvenanceNodes,
      unionCellCount: registered.unionCellCount, centroid: registered.centroid,
      fComponents: registered.fComponents, ...metrics });
  }
  assert.equal(components.length, slot.overlapComponentCount);
  const compatible = components.reduce((sum, component) => sum + component.independenceNumber, 0);
  assert.ok(compatible >= components.length && compatible <= nodes.length);
  return { seed: slot.seed, slotIndex: slot.slotIndex, anchorIndex: slot.anchorIndex, timeMs: slot.timeMs,
    uniqueSpatialOptionCount: nodes.length, registeredOverlapEdgeCount: slot.overlapEdges.length,
    overlapComponentCount: components.length, singletonComponentCount: components.filter(component => component.nodeCount === 1).length,
    contestedComponentCount: components.filter(component => component.nodeCount > 1).length,
    maximumCompatibleOptionCount: compatible,
    componentVsCompatibleDifference: compatible - components.length,
    components: components.map(stripInternal), _componentsInternal: components, nodes };
}

function aggregateComponentClasses(allComponents) {
  const classes = [
    { key: 'size-2', label: '2', test: n => n === 2 },
    { key: 'size-3', label: '3', test: n => n === 3 },
    { key: 'size-4-5', label: '4–5', test: n => n >= 4 && n <= 5 },
    { key: 'size-6-plus', label: '6+', test: n => n >= 6 }
  ];
  return classes.map(group => {
    const rows = allComponents.filter(row => row.nodeCount > 1 && group.test(row.nodeCount));
    const alphas = rows.map(row => row.independenceNumber), densities = rows.map(row => row.edgeDensity);
    return { sizeClass: group.label, componentCount: rows.length,
      cliqueCount: rows.filter(row => row.clique).length,
      cliqueFraction: rows.length ? rows.filter(row => row.clique).length / rows.length : null,
      alphaOneCount: rows.filter(row => row.independenceNumber === 1).length,
      alphaGreaterThanOneCount: rows.filter(row => row.independenceNumber > 1).length,
      alphaMedian: q(alphas, .5), alphaQ90: q(alphas, .9),
      universalVertexCount: rows.filter(row => row.universalVertices.length > 0).length,
      universalVertexFraction: rows.length ? rows.filter(row => row.universalVertices.length > 0).length / rows.length : null,
      medianEdgeDensity: q(densities, .5), q90EdgeDensity: q(densities, .9),
      alphaDistribution: countDistribution(alphas), provenance: summarizeProvenance(rows) };
  });
}

function countDistribution(values) {
  const out = {};
  for (const value of values) out[value] = (out[value] || 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => Number(a[0]) - Number(b[0])));
}

function summarizeProvenance(rows) {
  return {
    componentsWithBOnlyPossible: rows.filter(row => row.maximumIndependentSetProvenance.anyBOnly).length,
    componentsWithCOnlyPossible: rows.filter(row => row.maximumIndependentSetProvenance.anyCOnly).length,
    componentsWithDualNodePossible: rows.filter(row => row.maximumIndependentSetProvenance.anyDual).length,
    componentsWithBAndCPresentInOneMaximumSet: rows.filter(row => row.maximumIndependentSetProvenance.anyMixedBC).length
  };
}

function summarizeSlot(slot) {
  const contested = slot._componentsInternal.filter(row => row.nodeCount > 1);
  return {
    seed: slot.seed, slotIndex: slot.slotIndex, anchorIndex: slot.anchorIndex, timeMs: slot.timeMs,
    options: slot.uniqueSpatialOptionCount, components: slot.overlapComponentCount,
    singletonComponents: slot.singletonComponentCount, contestedComponents: slot.contestedComponentCount,
    maximumCompatibleOptions: slot.maximumCompatibleOptionCount,
    componentSuppressionOfCompatible: slot.componentVsCompatibleDifference,
    cliques: contested.filter(row => row.clique).length,
    contestedAlphaValues: contested.map(row => row.independenceNumber),
    contestedCliqueFraction: contested.length ? contested.filter(row => row.clique).length / contested.length : null
  };
}

function windowRows(seeds) {
  const bySeed = [], pooled = [];
  for (const seedData of seeds) {
    for (let index = 0; index < 10; index++) {
      const rows = seedData.slots.filter(slot => Math.floor(slot.timeMs / 60_000) === index).map(summarizeSlot);
      const contested = rows.flatMap(row => row.contestedAlphaValues);
      const contestedCount = rows.reduce((sum, row) => sum + row.contestedComponents, 0);
      bySeed.push(windowSummary(seedData.seed, index, rows, contested, contestedCount));
    }
  }
  for (let index = 0; index < 10; index++) {
    const rows = seeds.flatMap(seedData => seedData.slots.filter(slot => Math.floor(slot.timeMs / 60_000) === index).map(summarizeSlot));
    const contested = rows.flatMap(row => row.contestedAlphaValues);
    pooled.push(windowSummary('POOLED', index, rows, contested, rows.reduce((sum, row) => sum + row.contestedComponents, 0)));
  }
  return { bySeed, pooled };
}

function windowSummary(seed, index, rows, contestedAlphas, contestedCount) {
  return { seed, windowStartS: index * 60, windowEndS: (index + 1) * 60,
    temporalSlots: rows.length,
    totalOptions: rows.reduce((sum, row) => sum + row.options, 0),
    totalComponents: rows.reduce((sum, row) => sum + row.components, 0),
    totalSingletonComponents: rows.reduce((sum, row) => sum + row.singletonComponents, 0),
    contestedComponents: contestedCount,
    cliqueFraction: contestedCount ? rows.reduce((sum, row) => sum + row.cliques, 0) / contestedCount : null,
    medianAlpha: q(contestedAlphas, .5), q90Alpha: q(contestedAlphas, .9), maxAlpha: contestedAlphas.length ? Math.max(...contestedAlphas) : null,
    maximumCompatibleOptions: rows.reduce((sum, row) => sum + row.maximumCompatibleOptions, 0) };
}

function chooseCases(allComponents, persistent) {
  const rows = allComponents.filter(row => row.nodeCount > 1);
  const stableSort = (list, compare) => [...list].sort((a, b) => compare(a, b) || codeCompare(a.seed, b.seed) || a.slotIndex - b.slotIndex || codeCompare(a.componentId, b.componentId));
  const selected = [];
  function add(id, criterion, list, compare) {
    const row = stableSort(list, compare)[0];
    if (!row) { selected.push({ id, status: 'none', criterion }); return; }
    selected.push({ id, status: 'selected', criterion, seed: row.seed, slotIndex: row.slotIndex, anchorIndex: row.anchorIndex,
      timeMs: row.timeMs, componentId: row.componentId, nodeCount: row.nodeCount, edgeCount: row.edgeCount,
      edgeDensity: row.edgeDensity, clique: row.clique, cliqueNumber: row.cliqueNumber, alpha: row.independenceNumber,
      maximumIndependentSetCount: row.maximumIndependentSetCount, provenance: row.maximumIndependentSetProvenance,
      diagnosticMaximumIndependentSetOptionIds: row.diagnosticMaximumIndependentSetOptionIds,
      memberOptionIds: row.memberOptionIds, memberXHashes: row.memberXHashes, nodes: row.nodes,
      edges: row.edges, componentUnionCellCount: row.unionCellCount, centroid: row.centroid });
  }
  add('largest-clique-component', 'Largest contested clique by node count; then seed, slot, component ID ascending.', rows.filter(row => row.clique), (a, b) => b.nodeCount - a.nodeCount);
  add('largest-alpha-one-component', 'Largest contested component with alpha = 1; then seed, slot, component ID ascending.', rows.filter(row => row.independenceNumber === 1), (a, b) => b.nodeCount - a.nodeCount);
  add('largest-alpha-two-component', 'Largest contested component with alpha = 2; then seed, slot, component ID ascending.', rows.filter(row => row.independenceNumber === 2), (a, b) => b.nodeCount - a.nodeCount);
  add('maximum-alpha-component', 'Highest alpha; then most nodes; then seed, slot, component ID ascending.', rows, (a, b) => b.independenceNumber - a.independenceNumber || b.nodeCount - a.nodeCount);
  add('sparsest-connected-contested-component', 'Lowest edge density; then most nodes; then seed, slot, component ID ascending.', rows, (a, b) => a.edgeDensity - b.edgeDensity || b.nodeCount - a.nodeCount);
  const dualCompatible = rows.filter(row => row.nodes.some(node => node.composition === '{B,C}') &&
    row.maximumIndependentSetProvenance.profileCounts.some(profile => profile.dualNodes > 0 && profile.BOnlyNodes + profile.COnlyNodes + profile.dualNodes > 1));
  add('dual-node-with-compatible-distinct-option', 'A maximum independent set includes a {B,C} option and at least one other disjoint option; then largest alpha, most nodes, earliest.',
    dualCompatible, (a, b) => b.independenceNumber - a.independenceNumber || b.nodeCount - a.nodeCount);
  const changing = persistent.tracks.filter(track => track.nonIsomorphicTransitions.length > 0)
    .sort((a, b) => b.observationCount - a.observationCount || codeCompare(a.seed, b.seed) || codeCompare(a.trackId, b.trackId))[0];
  if (!changing) selected.push({ id: 'longest-lived-topology-change', status: 'none', criterion: 'Longest registered one-to-one contested track with a non-isomorphic adjacent graph; then seed and track ID ascending.' });
  else {
    const transition = changing.nonIsomorphicTransitions[0];
    const ref = allComponents.find(row => row.seed === changing.seed && row.slotIndex === transition.to.slotIndex && row.componentId === transition.to.componentId);
    assert.ok(ref);
    selected.push({ id: 'longest-lived-topology-change', status: 'selected', criterion: 'Longest registered one-to-one contested track with a non-isomorphic adjacent graph; then seed and track ID ascending.',
      seed: changing.seed, trackId: changing.trackId, observationCount: changing.observationCount, transition,
      componentId: ref.componentId, slotIndex: ref.slotIndex, anchorIndex: ref.anchorIndex, timeMs: ref.timeMs,
      nodeCount: ref.nodeCount, edgeCount: ref.edgeCount, edgeDensity: ref.edgeDensity, clique: ref.clique,
      cliqueNumber: ref.cliqueNumber, alpha: ref.independenceNumber, maximumIndependentSetCount: ref.maximumIndependentSetCount,
      provenance: ref.maximumIndependentSetProvenance, diagnosticMaximumIndependentSetOptionIds: ref.diagnosticMaximumIndependentSetOptionIds,
      memberOptionIds: ref.memberOptionIds, memberXHashes: ref.memberXHashes, nodes: ref.nodes, edges: ref.edges,
      componentUnionCellCount: ref.unionCellCount, centroid: ref.centroid });
  }
  return selected;
}

function svgAtlas(cases) {
  const W = 1240, panelW = 600, panelH = 390, cols = 2, rows = Math.ceil(cases.length / cols);
  const H = 80 + rows * panelH;
  const provenanceColor = composition => composition === 'B-only' ? '#c2410c' : composition === 'C-only' ? '#0369a1' : '#7e22ce';
  const esc = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    '<rect width="100%" height="100%" fill="#f8fafc"/>',
    '<text x="22" y="34" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#0f172a">Exact-X conflict topology cases</text>',
    '<text x="22" y="59" font-family="Arial,sans-serif" font-size="12" fill="#334155">Nodes show saved X masks; lines show shared cells. Dashed rings mark one diagnostic maximum independent set only.</text>'];
  cases.forEach((item, index) => {
    const x = 16 + (index % cols) * panelW, y = 72 + Math.floor(index / cols) * panelH;
    out.push(`<g transform="translate(${x},${y})"><rect width="${panelW - 16}" height="${panelH - 14}" rx="8" fill="white" stroke="#cbd5e1"/>`);
    out.push(`<text x="14" y="23" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#0f172a">${esc(item.id)} — ${esc(item.status)}</text>`);
    if (item.status !== 'selected') { out.push('</g>'); return; }
    out.push(`<text x="14" y="43" font-family="Arial,sans-serif" font-size="11" fill="#334155">${esc(item.seed)} · ${(item.timeMs / 1000).toFixed(3)} s · n=${item.nodeCount} m=${item.edgeCount} ω=${item.cliqueNumber} α=${item.alpha} · MIS=${item.maximumIndependentSetCount}</text>`);
    const cells = item.visualCells;
    if (!cells?.length) { out.push('<text x="14" y="80" font-family="Arial,sans-serif" font-size="12" fill="#b91c1c">No mask geometry in case receipt</text></g>'); return; }
    let minC = GRID, minR = GRID, maxC = 0, maxR = 0;
    for (const node of cells) for (const cell of node.xCells) { const c = cell % GRID, r = Math.floor(cell / GRID); minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r); }
    const area = { x: 30, y: 60, w: 350, h: 286 };
    const step = Math.min(area.w / Math.max(1, maxC - minC + 1), area.h / Math.max(1, maxR - minR + 1));
    const offsetX = area.x + (area.w - (maxC - minC + 1) * step) / 2;
    const offsetY = area.y + (area.h - (maxR - minR + 1) * step) / 2;
    const cellCenter = cell => ({ x: offsetX + ((cell % GRID) - minC + .5) * step, y: offsetY + (Math.floor(cell / GRID) - minR + .5) * step });
    const centers = new Map();
    for (const node of cells) {
      let sx = 0, sy = 0;
      for (const cell of node.xCells) { const point = cellCenter(cell); sx += point.x; sy += point.y;
        out.push(`<rect x="${(point.x - step / 2).toFixed(2)}" y="${(point.y - step / 2).toFixed(2)}" width="${Math.max(1, step).toFixed(2)}" height="${Math.max(1, step).toFixed(2)}" fill="${provenanceColor(node.composition)}" fill-opacity="0.20"/>`); }
      centers.set(node.optionId, { x: sx / node.xCells.length, y: sy / node.xCells.length, composition: node.composition });
    }
    for (const edge of item.edges) {
      const [a, b] = edge.optionIds, pa = centers.get(a), pb = centers.get(b);
      out.push(`<line x1="${pa.x.toFixed(2)}" y1="${pa.y.toFixed(2)}" x2="${pb.x.toFixed(2)}" y2="${pb.y.toFixed(2)}" stroke="#0f172a" stroke-width="1.5" stroke-opacity=".72"/>`);
    }
    const mis = new Set(item.diagnosticMaximumIndependentSetOptionIds);
    for (let i = 0; i < cells.length; i++) {
      const node = cells[i], p = centers.get(node.optionId), color = provenanceColor(node.composition);
      out.push(`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="9" fill="${color}" stroke="white" stroke-width="1.2"/>`);
      if (mis.has(node.optionId)) out.push(`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="12" fill="none" stroke="#111827" stroke-width="1.2" stroke-dasharray="3 2"/>`);
      out.push(`<text x="${p.x.toFixed(2)}" y="${(p.y + 3).toFixed(2)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" font-weight="700" fill="white">${i + 1}</text>`);
    }
    const lx = 404;
    out.push(`<text x="${lx}" y="78" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#0f172a">Option key</text>`);
    cells.forEach((node, i) => out.push(`<text x="${lx}" y="${94 + i * 16}" font-family="Arial,sans-serif" font-size="10" fill="${provenanceColor(node.composition)}">${i + 1}. ${esc(node.optionId)} ${esc(node.composition)} · ${node.xCells.length} cells</text>`));
    out.push(`<text x="${lx}" y="318" font-family="Arial,sans-serif" font-size="9" fill="#475569">Dashed rings: one of ${item.maximumIndependentSetCount} maximum</text>`);
    out.push(`<text x="${lx}" y="332" font-family="Arial,sans-serif" font-size="9" fill="#475569">independent sets; diagnostic example, not a winner.</text>`);
    out.push('</g>');
  });
  out.push('</svg>');
  return out.join('');
}

function svgPersistentTransition(transition) {
  const W = 1200, H = 620, panelW = 580;
  const esc = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const colors = composition => composition === 'B-only' ? '#c2410c' : composition === 'C-only' ? '#0369a1' : '#7e22ce';
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    '<rect width="100%" height="100%" fill="#f8fafc"/>',
    `<text x="22" y="30" font-family="Arial,sans-serif" font-size="20" font-weight="700" fill="#0f172a">Registered contested-region graph change · ${esc(transition?.trackId || 'none')}</text>`,
    '<text x="22" y="52" font-family="Arial,sans-serif" font-size="12" fill="#334155">Same registered one-to-one region correspondence; X node identities may change. Dashed rings mark one diagnostic maximum independent set, not a winner.</text>'];
  if (!transition) {
    out.push('<text x="22" y="100" font-family="Arial,sans-serif" font-size="16" fill="#b91c1c">No unambiguous topology-change continuation was available.</text></svg>');
    return out.join('');
  }
  const sides = [transition.from, transition.to];
  const allCells = sides.flatMap(side => side.visualCells.flatMap(node => node.xCells));
  let minC = GRID, minR = GRID, maxC = 0, maxR = 0;
  for (const cell of allCells) { const c = cell % GRID, r = Math.floor(cell / GRID); minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r); }
  const board = { x: 28, y: 94, w: 405, h: 475 };
  const step = Math.min(board.w / Math.max(1, maxC - minC + 1), board.h / Math.max(1, maxR - minR + 1));
  const drawSide = (side, x, label) => {
    out.push(`<g transform="translate(${x},0)"><rect x="0" y="68" width="${panelW - 12}" height="530" rx="8" fill="white" stroke="#cbd5e1"/>`);
    out.push(`<text x="16" y="88" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#0f172a">${label} · ${side.seed} · ${(side.timeMs / 1000).toFixed(3)} s · ${esc(side.componentId)}</text>`);
    out.push(`<text x="16" y="106" font-family="Arial,sans-serif" font-size="11" fill="#334155">n=${side.nodeCount} · m=${side.edgeCount} · ω=${side.cliqueNumber} · α=${side.alpha} · clique=${side.clique}</text>`);
    const offX = board.x + (board.w - (maxC - minC + 1) * step) / 2;
    const offY = board.y + (board.h - (maxR - minR + 1) * step) / 2;
    const center = cell => ({ x: offX + ((cell % GRID) - minC + .5) * step, y: offY + (Math.floor(cell / GRID) - minR + .5) * step });
    const centers = new Map();
    for (const node of side.visualCells) {
      let sx = 0, sy = 0;
      for (const cell of node.xCells) {
        const p = center(cell); sx += p.x; sy += p.y;
        out.push(`<rect x="${(p.x - step / 2).toFixed(2)}" y="${(p.y - step / 2).toFixed(2)}" width="${Math.max(1, step).toFixed(2)}" height="${Math.max(1, step).toFixed(2)}" fill="${colors(node.composition)}" fill-opacity=".20"/>`);
      }
      centers.set(node.optionId, { x: sx / node.xCells.length, y: sy / node.xCells.length });
    }
    for (const edge of side.edges) {
      const a = centers.get(edge.optionIds[0]), b = centers.get(edge.optionIds[1]);
      out.push(`<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="#0f172a" stroke-width="1.5" stroke-opacity=".72"/>`);
    }
    const mis = new Set(side.diagnosticMaximumIndependentSetOptionIds);
    side.visualCells.forEach((node, i) => {
      const p = centers.get(node.optionId), color = colors(node.composition);
      out.push(`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="9" fill="${color}" stroke="white" stroke-width="1.2"/>`);
      if (mis.has(node.optionId)) out.push(`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="12" fill="none" stroke="#111827" stroke-width="1.2" stroke-dasharray="3 2"/>`);
      out.push(`<text x="${p.x.toFixed(2)}" y="${(p.y + 3).toFixed(2)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" font-weight="700" fill="white">${i + 1}</text>`);
    });
    out.push('</g>');
  };
  drawSide(transition.from, 14, 'FROM');
  drawSide(transition.to, 606, 'TO');
  out.push('</svg>');
  return out.join('');
}

async function listOutputFiles(dir, relative = '') {
  const rows = [];
  for (const entry of await readdir(resolve(dir, relative), { withFileTypes: true })) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) rows.push(...await listOutputFiles(dir, rel));
    else if (entry.isFile() && rel !== 'manifest.json' && rel !== 'SHA256SUMS.txt') {
      const data = await readFile(resolve(dir, rel)); rows.push({ file: rel, bytes: data.length, sha256: hash(data) });
    }
  }
  return rows.sort((a, b) => codeCompare(a.file, b.file));
}

async function writeJson(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, jsonBytes(value));
}
async function writeGzip(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, gzipSync(Buffer.from(JSON.stringify(value) + '\n'), { level: 9, mtime: 0 }));
}

async function main() {
  checkIsomorphismHelper();
  await mkdir(resolve(OUT, 'analysis'), { recursive: true });
  await mkdir(resolve(OUT, 'visual'), { recursive: true });
  const input = await loadInputs();
  const allComponents = input.componentRows;
  const contested = allComponents.filter(row => row.nodeCount > 1);
  assert.equal(contested.length, 231);
  assert.equal(Math.max(...contested.map(row => row.nodeCount)), 12);
  const classes = aggregateComponentClasses(allComponents);
  const allSlots = input.seeds.flatMap(seed => seed.slots);
  const perSeed = input.seeds.map(seed => {
    const rows = seed.slots.map(summarizeSlot);
    const options = rows.reduce((sum, row) => sum + row.options, 0);
    const components = rows.reduce((sum, row) => sum + row.components, 0);
    const compatible = rows.reduce((sum, row) => sum + row.maximumCompatibleOptions, 0);
    return { seed: seed.seed, temporalSlots: rows.length, optionAppearances: options, componentEvents: components,
      maximumCompatibleEvents: compatible, additionalCompatibleVsOneComponent: compatible - components,
      compatibilityFractionOfOptions: options ? compatible / options : null,
      componentSuppressionFractionOfCompatible: compatible ? (compatible - components) / compatible : null,
      singletonComponents: rows.reduce((sum, row) => sum + row.singletonComponents, 0),
      contestedComponents: rows.reduce((sum, row) => sum + row.contestedComponents, 0),
      contestedCliqueCount: rows.reduce((sum, row) => sum + row.cliques, 0),
      totalCliqueFractionAmongContested: rows.reduce((sum, row) => sum + row.cliques, 0) / rows.reduce((sum, row) => sum + row.contestedComponents, 0),
      slots: rows };
  });
  const windows = windowRows(input.seeds);
  const slotsReceipt = [];
  for (const seed of input.seeds) {
    for (const slot of seed.slots) {
      slotsReceipt.push({ ...summarizeSlot(slot), registeredOverlapEdgeCount: slot.registeredOverlapEdgeCount });
    }
    const file = resolve(OUT, `analysis/graphs-${seed.seed}.json.gz`);
    await writeGzip(file, { schema: 'ant-bc-local-conflict-topology-slots-v1', seed: seed.seed,
      sourceConflictSlotsSha256: seed.sourceHash,
      slots: seed.slots.map(slot => ({ ...summarizeSlot(slot), registeredOverlapEdgeCount: slot.registeredOverlapEdgeCount,
        components: slot.components })) });
  }
  const persistentTracks = [];
  for (const seed of SEEDS) {
    const tracked = input.continuity.filter(row => row.seed === seed);
    const sourcePacket = JSON.parse(gunzipSync(await readFile(resolve(CONFLICT, `analysis/persistent-conflicts-${seed}.json.gz`))));
    for (const track of sourcePacket.contestedTracks) {
      const trackPairs = tracked.filter(pair => pair.trackId === track.trackId);
      persistentTracks.push({ seed, trackId: track.trackId, observationCount: track.observations.length,
        firstTimeMs: track.observations[0]?.timeMs ?? null, lastTimeMs: track.observations.at(-1)?.timeMs ?? null,
        observations: track.observations.map(observation => {
          const slot = input.seeds.find(row => row.seed === seed).slots[observation.slotIndex];
          const component = slot.components.find(row => row.componentId === observation.componentId);
          return { slotIndex: observation.slotIndex, anchorIndex: observation.anchorIndex, timeMs: observation.timeMs,
            componentId: observation.componentId, nodeCount: component.nodeCount, edgeCount: component.edgeCount,
            edgeDensity: component.edgeDensity, clique: component.clique, omega: component.cliqueNumber,
            alpha: component.independenceNumber, degreeHistogram: component.degreeHistogram,
            topologyClass: component.clique ? 'clique' : 'partial' };
        }),
        nonIsomorphicTransitions: trackPairs.filter(pair => !pair.isomorphicTopology),
        transitions: trackPairs });
    }
  }
  const persistentSummary = {
    exactCorrespondenceSource: 'registered contestedTracks with only consecutive observations; no new cross-slot identity matching',
    trackCount: persistentTracks.length,
    tracksWithMultipleObservations: persistentTracks.filter(track => track.observationCount > 1).length,
    adjacentOneToOneTransitions: input.continuity.length,
    exactIsomorphicTransitions: input.continuity.filter(row => row.isomorphicTopology).length,
    nonIsomorphicTransitions: input.continuity.filter(row => !row.isomorphicTopology).length,
    transitionClasses: countBy(input.continuity.map(row => row.transitionClass)),
    changedAlpha: input.continuity.filter(row => row.from.alpha !== row.to.alpha).length,
    changedCliqueState: input.continuity.filter(row => row.from.clique !== row.to.clique).length,
    exampleTransitions: input.continuity.filter(row => !row.isomorphicTopology).slice(0, 30),
    tracks: persistentTracks
  };
  const cases = chooseCases(allComponents, { tracks: persistentTracks });
  const caseMap = new Map(cases.map(row => [row.id, row]));
  for (const selected of cases) if (selected.status === 'selected') {
    const sourceSlot = input.seeds.find(row => row.seed === selected.seed).slots[selected.slotIndex];
    selected.visualCells = selected.memberOptionIds.map(optionId => {
      const node = sourceSlot.nodes.find(item => item.optionId === optionId);
      assert.ok(node);
      return { optionId: node.optionId, composition: node.composition, xCells: node.xCells };
    });
  }
  const changingCase = cases.find(row => row.id === 'longest-lived-topology-change' && row.status === 'selected');
  let persistentTransition = null;
  if (changingCase) {
    const track = persistentTracks.find(row => row.seed === changingCase.seed && row.trackId === changingCase.trackId);
    const snapshot = observation => {
      const slot = input.seeds.find(row => row.seed === changingCase.seed).slots[observation.slotIndex];
      const component = slot.components.find(row => row.componentId === observation.componentId);
      assert.ok(component);
      return { seed: changingCase.seed, slotIndex: observation.slotIndex, anchorIndex: observation.anchorIndex,
        timeMs: observation.timeMs, componentId: observation.componentId, nodeCount: component.nodeCount,
        edgeCount: component.edgeCount, edgeDensity: component.edgeDensity, clique: component.clique,
        cliqueNumber: component.cliqueNumber, alpha: component.independenceNumber,
        maximumIndependentSetCount: component.maximumIndependentSetCount,
        diagnosticMaximumIndependentSetOptionIds: component.diagnosticMaximumIndependentSetOptionIds,
        nodes: component.nodes, edges: component.edges,
        visualCells: component.memberOptionIds.map(optionId => {
          const node = slot.nodes.find(item => item.optionId === optionId);
          assert.ok(node);
          return { optionId, composition: node.composition, xCells: node.xCells };
        }) };
    };
    persistentTransition = { trackId: track.trackId, observationCount: track.observationCount,
      from: snapshot(changingCase.transition.from), to: snapshot(changingCase.transition.to),
      isomorphicTopology: changingCase.transition.isomorphicTopology,
      transitionClass: changingCase.transition.transitionClass };
    changingCase.transitionGraphs = persistentTransition;
  }
  const classedAll = allComponents.map(row => ({ ...row, seed: row.seed, slotIndex: row.slotIndex,
    maximumIndependentSetOptionIds: row.diagnosticMaximumIndependentSetOptionIds }));
  const pooled = {
    schema: 'ant-bc-local-conflict-topology-summary-v1',
    productionAuthority: PRODUCTION,
    inputSlots: input.totals.totalSlots,
    inputOptionAppearances: input.totals.totalOptions,
    registeredComponents: input.totals.totalComponents,
    contestedComponents: input.totals.contestedComponents,
    maximumComponentSize: Math.max(...contested.map(row => row.nodeCount)),
    contestedCliqueCount: contested.filter(row => row.clique).length,
    contestedCliqueFraction: contested.filter(row => row.clique).length / contested.length,
    contestedAlphaOneCount: contested.filter(row => row.independenceNumber === 1).length,
    contestedAlphaGreaterThanOneCount: contested.filter(row => row.independenceNumber > 1).length,
    alphaDistribution: countDistribution(contested.map(row => row.independenceNumber)),
    classStats: classes,
    slotSummaries: allSlots.map(summarizeSlot),
    seedSummaries: perSeed.map(({ slots, ...rest }) => rest),
    pooled60s: windows.pooled,
    persistent: {
      oneToOneAdjacentTransitions: input.continuity.length,
      isomorphic: input.continuity.filter(row => row.isomorphicTopology).length,
      nonIsomorphic: input.continuity.filter(row => !row.isomorphicTopology).length,
      transitionClasses: countBy(input.continuity.map(row => row.transitionClass)),
      changedAlpha: input.continuity.filter(row => row.from.alpha !== row.to.alpha).length,
      changedCliqueState: input.continuity.filter(row => row.from.clique !== row.to.clique).length
    }
  };
  const maximalSetCardinalityDistribution = {};
  for (const component of contested) for (const [size, count] of Object.entries(component.maximalIndependentSetSizeDistribution)) {
    maximalSetCardinalityDistribution[size] = (maximalSetCardinalityDistribution[size] || 0) + count;
  }
  Object.assign(pooled, {
    cliqueNumberDistribution: countDistribution(contested.map(row => row.cliqueNumber)),
    maximumIndependentSetCountDistribution: countDistribution(contested.map(row => row.maximumIndependentSetCount)),
    maximalIndependentSetCardinalityDistribution: Object.fromEntries(Object.entries(maximalSetCardinalityDistribution).sort((a, b) => Number(a[0]) - Number(b[0]))),
    componentsWithUniversalVertices: contested.filter(row => row.universalVertices.length > 0).length,
    totalArticulationVertices: contested.reduce((sum, row) => sum + row.articulationVertices.length, 0),
    componentsWithArticulationVertices: contested.filter(row => row.articulationVertices.length > 0).length,
    totalBridges: contested.reduce((sum, row) => sum + row.bridges.length, 0),
    componentsWithBridges: contested.filter(row => row.bridges.length > 0).length,
    maximumIndependentSetProvenance: summarizeProvenance(contested),
    contestedNodeProvenance: {
      BOnlyNodes: contested.reduce((sum, row) => sum + row.nodes.filter(node => node.composition === 'B-only').length, 0),
      COnlyNodes: contested.reduce((sum, row) => sum + row.nodes.filter(node => node.composition === 'C-only').length, 0),
      dualNodes: contested.reduce((sum, row) => sum + row.nodes.filter(node => node.composition === '{B,C}').length, 0),
      componentsWithDualNode: contested.filter(row => row.nodes.some(node => node.composition === '{B,C}')).length
    },
    maximumCompatibleEventsTotal: perSeed.reduce((sum, row) => sum + row.maximumCompatibleEvents, 0)
  });
  await writeJson(resolve(OUT, 'analysis/summary.json'), pooled);
  await writeJson(resolve(OUT, 'analysis/component-size-classes.json'), classes);
  await writeGzip(resolve(OUT, 'analysis/slot-options-components-compatible.json.gz'), { schema: 'ant-bc-options-components-compatible-v1', slots: slotsReceipt });
  await writeJson(resolve(OUT, 'analysis/windows-60s.json'), windows);
  await writeJson(resolve(OUT, 'analysis/persistent-topology.json'), persistentSummary);
  await writeJson(resolve(OUT, 'analysis/objective-cases.json'), { selectionRules: {
    tieBreak: 'seed ascending, slot index ascending, then component ID ascending unless case criterion ranks first',
    maximumIndependentSetExample: 'lexicographically first exact maximum independent set in option-ID order; diagnostic only',
    persistence: 'registered one-to-one adjacent-slot contestedTracks only; exact graph isomorphism disregards X node identities'
  }, cases });
  const caseGraph = svgAtlas(cases);
  await writeFile(resolve(OUT, 'visual/overlap-topology-atlas.svg'), caseGraph);
  await writeFile(resolve(OUT, 'visual/persistent-topology-transition.svg'), svgPersistentTransition(persistentTransition));
  assert.equal(input.totals.totalSlots, 163);
  assert.equal(input.totals.totalOptions, 1846);
  assert.equal(input.totals.totalComponents, 1352);
  assert.equal(input.totals.adjacentPersistentRegionTransitions, input.totals.registeredPersistentContinuations);
  assert.equal(cases.length, 7);
  assert.equal(caseMap.size, 7);
  await writeJson(resolve(OUT, 'analysis/validation.json'), {
    schema: 'ant-bc-local-conflict-topology-validation-v1', productionAuthority: PRODUCTION,
    inputConflictManifestSha256: input.conflictPackage.manifestSha256,
    inputConflictSumsSha256: input.conflictPackage.sumsSha256,
    inputCapacityManifestSha256: input.capacityPackage.manifestSha256,
    inputCapacitySumsSha256: input.capacityPackage.sumsSha256,
    registeredSlots: input.totals.totalSlots, registeredOptionAppearances: input.totals.totalOptions,
    registeredComponents: input.totals.totalComponents, contestedComponents: contested.length,
    sourceFiles: input.sourceFiles, sourcePackageFilesReverified: input.conflictPackage.manifest.files.length + input.capacityPackage.manifest.files.length,
    graphChecks: { directMaskEdgesVsCellInversion: 'pass', registeredEdges: 'pass', bfsVsUnionFindComponents: 'pass',
      exactCliqueAndAlphaBruteVsRecursive: 'pass', maximumIndependentSetsExactSetEquality: 'pass', maxComponentSize: 12 },
    temporalChecks: { actualSavedTimesRetained: true, registeredOneToOnePairs: input.totals.registeredPersistentContinuations,
      reconstructedAdjacentPairs: input.totals.adjacentPersistentRegionTransitions, exactIsomorphismMethod: 'degree-pruned adjacency-preserving backtracking' },
    deterministic: true, observerRngCalls: 0,
    productionPathsChanged: false, simulationOrReplay: false,
    diagnosticMaximumIndependentSetsAreCommitRecommendations: false
  });
  const report = `# B/C local conflict topology audit\n\n**Question:** Within each registered exact-X overlap component, how many member masks are mutually incompatible, and how many can coexist without X overlap?\n\n**Frozen authority:** production \`main@${PRODUCTION}\`; local-conflict decomposition \`${CONFLICT_COMMIT}\`; capacity necessity audit \`${CAPACITY_COMMIT}\`. Exact 163 slots, 1,846 option appearances, and 1,352 registered components were reused. No natural simulation or replay.\n\n## Result\n\nThe component is only a connected neighborhood; transitivity does not force every pair to overlap. Exact graph and independent-set counts are in \`analysis/\`. Among the ${contested.length} contested components, ${pooled.contestedCliqueCount} are cliques (${(pooled.contestedCliqueFraction * 100).toFixed(1)}%), and ${pooled.contestedAlphaGreaterThanOneCount} have \`α > 1\`. The maximum component size is 12. The size-class table distinguishes small one-winner geometry from larger partially compatible graphs.\n\n**Classification:** ${classification(classes, pooled)}. This is local exclusion topology only. It defines neither a selected set nor a commit law. The prior result \`CAPACITY LAW NOT YET JUSTIFIED\` remains unchanged.\n\n## Exact per-seed counts\n\n| Seed | Slots | Options | Components | Contested | Sum α | Additional compatible options vs one/component |\n|---|---:|---:|---:|---:|---:|---:|\n${perSeed.map(row => `| ${row.seed} | ${row.temporalSlots} | ${row.optionAppearances} | ${row.componentEvents} | ${row.contestedComponents} | ${row.maximumCompatibleEvents} | ${row.additionalCompatibleVsOneComponent} |`).join('\n')}\n\nThe sum of component counts is diagnostic \`COMPONENTS\`; the sum of \`α\` is the exact maximum number of pairwise X-disjoint options. Neither is a production rate target. The difference quantifies how one-per-component would compress compatible geometry.\n\n## Per-size contested-component topology\n\n| Size | Count | Clique fraction | α median / q90 | Universal-vertex fraction | Median edge density | α distribution |\n|---|---:|---:|---:|---:|---:|---|\n${classes.map(row => `| ${row.sizeClass} | ${row.componentCount} | ${row.cliqueFraction === null ? '—' : (row.cliqueFraction * 100).toFixed(1) + '%'} | ${row.alphaMedian ?? '—'} / ${row.alphaQ90 ?? '—'} | ${row.universalVertexFraction === null ? '—' : (row.universalVertexFraction * 100).toFixed(1) + '%'} | ${row.medianEdgeDensity === null ? '—' : row.medianEdgeDensity.toFixed(3)} | ${Object.entries(row.alphaDistribution).map(([k, v]) => `${k}:${v}`).join(', ') || '—'} |`).join('\n')}\n\nAll contested components are connected by construction and revalidated from X cells. Their exact clique number, independence number, all maximum-set counts and provenance profiles, maximal-set size distributions, universal vertices, articulation points and bridges are preserved in the per-slot receipts.\n\n## OPTIONS / COMPONENTS / COMPATIBLE\n\nThe fixed-window pooled series is in \`analysis/windows-60s.json\`; per-seed values are included there too. \`COMPATIBLE\` means \`sum α\`, not a selected subset. The exact 163 rows are in \`analysis/slot-options-components-compatible.json.gz\`.\n\n## Registered persistent-region topology\n\nThe comparison uses only existing adjacent-slot one-to-one contested-region tracks. It does not carry IDs through splits or merges. Exact unlabeled graph isomorphism compares adjacency structure while disregarding option identity.\n\n- Registered adjacent transitions: ${input.continuity.length}.\n- Isomorphic graph pairs: ${input.continuity.filter(row => row.isomorphicTopology).length}.\n- Non-isomorphic graph pairs: ${input.continuity.filter(row => !row.isomorphicTopology).length}.\n- Clique/partial transition counts: ${Object.entries(countBy(input.continuity.map(row => row.transitionClass))).map(([k,v]) => `${k}: ${v}`).join('; ') || 'none'}.\n\nThis supports descriptive topology change only along the pre-registered unambiguous continuations. It does not identify a persistent physical object.\n\n## Interpretation\n\n${interpretation(classes)}\n\n**Smallest next question:** Which minimal local responsibility should choose among options that overlap, while preserving pairwise-disjoint options as potentially compatible? Keep world-level capacity open.\n\n## Boundaries\n\nNo local winner, maximum independent set, greedy packing, B/C preference, actual Plate, material feedback, capacity law, or Residence behavior was added. The previous \`256\` count remains an implementation/storage reference only.\n\nSee [protocol](PROTOCOL.md), [validation](VALIDATION.md), [objective graph atlas](visual/overlap-topology-atlas.svg), [persistent topology transition](visual/persistent-topology-transition.svg), and [SHA-256 manifest](SHA256SUMS.txt).\n`;
  await writeFile(resolve(OUT, 'REPORT.md'), report);
  const pooledWindowTable = windows.pooled.map(row =>
    `| ${row.windowStartS}–${row.windowEndS} | ${row.totalOptions} | ${row.totalComponents} | ${row.contestedComponents} | ${row.cliqueFraction === null ? '—' : (row.cliqueFraction * 100).toFixed(1) + '%'} | ${row.medianAlpha ?? '—'} | ${row.maxAlpha ?? '—'} | ${row.maximumCompatibleOptions} |`).join('\n');
  const provenance = pooled.maximumIndependentSetProvenance;
  const reportDetail = `\n## Exact graph and provenance census\n\n- Contested component \`ω\` distribution: ${Object.entries(pooled.cliqueNumberDistribution).map(([k,v]) => `${k}:${v}`).join(', ')}.\n- Maximum independent set count per component: ${Object.entries(pooled.maximumIndependentSetCountDistribution).map(([k,v]) => `${k}:${v}`).join(', ')}. Each component's exact maximal independent set size distribution is in its receipt.\n- ${pooled.componentsWithUniversalVertices} contested components have at least one universal vertex; ${pooled.componentsWithArticulationVertices} have articulation vertices (${pooled.totalArticulationVertices} total); ${pooled.componentsWithBridges} have bridges (${pooled.totalBridges} total).\n- Contested nodes: ${pooled.contestedNodeProvenance.BOnlyNodes} B-only, ${pooled.contestedNodeProvenance.COnlyNodes} C-only, ${pooled.contestedNodeProvenance.dualNodes} \`{B,C}\`. Components with dual nodes: ${pooled.contestedNodeProvenance.componentsWithDualNode}.\n- Across maximum independent sets, ${provenance.componentsWithBOnlyPossible} components permit an all-B-only set, ${provenance.componentsWithCOnlyPossible} permit an all-C-only set, ${provenance.componentsWithDualNodePossible} permit a set containing a dual node, and ${provenance.componentsWithBAndCPresentInOneMaximumSet} have at least one maximum set containing both channels. These are availability counts, not provenance preferences.\n- Objective case \`dual-node-with-compatible-distinct-option\`: ${caseMap.get('dual-node-with-compatible-distinct-option').status}; no replacement case was selected.\n\n## Pooled 60 s evolution\n\n| Window (s) | Options | Components | Contested | Clique fraction | Median α | Max α | Maximum compatible options |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${pooledWindowTable}\n\nPer-seed windows and exact slot timestamps remain in \`analysis/windows-60s.json\` and \`analysis/slot-options-components-compatible.json.gz\`.\n`;
  const persistenceDetail = persistentTransition
    ? `\n## Long-lived topology-change case\n\nRegistered region \`${persistentTransition.trackId}\` spans ${persistentTransition.observationCount} observations. Its adjacent transition is ${persistentTransition.from.timeMs.toFixed(3)} ms \`n=${persistentTransition.from.nodeCount}, m=${persistentTransition.from.edgeCount}, ω=${persistentTransition.from.cliqueNumber}, α=${persistentTransition.from.alpha}, clique=${persistentTransition.from.clique}\` to ${persistentTransition.to.timeMs.toFixed(3)} ms \`n=${persistentTransition.to.nodeCount}, m=${persistentTransition.to.edgeCount}, ω=${persistentTransition.to.cliqueNumber}, α=${persistentTransition.to.alpha}, clique=${persistentTransition.to.clique}\`. The graphs are non-isomorphic. See the [matched graph view](visual/persistent-topology-transition.svg).\n`
    : '\nNo registered unambiguous topology-changing continuation was available.\n';
  await writeFile(resolve(OUT, 'REPORT.md'), report + reportDetail + persistenceDetail);
  await writeFile(resolve(OUT, 'PROTOCOL.md'), `# Protocol — B/C local conflict topology\n\n- Inputs: exact frozen packets from \`codex/ant-bc-local-conflict-decomposition-20261101@${CONFLICT_COMMIT}\` and previous capacity audit \`${CAPACITY_COMMIT}\`. Production authority represented is \`${PRODUCTION}\`.\n- Graph node: one registered unique mature X option. Edge: exact X masks share at least one cell. Existing same-mask B/C collapse remains one dual-provenance node.\n- Graph components are unchanged from the exact overlap relation. Every edge and component partition is independently reconstructed from X cells, compared with registered receipts, then checked using both BFS and union-find.\n- All contested components are size <=12. Exhaustive subset enumeration computes clique number, alpha, maximum-set counts and maximal-independent-set size distributions. Recursive include/exclude searches independently verify exact maximum cliques and independent sets.\n- Articulation vertices and bridges use graph connectivity after vertex/edge removal. Universal means degree \`n-1\`. Edge density is \`m / choose(n,2)\`.\n- \`COMPATIBLE\` is the sum of exact \`α\` across connected components within a slot. It is a maximum geometric packing cardinality, not a chosen set or commit recommendation.\n- Maximum-set provenance counts B-only, C-only and dual nodes. A dual node contributes to both channel-presence flags. No evidence strengths are combined.\n- Fixed windows use actual timestamps and \`floor(timeMs/60,000)\`, with reported intervals \`[0,60), ... [540,600)\`. Quantiles select the sorted value at \`floor((n-1)p)\`.\n- Persistence reads only the prior package's one-to-one adjacent contested-region track IDs. Between consecutive observations, unlabeled graph isomorphism uses degree-pruned adjacency-preserving backtracking. This compares abstract graph shape only; it does not assign persistent candidate identities.\n- Objective-case ties use seed, slot, component ID order after the stated criterion. One maximum independent set is shown as a diagnostic example only.\n- Deterministic Node.js analysis; zero RNG, zero simulation/replay, zero production feedback.\n`);
  await writeFile(resolve(OUT, 'README.md'), `# B/C local conflict topology audit\n\nResearch-only exact graph census of the registered 163-slot B/C X-overlap histories. It tests whether connected overlap components are valid one-winner units. It selects no winner and does not reopen world-level capacity.\n\nRead [report](REPORT.md), [protocol](PROTOCOL.md), [validation](VALIDATION.md), and [objective atlas](visual/overlap-topology-atlas.svg), and [registered transition](visual/persistent-topology-transition.svg). Machine-readable slot graphs and topology statistics are under \`analysis/\`.\n`);
  const validationText = `# Validation\n\n- Current research branch starts at capacity audit \`${CAPACITY_COMMIT}\`; production source authority recorded as \`${PRODUCTION}\`.\n- Reverified every manifest file and checksum entry in the registered local-conflict and capacity packages. Conflict manifest SHA-256: \`${input.conflictPackage.manifestSha256}\`.\n- Loaded exactly ${input.totals.totalSlots} slots, ${input.totals.totalOptions} option appearances, and ${input.totals.totalComponents} components. Source per-seed counts: 55/54/54 slots, 576/665/605 options, 422/486/444 components.\n- Direct pairwise set intersection matched cell-to-option inversion and all registered edges. BFS component sets matched registered partitions and union-find reconstructions.\n- Brute-force exhaustive subsets and recursive include/exclude search matched exact \`ω\`, \`α\`, and full maximum-set mask sets for all components. Maximum component size: 12.\n- Reconstructed registered unambiguous adjacent topology transitions: ${input.continuity.length}; equals registered count. No split/merge continuation IDs were invented.\n- Analysis rerun is deterministic; gzip timestamps are fixed. Both deterministic SVGs are generated from exact X masks.\n- Observer RNG calls: 0. Simulation/replay: none. \`src/\` and \`static/\` production behavior: unchanged.\n`;
  await writeFile(resolve(OUT, 'VALIDATION.md'), validationText);
  const files = await listOutputFiles(OUT);
  const scriptBytes = await readFile(fileURLToPath(import.meta.url));
  const manifest = { schema: 'ant-bc-local-conflict-topology-audit-manifest-v1',
    branch: 'codex/ant-bc-local-conflict-topology-audit-20261101',
    startingCommit: CAPACITY_COMMIT, productionAuthority: PRODUCTION,
    sourceConflictBranch: 'codex/ant-bc-local-conflict-decomposition-20261101', sourceConflictCommit: CONFLICT_COMMIT,
    sourceCapacityBranch: 'codex/ant-bc-material-capacity-necessity-audit-20261101', sourceCapacityCommit: CAPACITY_COMMIT,
    sourceSlotAuditCommit: SLOT_AUDIT, dualHistoryCommit: DUAL, provenancePrototypeCommit: PROTOTYPE,
    sourceConflictManifestSha256: input.conflictPackage.manifestSha256,
    sourceCapacityManifestSha256: input.capacityPackage.manifestSha256,
    analysis: { slots: 163, optionAppearances: 1846, components: 1352, contestedComponents: contested.length,
      maxExactGraphSize: 12, observerRngCalls: 0, simulationOrReplay: false },
    tools: { 'scripts/ant-bc-local-conflict-topology-audit.js': hash(scriptBytes) },
    files };
  await writeFile(resolve(OUT, 'manifest.json'), jsonBytes(manifest));
  const sumsRows = [...files, { file: 'manifest.json', bytes: (await readFile(resolve(OUT, 'manifest.json'))).length,
    sha256: hash(await readFile(resolve(OUT, 'manifest.json'))) }].sort((a, b) => codeCompare(a.file, b.file));
  await writeFile(resolve(OUT, 'SHA256SUMS.txt'), sumsRows.map(row => `${row.sha256}  ${row.file}`).join('\n') + '\n');
  console.log(JSON.stringify({ classification: pooled.contestedAlphaGreaterThanOneCount > pooled.contestedCliqueCount ? 'PAIRWISE EXCLUSION / MULTI-COMMIT' : 'MIXED TOPOLOGY',
    total: input.totals, pooled: { cliqueCount: pooled.contestedCliqueCount, alphaGt1: pooled.contestedAlphaGreaterThanOneCount,
      alphaDistribution: pooled.alphaDistribution }, classes, seeds: perSeed.map(({ slots, ...row }) => row),
    persistent: persistentSummary.transitionClasses, cases: cases.map(row => ({ id: row.id, status: row.status, seed: row.seed,
      slotIndex: row.slotIndex, componentId: row.componentId, nodeCount: row.nodeCount, alpha: row.alpha })) }, null, 2));
}

function countBy(values) {
  const rows = {};
  for (const value of values) rows[value] = (rows[value] || 0) + 1;
  return Object.fromEntries(Object.entries(rows).sort((a, b) => codeCompare(a[0], b[0])));
}

function classification(classes, summary) {
  const midLarge = classes.filter(row => row.componentCount && ['3', '4–5', '6+'].includes(row.sizeClass));
  const small = classes.find(row => row.sizeClass === '2');
  if (summary.contestedAlphaGreaterThanOneCount === 0) return 'ONE-WINNER COMPONENTS MOSTLY VALID';
  if (small?.cliqueFraction === 1 && midLarge.some(row => row.alphaGreaterThanOneCount > 0)) return 'MIXED TOPOLOGY';
  if (summary.contestedAlphaGreaterThanOneCount > 0) return 'PAIRWISE EXCLUSION / MULTI-COMMIT';
  return 'ONE-WINNER COMPONENTS MOSTLY VALID';
}

function interpretation(classes) {
  const size2 = classes.find(row => row.sizeClass === '2');
  const larger = classes.filter(row => ['3', '4–5', '6+'].includes(row.sizeClass) && row.componentCount);
  if (size2?.cliqueFraction === 1 && larger.some(row => row.alphaGreaterThanOneCount > row.cliqueCount)) {
    return 'Size-2 conflicts are pairwise-complete, while larger connected neighborhoods include mutually disjoint member X options. A single winner per connected component would therefore discard geometrically compatible choices in larger neighborhoods. The next responsibility is pairwise/local exclusion, not one winner for each transitive component.';
  }
  return 'Read the size-stratified clique and alpha distributions together. Connected components are transitive neighborhoods; alpha is the exact maximum pairwise-disjoint option count. Preserve any size-dependent difference instead of promoting connectedness itself to a winner unit.';
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
