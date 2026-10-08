import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceInputs, assertSourcesUnchanged } from './ant-social-null.js';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GRID = 96;
const SPACING = 1 / (GRID - 1);
const CURVATURE_SCALES = [0.03, 0.10];
const json = value => `${JSON.stringify(value, null, 2)}\n`;

function quantile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * p, lo = Math.floor(at);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (at - lo);
}

function distribution(values) {
  return { n: values.length, min: values.length ? Math.min(...values) : null,
    p50: quantile(values, 0.5), p90: quantile(values, 0.9), max: values.length ? Math.max(...values) : null };
}

function indexOf(point) {
  return Math.round(point.y * (GRID - 1)) * GRID + Math.round(point.x * (GRID - 1));
}

function neighbors(index) {
  const row = Math.floor(index / GRID), column = index % GRID, result = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (!dx && !dy) continue;
    const x = column + dx, y = row + dy;
    if (x >= 0 && x < GRID && y >= 0 && y < GRID) result.push(y * GRID + x);
  }
  return result;
}

function components(indices) {
  const pending = new Set(indices), groups = [];
  while (pending.size) {
    const first = pending.values().next().value, queue = [first], group = [];
    pending.delete(first);
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head]; group.push(current);
      for (const adjacent of neighbors(current)) if (pending.delete(adjacent)) queue.push(adjacent);
    }
    groups.push(group.sort((a, b) => a - b));
  }
  return groups;
}

export function analyzeCurvatureAtScale(points, spacing) {
  assert.ok(points.length >= 2 && Number.isFinite(spacing) && spacing > 0);
  assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  const vertices = [points[0]];
  for (const point of points.slice(1)) {
    const prior = vertices.at(-1);
    if (Math.hypot(point.x - prior.x, point.y - prior.y) > 1e-12) vertices.push(point);
  }
  const cumulative = [0];
  for (let index = 1; index < vertices.length; index += 1) {
    const prior = vertices[index - 1], point = vertices[index];
    cumulative.push(cumulative.at(-1) + Math.hypot(point.x - prior.x, point.y - prior.y));
  }
  const totalLength = cumulative.at(-1);
  assert.ok(totalLength > 0, 'nonzero path length');
  const sampleCount = Math.floor(totalLength / spacing + 1e-10) + 1;
  const samples = [];
  let segment = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const distance = Math.min(totalLength, index * spacing);
    while (segment + 1 < cumulative.length - 1 && cumulative[segment + 1] < distance - 1e-12) segment += 1;
    const a = vertices[segment], b = vertices[segment + 1];
    const length = cumulative[segment + 1] - cumulative[segment];
    const fraction = Math.max(0, Math.min(1, (distance - cumulative[segment]) / length));
    samples.push({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction });
  }
  const headings = samples.slice(1).map((point, index) => Math.atan2(
    point.y - samples[index].y, point.x - samples[index].x));
  const turns = [];
  for (let index = 1; index < headings.length; index += 1) {
    turns.push(Math.atan2(Math.sin(headings[index] - headings[index - 1]),
      Math.cos(headings[index] - headings[index - 1])));
  }
  const absoluteTurns = turns.map(Math.abs);
  const sampledLength = Math.max(0, samples.length - 1) * spacing;
  return { sampleSpacingWorldUnits: spacing, sampleCount: samples.length, sampledLengthWorldUnits: sampledLength,
    signedTurnRadians: turns.reduce((sum, value) => sum + value, 0),
    absoluteTurnRadians: absoluteTurns.reduce((sum, value) => sum + value, 0),
    meanAbsoluteTurnRadiansPerWorldUnit: sampledLength > 0
      ? absoluteTurns.reduce((sum, value) => sum + value, 0) / sampledLength : null,
    angleDistributionRadians: { signed: distribution(turns), absolute: distribution(absoluteTurns) },
    angleSamplesRadians: { signed: turns, absolute: absoluteTurns } };
}

export function analyzePlate(plate, previousUnion = new Set(), earlierMasks = []) {
  assert.equal(plate.grid?.width, GRID); assert.equal(plate.grid?.height, GRID);
  assert.equal(plate.mask?.length, GRID * GRID);
  const maskIndices = [];
  for (let index = 0; index < plate.mask.length; index += 1) {
    assert.ok(plate.mask[index] === 0 || plate.mask[index] === 1, 'binary frozen Plate mask');
    if (plate.mask[index]) maskIndices.push(index);
  }
  assert.ok(maskIndices.length > 0);
  const centerline = plate.centerline || [];
  const path = plate.principalPath || [];
  const nodeByIndex = new Map(centerline.map(node => [node.index, node]));
  const pathPoints = path.map(index => nodeByIndex.get(index));
  assert.ok(pathPoints.length >= 2 && pathPoints.every(Boolean), 'principal path maps to frozen centerline');

  const networkDegrees = new Map(centerline.map(node => [node.index, 0]));
  let networkEdgeLength = 0;
  for (const [a, b] of plate.edges || []) {
    assert.ok(networkDegrees.has(a) && networkDegrees.has(b), 'edge endpoints exist in centerline');
    networkDegrees.set(a, networkDegrees.get(a) + 1); networkDegrees.set(b, networkDegrees.get(b) + 1);
    const from = nodeByIndex.get(a), to = nodeByIndex.get(b);
    networkEdgeLength += Math.hypot(to.x - from.x, to.y - from.y);
  }
  const junctionNodes = centerline.filter(node => networkDegrees.get(node.index) > 2).map(node => node.index);
  const junctionGroups = components(junctionNodes);
  const pathLengths = [];
  const turns = [];
  for (let i = 1; i < pathPoints.length; i += 1) {
    const a = pathPoints[i - 1], b = pathPoints[i];
    pathLengths.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  const headings = pathPoints.slice(1).map((point, index) => Math.atan2(
    point.y - pathPoints[index].y, point.x - pathPoints[index].x));
  for (let i = 1; i < headings.length; i += 1) {
    turns.push(Math.atan2(Math.sin(headings[i] - headings[i - 1]), Math.cos(headings[i] - headings[i - 1])));
  }
  const principalLength = pathLengths.reduce((sum, length) => sum + length, 0);
  const first = pathPoints[0], last = pathPoints.at(-1);
  const endpointDistance = Math.hypot(last.x - first.x, last.y - first.y);
  const widths = (plate.widths || centerline.map(node => node.halfWidth)).filter(Number.isFinite);
  const widthRange = [0.012, 0.030];
  const overlapCount = maskIndices.reduce((count, index) => count + Number(previousUnion.has(index)), 0);
  const maskSet = new Set(maskIndices);
  const priorIoUs = earlierMasks.map(prior => {
    let intersection = 0;
    for (const index of maskIndices) if (prior.has(index)) intersection += 1;
    return intersection / (maskIndices.length + prior.size - intersection);
  });
  const maxPriorIoU = priorIoUs.length ? Math.max(...priorIoUs) : null;
  const centerlinePlot = centerline.map(({ index, x, y, halfWidth }) => ({ index, x, y, halfWidth }));
  return {
    id: plate.id, bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs,
    geometry: { grid: { width: GRID, height: GRID, coordinateStep: SPACING }, maskIndices,
      centerline: centerlinePlot, edges: plate.edges || [], principalPath: path,
      pickups: plate.pickups, material: plate.material },
    measures: {
      descriptorGeodesicLengthWorldUnits: plate.metrics?.geodesicLength ?? plate.provenance?.geodesicLength ?? null,
      principalPathLengthWorldUnits: principalLength, endpointDistanceWorldUnits: endpointDistance,
      principalTortuosity: endpointDistance > 1e-12 ? principalLength / endpointDistance : null,
      principalCurvature: { signedTurnRadians: turns.reduce((sum, turn) => sum + turn, 0),
        absoluteTurnRadians: turns.reduce((sum, turn) => sum + Math.abs(turn), 0),
        meanAbsoluteTurnRadiansPerWorldUnit: principalLength > 0
          ? turns.reduce((sum, turn) => sum + Math.abs(turn), 0) / principalLength : null,
        maximumAbsoluteStepRadians: turns.length ? Math.max(...turns.map(Math.abs)) : 0,
        scale: 'raw turns between archived centerline vertices; raster-scale diagnostic' },
      principalCurvatureByScale: CURVATURE_SCALES.map(scale => analyzeCurvatureAtScale(pathPoints, scale)),
      network: { centerlineCellCount: centerline.length, edgeCount: (plate.edges || []).length,
        edgeLengthWorldUnits: networkEdgeLength, endpointCount: [...networkDegrees.values()].filter(degree => degree <= 1).length,
        junctionNodeCount: junctionNodes.length, junctionClusterCount: junctionGroups.length,
        junctionClusters: junctionGroups,
        junctionProxyNote: 'Eight-neighbor degree over frozen centerline edges; diagonal raster staircases can create high-degree pixels. Clusters are adjacent flagged pixels, not physical branch counts.' },
      widths: { halfWidthWorldUnits: distribution(widths), clampRangeWorldUnits: widthRange,
        lowClampCount: widths.filter(width => Math.abs(width - widthRange[0]) <= 1e-9).length,
        highClampCount: widths.filter(width => Math.abs(width - widthRange[1]) <= 1e-9).length },
      footprint: { occupiedCells: maskIndices.length, normalizedArea: maskIndices.length / ((GRID - 1) ** 2),
        areaConvention: 'occupied 96x96 mask cells divided by 95^2; one normalized coordinate-grid cell area' },
      overlap: { priorUnionOverlapCells: overlapCount, newlyOccupiedCells: maskIndices.length - overlapCount,
        priorUnionOverlapNormalizedArea: overlapCount / ((GRID - 1) ** 2),
        newlyOccupiedNormalizedArea: (maskIndices.length - overlapCount) / ((GRID - 1) ** 2),
        priorUnionOverlapFraction: overlapCount / maskIndices.length,
        maxEarlierMaskIoU: maxPriorIoU, exactEarlierMaskMatch: maxPriorIoU === 1,
        similarityDefinition: 'maximum binary-mask IoU against any earlier Plate; production corridorSimilarity is private and not reimplemented' }
    },
    _mask: maskSet
  };
}

export function analyzeSeed(seed, archive, sourceHashes) {
  const events = archive.raw.births.filter(event => event.type === 'plate-birth')
    .map(event => event.payload).sort((a, b) => a.bornAtSimulationTimeMs - b.bornAtSimulationTimeMs);
  const union = new Set(), earlier = [], plates = [];
  for (const plate of events) {
    const result = analyzePlate(plate, union, earlier);
    for (const index of result._mask) union.add(index);
    earlier.push(result._mask);
    delete result._mask;
    plates.push(result);
  }
  const descriptors = events;
  const topology = compileSurfaceTopology({ plates: descriptors });
  for (let index = 0; index < plates.length; index += 1) {
    const compiled = compileSurfaceTopology({ plates: [descriptors[index]] });
    const pickups = Array.from(compiled.pickupNodeIndices);
    const pickupGridIndices = pickups.map(node => compiled.nodeGridIndices[node]);
    const columns = pickupGridIndices.map(cell => cell % 32), rows = pickupGridIndices.map(cell => Math.floor(cell / 32));
    plates[index].measures.compiledSolver = {
      nodeCount: compiled.nodeGridIndices.length, pickupNodeIndices: pickups,
      pickupGridIndices,
      pickupSeparationSolverCells: Math.hypot(columns[1] - columns[0], rows[1] - rows[0]),
      pickupSeparationWorldUnits: Math.hypot(columns[1] - columns[0], rows[1] - rows[0]) / 31
    };
  }
  const measures = plates.map(item => item.measures);
  const pick = (key, direction) => {
    const ordered = [...plates].filter(plate => Number.isFinite(key(plate))).sort((a, b) => direction
      * (key(a) - key(b) || a.id.localeCompare(b.id)));
    return ordered.length ? { id: ordered[0].id, value: key(ordered[0]) } : null;
  };
  return {
    seed, sourceHashes, plateCount: plates.length,
    summary: {
      geodesicLengthWorldUnits: distribution(measures.map(item => item.descriptorGeodesicLengthWorldUnits).filter(Number.isFinite)),
      principalPathLengthWorldUnits: distribution(measures.map(item => item.principalPathLengthWorldUnits)),
      principalTortuosity: distribution(measures.map(item => item.principalTortuosity).filter(Number.isFinite)),
      principalAbsoluteTurnRadiansPerWorldUnit: distribution(measures.map(item =>
        item.principalCurvature.meanAbsoluteTurnRadiansPerWorldUnit).filter(Number.isFinite)),
      principalCurvatureByScale: CURVATURE_SCALES.map(scale => {
        const values = measures.map(item => item.principalCurvatureByScale.find(value =>
          value.sampleSpacingWorldUnits === scale));
        return { sampleSpacingWorldUnits: scale,
          signedTurnRadians: distribution(values.map(value => value.signedTurnRadians)),
          absoluteTurnRadians: distribution(values.map(value => value.absoluteTurnRadians)),
          meanAbsoluteTurnRadiansPerWorldUnit: distribution(values.map(value => value.meanAbsoluteTurnRadiansPerWorldUnit)
            .filter(Number.isFinite)),
          angleDistributionRadians: {
            signed: distribution(values.flatMap(value => value.angleSamplesRadians.signed)),
            absolute: distribution(values.flatMap(value => value.angleSamplesRadians.absolute)) } };
      }),
      networkCells: distribution(measures.map(item => item.network.centerlineCellCount)),
      networkEdges: distribution(measures.map(item => item.network.edgeCount)),
      networkEdgeLengthWorldUnits: distribution(measures.map(item => item.network.edgeLengthWorldUnits)),
      junctionClusters: distribution(measures.map(item => item.network.junctionClusterCount)),
      halfWidthWorldUnits: distribution(plates.flatMap(plate => plate.geometry.centerline.map(node => node.halfWidth))),
      clampSaturation: { low: measures.reduce((sum, item) => sum + item.widths.lowClampCount, 0),
        high: measures.reduce((sum, item) => sum + item.widths.highClampCount, 0),
        samples: measures.reduce((sum, item) => sum + item.widths.halfWidthWorldUnits.n, 0) },
      footprintArea: distribution(measures.map(item => item.footprint.normalizedArea)),
      newlyOccupiedCells: distribution(measures.map(item => item.overlap.newlyOccupiedCells)),
      newlyOccupiedArea: distribution(measures.map(item => item.overlap.newlyOccupiedNormalizedArea)),
      priorUnionOverlapFraction: distribution(measures.map(item => item.overlap.priorUnionOverlapFraction)),
      maximumEarlierMaskIoU: distribution(measures.map(item => item.overlap.maxEarlierMaskIoU).filter(Number.isFinite)),
      material: Object.fromEntries(['stiffness', 'density', 'damping'].map(key => [key,
        distribution(descriptors.map(plate => plate.material[key]))])),
      compiledSolverNodeCount: distribution(measures.map(item => item.compiledSolver.nodeCount)),
      pickupSeparationWorldUnits: distribution(measures.map(item => item.compiledSolver.pickupSeparationWorldUnits)),
      exactEarlierMaskMatches: measures.filter(item => item.overlap.exactEarlierMaskMatch).length
    },
    representativeSelections: {
      minimumFootprint: pick(plate => plate.measures.footprint.normalizedArea, 1),
      maximumFootprint: pick(plate => plate.measures.footprint.normalizedArea, -1),
      maximumPrincipalTortuosity: pick(plate => plate.measures.principalTortuosity, -1),
      maximumJunctionClusterCount: pick(plate => plate.measures.network.junctionClusterCount, -1),
      rule: 'Observed extrema only; selections are descriptive plotting handles, not Plate classes.'
    },
    sonicPotential: { productionTopologyCompiler: 'compileSurfaceTopology over archived frozen descriptors',
      solverGrid: topology.solverRateHz ? 32 : null, solverRateHz: topology.solverRateHz,
      nodeCount: topology.nodeGridIndices.length,
      adjacentCouplingLinkCount: topology.adjacentLinkNodes.length / 2,
      interpretation: 'Compiled topology/material/pickup facts only; no DSP, PCM, audibility, or acoustic-performance claim.' },
    plates
  };
}

export const definitions = {
  coordinates: 'Archived x/y and half-width values are in the model normalized coordinate system. No physical meter conversion is asserted.',
  principalPath: 'Recompute Euclidean length and raw vertex turns from archived principalPath indices mapped to frozen centerline coordinates. Tortuosity is path length divided by endpoint distance; null for near-zero displacement.',
  multiscaleCurvature: 'Linear arc-length interpolation along the archived polyline at fixed 0.03 and 0.10 normalized-coordinate spacings. Signed/absolute turns and signed/absolute angle distributions describe resampled segments. Measurement leaves archived geometry unchanged. Raw vertex-turn totals are quantization-sensitive and alone do not establish smoothness, irregularity, or a morphology class.',
  network: 'Use archived frozen edges. Degree >2 and adjacent flagged pixel clusters are 8-neighbor raster proxies. Diagonal staircases can create multiple high-degree pixels; cluster count is not a physical branch count.',
  width: 'Use descriptor half-width values in normalized world units. Clamp counts use the frozen numeric bounds [0.012, 0.030] with 1e-9 tolerance; the numbers are not converted to meters.',
  footprint: 'Area proxy is occupied 96x96 mask cell count divided by 95^2, matching normalized coordinate-grid spacing.',
  overlap: 'Newly occupied cells count mask cells absent from the union of earlier births. IoU compares binary masks with each earlier descriptor; no arbitrary similarity threshold is applied.',
  limits: 'Archives contain recorded birth descriptors, not continuous candidate histories. Production corridorSimilarity is private and is not copied. Measurements describe the recorded frozen geometry; morphology does not imply social role, biological class, or sonic quality.'
};

async function main() {
  const output = resolve(process.argv[2] || 'test-results/morphology-plates');
  await mkdir(output, { recursive: true });
  const seeds = [];
  for (const seed of [20261005, 20261006, 20261007]) {
    const input = await sourceInputs(seed);
    seeds.push(analyzeSeed(seed, input.archive, input.sourceHashes));
  }
  await assertSourcesUnchanged(Object.assign({}, ...seeds.map(seed => seed.sourceHashes)));
  await writeFile(resolve(output, 'summary.json'), json({ schemaVersion: 2, definitions,
    parameters: { seeds: seeds.map(seed => seed.seed), descriptorSource: 'committed social-graph raw birth events',
      grid: GRID, coordinateStep: SPACING, widthClampWorldUnits: [0.012, 0.030],
      curvatureSampleSpacingsWorldUnits: CURVATURE_SCALES }, seeds }));
  console.log(JSON.stringify({ output, seeds: seeds.map(seed => ({ seed: seed.seed,
    plateCount: seed.plateCount, representativeSelections: seed.representativeSelections })) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
