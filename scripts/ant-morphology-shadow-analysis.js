import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePlate } from './ant-morphology-plates.js';
import { TRAIL_PLATE_GRID_SIZE, TRAIL_PLATE_HALF_WIDTH_RANGE } from '../src/lib/agents/ant/TrailPlateBirth.js';

const GRID = TRAIL_PLATE_GRID_SIZE;
const CELL_COUNT = GRID * GRID;
const distribution = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = p => sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
  return { n: sorted.length, min: sorted[0] ?? null, p50: at(0.5), p90: at(0.9), max: sorted.at(-1) ?? null };
};

const args = new Map(process.argv.slice(2).map(value => {
  const split = value.indexOf('=');
  return split < 0 ? [value, true] : [value.slice(0, split), value.slice(split + 1)];
}));

export function measureShadowCandidate(candidate, { tick, distanceToCorridorEdgeDiagnostic, productionPlateUnion,
  sourceConnectedSkeleton = [] }) {
  if (!candidate) return null;
  assert.equal(typeof distanceToCorridorEdgeDiagnostic, 'function');
  assert.equal(candidate.mask.length, CELL_COUNT);
  assert.equal(candidate.supportedMask.length, CELL_COUNT);
  const networkIndices = [...candidate.skeletonIndices].sort((a, b) => a - b);
  const distances = distanceToCorridorEdgeDiagnostic(candidate.supportedMask);
  const centerline = networkIndices.map(index => {
    const halfWidth = Math.max(TRAIL_PLATE_HALF_WIDTH_RANGE[0], Math.min(TRAIL_PLATE_HALF_WIDTH_RANGE[1],
      distances[index] / (GRID - 1)));
    return { x: (index % GRID) / (GRID - 1), y: Math.floor(index / GRID) / (GRID - 1), index, halfWidth };
  });
  const network = new Set(networkIndices);
  const edges = [];
  for (const index of networkIndices) for (const adjacent of neighbors(index)) {
    if (network.has(adjacent) && adjacent > index) edges.push([index, adjacent]);
  }
  const descriptor = { id: `diagnostic-${tick}`, bornAtSimulationTimeMs: tick * 1000 / 60,
    grid: { width: GRID, height: GRID }, mask: candidate.mask, centerline, edges,
    principalPath: candidate.path, widths: centerline.map(node => node.halfWidth),
    source: candidate.source, target: candidate.target, metrics: { geodesicLength: candidate.geodesicLength } };
  const measurements = compactMeasures(analyzePlate(descriptor, productionPlateUnion).measures);
  const targetBoundaryDistance = Math.min(candidate.target.x, candidate.target.y,
    1 - candidate.target.x, 1 - candidate.target.y);
  return { ...measurements, source: candidate.source, target: candidate.target,
    targetBoundaryDistanceWorldUnits: targetBoundaryDistance,
    retainedSourceConnectedSkeletonFraction: sourceConnectedSkeleton.length
      ? networkIndices.length / sourceConnectedSkeleton.length : null,
    sourceConnectedSkeletonPixelCount: sourceConnectedSkeleton.length,
    retainedNetworkPixelCount: networkIndices.length,
    selectedInteriorEndpointCount: candidate.selectedInteriorEndpointIndices?.length ?? 0 };
}

export function summarizeShadowReplay(replay) {
  const rows = replay.morphology || [];
  const components = rows.flatMap(row => row.shadowFunnel?.components || []);
  const gateCounts = { noCandidate: 0, persistence: 0, globalGap: 0, refractory: 0, newContacts: 0, birthCap: 0, ready: 0 };
  for (const row of rows) {
    if (!row.shadowCandidate) gateCounts.noCandidate += 1;
    else if (!row.shadowTemporal?.persistenceQualified) gateCounts.persistence += 1;
    else if (!row.shadowTemporal?.globalGapOpen) gateCounts.globalGap += 1;
    else if (!row.shadowTemporal?.sameCorridorRefractoryOpen) gateCounts.refractory += 1;
    else if (!row.shadowTemporal?.enoughNewFootContacts) gateCounts.newContacts += 1;
    else if (!row.shadowTemporal?.belowBirthCap) gateCounts.birthCap += 1;
    else gateCounts.ready += 1;
  }
  const candidates = rows.filter(row => row.shadowCandidate);
  const productionCandidates = rows.filter(row => row.candidate);
  const changed = rows.filter(row => row.geometryComparison?.differs);
  const pairedChanged = changed.filter(row => row.candidate && row.shadowCandidate);
  const interiorComponents = components.filter(row => row.sourceCount > 0 && row.interiorEndpointCount > 0);
  const interiorOnlyComponents = interiorComponents.filter(row => row.qualifiedBoundaryTargets === 0);
  return {
    seed: replay.seed, analysisCount: rows.length,
    selectorFunnel: {
      sourceConnectedComponentsWithBoundaryEndpoints: components.filter(row => row.sourceCount > 0 && row.boundaryCount > 0).length,
      sourceConnectedComponentsWithInteriorEndpointsAtLengthFloor: interiorComponents.length,
      componentsGainingInteriorEndpointFamily: interiorComponents.length,
      interiorOnlyEligibleComponents: interiorOnlyComponents.length,
      qualifyingInteriorEndpoints: interiorComponents.reduce((sum, row) => sum + row.interiorEndpointCount, 0),
      productionEligibleComponentObservations: rows.reduce((sum, row) => sum + (row.funnel?.candidateComponentCount || 0), 0),
      shadowEligibleComponentObservations: rows.reduce((sum, row) => sum + (row.shadowFunnel?.candidateComponentCount || 0), 0),
      note: 'Component counts are repeated observations at each one-second qualification analysis, not unique spatial components.'
    },
    instantaneous: {
      productionSelectedCandidateAnalyses: productionCandidates.length,
      shadowSelectedCandidateAnalyses: candidates.length,
      shadowOnlySelectedCandidateAnalyses: rows.filter(row => row.shadowCandidate && !row.candidate).length,
      selectedGeometryDifferentAnalyses: changed.length,
      additionalRetainedNetworkCells: distribution(changed.map(row => row.geometryComparison.additionalNetworkCells)),
      additionalRibbonCells: distribution(changed.map(row => row.geometryComparison.additionalRibbonCells)),
      materialDifferenceDefinition: 'Exact selected geometry difference: source, target, principal path, retained skeleton cells, or ribbon mask differs.'
    },
    temporal: {
      shadowCandidateAnalyses: candidates.length,
      persistenceSurvivors: rows.filter(row => row.shadowTemporal?.persistenceQualified).length,
      scheduleGateCounts: gateCounts,
      scheduleQualifiedAnalyses: rows.filter(row => row.shadowTemporal?.scheduleQualified).length,
      isolatedVirtualBirths: rows.reduce((sum, row) => sum + Number(row.shadowTemporal?.virtualBirth || false), 0),
      note: 'Virtual births update only the separate diagnostic shadow state; no Plate, production birth state, material, or audio is changed.'
    },
    morphology: {
      production: summarizeMeasureSet(productionCandidates.map(row => row.productionMeasures)),
      shadow: summarizeMeasureSet(candidates.map(row => row.shadowMeasures)),
      pairedDeltas: {
        principalGeodesicLengthWorldUnits: distribution(pairedChanged.map(row =>
          row.shadowMeasures.descriptorGeodesicLengthWorldUnits - row.productionMeasures.descriptorGeodesicLengthWorldUnits)),
        principalTortuosity: distribution(pairedChanged.map(row => row.shadowMeasures.principalTortuosity - row.productionMeasures.principalTortuosity)),
        footprintArea: distribution(pairedChanged.map(row => row.shadowMeasures.footprint.normalizedArea - row.productionMeasures.footprint.normalizedArea)),
        centerlineCells: distribution(pairedChanged.map(row => row.shadowMeasures.network.centerlineCellCount - row.productionMeasures.network.centerlineCellCount)),
        newSpatialArea: distribution(pairedChanged.map(row => row.shadowMeasures.overlap.newlyOccupiedNormalizedArea
          - row.productionMeasures.overlap.newlyOccupiedNormalizedArea))
      }
    },
    examples: selectExamples(rows, replay.seed)
  };
}

function compactMeasures(measures) {
  return { descriptorGeodesicLengthWorldUnits: measures.descriptorGeodesicLengthWorldUnits,
    principalPathLengthWorldUnits: measures.principalPathLengthWorldUnits,
    endpointDistanceWorldUnits: measures.endpointDistanceWorldUnits,
    principalTortuosity: measures.principalTortuosity,
    principalCurvature: measures.principalCurvature,
    principalCurvatureByScale: measures.principalCurvatureByScale.map(({ sampleSpacingWorldUnits, signedTurnRadians,
      absoluteTurnRadians, meanAbsoluteTurnRadiansPerWorldUnit, angleDistributionRadians }) => ({
      sampleSpacingWorldUnits, signedTurnRadians, absoluteTurnRadians, meanAbsoluteTurnRadiansPerWorldUnit,
      angleDistributionRadians })),
    network: { centerlineCellCount: measures.network.centerlineCellCount, edgeCount: measures.network.edgeCount,
      edgeLengthWorldUnits: measures.network.edgeLengthWorldUnits, endpointCount: measures.network.endpointCount,
      junctionNodeCount: measures.network.junctionNodeCount, junctionClusterCount: measures.network.junctionClusterCount },
    widths: { halfWidthWorldUnits: measures.widths.halfWidthWorldUnits, lowClampCount: measures.widths.lowClampCount,
      highClampCount: measures.widths.highClampCount },
    footprint: measures.footprint,
    overlap: { priorUnionOverlapCells: measures.overlap.priorUnionOverlapCells,
      newlyOccupiedCells: measures.overlap.newlyOccupiedCells,
      priorUnionOverlapNormalizedArea: measures.overlap.priorUnionOverlapNormalizedArea,
      newlyOccupiedNormalizedArea: measures.overlap.newlyOccupiedNormalizedArea,
      priorUnionOverlapFraction: measures.overlap.priorUnionOverlapFraction } };
}

function summarizeMeasureSet(measures) {
  const valid = measures.filter(Boolean);
  const widthSamples = valid.flatMap(item => item.widths.halfWidthWorldUnits.p50 === null ? [] : [item.widths.halfWidthWorldUnits.p50]);
  const widthCount = valid.reduce((sum, item) => sum + item.widths.halfWidthWorldUnits.n, 0);
  const lowClampCount = valid.reduce((sum, item) => sum + item.widths.lowClampCount, 0);
  const highClampCount = valid.reduce((sum, item) => sum + item.widths.highClampCount, 0);
  const all = pick => distribution(valid.map(pick));
  return { candidateCount: valid.length,
    principalGeodesicLengthWorldUnits: all(item => item.descriptorGeodesicLengthWorldUnits),
    principalTortuosity: all(item => item.principalTortuosity),
    footprintArea: all(item => item.footprint.normalizedArea),
    centerlineCells: all(item => item.network.centerlineCellCount),
    endpointProxy: all(item => item.network.endpointCount),
    junctionNodeProxy: all(item => item.network.junctionNodeCount),
    junctionClusterProxy: all(item => item.network.junctionClusterCount),
    retainedSourceConnectedSkeletonFraction: all(item => item.retainedSourceConnectedSkeletonFraction),
    targetBoundaryDistanceWorldUnits: all(item => item.targetBoundaryDistanceWorldUnits),
    sourceEndpointDisplacementWorldUnits: all(item => item.endpointDistanceWorldUnits),
    productionUnionOverlapFraction: all(item => item.overlap.priorUnionOverlapFraction),
    newSpatialAreaNormalized: all(item => item.overlap.newlyOccupiedNormalizedArea),
    perAnalysisMedianHalfWidthWorldUnits: distribution(widthSamples),
    widthClamp: { lowClampSamples: lowClampCount, highClampSamples: highClampCount, samples: widthCount,
      lowClampFraction: widthCount ? lowClampCount / widthCount : null,
      highClampFraction: widthCount ? highClampCount / widthCount : null,
      definition: 'Clamp sample counts are exact; the displayed half-width distribution is the distribution of each analysis candidate median.' },
    curvatureAt030: all(item => item.principalCurvatureByScale.find(value => value.sampleSpacingWorldUnits === 0.03)
      ?.meanAbsoluteTurnRadiansPerWorldUnit),
    curvatureAt010: all(item => item.principalCurvatureByScale.find(value => value.sampleSpacingWorldUnits === 0.10)
      ?.meanAbsoluteTurnRadiansPerWorldUnit) };
}

function selectExamples(rows, seed) {
  const available = rows.filter(row => row.candidate && row.shadowCandidate && row.geometryComparison?.differs);
  const pick = (list, score, direction = -1) => [...list].sort((a, b) => direction
    * (score(a) - score(b) || a.tick - b.tick))[0] || null;
  const largestAddedBranch = pick(available, row => row.geometryComparison.additionalNetworkCells);
  const maximumCurvature = pick(available, row => row.shadowMeasures.principalCurvatureByScale
    .find(value => value.sampleSpacingWorldUnits === 0.10)?.meanAbsoluteTurnRadiansPerWorldUnit);
  const minimumFootprint = pick(available, row => row.shadowMeasures.footprint.normalizedArea, 1);
  const unchanged = rows.find(row => row.candidate && row.shadowCandidate && !row.geometryComparison?.differs) || null;
  const ref = (row, seed) => row && ({ seed, tick: row.tick, timeSeconds: row.timeSeconds,
    additionalNetworkCells: row.geometryComparison.additionalNetworkCells,
    shadowFootprintArea: row.shadowMeasures.footprint.normalizedArea,
    shadowPrincipalTortuosity: row.shadowMeasures.principalTortuosity,
    shadowCurvatureAt010: row.shadowMeasures.principalCurvatureByScale
      .find(value => value.sampleSpacingWorldUnits === 0.10)?.meanAbsoluteTurnRadiansPerWorldUnit });
  return { productionAndShadow: ref(largestAddedBranch, seed), interiorBranchesOmittedByProduction: ref(largestAddedBranch, seed),
    maximumMeasuredCurvature: ref(maximumCurvature, seed), minimumFootprintAmongChanged: ref(minimumFootprint, seed),
    exactNoDifference: ref(unchanged, seed), availability: { changedCandidateCount: available.length,
      noDifferenceCandidateCount: rows.filter(row => row.candidate && row.shadowCandidate && !row.geometryComparison?.differs).length } };
}

async function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const input = resolve(String(args.get('--input') || resolve(root, 'test-results/ant-interior-endpoint-shadow')));
  const output = resolve(String(args.get('--output') || resolve(input, 'analysis.json')));
  const seeds = String(args.get('--seeds') || '20261005,20261006,20261007').split(',').map(Number);
  const results = [];
  for (const seed of seeds) {
    const replay = JSON.parse(await readFile(resolve(input, `seed${seed}-summary.json`), 'utf8'));
    results.push(summarizeShadowReplay(replay));
  }
  const report = { schemaVersion: 1, definitions: {
    interiorEndpoint: 'A Zhang-Suen skeleton graph node with exactly one eight-neighbor skeleton edge, outside the production boundary zone.',
    endpointQualification: 'Same chosen production source and production weighted Dijkstra path semantics; distance must be at least 0.30 world units.',
    sourceConnectedSkeleton: 'Selected skeleton component containing the exact production source choice.',
    materialDifference: 'Any exact difference in selected source, target, principal path, retained skeleton indices, or raster ribbon mask. No statistical or practical threshold is imposed.',
    area: 'Occupied 96x96 ribbon cells divided by 95^2. New area means shadow/production candidate cells outside the accumulated actual production Plate union at that analysis.',
    temporal: 'Separate shadow candidate persistence and scheduling state; current production FOOT_CONTACT count arrays are read-only inputs.'
  }, seeds: results };
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ output, seeds: results.map(seed => ({ seed: seed.seed,
    analysisCount: seed.analysisCount, changed: seed.instantaneous.selectedGeometryDifferentAnalyses,
    persistenceSurvivors: seed.temporal.persistenceSurvivors,
    scheduled: seed.temporal.scheduleQualifiedAnalyses })) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

function neighbors(index) {
  const row = Math.floor(index / GRID), column = index % GRID, result = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (!dx && !dy) continue;
    const x = column + dx, y = row + dy;
    if (x >= 0 && x < GRID && y >= 0 && y < GRID) result.push(y * GRID + x);
  }
  return result;
}
