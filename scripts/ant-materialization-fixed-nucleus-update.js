import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = join(ROOT, 'docs/ant/evidence/2026-10-31-materialization-fixed-nucleus-update');
const INPUT = join(BASE, 'data/frozen-inputs.json.gz');
const X_REFERENCE = join(BASE, 'data/registered-x-reference.json');
const UPDATE_PARITY = join(BASE, 'data/update-source-parity.json');
const CAPTURE_PARITY = join(BASE, 'data/capture-source-parity.json');
const SOURCE = join(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js');
const GRID = 96;
const SCALE = GRID - 1;
const COUNT = GRID * GRID;
const RADIUS = 0.15;
const EPSILON = 1e-12;
const CURRENT_MAIN = '1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44';
const CURRENT_SOURCE_BLOB = '238cc365f2602dc6a22091d69237b88962825a13';
const CURRENT_SOURCE_LF_SHA = 'cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67';
const HISTORY_COMMIT = '0d5096a920e1ebb2086fa1dae782c5d4e871b590';
const HISTORY_PATH = 'docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz';
const HISTORY_GZIP_SHA = '909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc';
const HISTORY_JSON_SHA = 'fba546769a1ddc552247a93f5c2d3719193b8d4785ed672442dcae1960e25339';
const UPDATE_COMMIT = '66e1b9812fc160910f60b18f17e49e8d3b674ee9';
const UPDATE_PATH = 'docs/ant/evidence/2026-10-29-event-evolved-scope/data/frozen-event-input.json.gz';
const UPDATE_GZIP_SHA = 'bd0fd2ccd036e824cb9fc1ceec6ab60a0cf711ab44d95487a08aced375d63253';
const CAPTURE_COMMIT = '5b9cd6ba47368cd61c0391cc64f9dc62416c7ef8';
const CAPTURE_PATH = 'docs/ant/evidence/2026-10-29-proposal-emergence-exploration/data/frozen-inputs.json.gz';
const CAPTURE_GZIP_SHA = '6ff3ec3d6fb8bc0fa1f323532361ab9d19ecc0e75353b1b9ce3d6875c440842d';

function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function lf(text) { return text.replace(/\r\n?/g, '\n'); }
function shaText(text) { return sha(Buffer.from(lf(text), 'utf8')); }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function sorted(values) { return [...values].sort((a, b) => a - b); }
function asMask(values, label, binary = true) {
  assert.ok(Array.isArray(values) || ArrayBuffer.isView(values), label + ' must be an array');
  assert.equal(values.length, COUNT, label + ' grid length');
  const mask = Uint8Array.from(values);
  if (binary) for (const value of mask) assert.ok(value === 0 || value === 1, label + ' must be binary');
  return mask;
}
function indices(mask) {
  const result = [];
  for (let index = 0; index < COUNT; index += 1) if (mask[index]) result.push(index);
  return result;
}
function setOf(maskOrIndices) {
  return maskOrIndices instanceof Set ? maskOrIndices : new Set(maskOrIndices);
}
function compareSets(previousValue, currentValue) {
  if (previousValue === null || currentValue === null) return { status: 'unavailable' };
  const previous = setOf(previousValue), current = setOf(currentValue);
  const intersection = [], lost = [], gained = [];
  for (const cell of previous) (current.has(cell) ? intersection : lost).push(cell);
  for (const cell of current) if (!previous.has(cell)) gained.push(cell);
  const union = previous.size + current.size - intersection.length;
  return {
    previousSize: previous.size,
    currentSize: current.size,
    intersection: intersection.length,
    lost: lost.length,
    gained: gained.length,
    union,
    jaccard: union ? intersection.length / union : 1,
    lostCells: sorted(lost),
    gainedCells: sorted(gained)
  };
}
function coordinates(index) {
  return { x: (index % GRID) / SCALE, y: Math.floor(index / GRID) / SCALE };
}
function diskMembership(index, nucleus) {
  const dx = ((index % GRID) - (nucleus % GRID)) / SCALE;
  const dy = (Math.floor(index / GRID) - Math.floor(nucleus / GRID)) / SCALE;
  return Math.hypot(dx, dy) <= RADIUS + EPSILON;
}
function captureX(F, nucleus, neighbors) {
  assert.ok(F[nucleus], 'X nucleus must belong to F');
  const seen = new Uint8Array(COUNT), queue = [nucleus];
  seen[nucleus] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    for (const next of neighbors(queue[head])) {
      if (!seen[next] && F[next] && diskMembership(next, nucleus)) {
        seen[next] = 1;
        queue.push(next);
      }
    }
  }
  return indices(seen);
}
function edgeNeighborCount(F, nucleus, neighbors) {
  return neighbors(nucleus).filter(next => F[next]).length;
}
function maxDSupportedNucleus(F, D, neighbors) {
  let best = null, eligibleCount = 0;
  for (let index = 0; index < COUNT; index += 1) {
    if (!F[index] || edgeNeighborCount(F, index, neighbors) === 0) continue;
    eligibleCount += 1;
    if (best === null || D[index] > D[best]) best = index;
  }
  return best === null ? null : { index: best, support: D[best], eligibleCount };
}
function isEdgeBearing(F, index, neighbors) {
  return Number.isInteger(index) && index >= 0 && index < COUNT
    && !!F[index] && edgeNeighborCount(F, index, neighbors) > 0;
}
function productionFunctions(sourceText) {
  assert.equal(shaText(sourceText), CURRENT_SOURCE_LF_SHA, 'current TrailPlateBirth source authority');
  const neighborStart = sourceText.indexOf('function neighborValues(');
  const neighborEnd = sourceText.indexOf('function createPheromoneSampler(', neighborStart);
  const thinStart = sourceText.indexOf('function zhangSuen(');
  const thinEnd = sourceText.indexOf('function skeletonComponents(', thinStart);
  assert.ok(neighborStart >= 0 && neighborEnd > neighborStart, 'production 8-neighbor helpers');
  assert.ok(thinStart >= 0 && thinEnd > thinStart, 'production thinning helper');
  const protectedMath = Object.create(Math);
  protectedMath.random = () => { throw new Error('analysis must not consume RNG'); };
  const code = 'const TRAIL_PLATE_GRID_SIZE=' + GRID + ';\n'
    + sourceText.slice(neighborStart, neighborEnd) + '\n'
    + sourceText.slice(thinStart, thinEnd) + '\n'
    + '({ neighbors, zhangSuen })';
  return runInNewContext(code, { Math: protectedMath });
}
function inducedMetrics(cells, nucleus, F, neighbors) {
  const set = new Set(cells);
  let edges = 0, endpoints = 0, junctions = 0;
  for (const cell of cells) {
    const degree = neighbors(cell).filter(next => set.has(next)).length;
    edges += degree;
    if (degree === 1) endpoints += 1;
    if (degree >= 3) junctions += 1;
  }
  edges /= 2;
  const distances = new Float64Array(COUNT);
  distances.fill(Infinity);
  distances[nucleus] = 0;
  const pending = [[0, nucleus]], visited = new Uint8Array(COUNT);
  while (pending.length) {
    pending.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const [distance, cell] = pending.shift();
    if (visited[cell]) continue;
    visited[cell] = 1;
    for (const next of neighbors(cell)) {
      if (!set.has(next) || visited[next]) continue;
      const diagonal = cell % GRID !== next % GRID && Math.floor(cell / GRID) !== Math.floor(next / GRID);
      const candidate = distance + (diagonal ? Math.SQRT2 : 1) / SCALE;
      if (candidate < distances[next]) {
        distances[next] = candidate;
        pending.push([candidate, next]);
      }
    }
  }
  let maxEuclideanRadius = 0, maxGraphDistance = 0;
  for (const cell of cells) {
    assert.ok(Number.isFinite(distances[cell]), 'X connectedness / graph reachability');
    const a = coordinates(cell), b = coordinates(nucleus);
    maxEuclideanRadius = Math.max(maxEuclideanRadius, Math.hypot(a.x - b.x, a.y - b.y));
    maxGraphDistance = Math.max(maxGraphDistance, distances[cell]);
  }
  let componentKey = null, componentSize = 0;
  const fSeen = new Uint8Array(COUNT), fQueue = [nucleus];
  fSeen[nucleus] = 1;
  for (let head = 0; head < fQueue.length; head += 1) {
    const cell = fQueue[head];
    componentSize += 1;
    componentKey = componentKey === null ? cell : Math.min(componentKey, cell);
    for (const next of neighbors(cell)) if (F[next] && !fSeen[next]) {
      fSeen[next] = 1;
      fQueue.push(next);
    }
  }
  const componentCount = (() => {
    const seen = new Uint8Array(COUNT);
    let count = 0;
    for (let start = 0; start < COUNT; start += 1) if (F[start] && !seen[start]) {
      count += 1;
      const queue = [start]; seen[start] = 1;
      for (let head = 0; head < queue.length; head += 1) for (const next of neighbors(queue[head])) {
        if (F[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
    return count;
  })();
  assert.deepEqual(cells, captureX(F, nucleus, neighbors), 'X is exactly the nucleus component inside the disk');
  return { inducedEdges: edges, endpoints, junctionNodes: junctions, connected: true,
    maxEuclideanRadius, maxWeightedGraphDistance: maxGraphDistance,
    componentInF: { keyLowestRowMajor: componentKey, size: componentSize, componentCount } };
}
function lossAttribution(lostCells, E, F, currentCapture, nucleus) {
  const groups = {
    noLongerEQualified: [],
    stillEButThinnedOutOfF: [],
    stillFOutsideCapture: [],
    stillFOutsideEuclideanDisk: [],
    stillFInsideDiskButDisconnected: [],
    stillFStillInCapture: []
  };
  for (const cell of lostCells) {
    if (!E[cell]) groups.noLongerEQualified.push(cell);
    else if (!F[cell]) groups.stillEButThinnedOutOfF.push(cell);
    else if (currentCapture?.has(cell)) groups.stillFStillInCapture.push(cell);
    else {
      groups.stillFOutsideCapture.push(cell);
      if (nucleus === null || !diskMembership(cell, nucleus)) groups.stillFOutsideEuclideanDisk.push(cell);
      else groups.stillFInsideDiskButDisconnected.push(cell);
    }
  }
  return Object.fromEntries(Object.entries(groups).map(([key, cells]) => [key, { count: cells.length, cells }]));
}
function anchorSummary(frame, eventState, startSet) {
  const { E, F, I } = frame;
  const fixedCells = eventState.fixedCells;
  const fixedSet = fixedCells === null ? null : new Set(fixedCells);
  let startInE = 0, startInF = 0, startInFixedX = 0;
  for (const cell of startSet) {
    startInE += E[cell] ? 1 : 0;
    startInF += F[cell] ? 1 : 0;
    startInFixedX += fixedSet?.has(cell) ? 1 : 0;
  }
  const statelessSet = eventState.statelessCells === null ? null : new Set(eventState.statelessCells);
  const ISet = new Set(indices(I));
  const fixedVsStateless = compareSets(eventState.fixedCells, eventState.statelessCells);
  const metrics = eventState.statelessCells === null ? null
    : inducedMetrics(eventState.statelessCells, eventState.statelessNucleus.index, F, eventState.neighbors);
  const fixedMetrics = eventState.fixedCells === null ? null
    : inducedMetrics(eventState.fixedCells, eventState.fixedNucleus, F, eventState.neighbors);
  return {
    anchorIndex: eventState.anchorIndex,
    timeMs: frame.timeMs,
    seconds: frame.timeMs / 1000,
    sizes: { E: indices(E).length, F: indices(F).length, productionI: ISet.size,
      statelessX: statelessSet?.size ?? null, fixedNucleusX: fixedSet?.size ?? null },
    maxDStateless: eventState.statelessNucleus && { ...eventState.statelessNucleus,
      point: [coordinates(eventState.statelessNucleus.index).x, coordinates(eventState.statelessNucleus.index).y] },
    fixedNucleus: {
      index: eventState.fixedNucleus,
      admissibleEdgeBearingFNode: eventState.fixedAdmissible,
      sequenceStatus: eventState.fixedSequenceStatus,
      DAtFixedCellDiagnosticOnly: frame.D[eventState.fixedNucleus],
      adjacentFCount: eventState.fixedNucleus === null ? 0
        : eventState.neighbors(eventState.fixedNucleus).filter(next => F[next]).length
    },
    memberships: {
      productionI: indices(I),
      statelessX: eventState.statelessCells,
      fixedNucleusX: eventState.fixedCells
    },
    fixedVsStateless: {
      nucleusDiffers: eventState.fixedNucleus !== eventState.statelessNucleus?.index,
      nucleusDisplacementWorld: eventState.fixedNucleus === null || eventState.statelessNucleus === null ? null
        : Math.hypot(coordinates(eventState.fixedNucleus).x - coordinates(eventState.statelessNucleus.index).x,
          coordinates(eventState.fixedNucleus).y - coordinates(eventState.statelessNucleus.index).y),
      jaccard: fixedVsStateless.jaccard ?? null,
      fixedOnlyCells: fixedVsStateless.lostCells ?? [],
      statelessOnlyCells: fixedVsStateless.gainedCells ?? []
    },
    productionIComparisons: {
      statelessX: compareSets(ISet, eventState.statelessCells),
      fixedNucleusX: compareSets(ISet, eventState.fixedCells)
    },
    startProposalSurvival: {
      denominator: startSet.size,
      stillInE: startInE,
      stillInF: startInF,
      stillInCurrentFixedX: fixedSet === null ? null : startInFixedX
    },
    statelessStructure: metrics,
    fixedNucleusStructure: fixedMetrics
  };
}
function eventAnalysis(event, eventIndex, referenceEvent, ops) {
  assert.equal(event.frames.length, 21, event.id + ' must preserve 21 saved anchors');
  const frames = event.frames.map((frame, index) => {
    const maps = frame.maps;
    const E = asMask(maps.E_qualified, event.id + ' E[' + index + ']');
    const F = asMask(maps.F_skeleton, event.id + ' F[' + index + ']');
    const I = asMask(maps.I_retained_network, event.id + ' I[' + index + ']');
    const D = Float64Array.from(maps.D_support);
    assert.equal(D.length, COUNT, event.id + ' D length');
    for (const value of D) assert.ok(Number.isFinite(value), event.id + ' finite D');
    const producedF = ops.zhangSuen(E);
    assert.deepEqual(Array.from(producedF), Array.from(F), event.id + ' current production F reproduction ' + index);
    for (let cell = 0; cell < COUNT; cell += 1) {
      assert.ok(!F[cell] || E[cell], event.id + ' F subset E at ' + index);
      assert.ok(!I[cell] || F[cell], event.id + ' production I subset F at ' + index);
    }
    return { timeMs: frame.timeMs, E, F, I, D };
  });
  const stateless = frames.map(frame => maxDSupportedNucleus(frame.F, frame.D, ops.neighbors));
  const startNucleus = stateless[0]?.index ?? null;
  assert.notEqual(startNucleus, null, event.id + ' START nucleus exists');
  let stopped = false, firstInvalid = null;
  const state = frames.map((frame, anchorIndex) => {
    const fixedAdmissible = isEdgeBearing(frame.F, startNucleus, ops.neighbors);
    if (!fixedAdmissible && firstInvalid === null) firstInvalid = anchorIndex;
    if (!fixedAdmissible) stopped = true;
    const fixedCells = stopped ? null : captureX(frame.F, startNucleus, ops.neighbors);
    const statelessNucleus = stateless[anchorIndex];
    const statelessCells = statelessNucleus ? captureX(frame.F, statelessNucleus.index, ops.neighbors) : null;
    return {
      anchorIndex, neighbors: ops.neighbors, statelessNucleus, statelessCells,
      fixedNucleus: startNucleus, fixedAdmissible, fixedCells,
      fixedSequenceStatus: stopped ? 'STOPPED_AFTER_FIRST_INVALIDATION' : 'ACTIVE'
    };
  });
  const startSet = new Set(state[0].fixedCells);
  const anchors = frames.map((frame, i) => anchorSummary(frame, state[i], startSet));
  const registeredMatches = [];
  for (const prior of referenceEvent.anchors) {
    const index = frames.findIndex(frame => frame.timeMs === prior.timeMs);
    assert.notEqual(index, -1, event.id + ' registered shared anchor exists');
    const actual = state[index];
    assert.equal(actual.statelessNucleus.index, prior.nucleusIndex,
      event.id + ' registered max-D nucleus at ' + prior.timeMs);
    assert.deepEqual(actual.statelessCells, prior.xCells,
      event.id + ' registered X membership at ' + prior.timeMs);
    registeredMatches.push({ anchorIndex: index, timeMs: prior.timeMs, nucleusIndex: actual.statelessNucleus.index,
      xNodes: actual.statelessCells.length, exactNucleusMatch: true, exactXSetMatch: true });
  }
  const transitions = [], cellReceipts = [];
  for (let i = 1; i < frames.length; i += 1) {
    const previous = frames[i - 1], current = frames[i], prevState = state[i - 1], currentState = state[i];
    const productionI = compareSets(indices(previous.I), indices(current.I));
    const statelessX = compareSets(prevState.statelessCells, currentState.statelessCells);
    const fixedX = compareSets(prevState.fixedCells, currentState.fixedCells);
    const currentStatelessCapture = currentState.statelessCells === null ? null : new Set(currentState.statelessCells);
    const currentFixedCapture = currentState.fixedCells === null ? null : new Set(currentState.fixedCells);
    const productionIAttribution = productionI.status === 'unavailable' ? null
      : lossAttribution(productionI.lostCells, current.E, current.F, currentStatelessCapture,
        currentState.statelessNucleus?.index ?? null);
    const statelessAttribution = statelessX.status === 'unavailable' ? null
      : lossAttribution(statelessX.lostCells, current.E, current.F, currentStatelessCapture,
        currentState.statelessNucleus?.index ?? null);
    const fixedAttribution = fixedX.status === 'unavailable' ? null
      : lossAttribution(fixedX.lostCells, current.E, current.F, currentFixedCapture, startNucleus);
    const previousNucleusStillEligible = isEdgeBearing(current.F, prevState.statelessNucleus.index, ops.neighbors);
    const bridgeX = previousNucleusStillEligible
      ? captureX(current.F, prevState.statelessNucleus.index, ops.neighbors) : null;
    const localRecapture = bridgeX === null ? { status: 'previous-nucleus-invalid-at-destination' }
      : compareSets(prevState.statelessCells, bridgeX);
    const allocationOnly = bridgeX === null || currentState.statelessCells === null
      ? { status: 'unavailable' } : compareSets(bridgeX, currentState.statelessCells);
    const row = {
      transitionIndex: i - 1,
      fromTimeMs: previous.timeMs,
      toTimeMs: current.timeMs,
      elapsedSeconds: (current.timeMs - previous.timeMs) / 1000,
      statelessNucleusChanged: prevState.statelessNucleus.index !== currentState.statelessNucleus?.index,
      fromNucleus: prevState.statelessNucleus.index,
      toNucleus: currentState.statelessNucleus?.index ?? null,
      previousNucleusStillEdgeBearingAtDestination: previousNucleusStillEligible,
      productionI,
      statelessX,
      fixedNucleusX: fixedX,
      statelessRecaptureUnderPreviousNucleus: localRecapture,
      currentFAllocationOnly: allocationOnly,
      lostCellStateAtDestination: {
        productionI: productionIAttribution,
        statelessX: statelessAttribution,
        fixedNucleusX: fixedAttribution
      }
    };
    transitions.push(row);
    cellReceipts.push({ transitionIndex: i - 1, fromTimeMs: previous.timeMs, toTimeMs: current.timeMs,
      productionI: productionI.status === 'unavailable' ? productionI
        : { lostCells: productionI.lostCells, gainedCells: productionI.gainedCells,
          lostPartition: productionIAttribution },
      statelessX: statelessX.status === 'unavailable' ? statelessX
        : { lostCells: statelessX.lostCells, gainedCells: statelessX.gainedCells,
          lostPartition: statelessAttribution },
      fixedNucleusX: fixedX.status === 'unavailable' ? fixedX
        : { lostCells: fixedX.lostCells, gainedCells: fixedX.gainedCells,
          lostPartition: fixedAttribution },
      statelessRecaptureUnderPreviousNucleus: localRecapture,
      currentFAllocationOnly: allocationOnly });
  }
  const historySummary = key => {
    const rows = transitions.map(row => row[key]).filter(row => row?.status !== 'unavailable');
    const attributeKey = key === 'fixedNucleusX' ? 'fixedNucleusX' : key;
    const sums = field => rows.reduce((total, row) => total + (row[field] ?? 0), 0);
    const partition = {};
    for (const transition of transitions) {
      const attribution = transition.lostCellStateAtDestination[attributeKey];
      for (const [name, entry] of Object.entries(attribution ?? {})) partition[name] = (partition[name] ?? 0) + entry.count;
    }
    return {
      validTransitions: rows.length,
      meanJaccard: rows.length ? rows.reduce((total, row) => total + row.jaccard, 0) / rows.length : null,
      totalLostOccurrences: sums('lost'),
      totalGainedOccurrences: sums('gained'),
      totalIntersectionOccurrences: sums('intersection'),
      totalPreviousMembershipOccurrences: sums('previousSize'),
      lostPartitionOccurrences: partition
    };
  };
  const fixedCompared = anchors.filter(row => row.fixedVsStateless.jaccard !== null);
  const sameNucleusRows = transitions.filter(row => !row.statelessNucleusChanged && row.statelessX.status !== 'unavailable');
  const meanWherePresent = (key, field) => {
    const rows = transitions.map(row => row[key]).filter(row => Number.isFinite(row?.[field]));
    return rows.length ? rows.reduce((sum, row) => sum + row[field], 0) / rows.length : null;
  };
  return {
    id: event.id,
    displayId: eventIndex === 0 ? 'P1' : 'P2',
    startTimeMs: frames[0].timeMs,
    endTimeMs: frames.at(-1).timeMs,
    anchors: anchors.length,
    transitions: transitions.length,
    startNucleus: { index: startNucleus, point: [coordinates(startNucleus).x, coordinates(startNucleus).y],
      DSupport: frames[0].D[startNucleus], eligibleNodesAtStart: stateless[0].eligibleCount },
    nucleusValidity: {
      firstInvalidAnchorIndex: firstInvalid,
      firstInvalidTimeMs: firstInvalid === null ? null : frames[firstInvalid].timeMs,
      atEveryAnchor: state.map((row, index) => ({ anchorIndex: index, timeMs: frames[index].timeMs,
        n0AdmissibleEdgeBearingF: row.fixedAdmissible,
        n0AdjacentFCount: ops.neighbors(startNucleus).filter(next => frames[index].F[next]).length,
        fixedSequenceStatus: row.fixedSequenceStatus }))
    },
    registeredSharedAnchorParity: registeredMatches,
    summaries: {
      productionI: historySummary('productionI'),
      statelessX: historySummary('statelessX'),
      fixedNucleusX: historySummary('fixedNucleusX'),
      fixedVsStatelessMeanSameAnchorJaccard: fixedCompared.length
        ? fixedCompared.reduce((sum, row) => sum + row.fixedVsStateless.jaccard, 0) / fixedCompared.length : null,
      unchangedStatelessNucleusTransitions: {
        count: sameNucleusRows.length,
        meanJaccard: sameNucleusRows.length
          ? sameNucleusRows.reduce((sum, row) => sum + row.statelessX.jaccard, 0) / sameNucleusRows.length : null,
        totalLost: sameNucleusRows.reduce((sum, row) => sum + row.statelessX.lost, 0),
        totalGained: sameNucleusRows.reduce((sum, row) => sum + row.statelessX.gained, 0)
      },
      statelessRecaptureUnderPreviousNucleus: {
        meanJaccard: meanWherePresent('statelessRecaptureUnderPreviousNucleus', 'jaccard'),
        totalLost: transitions.reduce((sum, row) => sum + (row.statelessRecaptureUnderPreviousNucleus.lost ?? 0), 0),
        totalGained: transitions.reduce((sum, row) => sum + (row.statelessRecaptureUnderPreviousNucleus.gained ?? 0), 0)
      },
      currentFAllocationOnly: {
        meanJaccard: meanWherePresent('currentFAllocationOnly', 'jaccard'),
        totalLost: transitions.reduce((sum, row) => sum + (row.currentFAllocationOnly.lost ?? 0), 0),
        totalGained: transitions.reduce((sum, row) => sum + (row.currentFAllocationOnly.gained ?? 0), 0)
      }
    },
    anchors,
    transitionRows: transitions,
    transitionCells: cellReceipts
  };
}
function validateFrozenData(input, reference, sourceText) {
  assert.equal(input.schema, 'ant-fixed-nucleus-update-input-v1');
  assert.equal(input.source.gzipSha256, HISTORY_GZIP_SHA);
  assert.equal(input.source.rawJsonSha256, HISTORY_JSON_SHA);
  assert.equal(input.source.seed, 20261005);
  assert.equal(input.source.audio, 'Off');
  assert.equal(input.source.grid, GRID);
  assert.equal(sha(Buffer.from(sourceText, 'utf8')), input.source.sourceTrailPlateBirthSha256,
    'current TrailPlateBirth bytes match the captured historical source');
  assert.equal(input.events.length, 2);
  assert.equal(reference.schema, 'ant-registered-x-reference-v1');
  assert.equal(reference.events.length, 2);
  assert.equal(reference.events[0].anchors.length + reference.events[1].anchors.length, 10);
  const refsById = new Map(reference.events.map(event => [event.id, event]));
  const ops = productionFunctions(sourceText);
  const fMatches = [];
  for (const event of input.events) {
    assert.equal(event.frames.length, 21, event.id + ' anchor count');
    const ref = refsById.get(event.id);
    assert.ok(ref, event.id + ' registered X reference');
    for (const [anchorIndex, frame] of event.frames.entries()) {
      assert.equal(frame.maps.E_qualified.length, COUNT);
      assert.equal(frame.maps.F_skeleton.length, COUNT);
      assert.equal(frame.maps.D_support.length, COUNT);
      assert.equal(frame.maps.I_retained_network.length, COUNT);
      const E = asMask(frame.maps.E_qualified, event.id + ' E ' + anchorIndex);
      const F = asMask(frame.maps.F_skeleton, event.id + ' F ' + anchorIndex);
      const D = frame.maps.D_support;
      assert.ok(D.every(value => Number.isFinite(value) && value >= 0), event.id + ' D is finite/nonnegative');
      const reproduced = ops.zhangSuen(E);
      assert.deepEqual(Array.from(reproduced), Array.from(F), event.id + ' F reproduced from current source');
      fMatches.push({ eventId: event.id, anchorIndex, timeMs: frame.timeMs, exact: true });
      for (let i = 0; i < COUNT; i += 1) {
        assert.ok(!F[i] || E[i], event.id + ' F subset E');
        assert.ok(!frame.maps.I_retained_network[i] || F[i], event.id + ' production I subset F');
      }
    }
  }
  assert.equal(shaText(sourceText), CURRENT_SOURCE_LF_SHA);
  return { ops, refsById, fMatches };
}
function buildAnalysis(input, reference, sourceText, updateParity, captureParity) {
  const { ops, refsById, fMatches } = validateFrozenData(input, reference, sourceText);
  const events = input.events.map((event, index) => eventAnalysis(event, index, refsById.get(event.id), ops));
  const referenceRows = events.flatMap(event => event.registeredSharedAnchorParity);
  assert.equal(referenceRows.length, 10);
  assert.ok(referenceRows.every(row => row.exactNucleusMatch && row.exactXSetMatch));
  assert.equal(fMatches.length, 42);
  assert.ok(updateParity && updateParity.exactEParity === 42 && updateParity.exactIParity === 42,
    'prior UPDATE event E/I frozen-set parity');
  assert.ok(captureParity && captureParity.exactEParity === 10 && captureParity.exactFParity === 10
    && captureParity.exactDParity === 10, 'prior capture packet E/F/D parity');
  const inputBytes = readFileSync(INPUT);
  const referenceBytes = readFileSync(X_REFERENCE);
  return {
    schema: 'ant-materialization-fixed-nucleus-update-v1',
    authority: {
      currentProductionMain: CURRENT_MAIN,
      currentTrailPlateBirthBlob: CURRENT_SOURCE_BLOB,
      currentTrailPlateBirthLfSha256: CURRENT_SOURCE_LF_SHA,
      currentTrailPlateBirthRawSha256: input.source.sourceTrailPlateBirthSha256,
      historicalSourceCaptureSha256: input.source.sourceTrailPlateBirthSha256,
      historicalCaptureRelation: 'frozen structural histories from the prior 2026-10-28 production capture; no current-world trajectory replay'
    },
    definitions: {
      allocation: 'eligible nucleus is an edge-bearing F node; maximize D_support; exact tie resolves to lower row-major index by ascending scan',
      capture: '8-neighbor component containing the nucleus in F intersected with Euclidean disk radius 0.15 normalized world units; closed bound uses the registered 1e-12 numerical epsilon',
      update: 'n0 is the START max-D nucleus; each later state freshly captures X(n0,F_t); no reallocation, previous membership, union, repair, or hysteresis; stop after first n0 invalidation',
      stateless: 'at each anchor independently select current max-D edge-bearing F nucleus and capture X',
      membership: 'E_qualified, F_skeleton from current production Zhang-Suen thinning, D_support, and production I_retained_network are exact saved grid inputs',
      grid: { side: GRID, spacing: 1 / SCALE, connectivity: 8, graphDiagnosticEdgeLengths: 'orthogonal 1/95, diagonal sqrt(2)/95' }
    },
    inputs: {
      source: input.source,
      derivedPacket: { path: 'data/frozen-inputs.json.gz', gzipSha256: sha(inputBytes), bytes: inputBytes.length },
      registeredXReference: { path: 'data/registered-x-reference.json', sha256: sha(referenceBytes) },
      priorUpdateParity: updateParity,
      priorCaptureParity: captureParity
    },
    validation: {
      events: 2,
      anchors: fMatches.length,
      transitions: 40,
      exactP1P2TimesRetained: true,
      currentSourceFReproduction: { exactFrames: fMatches.length, frames: fMatches },
      registeredCaptureParity: { exactXSets: referenceRows.length, exactNuclei: referenceRows.length, anchors: referenceRows },
      priorUpdateInputParity: { exactE: updateParity.exactEParity, exactI: updateParity.exactIParity,
        exactTimes: updateParity.exactTimeParity },
      priorCaptureInputParity: { exactE: captureParity.exactEParity, exactF: captureParity.exactFParity,
        exactD: captureParity.exactDParity },
      observerRandomCalls: 0
    },
    events
  };
}
function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function toCsv(analysis) {
  const headers = ['event', 'transition', 'fromTimeMs', 'toTimeMs', 'nucleusChanged', 'fromNucleus', 'toNucleus',
    'allocationPreviousNucleusValid', 'I_lost', 'I_gained', 'I_jaccard', 'I_lost_noLongerE', 'I_lost_stillE_notF',
    'I_lost_stillF_outsideStatelessX', 'statelessX_lost', 'statelessX_gained', 'statelessX_jaccard',
    'statelessX_lost_noLongerE', 'statelessX_lost_stillE_notF', 'statelessX_lost_stillF_outsideX',
    'fixedX_lost', 'fixedX_gained', 'fixedX_jaccard', 'fixedX_lost_noLongerE', 'fixedX_lost_stillE_notF',
    'fixedX_lost_stillF_outsideX', 'sameNucleusRecapture_lost', 'sameNucleusRecapture_gained',
    'sameNucleusRecapture_jaccard', 'allocationOnly_lost', 'allocationOnly_gained', 'allocationOnly_jaccard'];
  const rows = [headers];
  for (const event of analysis.events) for (const row of event.transitionRows) {
    const I = row.productionI, X = row.statelessX, FX = row.fixedNucleusX;
    const IA = row.lostCellStateAtDestination.productionI ?? {};
    const XA = row.lostCellStateAtDestination.statelessX ?? {};
    const FA = row.lostCellStateAtDestination.fixedNucleusX ?? {};
    const local = row.statelessRecaptureUnderPreviousNucleus, alloc = row.currentFAllocationOnly;
    rows.push([event.displayId, row.transitionIndex, row.fromTimeMs, row.toTimeMs, row.statelessNucleusChanged,
      row.fromNucleus, row.toNucleus, row.previousNucleusStillEdgeBearingAtDestination,
      I.lost, I.gained, I.jaccard, IA.noLongerEQualified?.count, IA.stillEButThinnedOutOfF?.count,
      IA.stillFOutsideCapture?.count, X.lost, X.gained, X.jaccard, XA.noLongerEQualified?.count,
      XA.stillEButThinnedOutOfF?.count, XA.stillFOutsideCapture?.count, FX.lost, FX.gained, FX.jaccard,
      FA.noLongerEQualified?.count, FA.stillEButThinnedOutOfF?.count, FA.stillFOutsideCapture?.count,
      local.lost, local.gained, local.jaccard, alloc.lost, alloc.gained, alloc.jaccard]);
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}
function outputBytes(input, reference, sourceText, updateParity, captureParity) {
  const analysis = buildAnalysis(input, reference, sourceText, updateParity, captureParity);
  const cells = { schema: 'ant-materialization-fixed-nucleus-transition-cells-v1',
    events: analysis.events.map(event => ({ id: event.displayId, transitions: event.transitionCells })) };
  const validation = { schema: 'ant-materialization-fixed-nucleus-validation-v1', ...analysis.validation,
    sourceAuthority: analysis.authority, inputLineage: analysis.inputs };
  return new Map([
    ['analysis.json', Buffer.from(JSON.stringify(analysis, null, 2) + '\n')],
    ['transition-table.csv', Buffer.from(toCsv(analysis))],
    ['transition-cells.json', Buffer.from(JSON.stringify(cells, null, 2) + '\n')],
    ['validation.json', Buffer.from(JSON.stringify(validation, null, 2) + '\n')]
  ]);
}
function loadInput() { return JSON.parse(gunzipSync(readFileSync(INPUT)).toString('utf8')); }
function loadReferences() { return readJson(X_REFERENCE); }
function readStdin() { return new Promise((resolveRead, reject) => {
  const chunks = [];
  process.stdin.on('data', chunk => chunks.push(Buffer.from(chunk)));
  process.stdin.on('end', () => resolveRead(Buffer.concat(chunks)));
  process.stdin.on('error', reject);
}); }
function assertNoRandom() {
  const original = Math.random;
  Math.random = () => { throw new Error('observer attempted RNG use'); };
  return () => { Math.random = original; };
}
async function extractInput() {
  const gzip = await readStdin();
  assert.equal(sha(gzip), HISTORY_GZIP_SHA, 'original frozen history gzip hash');
  const raw = gunzipSync(gzip);
  assert.equal(sha(raw), HISTORY_JSON_SHA, 'original frozen history JSON hash');
  const packet = JSON.parse(raw.toString('utf8'));
  assert.equal(packet.schema, 'ant-omitted-history-packet-v1');
  assert.equal(packet.seed, 20261005);
  assert.equal(packet.audio, 'Off');
  assert.equal(packet.grid, GRID);
  const ranges = [
    { id: 'P1', sourceId: 'trail-plate-1', startMs: 64000, endMs: 85000 },
    { id: 'P2', sourceId: 'trail-plate-2', startMs: 86000, endMs: 107000 }
  ];
  const events = ranges.map(range => {
    const frames = packet.analyses.filter(row => row.simulationTimeMs >= range.startMs && row.simulationTimeMs < range.endMs);
    assert.equal(frames.length, 21, range.id + ' frozen anchor count');
    const expectedMapKeys = ['D_support', 'E_qualified', 'F_skeleton', 'I_retained_network'];
    return { id: range.id, sourceEventId: range.sourceId,
      startTimeMs: frames[0].simulationTimeMs, endTimeMs: frames.at(-1).simulationTimeMs,
      frames: frames.map(row => {
        for (const key of expectedMapKeys) assert.equal(row.maps[key]?.length, COUNT, range.id + ' map ' + key);
        return { tick: row.tick, timeMs: row.simulationTimeMs,
          maps: Object.fromEntries(expectedMapKeys.map(key => [key, Array.from(row.maps[key])])) };
      }) };
  });
  return {
    schema: 'ant-fixed-nucleus-update-input-v1',
    source: {
      commit: HISTORY_COMMIT, path: HISTORY_PATH, gzipSha256: HISTORY_GZIP_SHA, gzipBytes: gzip.length,
      rawJsonSha256: HISTORY_JSON_SHA, rawJsonBytes: raw.length,
      sourceMainAtCapture: packet.provenance.main, sourceTrailPlateBirthSha256: packet.provenance.sourceHashes['src/lib/agents/ant/TrailPlateBirth.js'],
      seed: packet.seed, hz: 60, audio: packet.audio, grid: packet.grid
    },
    events
  };
}
function extractRegisteredReference(text) {
  const prior = JSON.parse(text);
  assert.equal(prior.schema, 'ant-authored-materialization-v1');
  return {
    schema: 'ant-registered-x-reference-v1',
    source: { commit: CAPTURE_COMMIT,
      path: 'docs/ant/evidence/2026-10-29-authored-materialization-law-synthesis/analysis.json',
      inputPath: CAPTURE_PATH, inputGzipSha256: CAPTURE_GZIP_SHA },
    events: prior.events.map((event, i) => ({ id: i === 0 ? 'P1' : 'P2', anchors: event.anchors.map(anchor => ({
      timeMs: anchor.timeMs,
      nucleusIndex: anchor.nucleus.index,
      nucleusDSupport: anchor.nucleus.D,
      xCells: sorted(anchor.candidates.X.cells)
    })) }))
  };
}
function compareUpdatePacket(packetBytes, input) {
  assert.equal(sha(packetBytes), UPDATE_GZIP_SHA, 'prior UPDATE event packet raw hash');
  const packet = JSON.parse(gunzipSync(packetBytes).toString('utf8'));
  assert.equal(packet.schema, 'ant-event-evolution-frozen-input-v1');
  let exactEParity = 0, exactIParity = 0, exactTimeParity = 0;
  for (let eventIndex = 0; eventIndex < input.events.length; eventIndex += 1) {
    const current = input.events[eventIndex], prior = packet.events[eventIndex];
    assert.equal(current.sourceEventId, prior.id);
    assert.equal(current.frames.length, prior.frames.length);
    for (let i = 0; i < current.frames.length; i += 1) {
      const frame = current.frames[i], old = prior.frames[i];
      assert.equal(frame.timeMs, old.timeMs);
      exactTimeParity += 1;
      assert.deepEqual(indices(asMask(frame.maps.E_qualified, 'E')), sorted(old.E));
      exactEParity += 1;
      assert.deepEqual(indices(asMask(frame.maps.I_retained_network, 'I')), sorted(old.I));
      exactIParity += 1;
    }
  }
  assert.equal(exactTimeParity, 42);
  return { schema: 'ant-materialization-frozen-update-source-parity-v1',
    source: { commit: UPDATE_COMMIT, path: UPDATE_PATH, gzipSha256: UPDATE_GZIP_SHA, bytes: packetBytes.length },
    comparedFrames: exactTimeParity, exactTimeParity, exactEParity, exactIParity,
    note: 'The earlier 21-anchor packet agrees exactly for time, E and production I. H was not carried into this UPDATE analysis.' };
}
function compareCapturePacket(packetBytes, input) {
  assert.equal(sha(packetBytes), CAPTURE_GZIP_SHA, 'prior capture input raw hash');
  const packet = JSON.parse(gunzipSync(packetBytes).toString('utf8'));
  assert.equal(packet.schema, 'ant-emergence-frozen-v1');
  let exactEParity = 0, exactFParity = 0, exactDParity = 0;
  const packetEvents = packet.events;
  for (let eventIndex = 0; eventIndex < input.events.length; eventIndex += 1) {
    const event = input.events[eventIndex], prior = packetEvents[eventIndex];
    assert.equal(String(prior.id), String(eventIndex + 1));
    for (const old of prior.anchors) {
      const frame = event.frames.find(row => row.timeMs === old.timeMs);
      assert.ok(frame, event.id + ' prior capture time ' + old.timeMs);
      assert.deepEqual(frame.maps.E_qualified, old.maps.E_qualified);
      exactEParity += 1;
      assert.deepEqual(frame.maps.F_skeleton, old.maps.F_skeleton);
      exactFParity += 1;
      assert.deepEqual(frame.maps.D_support, old.maps.D_support);
      exactDParity += 1;
    }
  }
  assert.equal(exactEParity, 10);
  assert.equal(exactFParity, 10);
  assert.equal(exactDParity, 10);
  return { schema: 'ant-materialization-frozen-capture-source-parity-v1',
    source: { commit: CAPTURE_COMMIT, path: CAPTURE_PATH, gzipSha256: CAPTURE_GZIP_SHA, bytes: packetBytes.length },
    comparedSharedAnchors: exactEParity, exactEParity, exactFParity, exactDParity };
}
function writeOutputs() {
  const input = loadInput(), reference = loadReferences(), sourceText = readFileSync(SOURCE, 'utf8');
  const updateParity = readJson(UPDATE_PARITY), captureParity = readJson(CAPTURE_PARITY);
  const outputs = outputBytes(input, reference, sourceText, updateParity, captureParity);
  mkdirSync(BASE, { recursive: true });
  for (const [name, bytes] of outputs) writeFileSync(join(BASE, name), bytes);
  return outputs;
}
function checkOutputs() {
  const outputs = outputBytes(loadInput(), loadReferences(), readFileSync(SOURCE, 'utf8'),
    readJson(UPDATE_PARITY), readJson(CAPTURE_PARITY));
  for (const [name, expected] of outputs) assert.deepEqual(readFileSync(join(BASE, name)), expected, name + ' deterministic output');
  return { outputs: outputs.size, deterministic: true };
}
async function main() {
  const restoreRandom = assertNoRandom();
  try {
    const mode = process.argv[2] ?? '--write';
    if (mode === '--extract') {
      const packet = await extractInput();
      const compressed = gzipSync(Buffer.from(JSON.stringify(packet)), { level: 9, mtime: 0 });
      process.stdout.write(compressed);
      return;
    }
    if (mode === '--extract-registered-x') {
      const text = await readStdin();
      process.stdout.write(JSON.stringify(extractRegisteredReference(text.toString('utf8')), null, 2) + '\n');
      return;
    }
    if (mode === '--check-update-source') {
      const result = compareUpdatePacket(await readStdin(), loadInput());
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    if (mode === '--check-capture-source') {
      const result = compareCapturePacket(await readStdin(), loadInput());
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    if (mode === '--write') {
      const outputs = writeOutputs();
      const result = JSON.parse(outputs.get('analysis.json'));
      process.stdout.write(JSON.stringify({ written: [...outputs.keys()], events: result.events.map(event => ({
        id: event.displayId, startNucleus: event.startNucleus.index,
        firstInvalidAnchorIndex: event.nucleusValidity.firstInvalidAnchorIndex,
        productionIMeanJaccard: event.summaries.productionI.meanJaccard,
        statelessXMeanJaccard: event.summaries.statelessX.meanJaccard,
        fixedNucleusXMeanJaccard: event.summaries.fixedNucleusX.meanJaccard
      })), validation: result.validation }, null, 2) + '\n');
      return;
    }
    if (mode === '--check') {
      process.stdout.write(JSON.stringify(checkOutputs(), null, 2) + '\n');
      return;
    }
    throw new Error('unknown mode: ' + mode);
  } finally {
    restoreRandom();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
}
