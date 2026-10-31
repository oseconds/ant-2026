import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = join(ROOT, 'docs/ant/evidence/2026-10-31-materialization-e-incumbent-eligibility');
const INPUT = join(BASE, 'data/frozen-inputs.json.gz');
const REGISTERED_X = join(BASE, 'data/registered-x-reference.json');
const PRIOR_B = join(BASE, 'data/prior-b-reference.json');
const UPDATE_PARITY = join(BASE, 'data/update-source-parity.json');
const CAPTURE_PARITY = join(BASE, 'data/capture-source-parity.json');
const STOP_WITNESS = join(BASE, 'data/stop-witness.json');
const SOURCE = join(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js');
const GRID = 96;
const SCALE = GRID - 1;
const COUNT = GRID * GRID;
const RADIUS = 0.15;
const EPSILON = 1e-12;
const CURRENT_MAIN = '1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44';
const CURRENT_SOURCE_BLOB = '238cc365f2602dc6a22091d69237b88962825a13';
const CURRENT_SOURCE_RAW_SHA = '283de374bc38cd8baae47d99d253d43b71b800edbf4747d19d06299986c12860';
const CURRENT_SOURCE_LF_SHA = 'cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67';
const PREVIOUS_RESULT_COMMIT = '3ddf7a2fb08e6a91ce71f9edf3ec4c7c8237e386';
const PREVIOUS_INPUT_SHA = 'ec56df45a4e346f7ea79d3e368654b788dc08e8a9c4d40009df8fd57a80cd864';
const PREVIOUS_REGISTERED_X_SHA = '3315321b5bbe0599949d742e794236de1b855b98fe96669a6f1b5244764c0345';
const PREVIOUS_B_ANALYSIS_SHA = '0535b9aa419a6066a946e2a37e8e2bf56c903dd64532162c96544cc96a597f2c';
const PREVIOUS_B_REFERENCE_SHA = '395ec41625c9806f40321a3511b4230e04b30d03e73e62d2d463df3f5211ff07';
const UPDATE_PARITY_SHA = '9345bdfc776823873b54a3b6f29e6453537fa261107c8f88c1742b3591359719';
const CAPTURE_PARITY_SHA = '48f30bed540f2db400700504c2b09b35737acc4965c9e7b278f5cc2cc165bd68';
const HISTORY_PACKET_SHA = '909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc';
const HISTORY_JSON_SHA = 'fba546769a1ddc552247a93f5c2d3719193b8d4785ed672442dcae1960e25339';

function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function shaText(text) { return sha(Buffer.from(text.replace(/\r\n?/g, '\n'), 'utf8')); }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function sorted(values) { return [...values].sort((a, b) => a - b); }
function indices(mask) {
  const result = [];
  for (let i = 0; i < COUNT; i += 1) if (mask[i]) result.push(i);
  return result;
}
function asMask(values, label) {
  assert.ok(Array.isArray(values) || ArrayBuffer.isView(values), label + ' array');
  assert.equal(values.length, COUNT, label + ' grid length');
  const result = Uint8Array.from(values);
  for (const value of result) assert.ok(value === 0 || value === 1, label + ' binary mask');
  return result;
}
function point(index) {
  return { x: (index % GRID) / SCALE, y: Math.floor(index / GRID) / SCALE };
}
function diskMember(index, nucleus) {
  const dx = ((index % GRID) - (nucleus % GRID)) / SCALE;
  const dy = (Math.floor(index / GRID) - Math.floor(nucleus / GRID)) / SCALE;
  return Math.hypot(dx, dy) <= RADIUS + EPSILON;
}
function productionFunctions(sourceText) {
  const protectedMath = Object.create(Math);
  protectedMath.random = () => { throw new Error('analysis attempted RNG use'); };
  const neighborStart = sourceText.indexOf('function neighborValues(');
  const neighborEnd = sourceText.indexOf('function createPheromoneSampler(', neighborStart);
  const thinStart = sourceText.indexOf('function zhangSuen(');
  const thinEnd = sourceText.indexOf('function skeletonComponents(', thinStart);
  assert.ok(neighborStart >= 0 && neighborEnd > neighborStart, 'production neighbor helpers');
  assert.ok(thinStart >= 0 && thinEnd > thinStart, 'production Zhang-Suen helper');
  const code = 'const TRAIL_PLATE_GRID_SIZE=' + GRID + ';\n'
    + sourceText.slice(neighborStart, neighborEnd) + '\n'
    + sourceText.slice(thinStart, thinEnd) + '\n'
    + '({neighbors,zhangSuen})';
  return runInNewContext(code, { Math: protectedMath });
}
function edgeBearing(F, index, neighbors) {
  return Number.isInteger(index) && index >= 0 && index < COUNT && !!F[index]
    && neighbors(index).some(next => F[next]);
}
function maxDSupportedNucleus(F, D, neighbors) {
  let best = null, eligibleCount = 0;
  for (let i = 0; i < COUNT; i += 1) {
    if (!F[i] || !neighbors(i).some(next => F[next])) continue;
    eligibleCount += 1;
    if (best === null || D[i] > D[best]) best = i;
  }
  return best === null ? null : { index: best, support: D[best], eligibleCount };
}
function capture(mask, nucleus, neighbors) {
  assert.ok(mask[nucleus], 'capture nucleus must be in admissible set');
  const visited = new Uint8Array(COUNT), queue = [nucleus];
  const parent = new Int32Array(COUNT);
  parent.fill(-1);
  visited[nucleus] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    for (const next of neighbors(queue[head])) {
      if (mask[next] && !visited[next] && diskMember(next, nucleus)) {
        visited[next] = 1;
        parent[next] = queue[head];
        queue.push(next);
      }
    }
  }
  return { cells: indices(visited), visited, parent };
}
function pathToRoot(parent, cell, root) {
  const path = [cell];
  let current = cell;
  while (current !== root) {
    current = parent[current];
    assert.ok(current >= 0, 'treatment path reaches n0');
    path.push(current);
  }
  return path.reverse();
}
function stopForSignature(witness) {
  const error = new Error('locked Q-only signature violation');
  error.name = 'LockedQOnlySignatureViolation';
  error.witness = witness;
  throw error;
}
function setCompare(previous, current) {
  if (previous === null || current === null) return { status: 'unavailable' };
  const prev = new Set(previous), curr = new Set(current);
  const intersection = [], lost = [], gained = [];
  for (const cell of prev) (curr.has(cell) ? intersection : lost).push(cell);
  for (const cell of curr) if (!prev.has(cell)) gained.push(cell);
  const union = prev.size + curr.size - intersection.length;
  return {
    previousSize: prev.size, currentSize: curr.size, intersection: intersection.length,
    lost: lost.length, gained: gained.length, union,
    jaccard: union ? intersection.length / union : 1,
    lostCells: sorted(lost), gainedCells: sorted(gained)
  };
}
function setInsideDisk(mask, nucleus) {
  const result = new Uint8Array(COUNT);
  for (let i = 0; i < COUNT; i += 1) if (mask[i] && diskMember(i, nucleus)) result[i] = 1;
  return result;
}
function inducedMetrics(cells, nucleus, neighbors, diskCellCount, E) {
  const set = new Set(cells);
  let degreeTotal = 0, endpoints = 0, junctions = 0, articulationCount = 0, edges = 0;
  const degree = new Map();
  for (const cell of cells) {
    const value = neighbors(cell).filter(next => set.has(next)).length;
    degree.set(cell, value);
    degreeTotal += value;
    if (value === 1) endpoints += 1;
    if (value >= 3) junctions += 1;
  }
  edges = degreeTotal / 2;
  const discovery = new Map(), low = new Map(), parent = new Map(), articulation = new Set();
  let clock = 0;
  function visit(cell) {
    discovery.set(cell, ++clock);
    low.set(cell, clock);
    let children = 0;
    for (const next of neighbors(cell)) {
      if (!set.has(next)) continue;
      if (!discovery.has(next)) {
        parent.set(next, cell);
        children += 1;
        visit(next);
        low.set(cell, Math.min(low.get(cell), low.get(next)));
        if (!parent.has(cell) && children > 1) articulation.add(cell);
        if (parent.has(cell) && low.get(next) >= discovery.get(cell)) articulation.add(cell);
      } else if (parent.get(cell) !== next) {
        low.set(cell, Math.min(low.get(cell), discovery.get(next)));
      }
    }
  }
  if (cells.length) visit(nucleus);
  articulationCount = articulation.size;
  const distances = new Float64Array(COUNT);
  distances.fill(Infinity);
  distances[nucleus] = 0;
  const pending = [[0, nucleus]], seen = new Uint8Array(COUNT);
  while (pending.length) {
    pending.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const entry = pending.shift(), distance = entry[0], cell = entry[1];
    if (seen[cell]) continue;
    seen[cell] = 1;
    for (const next of neighbors(cell)) {
      if (!set.has(next) || seen[next]) continue;
      const diagonal = cell % GRID !== next % GRID
        && Math.floor(cell / GRID) !== Math.floor(next / GRID);
      const candidate = distance + (diagonal ? Math.SQRT2 : 1) / SCALE;
      if (candidate < distances[next]) {
        distances[next] = candidate;
        pending.push([candidate, next]);
      }
    }
  }
  let maxRadius = 0, maxGraphDistance = 0, localEInDisk = 0;
  for (let i = 0; i < COUNT; i += 1) if (E[i] && diskMember(i, nucleus)) localEInDisk += 1;
  for (const cell of cells) {
    assert.ok(Number.isFinite(distances[cell]), 'proposal remains connected to nucleus');
    const a = point(cell), b = point(nucleus);
    maxRadius = Math.max(maxRadius, Math.hypot(a.x - b.x, a.y - b.y));
    maxGraphDistance = Math.max(maxGraphDistance, distances[cell]);
  }
  return {
    nodes: cells.length, inducedEdges: edges, connected: cells.length > 0 && seen[nucleus] === 1,
    endpoints, junctionNodes: junctions, articulationNodes: articulationCount,
    maxEuclideanRadius: maxRadius, maxWeightedGraphDistance: maxGraphDistance,
    cycleRank: edges - cells.length + 1,
    densityInsideDisk: cells.length / diskCellCount,
    localECount: localEInDisk,
    fractionOfLocalE: localEInDisk ? cells.length / localEInDisk : null,
    degrees: Object.fromEntries(cells.map(cell => [cell, degree.get(cell)])),
    articulationCells: sorted(articulation)
  };
}
function runsOfAnchors(anchorIndices, frames) {
  if (!anchorIndices.length) return [];
  const runs = [];
  let start = anchorIndices[0], previous = start;
  for (let i = 1; i <= anchorIndices.length; i += 1) {
    const next = anchorIndices[i];
    if (next === previous + 1) { previous = next; continue; }
    runs.push({
      startAnchor: start, endAnchor: previous, consecutiveAnchorCount: previous - start + 1,
      startTimeMs: frames[start].timeMs, endTimeMs: frames[previous].timeMs
    });
    if (next !== undefined) start = previous = next;
  }
  return runs;
}
function summarizeCounts(values) {
  if (!values.length) return { count: 0, min: null, median: null, max: null, mean: null };
  const sortedValues = sorted(values);
  const mid = Math.floor(sortedValues.length / 2);
  const median = sortedValues.length % 2
    ? sortedValues[mid] : (sortedValues[mid - 1] + sortedValues[mid]) / 2;
  return {
    count: values.length, min: sortedValues[0], median, max: sortedValues.at(-1),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length
  };
}
function validateInputs(inputBytes, input, registeredBytes, registered, priorBBytes, priorB,
  updateParityBytes, updateParity, captureParityBytes, captureParity, sourceRaw, sourceText) {
  assert.equal(sha(inputBytes), PREVIOUS_INPUT_SHA, 'exact previous frozen-input packet');
  assert.equal(sha(registeredBytes), PREVIOUS_REGISTERED_X_SHA, 'exact registered-X reference');
  assert.equal(sha(priorBBytes), PREVIOUS_B_REFERENCE_SHA, 'exact prior B reference');
  assert.equal(sha(updateParityBytes), UPDATE_PARITY_SHA, 'exact prior UPDATE parity receipt');
  assert.equal(sha(captureParityBytes), CAPTURE_PARITY_SHA, 'exact prior capture parity receipt');
  assert.equal(input.schema, 'ant-fixed-nucleus-update-input-v1');
  assert.equal(input.source.gzipSha256, HISTORY_PACKET_SHA);
  assert.equal(input.source.rawJsonSha256, HISTORY_JSON_SHA);
  assert.equal(input.source.seed, 20261005);
  assert.equal(input.source.hz, 60);
  assert.equal(input.source.audio, 'Off');
  assert.equal(input.source.grid, GRID);
  assert.equal(input.source.sourceTrailPlateBirthSha256, CURRENT_SOURCE_RAW_SHA);
  assert.equal(sha(sourceRaw), CURRENT_SOURCE_RAW_SHA, 'current production source raw bytes');
  assert.equal(shaText(sourceText), CURRENT_SOURCE_LF_SHA, 'current production source LF bytes');
  const sourceLf = Buffer.from(sourceText.replace(/\r\n?/g, '\n'), 'utf8');
  const blobHash = createHash('sha1')
    .update(Buffer.concat([Buffer.from('blob ' + sourceLf.length + '\0'), sourceLf])).digest('hex');
  assert.equal(blobHash, CURRENT_SOURCE_BLOB, 'current production TrailPlateBirth Git blob');
  assert.equal(priorB.schema, 'ant-e-eligibility-prior-fixed-x-reference-v1');
  assert.equal(priorB.source.commit, PREVIOUS_RESULT_COMMIT);
  assert.equal(priorB.source.sha256, PREVIOUS_B_ANALYSIS_SHA);
  assert.equal(priorB.source.frozenInputSha256, PREVIOUS_INPUT_SHA);
  assert.equal(priorB.source.registeredXReferenceSha256, PREVIOUS_REGISTERED_X_SHA);
  assert.equal(updateParity.exactTimeParity, 42);
  assert.equal(updateParity.exactEParity, 42);
  assert.equal(updateParity.exactIParity, 42);
  assert.equal(captureParity.exactEParity, 10);
  assert.equal(captureParity.exactFParity, 10);
  assert.equal(captureParity.exactDParity, 10);
  assert.equal(registered.schema, 'ant-registered-x-reference-v1');
  assert.equal(input.events.length, 2);
  assert.equal(priorB.events.length, 2);
  assert.equal(registered.events.reduce((sum, event) => sum + event.anchors.length, 0), 10);
  return { ops: productionFunctions(sourceText), updateParity, captureParity };
}
function eventAnalysis(event, eventIndex, priorEvent, registeredEvent, ops, sourceParity) {
  assert.equal(event.id, priorEvent.id);
  assert.equal(event.frames.length, 21);
  assert.equal(event.frames[0].timeMs, priorEvent.startTimeMs);
  assert.equal(event.frames.at(-1).timeMs, priorEvent.endTimeMs);
  const frames = event.frames.map((frame, index) => {
    const maps = frame.maps;
    const E = asMask(maps.E_qualified, event.id + ' E[' + index + ']');
    const F = asMask(maps.F_skeleton, event.id + ' F[' + index + ']');
    const I = asMask(maps.I_retained_network, event.id + ' I[' + index + ']');
    const D = Float64Array.from(maps.D_support);
    assert.equal(D.length, COUNT);
    assert.ok(D.every(Number.isFinite), event.id + ' finite D values');
    const reproducedF = ops.zhangSuen(E);
    assert.deepEqual(Array.from(reproducedF), Array.from(F),
      event.id + ' F reproduced by current production thinning at anchor ' + index);
    for (let cell = 0; cell < COUNT; cell += 1) {
      assert.ok(!F[cell] || E[cell], event.id + ' F subset E');
      assert.ok(!I[cell] || F[cell], event.id + ' production I subset F');
    }
    return { tick: frame.tick, timeMs: frame.timeMs, E, F, I, D };
  });
  const start = maxDSupportedNucleus(frames[0].F, frames[0].D, ops.neighbors);
  assert.ok(start, event.id + ' START max-D nucleus exists');
  assert.equal(start.index, priorEvent.startNucleus, event.id + ' START nucleus matches previous pass');
  const n0 = start.index;
  const referenceByTime = new Map(priorEvent.anchors.map(anchor => [anchor.timeMs, anchor]));
  const registeredByTime = new Map(registeredEvent.anchors.map(anchor => [anchor.timeMs, anchor]));
  const fReproduction = [], bReproduction = [], registeredXMatches = [];
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i], prior = priorEvent.anchors[i];
    assert.equal(frame.timeMs, prior.timeMs, event.id + ' exact previous B anchor time');
    const nucleusValid = edgeBearing(frame.F, n0, ops.neighbors);
    const b = nucleusValid ? capture(frame.F, n0, ops.neighbors).cells : null;
    assert.equal(prior.nucleus, n0, event.id + ' prior fixed nucleus at anchor ' + i);
    assert.deepEqual(b, prior.cells, event.id + ' exact prior B membership at anchor ' + i);
    bReproduction.push({ anchorIndex: i, timeMs: frame.timeMs, n0, nodes: b.length, exact: true });
    fReproduction.push({ anchorIndex: i, timeMs: frame.timeMs, exact: true });
    const registered = registeredByTime.get(frame.timeMs);
    if (registered) {
      const maxD = maxDSupportedNucleus(frame.F, frame.D, ops.neighbors);
      assert.ok(maxD, event.id + ' registered stateless nucleus exists');
      assert.equal(maxD.index, registered.nucleusIndex, event.id + ' registered max-D nucleus');
      assert.deepEqual(capture(frame.F, maxD.index, ops.neighbors).cells, registered.xCells,
        event.id + ' registered stateless X');
      registeredXMatches.push({ anchorIndex: i, timeMs: frame.timeMs, nucleus: maxD.index, exact: true });
    }
  }
  assert.equal(bReproduction.length, 21);
  assert.equal(registeredXMatches.length, registeredEvent.anchors.length);
  let stopped = false, firstInvalid = null, previousQ = null;
  const states = [];
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i], validF = edgeBearing(frame.F, n0, ops.neighbors);
    const b = !stopped && validF ? capture(frame.F, n0, ops.neighbors).cells : null;
    let incumbent = new Uint8Array(COUNT), admissible = new Uint8Array(COUNT);
    if (!stopped) {
      if (i > 0 && previousQ) {
        for (const cell of previousQ) if (frame.E[cell] && diskMember(cell, n0)) incumbent[cell] = 1;
      }
      for (let cell = 0; cell < COUNT; cell += 1) {
        if (diskMember(cell, n0) && (frame.F[cell] || incumbent[cell])) admissible[cell] = 1;
      }
    }
    const treatmentNucleusInAdmissible = !!admissible[n0];
    if (!validF && !stopped) {
      firstInvalid = { anchorIndex: i, timeMs: frame.timeMs };
      stopped = true;
    }
    let q = null, qVisited = null, qParent = null;
    if (!stopped) {
      if (i === 0) {
        q = b;
        qVisited = new Uint8Array(COUNT);
        for (const cell of q) qVisited[cell] = 1;
        qParent = new Int32Array(COUNT);
        qParent.fill(-1);
      } else {
        const captured = capture(admissible, n0, ops.neighbors);
        q = captured.cells;
        qVisited = captured.visited;
        qParent = captured.parent;
      }
    }
    if (b !== null && q !== null) {
      const bSet = new Set(b), previousQSet = previousQ === null ? null : new Set(previousQ);
      for (const cell of q) {
        if (bSet.has(cell)) continue;
        const signature = {
          previousQMember: !!previousQSet?.has(cell), currentE: !!frame.E[cell],
          currentF: !!frame.F[cell], connectedThroughAdmissibleGraph: !!qVisited[cell],
          outsideCurrentB: !bSet.has(cell), withinDisk: diskMember(cell, n0)
        };
        if (!signature.previousQMember || !signature.currentE || signature.currentF
          || !signature.connectedThroughAdmissibleGraph || !signature.withinDisk) {
          const path = pathToRoot(qParent, cell, n0);
          stopForSignature({
            event: event.id, anchorIndex: i, timeMs: frame.timeMs, nucleus: n0, cell,
            nucleusEdgeBearingInCurrentF: edgeBearing(frame.F, n0, ops.neighbors), signature,
            pathFromN0ThroughAdmissibleGraph: path.map(pathCell => ({
              cell: pathCell, currentF: !!frame.F[pathCell], currentE: !!frame.E[pathCell],
              previousQ: !!previousQSet?.has(pathCell),
              incumbentOnly: !!previousQSet?.has(pathCell) && !!frame.E[pathCell] && !frame.F[pathCell],
              distanceFromNucleus: Math.hypot(point(pathCell).x - point(n0).x,
                point(pathCell).y - point(n0).y)
            })),
            priorBSize: b.length, treatmentQSize: q.length,
            currentFComponentExcludesCell: !bSet.has(cell),
            priorBExactAnchorsValidated: (eventIndex * 21) + bReproduction.length,
            currentFExactAnchorsValidated: (eventIndex * 21) + fReproduction.length,
            exactStartNucleiValidated: eventIndex + 1,
            registeredStatelessXAnchorsValidated: (eventIndex * 5) + registeredXMatches.length,
            priorSourceParity: sourceParity,
            interpretationStopped: true
          });
        }
      }
    }
    const state = {
      anchorIndex: i, timeMs: frame.timeMs, nucleusValidInF: validF,
      treatmentNucleusInAdmissible, admissibleSize: indices(admissible).length,
      incumbentCandidateSize: indices(incumbent).length, B: b, Q: q,
      admissible, qVisited, qParent, sequenceStatus: stopped ? 'NUCLEUS_INVALID_STOP' : 'ACTIVE'
    };
    states.push(state);
    previousQ = q === null ? null : new Set(q);
  }
  const anchorRows = [];
  const transitionRows = [], transitionReceipts = [];
  const exitedQ = new Map(), reentriesViaF = [], blockedWithoutFreshF = [];
  let reentryChecks = 0;
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i], state = states[i], prevState = states[i - 1] ?? null;
    const bSet = state.B === null ? null : new Set(state.B);
    const qSet = state.Q === null ? null : new Set(state.Q);
    const prevQSet = prevState?.Q === null || !prevState ? null : new Set(prevState.Q);
    const qOnly = bSet && qSet ? sorted([...qSet].filter(cell => !bSet.has(cell))) : [];
    const directSignature = [];
    if (qOnly.length) {
      assert.ok(i > 0 && prevQSet, event.id + ' Q-only cells require previous Q');
      for (const cell of qOnly) {
        const signature = {
          cell, previousQMember: prevQSet.has(cell), currentE: !!frame.E[cell],
          currentF: !!frame.F[cell], connectedThroughAdmissibleGraph: !!state.qVisited[cell],
          admissible: !!state.admissible[cell],
          distanceFromNucleus: Math.hypot(point(cell).x - point(n0).x, point(cell).y - point(n0).y)
        };
        assert.ok(signature.previousQMember, event.id + ' Q-only must belong to previous Q');
        assert.ok(signature.currentE, event.id + ' Q-only must remain E-qualified');
        assert.ok(!signature.currentF, event.id + ' Q-only must be absent from current F');
        assert.ok(signature.connectedThroughAdmissibleGraph && signature.admissible,
          event.id + ' Q-only must connect through current treatment admissibility');
        if (signature.currentF) {
          const path = pathToRoot(state.qParent, cell, n0);
          stopForSignature({
            event: event.id, anchorIndex: i, timeMs: frame.timeMs, nucleus: n0, cell,
            signature: {
              previousQMember: signature.previousQMember, currentE: signature.currentE,
              currentF: signature.currentF, connectedThroughAdmissibleGraph: signature.connectedThroughAdmissibleGraph,
              outsideCurrentB: !bSet.has(cell), withinDisk: diskMember(cell, n0)
            },
            pathFromN0ThroughAdmissibleGraph: path.map(pathCell => ({
              cell: pathCell, currentF: !!frame.F[pathCell], currentE: !!frame.E[pathCell],
              previousQ: prevQSet.has(pathCell),
              incumbentOnly: !!prevQSet.has(pathCell) && !!frame.E[pathCell] && !frame.F[pathCell],
              distanceFromNucleus: Math.hypot(point(pathCell).x - point(n0).x,
                point(pathCell).y - point(n0).y)
            })),
            priorBSize: state.B.length, treatmentQSize: state.Q.length,
            currentFComponentExcludesCell: !bSet.has(cell),
            priorBExactAnchorsValidated: (eventIndex * 21) + 21,
            currentFExactAnchorsValidated: (eventIndex * 21) + 21,
            registeredStatelessXAnchorsValidated: 10,
            interpretationStopped: true
          });
        }
        directSignature.push(signature);
      }
    }
    if (bSet && qSet) {
      for (const cell of bSet) assert.ok(qSet.has(cell), event.id + ' treatment must contain fresh fixed X');
      const qOnlyNotF = [...qSet].filter(cell => !frame.F[cell]);
      assert.equal(qOnly.length, qOnlyNotF.length, event.id + ' Q-only equals incumbent-only membership');
      for (const cell of qSet) assert.ok(frame.E[cell], event.id + ' every Q member remains E-qualified');
    }
    if (qSet) {
      for (const [cell, exitAnchor] of exitedQ) {
        reentryChecks += 1;
        if (qSet.has(cell)) {
          assert.ok(frame.F[cell], event.id + ' cell exited Q at ' + exitAnchor
            + ' and may re-enter only through current F at anchor ' + i + ' (cell ' + cell + ')');
          reentriesViaF.push({ cell, exitedAtAnchor: exitAnchor, anchorIndex: i, timeMs: frame.timeMs });
          exitedQ.delete(cell);
        } else if (frame.E[cell] && !frame.F[cell]) {
          blockedWithoutFreshF.push({ cell, anchorIndex: i, timeMs: frame.timeMs });
        }
      }
    }
    const diskCellCount = indices(setInsideDisk(new Uint8Array(COUNT).fill(1), n0)).length;
    const bMetrics = state.B === null ? null : inducedMetrics(state.B, n0, ops.neighbors, diskCellCount, frame.E);
    const qMetrics = state.Q === null ? null : inducedMetrics(state.Q, n0, ops.neighbors, diskCellCount, frame.E);
    const localE = indices(setInsideDisk(frame.E, n0)).length;
    const bVsQ = setCompare(state.B, state.Q);
    const I = indices(frame.I);
    const IvsB = setCompare(I, state.B), IvsQ = setCompare(I, state.Q);
    const currentFCount = qSet ? [...qSet].filter(cell => frame.F[cell]).length : null;
    const incumbentOnlyCount = qSet ? [...qSet].filter(cell => !frame.F[cell]).length : null;
    const previousECount = prevQSet ? [...prevQSet].filter(cell => frame.E[cell]).length : null;
    const qOnlyDegrees = qMetrics?.degrees ?? {};
    const qOnlyArticulation = new Set(qMetrics?.articulationCells ?? []);
    anchorRows.push({
      anchorIndex: i, timeMs: frame.timeMs, seconds: frame.timeMs / 1000,
      nucleus: { index: n0, validInCurrentF: state.nucleusValidInF,
        treatmentWouldAdmitAtInvalidation: state.treatmentNucleusInAdmissible,
        admissibleSize: state.admissibleSize, incumbentCandidateSize: state.incumbentCandidateSize,
        sequenceStatus: state.sequenceStatus },
      sizes: { E: indices(frame.E).length, F: indices(frame.F).length, productionI: I.length,
        localEInsideDisk: localE, B: state.B?.length ?? null, Q: state.Q?.length ?? null },
      memberships: { B: state.B, Q: state.Q },
      QOnlyRelativeToB: directSignature.map(row => ({ ...row,
        currentQDegree: qOnlyDegrees[row.cell], articulationInQ: qOnlyArticulation.has(row.cell) })),
      sameAnchor: {
        BvsQ: bVsQ,
        QoverB: state.B && state.Q ? state.Q.length / state.B.length : null,
        QOnlyFraction: qSet?.size ? qOnly.length / qSet.size : null,
        BLocalEFraction: localE ? state.B?.length / localE : null,
        QLocalEFraction: localE ? state.Q?.length / localE : null,
        QPresentInCurrentF: currentFCount, QRetainedOnlyThroughIncumbent: incumbentOnlyCount,
        previousQStillEQualified: previousECount
      },
      structure: { B: bMetrics, Q: qMetrics },
      productionI: { size: I.length, versusB: IvsB, versusQ: IvsQ }
    });
    if (i > 0) {
      const prior = states[i - 1];
      const bTransition = setCompare(prior.B, state.B);
      const qTransition = setCompare(prior.Q, state.Q);
      let qLossPartition = null, qRetainedPartition = null, qGainsFromF = null;
      if (qTransition.status !== 'unavailable') {
        const qLostNoLongerE = [], qLostStillEConnectivity = [];
        const currentAdmissible = new Set(indices(state.admissible));
        for (const cell of qTransition.lostCells) {
          if (!frame.E[cell]) qLostNoLongerE.push(cell);
          else {
            assert.ok(currentAdmissible.has(cell), event.id + ' E-qualified Q loss remained admissible');
            assert.ok(!qSet.has(cell), event.id + ' E-qualified Q loss is disconnected');
            qLostStillEConnectivity.push(cell);
          }
        }
        const retained = qTransition.intersection > 0
          ? prior.Q.filter(cell => qSet.has(cell)) : [];
        const retainedCurrentF = retained.filter(cell => frame.F[cell]);
        const retainedIncumbentOnly = retained.filter(cell => frame.E[cell] && !frame.F[cell]);
        assert.equal(retainedCurrentF.length + retainedIncumbentOnly.length, retained.length);
        qLossPartition = {
          noLongerE: qLostNoLongerE, stillEButDisconnected: qLostStillEConnectivity,
          nucleusInvalidation: []
        };
        qRetainedPartition = { presentInCurrentF: retainedCurrentF, incumbentOnlyStillE: retainedIncumbentOnly };
        qGainsFromF = qTransition.gainedCells.filter(cell => frame.F[cell]);
        assert.equal(qGainsFromF.length, qTransition.gained,
          event.id + ' all new Q members must enter through current F');
      } else if (prior.Q !== null && state.sequenceStatus === 'NUCLEUS_INVALID_STOP') {
        qLossPartition = {
          noLongerE: [], stillEButDisconnected: [],
          nucleusInvalidation: prior.Q.slice()
        };
      }
      const row = {
        transitionIndex: i - 1, fromTimeMs: prior.timeMs, toTimeMs: state.timeMs,
        elapsedSeconds: (state.timeMs - prior.timeMs) / 1000,
        n0ValidInCurrentF: state.nucleusValidInF,
        B: bTransition, Q: qTransition,
        QLossPartition: qLossPartition, QRetainedPartition: qRetainedPartition,
        QGainsFromCurrentF: qGainsFromF,
        QOnlyCountAtDestination: qOnly.length,
        QoverBAtDestination: state.B && state.Q ? state.Q.length / state.B.length : null,
        QOnlyFractionAtDestination: qSet?.size ? qOnly.length / qSet.size : null,
        QLocalEFractionAtDestination: localE && state.Q ? state.Q.length / localE : null
      };
      transitionRows.push(row);
      transitionReceipts.push({
        transitionIndex: i - 1, fromTimeMs: prior.timeMs, toTimeMs: state.timeMs,
        B: bTransition.status === 'unavailable' ? bTransition
          : { lostCells: bTransition.lostCells, gainedCells: bTransition.gainedCells },
        Q: qTransition.status === 'unavailable' ? qTransition
          : { lostCells: qTransition.lostCells, gainedCells: qTransition.gainedCells },
        QLossPartition: qLossPartition, QRetainedPartition: qRetainedPartition,
        QGainsFromCurrentF: qGainsFromF
      });
      if (prior.Q) {
        const nextSet = state.Q === null ? new Set() : new Set(state.Q);
        for (const cell of prior.Q) if (!nextSet.has(cell) && !exitedQ.has(cell)) exitedQ.set(cell, i - 1);
      }
    }
  }
  const qOnlyByCell = new Map();
  for (const anchor of anchorRows) for (const row of anchor.QOnlyRelativeToB) {
    if (!qOnlyByCell.has(row.cell)) qOnlyByCell.set(row.cell, []);
    qOnlyByCell.get(row.cell).push({ anchorIndex: anchor.anchorIndex, timeMs: anchor.timeMs,
      distanceFromNucleus: row.distanceFromNucleus, degree: row.currentQDegree,
      articulationInQ: row.articulationInQ });
  }
  const staleCells = [];
  for (const [cell, appearances] of [...qOnlyByCell].sort((a, b) => a[0] - b[0])) {
    const qOnlyAnchors = appearances.map(row => row.anchorIndex);
    const absentFRuns = runsOfAnchors(qOnlyAnchors, frames);
    const firstIndex = qOnlyAnchors[0];
    const returnIndex = frames.findIndex((frame, index) => index > firstIndex && frame.F[cell]);
    const leaveEIndex = frames.findIndex((frame, index) => index > firstIndex && !frame.E[cell]);
    staleCells.push({
      cell, firstQOnlyAnchor: firstIndex, firstQOnlyTimeMs: frames[firstIndex].timeMs,
      distanceFromNucleus: appearances[0].distanceFromNucleus,
      totalEpisodeAnchorsRetainedAbsentFromF: appearances.length,
      maxConsecutiveAnchorsRetainedAbsentFromF: Math.max(...absentFRuns.map(run => run.consecutiveAnchorCount)),
      absentFRuns, rolesByAnchor: appearances,
      returnsToFWithinWindow: returnIndex >= 0,
      firstReturnToFAnchor: returnIndex >= 0 ? returnIndex : null,
      firstReturnToFTimeMs: returnIndex >= 0 ? frames[returnIndex].timeMs : null,
      leavesEWithinWindow: leaveEIndex >= 0,
      firstEExitAnchor: leaveEIndex >= 0 ? leaveEIndex : null,
      firstEExitTimeMs: leaveEIndex >= 0 ? frames[leaveEIndex].timeMs : null,
      rightCensoredAtWindowEnd: returnIndex < 0 && leaveEIndex < 0
    });
  }
  const armSummary = key => {
    const rows = transitionRows.map(row => row[key]).filter(row => row.status !== 'unavailable');
    return {
      validTransitions: rows.length,
      meanJaccard: rows.length ? rows.reduce((sum, row) => sum + row.jaccard, 0) / rows.length : null,
      totalLostOccurrences: rows.reduce((sum, row) => sum + row.lost, 0),
      totalGainedOccurrences: rows.reduce((sum, row) => sum + row.gained, 0)
    };
  };
  const qOnlyAppearances = anchorRows.flatMap(row => row.QOnlyRelativeToB);
  const retentionRuns = staleCells.flatMap(row => row.absentFRuns.map(run => run.consecutiveAnchorCount));
  const ratios = anchorRows.map(row => row.sameAnchor.QoverB).filter(Number.isFinite);
  const qLocalEFractions = anchorRows.map(row => row.sameAnchor.QLocalEFraction).filter(Number.isFinite);
  const qOnlyFractions = anchorRows.map(row => row.sameAnchor.QOnlyFraction).filter(Number.isFinite);
  return {
    id: event.id, displayId: event.id, startTimeMs: frames[0].timeMs, endTimeMs: frames.at(-1).timeMs,
    anchors: frames.length, transitions: frames.length - 1, startNucleus: start,
    nucleusValidity: { firstInvalid, allAnchorsValid: firstInvalid === null,
      timeline: states.map(state => ({ anchorIndex: state.anchorIndex, timeMs: state.timeMs,
        validInCurrentF: state.nucleusValidInF,
        treatmentWouldAdmitAtInvalidation: state.treatmentNucleusInAdmissible,
        sequenceStatus: state.sequenceStatus })) },
    validation: { exactBReproduction: bReproduction, exactRegisteredXMatches: registeredXMatches,
      QOnlySignatureCells: qOnlyAppearances.length,
      QOnlySignatureViolations: 0, reentryChecks,
      reentriesViaFreshF: reentriesViaF, blockedEQualifiedReentryWithoutF: blockedWithoutFreshF,
      reentryViolations: 0 },
    summaries: {
      B: armSummary('B'), Q: armSummary('Q'),
      qOnlyMembershipOccurrences: qOnlyAppearances.length,
      qOnlyUniqueCells: staleCells.length,
      qOnlyPerAnchorFraction: summarizeCounts(qOnlyFractions),
      QoverBPerAnchor: summarizeCounts(ratios),
      QLocalEFractionPerAnchor: summarizeCounts(qLocalEFractions),
      QOnlyRetainedDurationInAnchors: summarizeCounts(retentionRuns),
      uniqueQOnlyCellOutcomes: {
        total: staleCells.length,
        returnedToF: staleCells.filter(row => row.returnsToFWithinWindow).length,
        laterLeftE: staleCells.filter(row => row.leavesEWithinWindow).length,
        rightCensored: staleCells.filter(row => row.rightCensoredAtWindowEnd).length
      }
    },
    anchors: anchorRows, transitions: transitionRows, transitionReceipts,
    QOnlyCellHistory: staleCells
  };
}
function buildAnalysis() {
  const inputBytes = readFileSync(INPUT), registeredBytes = readFileSync(REGISTERED_X);
  const priorBBytes = readFileSync(PRIOR_B), updateParityBytes = readFileSync(UPDATE_PARITY);
  const captureParityBytes = readFileSync(CAPTURE_PARITY), sourceRaw = readFileSync(SOURCE);
  const sourceText = sourceRaw.toString('utf8');
  const input = JSON.parse(gunzipSync(inputBytes).toString('utf8'));
  const registered = JSON.parse(registeredBytes.toString('utf8'));
  const priorB = JSON.parse(priorBBytes.toString('utf8'));
  const updateParity = JSON.parse(updateParityBytes.toString('utf8'));
  const captureParity = JSON.parse(captureParityBytes.toString('utf8'));
  const validated = validateInputs(inputBytes, input, registeredBytes, registered, priorBBytes, priorB,
    updateParityBytes, updateParity, captureParityBytes, captureParity, sourceRaw, sourceText);
  const ops = validated.ops;
  const events = input.events.map((event, index) => {
    const priorEvent = priorB.events[index];
    const registeredEvent = registered.events.find(row => row.id === event.id);
    assert.ok(registeredEvent, event.id + ' registered X event');
    return eventAnalysis(event, index, priorEvent, registeredEvent, ops, {
      updateSourceParity: validated.updateParity, captureSourceParity: validated.captureParity
    });
  });
  assert.equal(events.reduce((sum, event) => sum + event.validation.exactBReproduction.length, 0), 42);
  assert.equal(events.reduce((sum, event) => sum + event.validation.exactRegisteredXMatches.length, 0), 10);
  assert.ok(events.every(event => event.validation.QOnlySignatureViolations === 0
    && event.validation.reentryViolations === 0));
  return {
    schema: 'ant-materialization-e-incumbent-eligibility-v1',
    authority: {
      currentProductionMain: CURRENT_MAIN,
      previousFixedNucleusResultCommit: PREVIOUS_RESULT_COMMIT,
      currentTrailPlateBirthBlob: CURRENT_SOURCE_BLOB,
      currentTrailPlateBirthRawSha256: CURRENT_SOURCE_RAW_SHA,
      currentTrailPlateBirthLfSha256: CURRENT_SOURCE_LF_SHA
    },
    definitions: {
      START: 'edge-bearing F node with maximum D_support; exact ties choose lower row-major index; selected once then n0 is frozen',
      B: 'nucleus-connected component containing n0 inside current F intersected with closed Euclidean disk radius 0.15',
      Q: 'Q0=B0; later admissible=F(t) union (Q(t-1) intersect E(t)); Q is the n0-connected component inside the same disk',
      QLimit: 'new members enter only through current F; prior members persist only while current E-qualified; no archive, time threshold, score, repair, reallocation or out-of-disk membership',
      nucleusValidity: 'n0 must remain edge-bearing in current F; stop the entire event at first invalid anchor even if treatment admissibility would include n0',
      grid: { side: GRID, spacing: 1 / SCALE, connectivity: 8, radius: RADIUS,
        graphMetric: 'orthogonal 1/95, diagonal sqrt(2)/95; diagnostic only' }
    },
    inputs: {
      frozenInput: { path: 'data/frozen-inputs.json.gz', sha256: sha(inputBytes), bytes: inputBytes.length,
        sourceCommit: input.source.commit, sourcePath: input.source.path,
        sourcePacketSha256: input.source.gzipSha256, decodedPacketSha256: input.source.rawJsonSha256 },
      previousBReference: { path: 'data/prior-b-reference.json', sha256: sha(priorBBytes),
        sourceCommit: priorB.source.commit, previousAnalysisSha256: priorB.source.sha256 },
      registeredXReference: { path: 'data/registered-x-reference.json', sha256: sha(registeredBytes) },
      observerRandomCalls: 0
    },
    validation: {
      events: events.length, anchors: events.reduce((sum, event) => sum + event.anchors, 0),
      transitions: events.reduce((sum, event) => sum + event.transitions, 0),
      exactBReproduction: events.reduce((sum, event) => sum + event.validation.exactBReproduction.length, 0),
      exactStartNuclei: events.every(event => event.startNucleus.index === event.anchors[0].nucleus.index),
      currentSourceFReproduction: 42, registeredStatelessXParity: 10,
      QOnlySignatureViolations: 0, reentryViolations: 0,
      firstInvalidation: events.map(event => ({ event: event.id, ...event.nucleusValidity })),
      note: 'No simulation, RNG draw, candidate world or trajectory replay; all computations use the frozen packet.'
    },
    events
  };
}
function csv(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function outputBytes() {
  const analysis = buildAnalysis();
  const receipts = {
    schema: 'ant-materialization-e-incumbent-membership-receipts-v1',
    events: analysis.events.map(event => ({
      id: event.id,
      anchors: event.anchors.map(row => ({ anchorIndex: row.anchorIndex, timeMs: row.timeMs,
        B: row.memberships.B, Q: row.memberships.Q, QOnlyRelativeToB: row.QOnlyRelativeToB })),
      transitions: event.transitionReceipts,
      QOnlyCellHistory: event.QOnlyCellHistory,
      reentryValidation: event.validation
    }))
  };
  const headers = [
    'event', 'transition', 'fromTimeMs', 'toTimeMs', 'n0ValidInF',
    'B_previous', 'B_current', 'B_intersection', 'B_lost', 'B_gained', 'B_union', 'B_jaccard',
    'Q_previous', 'Q_current', 'Q_intersection', 'Q_lost', 'Q_gained', 'Q_union', 'Q_jaccard',
    'Q_loss_noLongerE', 'Q_loss_stillE_disconnected', 'Q_loss_nucleusInvalidation',
    'Q_retained_inF', 'Q_retained_incumbentOnly', 'Q_gains_from_currentF',
    'Q_only_count', 'Q_over_B', 'Q_only_fraction', 'Q_localE_fraction'
  ];
  const rows = [headers];
  for (const event of analysis.events) for (const row of event.transitions) {
    const b = row.B, q = row.Q, lp = row.QLossPartition ?? {}, rp = row.QRetainedPartition ?? {};
    rows.push([
      event.id, row.transitionIndex, row.fromTimeMs, row.toTimeMs, row.n0ValidInCurrentF,
      b.previousSize, b.currentSize, b.intersection, b.lost, b.gained, b.union, b.jaccard,
      q.previousSize, q.currentSize, q.intersection, q.lost, q.gained, q.union, q.jaccard,
      lp.noLongerE?.length ?? 0, lp.stillEButDisconnected?.length ?? 0, lp.nucleusInvalidation?.length ?? 0,
      rp.presentInCurrentF?.length ?? 0, rp.incumbentOnlyStillE?.length ?? 0,
      row.QGainsFromCurrentF?.length ?? 0, row.QOnlyCountAtDestination,
      row.QoverBAtDestination, row.QOnlyFractionAtDestination, row.QLocalEFractionAtDestination
    ]);
  }
  const validation = {
    schema: 'ant-materialization-e-incumbent-validation-v1',
    ...analysis.validation, authority: analysis.authority, inputs: analysis.inputs,
    eventChecks: analysis.events.map(event => ({ id: event.id, ...event.validation }))
  };
  return new Map([
    ['analysis.json', Buffer.from(JSON.stringify(analysis, null, 2) + '\n')],
    ['membership-receipts.json', Buffer.from(JSON.stringify(receipts, null, 2) + '\n')],
    ['transition-table.csv', Buffer.from(rows.map(row => row.map(csv).join(',')).join('\n') + '\n')],
    ['validation.json', Buffer.from(JSON.stringify(validation, null, 2) + '\n')]
  ]);
}
function assertNoRandom() {
  const original = Math.random;
  let calls = 0;
  Math.random = () => { calls += 1; throw new Error('observer attempted RNG use'); };
  return { calls: () => calls, restore: () => { Math.random = original; } };
}
function main() {
  const randomGuard = assertNoRandom();
  try {
    const mode = process.argv[2] ?? '--write';
    let outputs;
    try {
      outputs = outputBytes();
    } catch (error) {
      if (error.name !== 'LockedQOnlySignatureViolation' || !error.witness) throw error;
      assert.equal(randomGuard.calls(), 0, 'observer consumes no RNG before stop');
      const stop = {
        schema: 'ant-materialization-e-incumbent-stop-witness-v1',
        status: 'STOPPED_LOCKED_Q_ONLY_SIGNATURE_VIOLATION',
        authority: { currentMain: CURRENT_MAIN, previousResultCommit: PREVIOUS_RESULT_COMMIT },
        validationBeforeStop: {
          frozenInputSha256: PREVIOUS_INPUT_SHA, priorBReferenceSha256: PREVIOUS_B_REFERENCE_SHA,
          registeredXReferenceSha256: PREVIOUS_REGISTERED_X_SHA,
          priorUpdateParitySha256: UPDATE_PARITY_SHA, priorCaptureParitySha256: CAPTURE_PARITY_SHA,
          exactCurrentFReproductionAnchors: error.witness.currentFExactAnchorsValidated,
          exactPriorBReproductionAnchors: error.witness.priorBExactAnchorsValidated,
          exactStartNuclei: error.witness.exactStartNucleiValidated,
          exactRegisteredStatelessXAnchors: error.witness.registeredStatelessXAnchorsValidated,
          priorEParity: error.witness.priorSourceParity.updateSourceParity.exactEParity,
          priorFParity: error.witness.priorSourceParity.captureSourceParity.exactFParity,
          priorIParity: error.witness.priorSourceParity.updateSourceParity.exactIParity,
          observerRandomCalls: 0
        },
        lockedFailure: error.witness,
        boundary: 'No outcome classification or incumbent usefulness/staleness interpretation is produced.'
      };
      const bytes = Buffer.from(JSON.stringify(stop, null, 2) + '\n');
      if (mode === '--write') {
        mkdirSync(BASE, { recursive: true });
        writeFileSync(STOP_WITNESS, bytes);
        process.stdout.write(JSON.stringify({ status: stop.status, witness: error.witness,
          receipt: 'data/stop-witness.json', observerRandomCalls: 0 }, null, 2) + '\n');
        return;
      }
      if (mode === '--check') {
        assert.deepEqual(readFileSync(STOP_WITNESS), bytes, 'deterministic locked-stop witness');
        process.stdout.write(JSON.stringify({ deterministic: true, status: stop.status,
          observerRandomCalls: 0 }, null, 2) + '\n');
        return;
      }
      throw new Error('unknown mode: ' + mode);
    }
    assert.equal(randomGuard.calls(), 0, 'observer consumes no RNG');
    if (mode === '--write') {
      mkdirSync(BASE, { recursive: true });
      for (const [name, bytes] of outputs) writeFileSync(join(BASE, name), bytes);
      const analysis = JSON.parse(outputs.get('analysis.json').toString('utf8'));
      process.stdout.write(JSON.stringify({
        written: [...outputs.keys()],
        events: analysis.events.map(event => ({
          id: event.id, startNucleus: event.startNucleus.index,
          firstInvalid: event.nucleusValidity.firstInvalid,
          B: event.summaries.B, Q: event.summaries.Q,
          qOnlyUniqueCells: event.summaries.qOnlyUniqueCells,
          qOnlyOccurrences: event.summaries.qOnlyMembershipOccurrences
        })),
        validation: analysis.validation
      }, null, 2) + '\n');
      return;
    }
    if (mode === '--check') {
      for (const [name, bytes] of outputs) {
        assert.deepEqual(readFileSync(join(BASE, name)), bytes, name + ' deterministic output');
      }
      process.stdout.write(JSON.stringify({ outputs: outputs.size, deterministic: true,
        randomCalls: randomGuard.calls() }, null, 2) + '\n');
      return;
    }
    throw new Error('unknown mode: ' + mode);
  } finally {
    randomGuard.restore();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
