import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { TRAIL_PLATE_GRID_SIZE, TRAIL_PLATE_SUPPORT_RADIUS } from '../src/lib/agents/ant/TrailPlateBirth.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-29-traffic-direction-signal-audit';
const INPUTS = PACKAGE + '/data/frozen-event-inputs.json.gz';
const ANCHORS = PACKAGE + '/data/frozen-parity-anchors.json.gz';
const OUTPUTS = [PACKAGE + '/data/motion-samples.json.gz', PACKAGE + '/analysis.json', PACKAGE + '/atlas.html'];
const SEED = 20261005;
const DT = 1 / 60;
const SIZE = TRAIL_PLATE_GRID_SIZE;
const R1 = 0.030;
const R0 = 0.012;
const TAU = Math.PI * 2;

const sha256 = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => sha256(JSON.stringify(value));
const readGzipJson = async path => JSON.parse(gunzipSync(await readFile(resolve(ROOT, path))));
const canonicalText = value => Buffer.from(value.toString('utf8').replace(/\r\n?/g, '\n'));
const writeOrCheck = async (path, bytes, check) => {
  const target = resolve(ROOT, path);
  if (check) {
    const actual = await readFile(target);
    assert((path.endsWith('.gz') ? actual : canonicalText(actual)).equals(bytes), path + ' differs from deterministic replay output');
  }
  else await writeFile(target, bytes);
};

function wrapPi(angle) { return Math.atan2(Math.sin(angle), Math.cos(angle)); }
function wrapAxis(angle) { return Math.atan2(Math.sin(2 * angle), Math.cos(2 * angle)) / 2; }
function pointFor(index) { return { x: index % SIZE / (SIZE - 1), y: Math.floor(index / SIZE) / (SIZE - 1) }; }
function angleDegrees(value) { return value === null ? null : value * 180 / Math.PI; }

function observedSegmentEnd(x0, y0, x1, y1) {
  // Mirror production's contact-only clipping; preserve the actual state endpoint and movement ray.
  const dx = x1 - x0, dy = y1 - y0;
  let fraction = 1;
  if (x1 < 0) fraction = Math.min(fraction, -x0 / dx);
  else if (x1 > 1) fraction = Math.min(fraction, (1 - x0) / dx);
  if (y1 < 0) fraction = Math.min(fraction, -y0 / dy);
  else if (y1 > 1) fraction = Math.min(fraction, (1 - y0) / dy);
  return { x: Math.max(0, Math.min(1, x0 + dx * fraction)), y: Math.max(0, Math.min(1, y0 + dy * fraction)) };
}

function makeGraph(event) {
  const nodeIds = [...event.scaffolds.selected].sort((a, b) => a - b);
  const nodeSet = new Set(nodeIds);
  const degree = new Map(nodeIds.map(index => [index, 0]));
  const edges = event.plate.edges.map(([a0, b0], id) => {
    const a = Math.min(a0, b0), b = Math.max(a0, b0);
    assert(nodeSet.has(a) && nodeSet.has(b), event.id + ' edge is outside selected I');
    degree.set(a, degree.get(a) + 1);
    degree.set(b, degree.get(b) + 1);
    const from = pointFor(a), to = pointFor(b), dx = to.x - from.x, dy = to.y - from.y;
    const gridDx = b % SIZE - a % SIZE, gridDy = Math.floor(b / SIZE) - Math.floor(a / SIZE);
    const orientationClass = gridDy === 0 ? 'horizontal' : gridDx === 0 ? 'vertical'
      : gridDx > 0 ? 'diagonal-down-right' : 'diagonal-down-left';
    return { id, a, b, from, to, dx, dy, gridDx, gridDy, orientationClass, length: Math.hypot(dx, dy),
      tangent: Math.atan2(dy, dx), midpoint: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } };
  });
  const incident = new Map(nodeIds.map(index => [index, []]));
  for (const edge of edges) { incident.get(edge.a).push(edge.id); incident.get(edge.b).push(edge.id); }
  assert.equal(edges.length, event.plate.edges.length);
  assert.deepEqual(nodeIds, event.plate.centerline.map(point => point.index).sort((a, b) => a - b));
  return { nodeIds, degree, edges, incident };
}

function nearestEdge(x, y, graph) {
  let best = Infinity, winner = null;
  const tied = [];
  for (const edge of graph.edges) {
    const t = Math.max(0, Math.min(1, ((x - edge.from.x) * edge.dx + (y - edge.from.y) * edge.dy)
      / (edge.length * edge.length)));
    const qx = edge.from.x + edge.dx * t, qy = edge.from.y + edge.dy * t;
    const d2 = (x - qx) ** 2 + (y - qy) ** 2;
    if (d2 < best) { best = d2; winner = { edge, t, qx, qy }; tied.length = 0; tied.push(edge); }
    else if (d2 === best) tied.push(edge);
  }
  const ambiguousTangent = tied.some(edge => edge.gridDx * winner.edge.gridDy - edge.gridDy * winner.edge.gridDx !== 0);
  return { ...winner, distance: Math.sqrt(best), tiedEdgeIds: tied.map(edge => edge.id), ambiguousTangent };
}

function directionStats(rows) {
  const angles = rows.filter(row => row.directionRad !== null).map(row => row.directionRad);
  if (!angles.length) return { n: 0, directionalResultant: null, axialResultant: null, meanDirectionDegrees: null, meanAxisDegrees: null };
  let x = 0, y = 0, ax = 0, ay = 0;
  for (const angle of angles) { x += Math.cos(angle); y += Math.sin(angle); ax += Math.cos(2 * angle); ay += Math.sin(2 * angle); }
  const directionLength = Math.hypot(x, y), axisLength = Math.hypot(ax, ay);
  return {
    n: angles.length,
    directionalResultant: directionLength / angles.length,
    axialResultant: axisLength / angles.length,
    meanDirectionDegrees: directionLength === 0 ? null : angleDegrees(Math.atan2(y, x)),
    meanAxisDegrees: axisLength === 0 ? null : angleDegrees(Math.atan2(ay, ax) / 2)
  };
}

function numericStats(values) {
  if (!values.length) return { n: 0, min: null, q25: null, median: null, mean: null, q75: null, q90: null, q95: null, q99: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = p => sorted[Math.floor((sorted.length - 1) * p)];
  return { n: sorted.length, min: sorted[0], q25: at(0.25), median: at(0.5), mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    q75: at(0.75), q90: at(0.9), q95: at(0.95), q99: at(0.99), max: sorted.at(-1) };
}

function pearson(xs, ys) {
  if (xs.length < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let xx = 0, yy = 0, xy = 0;
  for (let i = 0; i < xs.length; i += 1) { const x = xs[i] - mx, y = ys[i] - my; xx += x * x; yy += y * y; xy += x * y; }
  return xx && yy ? xy / Math.sqrt(xx * yy) : null;
}

function scaffoldCurvature(graph) {
  const rows = [];
  for (const node of graph.nodeIds) {
    const incident = graph.incident.get(node);
    if (incident.length !== 2) continue;
    const [a, b] = incident.map(id => graph.edges[id]);
    const turn = Math.abs(wrapAxis(a.tangent - b.tangent));
    rows.push({ node, edgeIds: incident, turnRadians: turn, meanEdgeLength: (a.length + b.length) / 2,
      curvatureRadiansPerUnit: turn / ((a.length + b.length) / 2) });
  }
  return rows;
}

function geometricCrossings(graph, samples) {
  const crossings = [];
  for (let i = 0; i < graph.edges.length; i += 1) for (let j = i + 1; j < graph.edges.length; j += 1) {
    const a = graph.edges[i], b = graph.edges[j];
    if ([a.a, a.b].some(node => node === b.a || node === b.b)) continue;
    const ax = a.a % SIZE, ay = Math.floor(a.a / SIZE), bx = a.b % SIZE, by = Math.floor(a.b / SIZE);
    const cx = b.a % SIZE, cy = Math.floor(b.a / SIZE), dx = b.b % SIZE, dy = Math.floor(b.b / SIZE);
    const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
    const denominator = rx * sy - ry * sx;
    if (denominator === 0) continue;
    const qx = cx - ax, qy = cy - ay;
    const t = (qx * sy - qy * sx) / denominator, u = (qx * ry - qy * rx) / denominator;
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    const point = { x: (ax + t * rx) / (SIZE - 1), y: (ay + t * ry) / (SIZE - 1) };
    const local = samples.filter(row => row.directionRad !== null && Math.hypot(row.midX - point.x, row.midY - point.y) <= R1);
    const branches = [a, b].map(edge => {
      const rows = local.filter(row => row.edgeId === edge.id && !row.ambiguousTangent);
      return { edgeId: edge.id, samples: rows.length, traffic: directionStats(rows) };
    });
    crossings.push({ edgeIds: [a.id, b.id], x: point.x, y: point.y,
      localMovementSamples: local.length, tangentAmbiguousSamples: local.filter(row => row.ambiguousTangent).length,
      localTraffic: directionStats(local), crossingEdgeUse: branches });
  }
  return crossings;
}

function pairedTurning(samples, graph) {
  const byId = new Map();
  for (const row of samples) {
    if (!byId.has(row.agentId)) byId.set(row.agentId, []);
    byId.get(row.agentId).push(row);
  }
  const pairs = [], excluded = { tickGapOrMissing: 0, tangentAmbiguous: 0, junctionTransition: 0, nonAdjacentEdges: 0 };
  for (const rows of byId.values()) {
    rows.sort((a, b) => a.tick - b.tick);
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1], current = rows[i];
      if (current.tick !== previous.tick + 1) { excluded.tickGapOrMissing += 1; continue; }
      if (previous.ambiguousTangent || current.ambiguousTangent) { excluded.tangentAmbiguous += 1; continue; }
      const previousEdge = graph.edges[previous.edgeId], currentEdge = graph.edges[current.edgeId];
      let axisTurn = 0, curvature = 0, transitionNode = null;
      if (previous.edgeId !== current.edgeId) {
        const common = [previousEdge.a, previousEdge.b].filter(node => node === currentEdge.a || node === currentEdge.b);
        if (common.length !== 1) { excluded.nonAdjacentEdges += 1; continue; }
        transitionNode = common[0];
        if (graph.degree.get(transitionNode) !== 2) { excluded.junctionTransition += 1; continue; }
        const parallelAxes = previousEdge.gridDx * currentEdge.gridDy - previousEdge.gridDy * currentEdge.gridDx === 0;
        axisTurn = parallelAxes ? 0 : Math.abs(wrapAxis(currentEdge.tangent - previousEdge.tangent));
        curvature = axisTurn / ((previousEdge.length + currentEdge.length) / 2);
      }
      const headingTurn = Math.abs(current.headingChangeRad);
      const displacementTurn = previous.directionRad === null || current.directionRad === null
        ? null : Math.abs(wrapPi(current.directionRad - previous.directionRad));
      const speed = current.distance / DT;
      pairs.push({ agentId: current.agentId, tick: current.tick, previousEdgeId: previous.edgeId,
        edgeId: current.edgeId, transitionNode, scaffoldAxisTurnRadians: axisTurn,
        scaffoldCurvatureRadiansPerUnit: curvature, actualHeadingTurnRadians: headingTurn,
        actualAngularSpeedRadiansPerSecond: headingTurn / DT,
        actualMovementTurnRadians: displacementTurn,
        scaffoldPredictedAngularSpeedRadiansPerSecond: curvature * speed });
    }
  }
  return { pairs, excluded };
}

function junctionRows(graph, samples) {
  const moving = samples.filter(row => row.directionRad !== null);
  return graph.nodeIds.filter(node => graph.degree.get(node) >= 3).map(node => {
    const point = pointFor(node);
    const local = moving.filter(row => Math.hypot(row.midX - point.x, row.midY - point.y) <= R1);
    const branches = graph.incident.get(node).map(edgeId => {
      const edge = graph.edges[edgeId], neighbor = edge.a === node ? edge.b : edge.a;
      const other = pointFor(neighbor), outward = Math.atan2(other.y - point.y, other.x - point.x);
      const used = local.filter(row => row.edgeId === edgeId && !row.ambiguousTangent);
      return { edgeId, neighbor, samples: used.length, outwardMeanProjection: used.length
        ? used.reduce((sum, row) => sum + Math.cos(row.directionRad - outward), 0) / used.length : null,
      traffic: directionStats(used) };
    });
    return { node, degree: graph.degree.get(node), x: point.x, y: point.y,
      localMovementSamples: local.length, localTraffic: directionStats(local),
      ambiguousLocalSamples: local.filter(row => row.ambiguousTangent).length,
      branches, branchesWithObservedMovement: branches.filter(branch => branch.samples > 0).length };
  });
}

function summarizeEvent(event, graph, data) {
  const all = data.samples;
  const r1 = all.filter(row => row.distanceToI <= R1);
  const moving = r1.filter(row => row.directionRad !== null);
  const geometric = moving.filter(row => !row.ambiguousTangent);
  const r0 = geometric.filter(row => row.distanceToI <= R0);
  const edgeRows = graph.edges.map(edge => {
    const rows = geometric.filter(row => row.edgeId === edge.id);
    const directions = directionStats(rows);
    const delta = rows.map(row => Math.abs(row.axialDeltaRadians));
    return { edgeId: edge.id, nodes: [edge.a, edge.b], length: edge.length,
      tangentDegrees: angleDegrees(edge.tangent), movementSamples: rows.length,
      directionalResultant: directions.directionalResultant, axialResultant: directions.axialResultant,
      meanDirectionDegrees: directions.meanDirectionDegrees, meanAxisDegrees: directions.meanAxisDegrees,
      meanDirectionRadians: directions.meanDirectionDegrees === null ? null : directions.meanDirectionDegrees * Math.PI / 180,
      meanSignedProjection: rows.length ? rows.reduce((sum, row) => sum + row.signedProjection, 0) / rows.length : null,
      absoluteAxialDeltaDegrees: numericStats(delta.map(angleDegrees)) };
  });
  const edgeWithTwoSamples = edgeRows.filter(row => row.movementSamples >= 2);
  const orientationGroups = [...new Set(graph.edges.map(edge => edge.orientationClass))].sort().map(orientationClass => {
    const edgeIds = graph.edges.filter(edge => edge.orientationClass === orientationClass).map(edge => edge.id);
    const rows = geometric.filter(row => edgeIds.includes(row.edgeId));
    const localEdges = edgeRows.filter(row => edgeIds.includes(row.edgeId) && row.movementSamples >= 2);
    const edgeSignedProjection = localEdges.map(row => row.meanSignedProjection);
    const edgeMeanDirections = localEdges.filter(row => row.meanDirectionRadians !== null)
      .map(row => ({ directionRad: row.meanDirectionRadians }));
    return { orientationClass, scaffoldEdgeCount: edgeIds.length,
      edgesWithMovingTraffic: edgeRows.filter(row => edgeIds.includes(row.edgeId) && row.movementSamples > 0).length,
      samples: rows.length, traffic: directionStats(rows),
      meanAbsoluteCosineToScaffoldAxis: rows.length ? rows.reduce((sum, row) => sum + row.axialAlignment, 0) / rows.length : null,
      meanAbsoluteCrossAxisComponent: rows.length ? rows.reduce((sum, row) => sum + Math.abs(row.crossProjection), 0) / rows.length : null,
      absoluteAxialDeltaDegrees: numericStats(rows.map(row => angleDegrees(Math.abs(row.axialDeltaRadians)))),
      signedProjectionCanonicalLowIndexToHighIndex: numericStats(rows.map(row => row.signedProjection)),
      perEdgeDirectionalResultant: numericStats(localEdges.map(row => row.directionalResultant)),
      perEdgeAxialResultant: numericStats(localEdges.map(row => row.axialResultant)),
      equallyWeightedPerEdgeMeanDirection: directionStats(edgeMeanDirections),
      perEdgeSignedProjectionCanonicalLowIndexToHighIndex: numericStats(edgeSignedProjection),
      edgesWithPositiveCanonicalMeanProjection: edgeSignedProjection.filter(value => value > 0).length,
      edgesWithNegativeCanonicalMeanProjection: edgeSignedProjection.filter(value => value < 0).length,
      edgesWithZeroCanonicalMeanProjection: edgeSignedProjection.filter(value => value === 0).length };
  });
  const curvatures = scaffoldCurvature(graph);
  const crossings = geometricCrossings(graph, r1);
  const turning = pairedTurning(r1, graph);
  const pairs = turning.pairs;
  const actualHeadingTurn = pairs.map(row => angleDegrees(row.actualHeadingTurnRadians));
  const scaffoldTurn = pairs.map(row => angleDegrees(row.scaffoldAxisTurnRadians));
  const actualMoveTurn = pairs.filter(row => row.actualMovementTurnRadians !== null)
    .map(row => angleDegrees(row.actualMovementTurnRadians));
  const meanSigned = geometric.length ? geometric.reduce((sum, row) => sum + row.signedProjection, 0) / geometric.length : null;
  const meanAxial = geometric.length ? geometric.reduce((sum, row) => sum + row.axialAlignment, 0) / geometric.length : null;
  const meanCross = geometric.length ? geometric.reduce((sum, row) => sum + Math.abs(row.crossProjection), 0) / geometric.length : null;
  const globalDirection = directionStats(moving);
  const globalDirectionRadians = globalDirection.meanDirectionDegrees === null ? null : globalDirection.meanDirectionDegrees * Math.PI / 180;
  const singleDirectionAxialAlignment = globalDirectionRadians === null ? null : geometric.reduce((sum, row) =>
    sum + Math.abs(Math.cos(globalDirectionRadians - row.tangentRad)), 0) / geometric.length;
  const headingErrors = r1.map(row => Math.abs(row.headingChangeRad - row.angularVelocity * DT));
  const movementTurnPairs = pairs.filter(row => row.actualMovementTurnRadians !== null);
  return {
    id: event.id, startMs: event.event.startAnalysisTimeMs, endMs: event.plate.bornAtSimulationTimeMs,
    eventWindowTicks: data.windowTicks, movementStepsAcrossAllAgents: data.allMovementSteps,
    movementStepsNearSelectedI: r1.length, movingStepsNearSelectedI: moving.length,
    zeroDisplacementStepsNearSelectedI: r1.length - moving.length,
    outsideR1Steps: data.allMovementSteps - r1.length,
    tangentAmbiguousMovingSteps: moving.length - geometric.length,
    uniqueAgentsNearI: new Set(r1.map(row => row.agentId)).size,
    uniqueEdgesWithMovingTraffic: edgeRows.filter(row => row.movementSamples > 0).length,
    selectedEdgeCount: graph.edges.length, junctionCount: graph.nodeIds.filter(node => graph.degree.get(node) >= 3).length,
    axialAlignment: { n: geometric.length, meanAbsoluteCosine: meanAxial,
      meanAbsoluteCrossAxisComponent: meanCross,
      globalDirectionCountermodel: { meanWorldDirectionDegrees: globalDirection.meanDirectionDegrees,
        singleDirectionPredictedMeanAbsoluteCosine: singleDirectionAxialAlignment },
      absoluteAxialDeltaDegrees: numericStats(geometric.map(row => angleDegrees(Math.abs(row.axialDeltaRadians)))),
      signedProjectionCanonicalLowIndexToHighIndex: { mean: meanSigned,
        distribution: numericStats(geometric.map(row => row.signedProjection)) } },
    directionalVsAxial: { spatiallyPooledWorldFrame: directionStats(moving),
      perEdgeSampleCounts: numericStats(edgeRows.map(row => row.movementSamples)),
      edgesWithAtLeastTwoSamples: edgeWithTwoSamples.length,
      perEdgeDirectionalResultant: numericStats(edgeWithTwoSamples.map(row => row.directionalResultant)),
      perEdgeAxialResultant: numericStats(edgeWithTwoSamples.map(row => row.axialResultant)),
      interpretationNote: 'World-frame pooling mixes different scaffold orientations; per-edge rows retain local structure. n=1 resultants are mathematically 1 and are not treated as coherence evidence.' },
    sameScaffoldOrientationGroups: orientationGroups,
    r0Sensitivity: { range: R0, movementStepsNearI: all.filter(row => row.distanceToI <= R0).length,
      movingSteps: r0.length, tangentAmbiguousMovingSteps: all.filter(row => row.distanceToI <= R0 && row.directionRad !== null && row.ambiguousTangent).length,
      meanAbsoluteCosine: r0.length ? r0.reduce((sum, row) => sum + row.axialAlignment, 0) / r0.length : null,
      directionalVsAxial: directionStats(r0) },
    edgeTraffic: edgeRows,
    junctions: junctionRows(graph, r1),
    nonNodeGeometricCrossings: crossings,
    turning: { movementSamplingHz: 60, headingChangeResolution: 'per production tick; no interpolation',
      maxHeadingIdentityErrorRadians: Math.max(0, ...headingErrors),
      absoluteAngularVelocityRadiansPerSecond: numericStats(r1.map(row => Math.abs(row.angularVelocity))),
      signedAngularVelocityRadiansPerSecond: numericStats(r1.map(row => row.angularVelocity)),
      absoluteHeadingChangeDegreesPerTick: numericStats(r1.map(row => angleDegrees(Math.abs(row.headingChangeRad)))),
      scaffoldDegree2NodeCurvatureRadiansPerUnit: numericStats(curvatures.map(row => row.curvatureRadiansPerUnit)),
      scaffoldDegree2NodeCurvatures: curvatures,
      pairedUniqueDegree2OrSameEdgeSamples: pairs.length,
      scaffoldAxisChangingPairs: pairs.filter(row => row.scaffoldAxisTurnRadians > 0).length,
      excludedPairs: turning.excluded,
      actualHeadingTurnDegreesPerTick: numericStats(actualHeadingTurn),
      actualRealizedTravelTurnDegreesPerTick: numericStats(actualMoveTurn),
      scaffoldAxisTurnDegreesPerTick: numericStats(scaffoldTurn),
      actualHeadingTurnVsScaffoldAxisTurnPearson: pearson(actualHeadingTurn, scaffoldTurn),
      actualRealizedTravelTurnVsScaffoldAxisTurnPearson: pearson(
        movementTurnPairs.map(row => angleDegrees(row.actualMovementTurnRadians)),
        movementTurnPairs.map(row => angleDegrees(row.scaffoldAxisTurnRadians))),
      actualAngularSpeedVsScaffoldCurvatureSpeedPearson: pearson(
        pairs.map(row => row.actualAngularSpeedRadiansPerSecond),
        pairs.map(row => row.scaffoldPredictedAngularSpeedRadiansPerSecond)),
      pairedValues: pairs },
    atlasSampleCount: moving.length
  };
}

function mapAtBirth(controller, expected, graph, inputs) {
  const size = SIZE * SIZE;
  const field = controller.field;
  const projection = new Float32Array(size);
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
    projection[y * SIZE + x] = field.sample(x / (SIZE - 1), y / (SIZE - 1));
  }
  const chemical = Array.from(controller.trailPlateBirth.chemicalMemory);
  const surface = Array.from(controller.surfaceField.values);
  const support = new Float32Array(size);
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
    support[y * SIZE + x] = controller.surfaceField.sampleSupport(x / (SIZE - 1), y / (SIZE - 1), TRAIL_PLATE_SUPPORT_RADIUS);
  }
  assert.deepEqual(chemical, expected.fields.chemical, expected.id + ' chemical memory snapshot');
  assert.deepEqual(surface, expected.fields.surface, expected.id + ' SurfaceField snapshot');
  assert.deepEqual(Array.from(support), expected.fields.support, expected.id + ' support snapshot');
  const selected = new Uint8Array(size);
  for (const index of expected.scaffolds.selected) selected[index] = 1;
  const principal = new Uint8Array(size);
  for (const index of expected.plate.principalPath) principal[index] = 1;
  const firstPlate = Uint8Array.from(controller.trailPlateBirth.getPlates()[0].mask);
  const maps = { A_projection96: Array.from(projection), B_memory: chemical, C_surface: surface,
    D_support: Array.from(support), I_retained_network: Array.from(selected),
    I_principal_path: Array.from(principal), J_frozen_first_plate: Array.from(firstPlate) };
  const anchor = currentAnchors.analysisSnapshots.find(row => row.tick === Math.round(controller.simulationTimeMs / (1000 * DT)));
  assert(anchor, expected.id + ' frozen one-second analysis anchor');
  const hashes = Object.fromEntries(Object.entries(maps).map(([key, value]) => [key, jsonHash(value)]));
  for (const [key, hash] of Object.entries(hashes)) assert.equal(hash, anchor.criticalMapHashes[key], expected.id + ' frozen ' + key + ' map');
  return { simulationTimeMs: controller.simulationTimeMs, inputChemicalExact: true, inputSurfaceExact: true,
    inputSupportExact: true, criticalMapHashes: hashes, criticalMapParityExact: true,
    selectedNodes: expected.scaffolds.selected.length, principalPathNodes: expected.plate.principalPath.length,
    plateCells: expected.plate.mask.reduce((sum, value) => sum + value, 0), edgeCount: graph.edges.length };
}

let currentAnchors;

async function replay(inputs, anchors) {
  const sourceHashes = [];
  for (const [path, expected] of Object.entries(anchors.source.sourceHashes).filter(([path]) => path.startsWith('src/'))) {
    const actual = sha256(await readFile(resolve(ROOT, path)));
    assert.equal(actual, expected, 'production source hash ' + path);
    sourceHashes.push({ path, sha256: actual });
  }
  assert(sourceHashes.length >= 10, 'current-G source hash coverage');
  const graphs = inputs.events.map(makeGraph);
  const samples = inputs.events.map(() => []), windowTicks = inputs.events.map(() => 0), allMovementSteps = inputs.events.map(() => 0);
  const contactPayloads = [], birthPayloads = [], eventMaps = [];
  let rngState = SEED >>> 0, rngCalls = 0, mathRandomCalls = 0;
  const random = () => { rngCalls += 1; rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 0x100000000; };
  const controller = new AntController({ random });
  const originalRandom = Math.random;
  Math.random = () => { mathRandomCalls += 1; throw new Error('Math.random used during deterministic replay'); };
  const rngAtBirth = new Map();
  controller.subscribe(event => {
    if (event.type === 'foot-contact') contactPayloads.push(event.payload);
    if (event.type !== 'plate-birth') return;
    const plate = event.payload;
    const expected = inputs.events.find(item => item.id === plate.id);
    assert(expected, 'unexpected materialization ' + plate.id);
    const graph = graphs[inputs.events.indexOf(expected)];
    assert.equal(plate.bornAtSimulationTimeMs, expected.plate.bornAtSimulationTimeMs);
    assert.deepEqual(plate.source, expected.plate.source);
    assert.deepEqual(plate.target, expected.plate.target);
    assert.deepEqual(plate.edges, expected.plate.edges);
    assert.deepEqual(plate.centerline, expected.plate.centerline);
    assert.deepEqual(plate.principalPath, expected.plate.principalPath);
    assert(Buffer.from(plate.mask).equals(Buffer.from(expected.plate.mask)), expected.id + ' exact immutable mask');
    const mapParity = mapAtBirth(controller, expected, graph, inputs);
    const receipt = { id: plate.id, bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs,
      source: plate.source, target: plate.target, grid: plate.grid, maskSha256: sha256(Buffer.from(plate.mask)) };
    birthPayloads.push(receipt);
    rngAtBirth.set(plate.id, { state: rngState, calls: rngCalls });
    eventMaps.push({ id: plate.id, ...mapParity });
  });
  try {
    await controller.init();
    assert.equal(controller.field.width, 316);
    assert.equal(controller.field.height, 316);
    assert.equal(controller.getSnapshot().audio.enabled, false, 'Audio Off');
    const totalTicks = Math.round(inputs.events.at(-1).plate.bornAtSimulationTimeMs / (DT * 1000));
    for (let tick = 1; tick <= totalTicks; tick += 1) {
      const previous = controller.agents.map(agent => ({ agent, id: agent.id, x: agent.x, y: agent.y,
        vx: agent.vx, vy: agent.vy, heading: agent.heading }));
      controller.tick(DT);
      const timeMs = controller.simulationTimeMs;
      for (let eventIndex = 0; eventIndex < inputs.events.length; eventIndex += 1) {
        const event = inputs.events[eventIndex];
        if (!(timeMs > event.event.startAnalysisTimeMs && timeMs <= event.plate.bornAtSimulationTimeMs)) continue;
        windowTicks[eventIndex] += 1;
        for (const item of previous) {
          allMovementSteps[eventIndex] += 1;
          const agent = item.agent;
          const stateDx = agent.x - item.x, stateDy = agent.y - item.y, stateDistance = Math.hypot(stateDx, stateDy);
          const observedEnd = observedSegmentEnd(item.x, item.y, agent.x, agent.y);
          const dx = observedEnd.x - item.x, dy = observedEnd.y - item.y, distance = Math.hypot(dx, dy);
          const midX = (item.x + observedEnd.x) / 2, midY = (item.y + observedEnd.y) / 2;
          const nearest = nearestEdge(midX, midY, graphs[eventIndex]);
          if (nearest.distance > R1) continue;
          const directionRad = stateDistance > 0 ? Math.atan2(stateDy, stateDx) : null;
          const edge = nearest.edge;
          const delta = directionRad === null ? null : wrapPi(directionRad - edge.tangent);
          const axialDelta = directionRad === null ? null : wrapAxis(delta);
          const headingChangeRad = wrapPi(agent.heading - item.heading);
          assert(Math.abs(headingChangeRad - agent.angularVelocity * DT) < 1e-12, 'per-tick heading/turn identity');
          samples[eventIndex].push({ tick, timeMs, agentId: item.id,
            x0: item.x, y0: item.y, x1: agent.x, y1: agent.y, observedX1: observedEnd.x, observedY1: observedEnd.y,
            midX, midY,
            vx0: item.vx, vy0: item.vy, vx1: agent.vx, vy1: agent.vy,
            heading0: item.heading, heading1: agent.heading, headingChangeRad,
            angularVelocity: agent.angularVelocity, dx, dy, distance, stateDx, stateDy, stateDistance, directionRad,
            edgeId: edge.id, edgeA: edge.a, edgeB: edge.b, edgeT: nearest.t,
            tangentRad: edge.tangent, nearestX: nearest.qx, nearestY: nearest.qy,
            distanceToI: nearest.distance, tiedEdgeIds: nearest.tiedEdgeIds,
            ambiguousTangent: nearest.ambiguousTangent,
            deltaRadians: delta, axialDeltaRadians: axialDelta,
            signedProjection: directionRad === null ? null : Math.cos(delta),
            axialAlignment: directionRad === null ? null : Math.abs(Math.cos(delta)),
            crossProjection: directionRad === null ? null : Math.sin(delta) });
        }
      }
    }
    const contactsThroughP2 = contactPayloads.filter(payload => payload.simulationTimeMs <= anchors.scope.endpointMs);
    const contactDigest = streamHash(contactsThroughP2);
    assert.equal(contactsThroughP2.length, anchors.contactPrefix.groups, 'frozen contact group prefix');
    assert.equal(contactsThroughP2.reduce((sum, payload) => sum + payload.contacts.length, 0), anchors.contactPrefix.feet, 'frozen foot prefix');
    assert.equal(contactDigest, anchors.contactPrefix.sha256, 'frozen ordered contact stream prefix');
    assert.deepEqual(birthPayloads, anchors.births, 'frozen P1/P2 commit receipts');
    const eventContactParity = inputs.events.map((event, index) => {
      const range = contactPayloads.filter(payload => payload.simulationTimeMs > event.event.startAnalysisTimeMs
        && payload.simulationTimeMs <= event.plate.bornAtSimulationTimeMs);
      const expected = anchors.eventRanges[index];
      const actual = { id: event.id, startMs: event.event.startAnalysisTimeMs, endMs: event.plate.bornAtSimulationTimeMs,
        contactGroups: range.length, feet: range.reduce((sum, payload) => sum + payload.contacts.length, 0),
        contactStreamSha256: streamHash(range) };
      assert.deepEqual(actual, expected, event.id + ' frozen event-window contact stream');
      return actual;
    });
    return { samples, windowTicks, allMovementSteps, contactPayloads,
      parity: { productionSourceHashes: sourceHashes, audio: 'Off', tickRate: 60,
        ticksToP2: totalTicks, mathRandomCalls, rngAtBirth: Object.fromEntries(rngAtBirth),
        contactPrefix: { groups: contactsThroughP2.length, feet: contactsThroughP2.reduce((sum, row) => sum + row.contacts.length, 0),
          sha256: contactDigest, exact: true },
        eventContactWindows: eventContactParity, births: birthPayloads, eventMaps } };
  } finally {
    Math.random = originalRandom;
    await controller.destroy();
    assert.equal(mathRandomCalls, 0);
  }
}

function streamHash(rows) { const hash = createHash('sha256'); for (const row of rows) hash.update(JSON.stringify(row) + '\n'); return hash.digest('hex'); }

function atlasSvg(event, graph, summary, samples) {
  const margin = 24, span = 620, xy = point => ({ x: margin + point.x * span, y: margin + point.y * span });
  const color = angle => `hsl(${((angleDegrees(angle) % 360) + 360) % 360} 92% 43%)`;
  const path = event.plate.principalPath.map(pointFor);
  const edges = graph.edges.map(edge => {
    const a = xy(edge.from), b = xy(edge.to);
      return `<line class="scaffold-edge" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#236a9d" stroke-width="1.25" opacity=".92"/>`;
  }).join('');
  const principal = path.slice(1).map((point, index) => {
    const a = xy(path[index]), b = xy(point);
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#ee9b37" stroke-width="2" stroke-dasharray="4 4" opacity=".8"/>`;
  }).join('');
  const motion = samples.filter(row => row.directionRad !== null).map(row => {
    const a = xy({ x: row.x0, y: row.y0 }), b = xy({ x: row.observedX1, y: row.observedY1 }), mid = xy({ x: row.midX, y: row.midY });
    return `<line class="sample-vector" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color(row.directionRad)}" stroke-width=".8" opacity=".42"/><circle class="sample-movement" cx="${mid.x}" cy="${mid.y}" r=".9" fill="${color(row.directionRad)}" opacity=".68"/>`;
  }).join('');
  const arrows = summary.edgeTraffic.filter(row => row.movementSamples > 0 && row.meanDirectionDegrees !== null).map(row => {
    const edge = graph.edges[row.edgeId], p = xy(edge.midpoint), angle = row.meanDirectionDegrees * Math.PI / 180, size = 10;
    return `<line class="edge-mean-direction" x1="${p.x - Math.cos(angle) * size / 2}" y1="${p.y - Math.sin(angle) * size / 2}" x2="${p.x + Math.cos(angle) * size / 2}" y2="${p.y + Math.sin(angle) * size / 2}" stroke="${color(angle)}" stroke-width="1.8" opacity="${row.directionalResultant}" marker-end="url(#arrow)"/>`;
  }).join('');
  const junctions = summary.junctions.map(row => {
    const p = xy({ x: row.x, y: row.y }); return `<circle class="junction" cx="${p.x}" cy="${p.y}" r="3.1" fill="#fff" stroke="#131313" stroke-width="1.2"><title>node ${row.node}; degree ${row.degree}; local movement ${row.localMovementSamples}; observed branches ${row.branchesWithObservedMovement}/${row.degree}</title></circle>`;
  }).join('');
  const crossings = summary.nonNodeGeometricCrossings.map(row => {
    const p = xy({ x: row.x, y: row.y }); return `<path class="geometric-crossing" d="M ${p.x} ${p.y - 3.2} L ${p.x + 3.2} ${p.y} L ${p.x} ${p.y + 3.2} L ${p.x - 3.2} ${p.y} Z" fill="#d23b88" stroke="#fff" stroke-width=".8"><title>non-node geometric crossing; edges ${row.edgeIds.join(',')}; local movement ${row.localMovementSamples}; ambiguous ${row.tangentAmbiguousSamples}</title></path>`;
  }).join('');
  return `<svg viewBox="0 0 668 704" role="img" aria-label="${event.id} actual movement samples over selected scaffold I"><defs><marker id="arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" fill="context-stroke"/></marker></defs><rect x="${margin}" y="${margin}" width="${span}" height="${span}" fill="#fbfbf8" stroke="#888"/>${edges}${principal}${motion}${arrows}${junctions}${crossings}<text x="24" y="672" font-size="12" fill="#333">Blue I edges · orange principal path (secondary) · black circles = graph junctions · magenta diamonds = geometric crossings</text></svg>`;
}

function makeAtlas(inputs, graphs, summaries) {
  const sections = inputs.events.map((event, index) => {
    const result = summaries[index], stats = result.directionalVsAxial.spatiallyPooledWorldFrame;
    const numbers = [
      ['Exact event window', `${event.event.startAnalysisTimeMs.toFixed(3)}–${event.plate.bornAtSimulationTimeMs.toFixed(3)} ms`],
      ['Movement steps near I, r1', result.movingStepsNearSelectedI],
      ['Distance outside r1', result.outsideR1Steps],
      ['Ambiguous tangent samples', result.tangentAmbiguousMovingSteps],
      ['Axial alignment mean |cos δ|', result.axialAlignment.meanAbsoluteCosine],
      ['Signed projection mean cos δ', result.axialAlignment.signedProjectionCanonicalLowIndexToHighIndex.mean],
      ['Pooled directional resultant Rd', stats.directionalResultant],
      ['Pooled axial resultant Ra', stats.axialResultant],
      ['Per-edge median Rd (n≥2)', result.directionalVsAxial.perEdgeDirectionalResultant.median],
      ['Per-edge median Ra (n≥2)', result.directionalVsAxial.perEdgeAxialResultant.median],
      ['Degree ≥3 junctions', result.junctionCount],
      ['Non-node geometric crossings', result.nonNodeGeometricCrossings.length],
      ['Pairs: same edge / degree-2 transition', result.turning.pairedUniqueDegree2OrSameEdgeSamples],
      ['Mean |ω|, rad/s', result.turning.absoluteAngularVelocityRadiansPerSecond.mean],
      ['Median |heading Δ|, degrees/tick', result.turning.absoluteHeadingChangeDegreesPerTick.median],
      ['Pearson: heading turn vs scaffold axis turn', result.turning.actualHeadingTurnVsScaffoldAxisTurnPearson]
    ];
    const fmt = value => typeof value === 'number' ? Number(value.toPrecision(5)).toString() : value ?? '—';
    const svg = atlasSvg(event, graphs[index], result, replayResult.samples[index]);
    assert.equal((svg.match(/class="scaffold-edge"/g) || []).length, result.selectedEdgeCount, event.id + ' atlas scaffold edges');
    assert.equal((svg.match(/class="sample-movement"/g) || []).length, result.atlasSampleCount, event.id + ' atlas movement samples');
    assert.equal((svg.match(/class="junction"/g) || []).length, result.junctions.length, event.id + ' atlas junction values');
    assert.equal((svg.match(/class="geometric-crossing"/g) || []).length, result.nonNodeGeometricCrossings.length, event.id + ' atlas crossing values');
    return `<section><h2>${event.id} · seed ${SEED} · ${event.event.startAnalysisTimeMs.toFixed(3)}–${event.plate.bornAtSimulationTimeMs.toFixed(3)} ms</h2><div class="layout"><div class="map">${svg}</div><table>${numbers.map(([label, value]) => `<tr><th>${label}</th><td>${fmt(value)}</td></tr>`).join('')}</table></div><details><summary>All junction measurements (${result.junctions.length})</summary><pre>${JSON.stringify(result.junctions, null, 2)}</pre></details><details><summary>Exact scaffold-orientation groups (${result.sameScaffoldOrientationGroups.length})</summary><pre>${JSON.stringify(result.sameScaffoldOrientationGroups, null, 2)}</pre></details></section>`;
  });
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ANT traffic direction signal audit</title><style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#20242a}h1{margin-bottom:4px}section{border-top:1px solid #bbb;padding-top:14px;margin-top:24px}.layout{display:grid;grid-template-columns:minmax(420px,668px) minmax(360px,1fr);gap:20px;align-items:start}.map svg{width:100%;height:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd}th{font-weight:500}pre{white-space:pre-wrap;font-size:11px}.note{max-width:1000px;color:#444}@media(max-width:950px){.layout{grid-template-columns:1fr}} </style><h1>ANT traffic direction signal audit</h1><p class="note">60 Hz read-only replay; actual realized movement is shown over selected scaffold I. Primary association r1=0.030; fixed sensitivity r0=0.012. Blue lines are actual I edges. Orange dashed line is the principal path, shown only as a secondary reference. Movement marks preserve exact coordinates; hue encodes realized direction. Edge arrows have fixed display length and opacity equal to directional resultant. No chemical or SurfaceField layer is shown.</p>${sections.join('')}</html>`;
}

let replayResult;
async function main() {
  const check = process.argv.includes('--check');
  const inputs = await readGzipJson(INPUTS), anchors = await readGzipJson(ANCHORS);
  currentAnchors = anchors;
  assert.equal(inputs.scope.seed, SEED);
  assert.equal(inputs.scope.hz, 60);
  assert.equal(inputs.scope.audio, 'Off');
  assert.equal(inputs.events.length, 2);
  assert.equal(inputs.events.at(-1).plate.bornAtSimulationTimeMs, anchors.scope.endpointMs);
  assert.equal(anchors.source.sha256, '909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc');
  assert.equal(anchors.source.provenanceMain, 'aeefa12d8de9da400cb8a2a3d4b5080a21ba0292');
  assert(Math.abs(wrapAxis(Math.PI)) < 1e-14, 'axial angle wraps a half-turn');
  const inputsSha = sha256(await readFile(resolve(ROOT, INPUTS))), anchorsSha = sha256(await readFile(resolve(ROOT, ANCHORS)));
  const generated = await replay(inputs, anchors);
  replayResult = generated;
  const graphs = inputs.events.map(makeGraph);
  const summaries = inputs.events.map((event, index) => summarizeEvent(event, graphs[index], {
    samples: generated.samples[index], windowTicks: generated.windowTicks[index], allMovementSteps: generated.allMovementSteps[index]
  }));
  assert.deepEqual(generated.windowTicks, [1200, 1200], 'event windows use exact frozen tick anchors');
  const samplePacket = { schema: 'ant-traffic-direction-motion-v1', scope: { seed: SEED, hz: 60, audio: 'Off', primaryRange: R1, sensitivityRange: R0 },
    events: inputs.events.map((event, index) => ({ id: event.id, startMs: event.event.startAnalysisTimeMs,
      endMs: event.plate.bornAtSimulationTimeMs, movementStepsAcrossAllAgents: generated.allMovementSteps[index],
      associatedSamples: generated.samples[index] })) };
  const sampleBytes = gzipSync(Buffer.from(JSON.stringify(samplePacket)));
  const summary = { schema: 'ant-traffic-direction-signal-audit-v1', baseline: { productionMain: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785',
      researchParent: '05012e1b02acb565b9e7f6c2c9076b48be337f39', historyPacketMain: anchors.source.provenanceMain,
      historyPacketCommit: anchors.source.commit, branch: 'codex/ant-traffic-direction-signal-audit-20261028' },
    provenance: { inputsSha256: inputsSha, parityAnchorsSha256: anchorsSha,
      sourceHistoryPacketSha256: anchors.source.sha256, sourceHistoryPacketBytes: anchors.source.bytes,
      productionSourceHashesMatched: generated.parity.productionSourceHashes.length,
      productionSourceHashes: generated.parity.productionSourceHashes },
    replay: generated.parity,
    method: { selectedScaffold: 'Actual frozen I edges and selected node coordinates from event descriptors; principal path is secondary only.',
      edgeTangent: 'Unoriented local edge axis; canonical signed direction uses ascending node index only as a coordinate convention.',
      association: { primary: R1, sensitivity: R0, measure: 'Nearest point on actual selected-I line segment to each realized movement-segment midpoint in normalized 96-grid coordinates.' },
      ambiguity: 'Exact nearest-distance ties with distinct tangent axes are retained and excluded from tangent comparisons; no junction tangent is forced.',
      movement: 'Actual 60 Hz position deltas; heading and angular velocity are recorded independently. Zero displacement has no travel angle.',
      turning: 'No interpolation or smoothing; geometry curvature is discrete, unsmoothed 96-grid degree-2 node/edge curvature.' },
    eventSummaries: summaries,
    interpretation: { decision: 'see REPORT.md', note: 'The report states the bounded evidence-based decision and counterexamples.' } };
  const atlasBytes = Buffer.from(makeAtlas(inputs, graphs, summaries));
  summary.provenance.motionSamplesSha256 = sha256(sampleBytes);
  const finalSummaryBytes = Buffer.from(JSON.stringify(summary, null, 2) + '\n');
  const outputs = [sampleBytes, finalSummaryBytes, atlasBytes];
  for (let i = 0; i < OUTPUTS.length; i += 1) await writeOrCheck(OUTPUTS[i], outputs[i], check);
  console.log(JSON.stringify({ mode: check ? 'check' : 'write', ticksToP2: generated.parity.ticksToP2,
    eventTicks: generated.windowTicks, movementSteps: summaries.map(row => row.movementStepsNearSelectedI),
    movingSteps: summaries.map(row => row.movingStepsNearSelectedI),
    contactPrefix: generated.parity.contactPrefix, commits: generated.parity.births.map(row => ({ id: row.id, timeMs: row.bornAtSimulationTimeMs, maskSha256: row.maskSha256 })),
    outputs: OUTPUTS, deterministicArtifactSha256: outputs.map(sha256) }));
}

await main();
