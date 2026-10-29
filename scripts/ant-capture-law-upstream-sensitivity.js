#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { captureStructuralPackets } from './ant-authored-capture-core.js';

const BASE = 'docs/ant/evidence/2026-10-29-ant-capture-law-upstream-sensitivity';
const INPUT = 'docs/ant/evidence/2026-10-29-proposal-emergence-exploration/data/frozen-inputs.json.gz';
const PARENT = 'docs/ant/evidence/2026-10-29-authored-materialization-law-synthesis';
const SOURCE = 'src/lib/agents/ant/TrailPlateBirth.js';
const OUTPUTS = { analysis: `${BASE}/analysis.json`, atlas: `${BASE}/atlas.svg` };
const MAIN_SHA = '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785';
const PARENT_SHA = '5b9cd6ba47368cd61c0391cc64f9dc62416c7ef8';
const INPUT_SHA = '6ff3ec3d6fb8bc0fa1f323532361ab9d19ecc0e75353b1b9ce3d6875c440842d';
const PARENT_ANALYSIS_SHA = '4fe30c4f8468b45895f2232169dbb3bc8bfe7ae768d459de4d84318d48419ce9';
const SOURCE_SHA = 'cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67';
const SIDE = 96, CELL_COUNT = SIDE * SIDE, SCALE = SIDE - 1;
const RADIUS = .15, EPSILON = 1e-12, SQRT2 = Math.SQRT2;
const STRESS_CELLS = { P1: 5619, P2: 5620 };
const ROLES = ['START', '+10s', 'COMMIT−2s', 'COMMIT−1s', 'COMMIT'];
const COLORS = { E: '#e6eeed', F: '#8d999e', X: '#2c9b76', G: '#4c78b9', B: '#b26186' };

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const lf = value => value.replace(/\r\n?/g, '\n');
const cells = mask => Array.from(mask, (value, index) => value ? index : -1).filter(index => index >= 0);
const sortedUnique = values => [...new Set(values)].sort((a, b) => a - b);
const point = index => [index % SIDE / SCALE, Math.floor(index / SIDE) / SCALE];
const gridPoint = index => [index % SIDE, Math.floor(index / SIDE)];
const edgeLength = (a, b) => {
  const [ax, ay] = gridPoint(a), [bx, by] = gridPoint(b);
  return Math.hypot(ax - bx, ay - by) / SCALE;
};
const isDiagonal = (a, b) => {
  const [ax, ay] = gridPoint(a), [bx, by] = gridPoint(b);
  return ax !== bx && ay !== by;
};

function readInputs() {
  const frozenBytes = readFileSync(INPUT);
  assert.equal(sha256(frozenBytes), INPUT_SHA, 'frozen input gzip hash');
  const parentText = lf(readFileSync(`${PARENT}/analysis.json`, 'utf8'));
  assert.equal(sha256(Buffer.from(parentText, 'utf8')), PARENT_ANALYSIS_SHA, 'parent analysis hash');
  const sourceText = lf(readFileSync(SOURCE, 'utf8'));
  assert.equal(sha256(Buffer.from(sourceText, 'utf8')), SOURCE_SHA, 'current production source hash');
  const frozen = JSON.parse(gunzipSync(frozenBytes));
  const parent = JSON.parse(parentText);
  assert.equal(frozen.main, MAIN_SHA);
  assert.equal(frozen.seed, 20261005);
  assert.equal(frozen.heading, 'H0');
  assert.equal(frozen.audio, 'Off');
  assert.equal(frozen.events.length, 2);
  assert.equal(parent.events.length, 2);
  assert.equal(parent.authoredRadius, RADIUS);
  assert.equal(parent.inputSha256, INPUT_SHA);
  assert.equal(parent.sourceSha256LF, SOURCE_SHA);
  return { frozen, parent, sourceText };
}

function sourceFunctions(sourceText) {
  const math = Object.create(Math);
  math.random = () => { throw new Error('production extraction must not consume RNG'); };
  const source = sourceText.replace(/^export /gm, '')
    + '\n({TRAIL_PLATE_GRID_SIZE, zhangSuen, neighbors, MinHeap, skeletonComponents})';
  const functions = runInNewContext(source, { Math: math });
  assert.equal(functions.TRAIL_PLATE_GRID_SIZE, SIDE);
  return functions;
}

function chooseNucleus(F, D, f) {
  const eligible = rankedNuclei(F, D, f);
  if (!eligible.length) return null;
  const index = eligible[0], value = D[index];
  return {
    index, value,
    eligibleNodeCount: eligible.length,
    exactMaxTieCount: eligible.filter(cell => D[cell] === value).length,
    runnerUpGap: eligible.length > 1 ? value - D[eligible[1]] : null,
    topFive: eligible.slice(0, 5).map(cell => ({ index: cell, D: D[cell] }))
  };
}

function rankedNuclei(F, D, f) {
  return cells(F).filter(index => f.neighbors(index).some(next => F[next]))
    .sort((a, b) => D[b] - D[a] || a - b);
}

function shortestTree(F, nucleus, f) {
  assert.ok(F[nucleus], 'shortest-tree root is in F');
  const beforeHash = sha256(F);
  const distance = new Float64Array(CELL_COUNT); distance.fill(Infinity);
  const parent = new Int32Array(CELL_COUNT); parent.fill(-2);
  distance[nucleus] = 0; parent[nucleus] = -1;
  const heap = new f.MinHeap(); heap.push(0, nucleus);
  while (heap.length) {
    const [currentDistance, current] = heap.pop();
    if (currentDistance !== distance[current]) continue;
    for (const adjacent of f.neighbors(current)) {
      if (!F[adjacent]) continue;
      const candidate = currentDistance + (isDiagonal(current, adjacent) ? SQRT2 : 1) / SCALE;
      if (candidate < distance[adjacent] - EPSILON
        || (Math.abs(candidate - distance[adjacent]) <= EPSILON
          && (parent[adjacent] < 0 || current < parent[adjacent]))) {
        distance[adjacent] = candidate;
        parent[adjacent] = current;
        heap.push(candidate, adjacent);
      }
    }
  }
  assert.equal(sha256(F), beforeHash, 'shortest-tree extraction leaves F unchanged');
  const order = cells(F).filter(index => Number.isFinite(distance[index]))
    .sort((a, b) => distance[a] - distance[b] || a - b);
  return { distance, parent, order };
}

function sumParentEdges(indices, nucleus, tree, selectedSet = null) {
  let total = 0, internalEdgeCount = 0, outsideParentCount = 0;
  const edges = [];
  for (const index of indices) {
    if (index === nucleus) continue;
    const parent = tree.parent[index];
    assert.ok(parent >= 0, `reachable parent for cell ${index}`);
    const length = edgeLength(parent, index);
    total += length;
    if (selectedSet && selectedSet.has(parent)) internalEdgeCount += 1;
    else if (selectedSet) outsideParentCount += 1;
    edges.push({ parent, child: index, length });
  }
  return { total, internalEdgeCount, outsideParentCount, edges };
}

function chooseCapacityFromP1X(F, D, nucleus, X, f) {
  const tree = shortestTree(F, nucleus, f);
  assert.ok(X.every(index => Number.isFinite(tree.distance[index])), 'all P1 X nodes are reachable on F');
  const set = new Set(X);
  const account = sumParentEdges(X, nucleus, tree, set);
  assert.ok(account.total > 0);
  return {
    worldLength: account.total,
    edgeCount: X.length - 1,
    edgesWhoseParentIsOutsideX: account.outsideParentCount,
    internalParentEdgeCount: account.internalEdgeCount,
    axialEdges: account.edges.filter(edge => !isDiagonal(edge.parent, edge.child)).length,
    diagonalEdges: account.edges.filter(edge => isDiagonal(edge.parent, edge.child)).length,
    basis: 'original P1 COMMIT X members, one deterministic F shortest-tree parent edge per non-root member'
  };
}

function allocateCapacityB(F, nucleus, tree, capacity) {
  const admitted = new Uint8Array(CELL_COUNT); admitted[nucleus] = 1;
  let used = 0, capacityRejected = 0, blockedByRejectedParent = 0;
  const acceptedEdges = [];
  for (const index of tree.order) {
    if (index === nucleus) continue;
    const parent = tree.parent[index];
    assert.ok(parent >= 0 && tree.distance[parent] < tree.distance[index]);
    if (!admitted[parent]) { blockedByRejectedParent += 1; continue; }
    const length = edgeLength(parent, index);
    if (used + length <= capacity + EPSILON) {
      admitted[index] = 1;
      used += length;
      acceptedEdges.push({ parent, child: index, length });
    } else capacityRejected += 1;
  }
  const result = cells(admitted);
  assert.equal(result[0], Math.min(...result));
  assert.equal(result.length - 1, acceptedEdges.length, 'one rooted parent edge per admitted non-root node');
  assert.ok(used <= capacity + EPSILON, 'B never exceeds its one structural capacity');
  const set = new Set(result);
  assert.ok(acceptedEdges.every(edge => set.has(edge.parent) && set.has(edge.child)));
  return {
    cells: result,
    capacity: {
      limit: capacity, used, unused: Math.max(0, capacity - used),
      overage: Math.max(0, used - capacity), epsilon: EPSILON,
      rootedEdgeCount: acceptedEdges.length,
      capacityRejected, blockedByRejectedParent,
      edges: acceptedEdges
    }
  };
}

function candidateMetrics(name, indices, F, E, nucleus, tree, f, capacity = null) {
  const list = sortedUnique(indices), member = new Uint8Array(CELL_COUNT);
  for (const index of list) {
    assert.ok(F[index] && E[index], `${name} cell ${index} is contained in F and E`);
    member[index] = 1;
  }
  const components = f.skeletonComponents(member).length;
  assert.equal(components, 1, `${name} remains one 8-neighbor component`);
  const degrees = [], parentChildren = new Map(list.map(index => [index, 0]));
  let inducedEdges = 0, junctionNodes = 0, terminalNodes = 0;
  for (const index of list) {
    const degree = f.neighbors(index).filter(next => member[next]).length;
    degrees.push(degree);
    if (degree === 1) terminalNodes += 1;
    if (degree >= 3) junctionNodes += 1;
    for (const next of f.neighbors(index)) if (member[next] && index < next) inducedEdges += 1;
    const parent = tree.parent[index];
    if (index !== nucleus && parentChildren.has(parent)) parentChildren.set(parent, parentChildren.get(parent) + 1);
  }
  const treeEdges = sumParentEdges(list, nucleus, tree, new Set(list));
  const euclidean = list.map(index => {
    const [x, y] = point(index), [nx, ny] = point(nucleus);
    return Math.hypot(x - nx, y - ny);
  });
  const graph = list.map(index => tree.distance[index]);
  assert.ok(graph.every(Number.isFinite));
  const children = [...parentChildren.values()];
  return {
    name, cells: list, nodes: list.length, inducedEdges,
    components, terminalNodes, junctionNodes,
    inducedCycleRank: inducedEdges - list.length + components,
    rootedTreeLeaves: children.filter(count => count === 0).length,
    rootedTreeBranchNodes: children.filter(count => count >= 2).length,
    rootedParentEdgesInternal: treeEdges.internalEdgeCount,
    rootedParentEdgesOutsideSet: treeEdges.outsideParentCount,
    associatedRootedEdgeLength: treeEdges.total,
    maxEuclideanFromNucleus: Math.max(0, ...euclidean),
    maxFShortestPathDistance: Math.max(0, ...graph),
    bbox: [Math.min(...list.map(index => index % SIDE)), Math.min(...list.map(index => Math.floor(index / SIDE))),
      Math.max(...list.map(index => index % SIDE)), Math.max(...list.map(index => Math.floor(index / SIDE)))],
    capacity
  };
}

function captureView({ E, F, D, nucleus, capacity, f }) {
  if (!nucleus) return { status: 'NO ADMISSIBLE NUCLEUS', nucleus: null, candidates: null };
  const beforeHash = sha256(F);
  const tree = shortestTree(F, nucleus.index, f);
  const cap = captureStructuralPackets({ F, nucleus: nucleus.index, radius: RADIUS });
  const b = allocateCapacityB(F, nucleus.index, tree, capacity.worldLength);
  const candidates = {
    X: candidateMetrics('X', cap.X, F, E, nucleus.index, tree, f),
    G: candidateMetrics('G', cap.G, F, E, nucleus.index, tree, f),
    B: candidateMetrics('B', b.cells, F, E, nucleus.index, tree, f, b.capacity)
  };
  assert.ok(candidates.G.cells.every(index => candidates.X.cells.includes(index)), 'parent G subset X parity');
  assert.equal(sha256(F), beforeHash, 'capture view does not mutate F');
  return { status: 'AVAILABLE', nucleus, candidates };
}

function sameSet(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function intersectionCount(a, b) {
  const set = new Set(b);
  let count = 0;
  for (const value of a) if (set.has(value)) count += 1;
  return count;
}
function jaccard(a, b) {
  const intersection = intersectionCount(a, b);
  const union = a.length + b.length - intersection;
  return { from: a.length, to: b.length, shared: intersection, union, jaccard: union ? intersection / union : 1 };
}
function deltaSummary(from, to, editCell, oldNucleus = null, newNucleus = null) {
  const toSet = new Set(to), fromSet = new Set(from);
  const lost = from.filter(index => !toSet.has(index));
  const gained = to.filter(index => !fromSet.has(index));
  const distances = (values, center) => center === null ? null : values.map(index => {
    const [x, y] = point(index), [cx, cy] = point(center);
    return Math.hypot(x - cx, y - cy);
  });
  const nearEdit = list => list.filter(index => {
    const [x, y] = gridPoint(index), [ex, ey] = gridPoint(editCell);
    return Math.max(Math.abs(x - ex), Math.abs(y - ey)) <= 1;
  }).length;
  const quantiles = values => {
    if (!values.length) return { n: 0, min: null, median: null, p90: null, max: null };
    const s = [...values].sort((a, b) => a - b);
    return { n: s.length, min: s[0], median: s[Math.floor((s.length - 1) * .5)], p90: s[Math.floor((s.length - 1) * .9)], max: s.at(-1) };
  };
  return {
    ...jaccard(from, to),
    lost, gained,
    lostDistanceFromEdit: quantiles(distances(lost, editCell)),
    gainedDistanceFromEdit: quantiles(distances(gained, editCell)),
    lostDistanceFromOldNucleus: oldNucleus === null ? null : quantiles(distances(lost, oldNucleus)),
    gainedDistanceFromOldNucleus: oldNucleus === null ? null : quantiles(distances(gained, oldNucleus)),
    lostDistanceFromSelectedNucleus: newNucleus === null ? null : quantiles(distances(lost, newNucleus)),
    gainedDistanceFromSelectedNucleus: newNucleus === null ? null : quantiles(distances(gained, newNucleus)),
    lostWithinImmediateThinningStencil: nearEdit(lost),
    gainedWithinImmediateThinningStencil: nearEdit(gained),
    lostBeyondImmediateThinningStencil: lost.length - nearEdit(lost),
    gainedBeyondImmediateThinningStencil: gained.length - nearEdit(gained)
  };
}

function rasterStats(mask, f) {
  const indices = cells(mask), set = new Set(indices);
  let edges = 0, terminals = 0, junctions = 0;
  for (const index of indices) {
    const degree = f.neighbors(index).filter(next => set.has(next)).length;
    if (degree === 1) terminals += 1;
    if (degree >= 3) junctions += 1;
    for (const next of f.neighbors(index)) if (set.has(next) && index < next) edges += 1;
  }
  const components = f.skeletonComponents(mask).length;
  return { nodes: indices.length, edges, components, terminals, junctions, cycleRank: edges - indices.length + components };
}

function rasterDelta(oldMask, newMask, editCell, f) {
  const oldCells = cells(oldMask), newCells = cells(newMask);
  const result = deltaSummary(oldCells, newCells, editCell);
  const near = list => list.filter(index => {
    const [x, y] = gridPoint(index), [ex, ey] = gridPoint(editCell);
    return Math.max(Math.abs(x - ex), Math.abs(y - ey)) <= 1;
  }).length;
  return {
    ...result,
    old: rasterStats(oldMask, f), new: rasterStats(newMask, f),
    lostWithinImmediateThinningStencil: near(result.lost),
    gainedWithinImmediateThinningStencil: near(result.gained),
    lostBeyondImmediateThinningStencil: result.lost.length - near(result.lost),
    gainedBeyondImmediateThinningStencil: result.gained.length - near(result.gained)
  };
}

function selectView({ E, F, D, oldNucleus, mode, capacity, f }) {
  const admissibleOld = Number.isInteger(oldNucleus) && F[oldNucleus]
    && f.neighbors(oldNucleus).some(next => F[next]);
  if (mode === 'fixed-old-nucleus' && !admissibleOld) {
    return { status: 'CONTROL UNAVAILABLE', reason: 'old nucleus is not an edge-bearing F node', nucleus: null, candidates: null };
  }
  const maxDContext = chooseNucleus(F, D, f);
  const nucleus = mode === 'fixed-old-nucleus'
    ? { index: oldNucleus, value: D[oldNucleus] }
    : maxDContext;
  const result = captureView({ E, F, D, nucleus, capacity, f });
  return { ...result, mode, oldNucleusAvailable: admissibleOld, maxDContext };
}

function analyzeCommitStress({ state, parentStress, deleted, capacity, f }) {
  const { E, F, D, originalView, inputAnchor, event } = state;
  assert.equal(deleted, STRESS_CELLS[event], `${event} preregistered stress cell`);
  assert.ok(E[deleted] && F[deleted], `stress cell ${deleted} belongs to original E and F`);
  const oldNucleus = originalView.nucleus.index;
  const DHash = sha256(D);
  const directF = F.slice(); directF[deleted] = 0;
  const directE = E.slice();
  const directRoot = chooseNucleus(directF, D, f);
  const directViews = Object.fromEntries(['fixed-old-nucleus', 'reselected'].map(mode => [mode,
    selectView({ E: directE, F: directF, D, oldNucleus, mode, capacity, f })]));
  assert.ok(sameSet(directViews.reselected.candidates.X.cells, parentStress.candidates.X.result.cells), 'direct-F X matches parent');
  assert.ok(sameSet(directViews.reselected.candidates.G.cells, parentStress.candidates.G.result.cells), 'direct-F G matches parent');
  assert.equal(directViews.reselected.nucleus.index, parentStress.newNucleus, 'direct-F nucleus matches parent');

  const Eprime = E.slice(); Eprime[deleted] = 0;
  assert.equal(cells(E).length - cells(Eprime).length, 1, 'E perturbation removes exactly one qualified cell');
  const Fprime = f.zhangSuen(Eprime);
  const fixedView = selectView({ E: Eprime, F: Fprime, D, oldNucleus, mode: 'fixed-old-nucleus', capacity, f });
  const reselectedView = selectView({ E: Eprime, F: Fprime, D, oldNucleus, mode: 'reselected', capacity, f });
  assert.equal(sha256(D), DHash, 'D remains unchanged across both perturbations');
  assert.equal(Eprime[deleted], 0);
  assert.equal(inputAnchor.maps.E_qualified[deleted], 1, 'frozen packet remains unchanged');
  assert.equal(inputAnchor.maps.F_skeleton[deleted], 1, 'frozen packet remains unchanged');
  assert.ok(cells(Fprime).every(index => Eprime[index]), 'production thinning output is contained in E prime');
  const baselineSets = originalView.candidates;
  const candidateChanges = view => view.candidates ? Object.fromEntries(['X', 'G', 'B'].map(name => [name,
    deltaSummary(baselineSets[name].cells, view.candidates[name].cells, deleted, oldNucleus, view.nucleus.index)])) : null;
  const displacement = view => view.nucleus ? {
    from: oldNucleus, to: view.nucleus.index,
    worldDistance: Math.hypot(point(oldNucleus)[0] - point(view.nucleus.index)[0], point(oldNucleus)[1] - point(view.nucleus.index)[1]),
    DDelta: view.nucleus.value - originalView.nucleus.value
  } : null;
  return {
    event, timeMs: state.timeMs, deletedCell: deleted,
    oldNucleus, originalNucleus: originalView.nucleus,
    directF: {
      EUnchanged: sha256(directE) === sha256(E),
      ECells: cells(directE), FCells: cells(directF),
      F: rasterDelta(F, directF, deleted, f),
      reselectedNucleus: directRoot,
      views: directViews,
      captureChanges: Object.fromEntries(Object.entries(directViews).map(([key, value]) => [key, candidateChanges(value)])),
      parentParity: {
        X: jaccard(originalView.candidates.X.cells, directViews.reselected.candidates.X.cells),
        G: jaccard(originalView.candidates.G.cells, directViews.reselected.candidates.G.cells)
      }
    },
    upstreamEToF: {
      EprimeCells: cells(Eprime), FprimeCells: cells(Fprime),
      E: rasterDelta(E, Eprime, deleted, f),
      F: rasterDelta(F, Fprime, deleted, f),
      fixedOldNucleus: fixedView,
      reselectedNucleus: reselectedView,
      fixedNucleusDisplacement: displacement(fixedView),
      reselectedNucleusDisplacement: displacement(reselectedView),
      fixedCaptureChanges: candidateChanges(fixedView),
      reselectedCaptureChanges: candidateChanges(reselectedView)
    }
  };
}

function stateInput(eventId, stateIndex, frozen, parentEvent) {
  const inputEvent = frozen.events.find(event => event.id === eventId);
  assert.ok(inputEvent, `frozen event ${eventId}`);
  const inputAnchor = inputEvent.anchors[stateIndex];
  const parentAnchor = parentEvent.anchors[stateIndex];
  assert.ok(inputAnchor && parentAnchor);
  assert.equal(inputAnchor.timeMs, parentAnchor.timeMs, 'frozen timestamp matches parent');
  const E = Uint8Array.from(inputAnchor.maps.E_qualified);
  const savedF = Uint8Array.from(inputAnchor.maps.F_skeleton);
  const generatedF = sourceFns.zhangSuen(E);
  assert.ok(sameSet(cells(generatedF), cells(savedF)), `original E→F parity at P${eventId}-S${stateIndex + 1}`);
  const D = Float32Array.from(inputAnchor.maps.D_support);
  const nucleus = chooseNucleus(savedF, D, sourceFns);
  const expectedNucleus = parentAnchor.nucleus?.index;
  assert.equal(nucleus?.index ?? null, expectedNucleus ?? null, `parent nucleus parity at P${eventId}-S${stateIndex + 1}`);
  const tree = shortestTree(savedF, nucleus.index, sourceFns);
  const cap = captureStructuralPackets({ F: savedF, nucleus: nucleus.index, radius: RADIUS });
  assert.ok(sameSet(sortedUnique(cap.X), parentAnchor.candidates.X.cells), 'parent X parity');
  assert.ok(sameSet(sortedUnique(cap.G), parentAnchor.candidates.G.cells), 'parent G parity');
  return { event: `P${eventId}`, eventId, stateIndex, role: ROLES[stateIndex], timeMs: inputAnchor.timeMs,
    inputAnchor, E, F: savedF, D, nucleus, tree, cap, inputHashes: {
      E: sha256(E), F: sha256(savedF), D: sha256(D)
    } };
}

function stateWithCapacity(state, capacity) {
  const baseline = captureView({ E: state.E, F: state.F, D: state.D, nucleus: state.nucleus, capacity, f: sourceFns });
  return {
    key: `P${state.eventId}-S${state.stateIndex + 1}`,
    event: state.event, stateIndex: state.stateIndex, role: state.role, timeMs: state.timeMs,
    mapCounts: { E: cells(state.E).length, F: cells(state.F).length },
    mapHashes: state.inputHashes,
    ...(state.stateIndex === 4 ? { mapCells: { E: cells(state.E), F: cells(state.F) } } : {}),
    FStructure: rasterStats(state.F, sourceFns),
    nucleus: state.nucleus,
    candidates: baseline.candidates
  };
}

function adjacentSummary(states) {
  return states.slice(1).map((to, index) => {
    const from = states[index];
    return {
      from: from.key, to: to.key, gapSeconds: (to.timeMs - from.timeMs) / 1000,
      nucleusMoved: from.nucleus.index !== to.nucleus.index,
      nucleusDistance: edgeLength(from.nucleus.index, to.nucleus.index),
      candidates: Object.fromEntries(['X', 'G', 'B'].map(name => [name,
        jaccard(from.candidates[name].cells, to.candidates[name].cells)])),
      BCapacity: {
        fromUsed: from.candidates.B.capacity.used,
        toUsed: to.candidates.B.capacity.used,
        fromRemainder: from.candidates.B.capacity.unused,
        toRemainder: to.candidates.B.capacity.unused
      }
    };
  });
}

function sparseSubset(mask) { return cells(mask); }

function buildAnalysis({ frozen, parent, inputBytes, parentAnalysisText, sourceText }) {
  const parentEvents = new Map(parent.events.map(event => [event.id, event]));
  const eventInputs = frozen.events.slice().sort((a, b) => a.id - b.id);
  const prepared = eventInputs.map(inputEvent => {
    const parentEvent = parentEvents.get(inputEvent.id);
    assert.ok(parentEvent);
    assert.equal(inputEvent.anchors.length, 5);
    assert.equal(parentEvent.anchors.length, 5);
    return inputEvent.anchors.map((_, index) => stateInput(inputEvent.id, index, frozen, parentEvent));
  });
  const p1Commit = prepared[0][4];
  const p1X = sortedUnique(p1Commit.cap.X);
  const capacity = chooseCapacityFromP1X(p1Commit.F, p1Commit.D, p1Commit.nucleus.index, p1X, sourceFns);
  const events = prepared.map(states => {
    const outputStates = states.map(state => stateWithCapacity(state, capacity));
    const parentEvent = parentEvents.get(states[0].eventId);
    const commit = states[4];
    const stress = analyzeCommitStress({
      state: { ...commit, originalView: { nucleus: commit.nucleus, candidates: outputStates[4].candidates }, event: commit.event },
      parentStress: parentEvent.stress,
      deleted: parentEvent.stress.deleted,
      capacity,
      f: sourceFns
    });
    return { id: commit.event, states: outputStates, transitions: adjacentSummary(outputStates), stress };
  });

  const denseF = new Uint8Array(CELL_COUNT).fill(1), denseE = denseF.slice();
  const denseD = new Float32Array(CELL_COUNT); denseD[48 * SIDE + 48] = 1;
  const denseNucleus = chooseNucleus(denseF, denseD, sourceFns);
  assert.equal(denseNucleus.index, 48 * SIDE + 48);
  const denseView = captureView({ E: denseE, F: denseF, D: denseD, nucleus: denseNucleus, capacity, f: sourceFns });
  const parentDense = parent.fixtures.denseFullF;
  assert.equal(denseView.candidates.X.nodes, parentDense.X.nodes, 'dense fixture X parity');
  assert.equal(denseView.candidates.G.nodes, parentDense.G.nodes, 'dense fixture G parity');
  return {
    schema: 'ant-capture-law-upstream-sensitivity-v1',
    authority: { productionRef: 'origin/main', main: MAIN_SHA, parent: PARENT_SHA, branch: 'codex/ant-capture-law-upstream-sensitivity-20261029' },
    provenance: {
      frozenInput: INPUT, frozenInputSha256: sha256(inputBytes),
      parentAnalysis: `${PARENT}/analysis.json`, parentAnalysisSha256: sha256(Buffer.from(parentAnalysisText, 'utf8')),
      currentMainSource: SOURCE, currentMainSourceSha256LF: sha256(Buffer.from(sourceText, 'utf8')),
      seed: frozen.seed, heading: frozen.heading, audio: frozen.audio, replayCount: 0,
      resolution: '96x96, row-major, 8-neighbor production thinning and capture'
    },
    captureContract: {
      X: 'parent nucleus-connected component of F intersect EuclideanDisk(nucleus, 0.15)',
      G: 'parent graph-distance ball in F within 0.15; representation reference',
      B: 'deterministic F shortest-tree expansion under one rooted-parent-edge capacity',
      radiusWorldUnits: RADIUS,
      capacity: { ...capacity, authoredStatus: 'matched diagnostic normalization only; not a natural constant or production parameter' },
      edgeLengths: { axial: 1 / SCALE, diagonal: SQRT2 / SCALE },
      pathTie: 'current production MinHeap distance/index order and lower parent cell on 1e-12 distance ties',
      expansionOrder: 'ascending root distance, then row-major index; parent must already be admitted',
      capacityEpsilon: EPSILON
    },
    states: events.map(event => event.states),
    eventStress: events.map(event => ({ event: event.id, deletedCell: event.stress.deletedCell,
      timeMs: event.stress.timeMs, originalNucleus: event.stress.originalNucleus,
      directF: event.stress.directF, upstreamEToF: event.stress.upstreamEToF })),
    transitions: events.map(event => ({ event: event.id, rows: event.transitions })),
    denseFixture: {
      description: 'parent exact full-F 96x96 adversarial fixture with a unique center D maximum',
      FCells: sparseSubset(denseF), ECells: sparseSubset(denseE), nucleus: denseNucleus,
      candidates: denseView.candidates,
      parentParity: { XNodes: parentDense.X.nodes, GNodes: parentDense.G.nodes }
    },
    totals: {
      frozenStates: events.reduce((sum, event) => sum + event.states.length, 0),
      upstreamPerturbations: events.length,
      directFReferenceEdits: events.length,
      allOriginalXGParityStates: events.reduce((sum, event) => sum + event.states.length, 0)
    },
    boundaries: [
      'No new natural simulation, seed, field, RNG use, capture scale, capacity scale, nucleus policy, UPDATE, BODY, audio or production state.',
      'Results describe two one-cell frozen representation stresses and one dense adversarial fixture; they do not establish natural robustness or material meaning.',
      'Stateless ten-anchor B results are not UPDATE or long-run accumulation evidence.'
    ]
  };
}

function assertSelfChecks(data) {
  const root = 48 * SIDE + 48;
  const F = new Uint8Array(CELL_COUNT);
  for (const index of [root, root + 1, root + 2, root - SIDE, root - 2 * SIDE]) F[index] = 1;
  const tree = shortestTree(F, root, sourceFns);
  const branch = allocateCapacityB(F, root, tree, 2 / SCALE);
  assert.equal(branch.capacity.used, 2 / SCALE);
  assert.equal(branch.cells.length, 3);
  assert.ok(branch.cells.includes(root));
  assert.equal(sourceFns.skeletonComponents(Uint8Array.from(F, (value, index) => branch.cells.includes(index) ? value : 0)).length, 1);
  assert.deepEqual(branch, allocateCapacityB(F, root, tree, 2 / SCALE), 'B deterministic fixture');
  const empty = new Uint8Array(CELL_COUNT);
  assert.equal(chooseNucleus(empty, new Float32Array(CELL_COUNT), sourceFns), null);
  const fixedRoot = 40 * SIDE + 40, line = new Uint8Array(CELL_COUNT), supports = new Float32Array(CELL_COUNT);
  line[fixedRoot] = line[fixedRoot + 1] = line[fixedRoot + 2] = 1;
  supports[fixedRoot] = .5; supports[fixedRoot + 2] = 1;
  const fixed = selectView({ E: line, F: line, D: supports, oldNucleus: fixedRoot, mode: 'fixed-old-nucleus',
    capacity: { worldLength: 2 / SCALE }, f: sourceFns });
  assert.equal(fixed.nucleus.index, fixedRoot);
  assert.equal(fixed.nucleus.value, .5);
  assert.equal(fixed.maxDContext.index, fixedRoot + 2, 'fixed nucleus context remains separate from reselected max-D');
  assert.equal(data.totals.frozenStates, 10);
  for (const event of data.eventStress) {
    assert.equal(event.upstreamEToF.E.lost.length, 1);
    assert.equal(event.upstreamEToF.E.gained.length, 0);
    assert.equal(event.upstreamEToF.E.lost[0], event.deletedCell);
  }
  console.log('ant-capture-law-upstream-sensitivity self-test passed');
}

function svgPath(indices, x, y, cell) {
  return indices.map(index => {
    const left = x + index % SIDE * cell, top = y + Math.floor(index / SIDE) * cell;
    return `M${left},${top}h${cell}v${cell}h-${cell}z`;
  }).join('');
}
function svgText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function atlasSvg(data) {
  const cell = 3, map = SIDE * cell, panelW = 352, panelH = 366, gapX = 10, gapY = 10, margin = 24;
  const rowGroups = [];
  for (const event of data.eventStress) {
    const state = data.states[event.event === 'P1' ? 0 : 1][4];
    rowGroups.push({ title: `${event.event} COMMIT · original`,
      ECells: state.mapCells?.E || null, FCells: state.mapCells?.F || null,
      nucleus: state.nucleus.index, oldNucleus: state.nucleus.index, edit: null,
      candidates: state.candidates, deltas: null });
    rowGroups.push({ title: `${event.event} COMMIT · direct-F deletion`,
      ECells: event.directF.ECells, FCells: event.directF.FCells,
      nucleus: event.directF.views.reselected.nucleus?.index ?? null, oldNucleus: event.originalNucleus.index,
      edit: event.deletedCell, candidates: event.directF.views.reselected.candidates,
      deltas: event.directF.captureChanges.reselected });
    rowGroups.push({ title: `${event.event} COMMIT · E→F′ fixed old nucleus`,
      ECells: event.upstreamEToF.EprimeCells, FCells: event.upstreamEToF.FprimeCells,
      nucleus: event.upstreamEToF.fixedOldNucleus.nucleus?.index ?? null, oldNucleus: event.originalNucleus.index,
      edit: event.deletedCell, candidates: event.upstreamEToF.fixedOldNucleus.candidates,
      deltas: event.upstreamEToF.fixedCaptureChanges });
    rowGroups.push({ title: `${event.event} COMMIT · E→F′ reselected nucleus`,
      ECells: event.upstreamEToF.EprimeCells, FCells: event.upstreamEToF.FprimeCells,
      nucleus: event.upstreamEToF.reselectedNucleus.nucleus?.index ?? null, oldNucleus: event.originalNucleus.index,
      edit: event.deletedCell, candidates: event.upstreamEToF.reselectedNucleus.candidates,
      deltas: event.upstreamEToF.reselectedCaptureChanges });
  }
  rowGroups.push({ title: 'Dense-F adversarial fixture', ECells: data.denseFixture.ECells, FCells: data.denseFixture.FCells,
    nucleus: data.denseFixture.nucleus.index, oldNucleus: data.denseFixture.nucleus.index, edit: null,
    candidates: data.denseFixture.candidates, deltas: null });
  const width = margin * 2 + panelW * 3 + gapX * 2;
  const height = 92 + margin + rowGroups.length * (panelH + gapY) + 22;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<style>text{font-family:Arial,sans-serif;fill:#20313a}.title{font-size:21px;font-weight:700}.sub{font-size:11px;fill:#52636a}.head{font-size:12px;font-weight:700}.label{font-size:10px}.panel{fill:#fff;stroke:#aab6ba}.legend{font-size:11px}</style>',
    '<rect width="100%" height="100%" fill="#f4f7f7"/>',
    `<text x="${margin}" y="27" class="title">Frozen capture-law upstream sensitivity · 96×96</text>`,
    `<text x="${margin}" y="48" class="sub">Same coordinate frame and scale; each row shows its stated original or perturbed E/F. Pale = E, gray = F, colored = capture membership. Gold = original nucleus, black = reselected nucleus, magenta diamond = deletion.</text>`,
    `<text x="${margin}" y="68" class="sub">X=.15 Euclidean connected capture · G=.15 graph-distance reference · B=one fixed rooted-edge capacity. Overlays show membership, not material masks.</text>`,
    `<text x="${margin}" y="86" class="legend"><tspan fill="${COLORS.X}">X</tspan> · <tspan fill="${COLORS.G}">G</tspan> · <tspan fill="${COLORS.B}">B</tspan> · same 3-cell raster scale in every panel; no per-case normalization.</text>`
  ];
  const names = ['X', 'G', 'B'];
  for (let row = 0; row < rowGroups.length; row += 1) {
    const group = rowGroups[row];
    for (let col = 0; col < 3; col += 1) {
      const name = names[col], candidate = group.candidates?.[name];
      const x0 = margin + col * (panelW + gapX), y0 = 102 + row * (panelH + gapY);
      const mx = x0 + 26, my = y0 + 42;
      out.push(`<rect x="${x0}" y="${y0}" width="${panelW}" height="${panelH}" rx="3" class="panel"/>`);
      out.push(`<text x="${x0 + 8}" y="${y0 + 16}" class="head">${svgText(group.title)} · ${name}</text>`);
      out.push(`<text x="${x0 + 8}" y="${y0 + 30}" class="label">${candidate ? `${candidate.nodes} nodes · ${candidate.inducedEdges} induced edges · span ${candidate.maxEuclideanFromNucleus.toFixed(4)}` : 'CONTROL UNAVAILABLE'}</text>`);
      out.push(`<path d="${svgPath(group.ECells || [], mx, my, cell)}" fill="${COLORS.E}"/>`);
      out.push(`<path d="${svgPath(group.FCells || [], mx, my, cell)}" fill="${COLORS.F}" fill-opacity=".72"/>`);
      if (candidate) out.push(`<path d="${svgPath(candidate.cells, mx, my, cell)}" fill="${COLORS[name]}" fill-opacity=".88"/>`);
      out.push(`<rect x="${mx}" y="${my}" width="${map}" height="${map}" fill="none" stroke="#58666b" stroke-width=".8"/>`);
      const old = group.oldNucleus;
      if (Number.isInteger(old)) {
        const ox = mx + (old % SIDE + .5) * cell, oy = my + (Math.floor(old / SIDE) + .5) * cell;
        out.push(`<circle cx="${ox}" cy="${oy}" r="4.4" fill="none" stroke="#f0ad31" stroke-width="1.6"/>`);
      }
      if (Number.isInteger(group.nucleus)) {
        const nx = mx + (group.nucleus % SIDE + .5) * cell, ny = my + (Math.floor(group.nucleus / SIDE) + .5) * cell;
        out.push(`<path d="M${nx - 3.4},${ny}h6.8M${nx},${ny - 3.4}v6.8" stroke="#17242b" stroke-width="1.5"/>`);
      }
      if (Number.isInteger(group.edit)) {
        const ex = mx + (group.edit % SIDE + .5) * cell, ey = my + (Math.floor(group.edit / SIDE) + .5) * cell;
        out.push(`<path d="M${ex},${ey - 4.5}l4.5,4.5l-4.5,4.5l-4.5,-4.5z" fill="#e24c88" stroke="#fff" stroke-width=".8"/>`);
      }
      if (candidate && group.deltas?.[name]) {
        const d = group.deltas[name];
        out.push(`<text x="${x0 + 8}" y="${y0 + 351}" class="label">vs original: J=${d.jaccard.toFixed(4)} · lost=${d.lost.length} · gained=${d.gained.length}</text>`);
      } else if (candidate) {
        out.push(`<text x="${x0 + 8}" y="${y0 + 351}" class="label">B capacity used ${candidate.capacity?.used?.toFixed(4) ?? '—'} / ${data.captureContract.capacity.worldLength.toFixed(4)}</text>`);
      }
    }
  }
  out.push('</svg>');
  return `${out.join('\n')}\n`;
}

let sourceFns;
function generate() {
  const inputs = readInputs();
  sourceFns = sourceFunctions(inputs.sourceText);
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('capture-law audit must not consume RNG'); };
  try {
    return buildAnalysis({ ...inputs,
      inputBytes: readFileSync(INPUT),
      parentAnalysisText: lf(readFileSync(`${PARENT}/analysis.json`, 'utf8')),
      sourceText: inputs.sourceText });
  } finally { Math.random = originalRandom; }
}

function writeOutputs() {
  for (const path of Object.values(OUTPUTS)) assert.ok(!existsSync(path), `refusing to overwrite ${path}`);
  const data = generate();
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const atlas = atlasSvg(data);
  writeFileSync(OUTPUTS.analysis, json, 'utf8');
  writeFileSync(OUTPUTS.atlas, atlas, 'utf8');
  console.log(`capture-law analysis and atlas written; L_compare=${data.captureContract.capacity.worldLength}`);
}

function checkOutputs() {
  const data = generate();
  assert.equal(lf(readFileSync(OUTPUTS.analysis, 'utf8')), `${JSON.stringify(data, null, 2)}\n`, 'analysis rerun differs');
  assert.equal(lf(readFileSync(OUTPUTS.atlas, 'utf8')), atlasSvg(data), 'atlas rerun differs');
  console.log('capture-law analysis and atlas deterministic rerun passed');
}

const flag = process.argv[2];
if (flag === '--self-test') {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('self-test must not consume RNG'); };
  try { assertSelfChecks(generate()); } finally { Math.random = originalRandom; }
} else if (flag === '--write') writeOutputs();
else if (flag === '--check') checkOutputs();
else {
  console.error('usage: node scripts/ant-capture-law-upstream-sensitivity.js --self-test|--write|--check');
  process.exitCode = 2;
}
