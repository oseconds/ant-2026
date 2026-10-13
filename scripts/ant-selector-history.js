import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { makeDiagnosticSelector } from './ant-morphology-replay.js';
import { angularMetrics, assertFiniteTree, connectedComponents, decodeXorSnapshots, float32FromBytes,
  gridDistances, makeCenterline, maskFromIndices, maskOverlap, orInto, pearsonCorrelation, rasterizeRibbon,
  summarizeValues, uint32FromBytes } from './ant-selector-history-analysis.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const baselineCommit = '92d5917bc12baca48e936332ec05d22297cb1276';
const inputPath = 'docs/ant/evidence/2026-10-13-morphology-attribution';
const evidencePath = resolve(root, 'docs/ant/evidence/2026-10-13-selector-history');
const dataPath = resolve(evidencePath, 'data'), visualPath = resolve(evidencePath, 'visuals');
const validationPath = resolve(evidencePath, 'validation');
const gridSize = 96, cellCount = gridSize * gridSize;
const toolPaths = ['scripts/ant-morphology-replay.js', 'scripts/ant-selector-history-analysis.js',
  'scripts/ant-selector-history.js', 'tests/ant-selector-history.test.js'];

await mkdir(dataPath, { recursive: true });
await mkdir(visualPath, { recursive: true });
await mkdir(validationPath, { recursive: true });
assert.equal(execFileSync('git', ['merge-base', 'HEAD', baselineCommit], { cwd: root, encoding: 'utf8' }).trim(), baselineCommit,
  'Run from a branch descending from the verified morphology-attribution commit');
execFileSync('git', ['diff', '--quiet', baselineCommit, '--', 'src/lib/agents/ant'], { cwd: root });

const priorManifestBytes = await readFile(resolve(root, inputPath, 'manifest.json'));
const priorManifest = JSON.parse(priorManifestBytes.toString('utf8'));
const measurementBytes = await readFile(resolve(root, inputPath, 'data/birth-measurements.json'));
const sourceHashes = {};
for (const [path, expected] of Object.entries(priorManifest.sourceHashes)) {
  const bytes = await readFile(resolve(root, path));
  assert.equal(sha256(bytes), expected, `Morphology-attribution source changed: ${path}`);
  sourceHashes[path] = sha256(bytes);
}
assert.equal(priorManifest.birthCount, 100);
assert.deepEqual(priorManifest.perSeed.map(({ seed, birthCount }) => ({ seed, birthCount })), [
  { seed: 20261005, birthCount: 29 }, { seed: 20261006, birthCount: 33 }, { seed: 20261007, birthCount: 38 }
]);
assert.equal(priorManifest.productionMain, 'd45823d40c9a87c1b333fa9872f3c897ee9ab01b');
const measurements = JSON.parse(measurementBytes.toString('utf8'));
assert.equal(measurements.births.length, priorManifest.birthCount);
const selectorSource = await readFile(resolve(root, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
const selectors = await makeDiagnosticSelector(selectorSource, { includeShadow: false });
const production = await import(pathToFileURL(resolve(root, 'src/lib/agents/ant/TrailPlateBirth.js')).href);
const { TrailPlateBirth, TRAIL_PLATE_GRID_SIZE, TRAIL_PLATE_SOURCE_ORIGIN, TRAIL_PLATE_TARGET_EDGE_DISTANCE,
  TRAIL_PLATE_MIN_GEODESIC_LENGTH, TRAIL_PLATE_HALF_WIDTH_RANGE } = production;
assert.equal(TRAIL_PLATE_GRID_SIZE, gridSize);

const inputFiles = [{ path: `${inputPath}/manifest.json`, sha256: sha256(priorManifestBytes), bytes: priorManifestBytes.length },
  { path: `${inputPath}/data/birth-measurements.json`, sha256: sha256(measurementBytes), bytes: measurementBytes.length }];
const births = [], perSeed = [];
const random = Math.random;
let rngCalls = 0;
Math.random = () => { rngCalls += 1; throw new Error('Selector-history diagnostic consumed Math.random'); };
try {
  for (const seedInfo of priorManifest.perSeed) {
    const provenancePath = resolve(root, inputPath, 'data', `seed${seedInfo.seed}-replay-provenance.json`);
    const snapshotPath = resolve(root, inputPath, 'data', `seed${seedInfo.seed}-birth-inputs.xor.gz`);
    const provenanceBytes = await readFile(provenancePath), compressed = await readFile(snapshotPath);
    const replay = JSON.parse(provenanceBytes.toString('utf8'));
    assert.equal(replay.seed, seedInfo.seed);
    assert.deepEqual(replay.snapshotEncoding.arrayOrder,
      ['chemical', 'chemicalMemory', 'surface', 'support', 'supportedMask', 'contactCounts']);
    const snapshots = decodeXorSnapshots(compressed, replay.snapshotEncoding.descriptors);
    const seedBirths = measurements.births.filter(row => row.provenance.seed === seedInfo.seed);
    assert.equal(seedBirths.length, seedInfo.birthCount);
    assert.equal(snapshots.length, seedInfo.birthCount);
    inputFiles.push({ path: `${inputPath}/data/seed${seedInfo.seed}-birth-inputs.xor.gz`,
      sha256: sha256(compressed), bytes: compressed.length },
    { path: `${inputPath}/data/seed${seedInfo.seed}-replay-provenance.json`,
      sha256: sha256(provenanceBytes), bytes: provenanceBytes.length });
    let priorUnion = new Uint8Array(cellCount), priorIds = [], previousTimeMs = -Infinity;
    const seedRows = [];
    for (let index = 0; index < seedBirths.length; index += 1) {
      const birth = seedBirths[index], snapshot = snapshots[index];
      assert.equal(birth.provenance.birthIndex, index + 1);
      assert.equal(birth.provenance.plateId, `trail-plate-${index + 1}`);
      assert.equal(snapshot.tick, birth.provenance.tick);
      assert.equal(snapshot.timeSeconds, birth.provenance.simulationTimeSeconds);
      assert.ok(birth.provenance.simulationTimeMs > previousTimeMs, 'Birth order and simulation time must increase');
      previousTimeMs = birth.provenance.simulationTimeMs;
      assert.equal(priorIds.length, index, 'Prior Plate union contains every earlier birth exactly once');
      assert.ok(!priorIds.includes(birth.frozenPlate.id), 'Current Plate must be excluded from prior union');
      const inputMaskBytes = snapshot.arrays.supportedMask;
      const supportBytes = snapshot.arrays.support, chemicalBytes = snapshot.arrays.chemicalMemory;
      assert.equal(inputMaskBytes.length, cellCount);
      assert.equal(supportBytes.length, cellCount * 4);
      assert.equal(snapshot.arrays.chemical.length, cellCount * 4);
      assert.equal(chemicalBytes.length, cellCount * 4);
      assert.equal(snapshot.arrays.surface.length, cellCount * 4);
      assert.equal(snapshot.arrays.contactCounts.length, cellCount * 4);
      const mask = Uint8Array.from(inputMaskBytes);
      assert.ok(mask.every(value => value === 0 || value === 1));
      const supports = float32FromBytes(supportBytes, cellCount);
      const chemicalMemory = float32FromBytes(chemicalBytes, cellCount);
      assertFiniteTree(float32FromBytes(snapshot.arrays.chemical, cellCount), 'chemical');
      assertFiniteTree(float32FromBytes(snapshot.arrays.surface, cellCount), 'surface');
      assertFiniteTree(supports, 'support');
      assertFiniteTree(chemicalMemory, 'chemicalMemory');
      const funnel = {};
      const candidate = selectors.selectCandidateDiagnostic(mask, supports, chemicalMemory, funnel);
      assert.ok(candidate, `Production selector candidate missing at ${seedInfo.seed}/${birth.frozenPlate.id}`);
      validateCandidate(candidate, funnel, birth);
      const contactCounts = uint32FromBytes(snapshot.arrays.contactCounts, cellCount);
      const materializer = new TrailPlateBirth();
      materializer.plates.length = index;
      materializer.footContactCounts = contactCounts;
      const expected = birth.frozenPlate;
      const replayedDescriptor = materializer.createDescriptor({ ...candidate,
        stableSeconds: expected.provenance.stableSeconds,
        similarity: expected.provenance.corridorSimilarity
      }, expected.bornAtSimulationTimeMs);
      assert.deepEqual(replayedDescriptor, expected, `Production frozen descriptor mismatch at ${seedInfo.seed}/${expected.id}`);
      const inputSha256 = sha256(Buffer.concat(replay.snapshotEncoding.arrayOrder.map(key => snapshot.arrays[key])));
      const row = analyzeBirth({ birth, candidate, funnel, priorUnion, priorIds, inputSha256,
        sourceOrigin: TRAIL_PLATE_SOURCE_ORIGIN, sourceBoundaryDistance: TRAIL_PLATE_TARGET_EDGE_DISTANCE,
        minimumGeodesicLength: TRAIL_PLATE_MIN_GEODESIC_LENGTH,
        halfWidthRange: TRAIL_PLATE_HALF_WIDTH_RANGE, distanceToCorridorEdge: selectors.distanceToCorridorEdgeDiagnostic });
      seedRows.push(row); births.push(row);
      orInto(priorUnion, Uint8Array.from(expected.mask));
      priorIds.push(expected.id);
    }
    assert.equal(priorIds.length, seedInfo.birthCount);
    const unionCells = countOnes(priorUnion);
    perSeed.push({ seed: seedInfo.seed, birthCount: seedRows.length, finalPriorUnionCells: unionCells,
      metrics: summarizeRows(seedRows), temporal: temporalSummary(seedRows),
      discardedSegmentSummary: summarizeSegments(seedRows) });
    console.log(JSON.stringify({ seed: seedInfo.seed, births: seedRows.length, finalPriorUnionCells: unionCells,
      c0Matches: seedRows.length }));
  }
} finally {
  Math.random = random;
}
assert.equal(rngCalls, 0);
assert.equal(births.length, priorManifest.birthCount);
const summary = { totalBirths: births.length, seedCount: perSeed.length,
  metrics: summarizeRows(births), withPriorMaterial: summarizeRows(births.filter(row => row.priorMaterial.plateCount > 0)),
  perSeed, temporal: temporalSummary(births),
  representativeSelection: chooseRepresentatives(births).map(({ key, roles, row }) => ({ key, roles, seed: row.provenance.seed,
    plateId: row.provenance.plateId, birthIndex: row.provenance.birthIndex,
    simulationTimeSeconds: row.provenance.simulationTimeSeconds,
    criterion: roles.join(', ') })),
  noveltyRegionCoherence: summarizeNoveltyRegions(births),
  segmentCoherence: { totalSegments: births.reduce((sum, row) => sum + row.segments.length, 0),
    birthsWithDiscardedSegments: births.filter(row => row.segments.length > 0).length,
    birthsWithNovelDiscardedFootprintSegments: births.filter(row => row.segments.some(segment => segment.footprint.newAreaCells > 0)).length,
    birthsWithMultiCellNovelSegments: births.filter(row => row.segments.some(segment => segment.cellCount > 1
      && segment.footprint.newAreaCells > 0)).length,
    skeletonHistoryClasses: countClasses(births.flatMap(row => row.segments.map(segment => segment.skeletonHistoryClass))),
    footprintHistoryClasses: countClasses(births.flatMap(row => row.segments.map(segment => segment.footprintHistoryClass))),
    segmentCellCounts: summarizeValues(births.flatMap(row => row.segments.map(segment => segment.cellCount))),
    segmentPotentialFootprintNewAreaCells: summarizeValues(births.flatMap(row => row.segments.map(segment => segment.footprint.newAreaCells))) } };
assertFiniteTree({ births, summary });
await writeFile(resolve(dataPath, 'birth-measurements.json.gz'), gzipSync(Buffer.from(`${JSON.stringify({ schemaVersion: 1,
  method: 'Current production C0 geometry only; prior Plate union is accumulated from earlier frozen descriptors in exact birth order and updated after each row.',
  births: births.map(({ _visual, ...row }) => row) }, null, 2)}\n`), { level: 9 }));
await writeFile(resolve(dataPath, 'discarded-segments.json.gz'), gzipSync(Buffer.from(`${JSON.stringify({ schemaVersion: 1,
  segmentation: 'Eight-neighbor connected components of FULL minus RETAINED, with row-major scan and sorted cell indices.',
  segments: births.flatMap(row => row.segments.map(segment => ({ seed: row.provenance.seed,
    plateId: row.provenance.plateId, birthIndex: row.provenance.birthIndex,
    simulationTimeSeconds: row.provenance.simulationTimeSeconds, ...segment }))) }, null, 2)}\n`), { level: 9 }));
await writeFile(resolve(dataPath, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(resolve(visualPath, 'representative-births.svg'), makeRepresentativeSvg(births, summary.representativeSelection));
await writeFile(resolve(visualPath, 'all-birth-distributions.svg'), makeDistributionSvg(births));
await writeFile(resolve(visualPath, 'novelty-over-time.svg'), makeTimeSvg(births));

const manifest = { schemaVersion: 1, taskBaseline: baselineCommit, productionMain: priorManifest.productionMain,
  gridSize, sourceOrigin: TRAIL_PLATE_SOURCE_ORIGIN, sourceBoundaryDistance: TRAIL_PLATE_TARGET_EDGE_DISTANCE,
  minimumGeodesicLength: TRAIL_PLATE_MIN_GEODESIC_LENGTH, halfWidthRange: TRAIL_PLATE_HALF_WIDTH_RANGE,
  inputEvidence: { path: inputPath, manifestSha256: sha256(priorManifestBytes),
    birthMeasurementsSha256: sha256(measurementBytes), files: inputFiles,
    seedBirthCounts: priorManifest.perSeed.map(({ seed, birthCount }) => ({ seed, birthCount })) },
  productionSourceHashes: sourceHashes,
  diagnosticToolHashes: Object.fromEntries(await Promise.all(toolPaths.map(async path =>
    [path, sha256(await readFile(resolve(root, path)))]))),
  visualScales: { worldGrid: 'fixed 96×96 cells in normalized [0,1]×[0,1] coordinates',
    distributionFractions: [0, 1], simulationTimeSeconds: [0, 600],
    discardedCellCount: [0, summary.metrics.discardedSkeletonCells.max], perBirthNormalization: false },
  integrity: { exactBirthInputsDecoded: births.length, c0GeometryExactMatches: births.length,
    frozenDescriptorExactMatches: births.length, priorUnionExcludesCurrentBirth: births.length,
    finiteValuesChecked: true, overlapAccountingConserved: true, productionSourceChanges: 0,
    rngCalls, naturalSimulationReplayed: false },
  outputFiles: ['data/birth-measurements.json.gz', 'data/discarded-segments.json.gz', 'data/summary.json',
    'visuals/representative-births.svg', 'visuals/all-birth-distributions.svg', 'visuals/novelty-over-time.svg'] };
await writeFile(resolve(evidencePath, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeChecksums(evidencePath);
console.log(JSON.stringify({ totalBirths: births.length, rngCalls, metrics: summary.metrics,
  temporal: summary.temporal, segmentCoherence: summary.segmentCoherence }));

function validateCandidate(candidate, funnel, birth) {
  const expected = birth.funnel.selectedCandidate;
  assert.deepEqual(candidate.source, expected.source);
  assert.deepEqual(candidate.target, expected.target);
  assert.ok(Math.abs(candidate.geodesicLength - expected.geodesicLength) < 1e-12);
  assert.deepEqual(candidate.path, expected.path);
  assert.deepEqual(candidate.skeletonIndices, expected.skeletonIndices);
  assert.deepEqual(Buffer.from(candidate.supportedMask).toString('base64'), expected.supportedMask);
  assert.deepEqual(Buffer.from(candidate.mask).toString('base64'), expected.ribbonMask);
  assert.deepEqual(Buffer.from(candidate.component).toString('base64'), expected.component);
  assert.equal(candidate.meanChemical, expected.meanChemical);
  assert.equal(candidate.meanSupport, expected.meanSupport);
  const component = funnel.components.find(row => row.candidateSourceIndex === candidate.source.index);
  assert.ok(component, `Selected skeleton component missing for ${birth.provenance.seed}/${birth.frozenPlate.id}`);
  assert.deepEqual(component.skeletonIndices, expected.prePruneSkeletonIndices);
}

function analyzeBirth({ birth, candidate, funnel, priorUnion, priorIds, inputSha256, sourceOrigin, sourceBoundaryDistance,
  minimumGeodesicLength, halfWidthRange, distanceToCorridorEdge }) {
  const { seed, plateId, birthIndex, simulationTimeSeconds, simulationTimeMs } = birth.provenance;
  const expectedMask = Uint8Array.from(birth.frozenPlate.mask);
  assert.ok(expectedMask.every(value => value === 0 || value === 1));
  const priorArea = countOnes(priorUnion);
  const component = funnel.components.find(row => row.candidateSourceIndex === candidate.source.index);
  const fullIndices = component.skeletonIndices.slice().sort((a, b) => a - b);
  const retainedIndices = candidate.skeletonIndices.slice().sort((a, b) => a - b);
  const fullMask = maskFromIndices(fullIndices, cellCount), retainedMask = maskFromIndices(retainedIndices, cellCount);
  const discardedMask = new Uint8Array(cellCount), discardedIndices = [];
  for (const index of retainedIndices) assert.ok(fullMask[index], `RETAINED cell outside FULL at ${seed}/${plateId}`);
  for (const index of fullIndices) {
    if (!retainedMask[index]) { discardedMask[index] = 1; discardedIndices.push(index); }
  }
  assert.equal(fullIndices.length, retainedIndices.length + discardedIndices.length);
  const corridorMask = Uint8Array.from(candidate.supportedMask);
  const edgeDistances = distanceToCorridorEdge(corridorMask);
  const retainedFootprint = rasterizeRibbon(makeCenterline(retainedIndices, edgeDistances, halfWidthRange, gridSize), gridSize);
  const discardedFootprint = rasterizeRibbon(makeCenterline(discardedIndices, edgeDistances, halfWidthRange, gridSize), gridSize);
  assert.deepEqual(retainedFootprint, expectedMask, `Retained ribbon differs from frozen descriptor: ${seed}/${plateId}`);
  const projectedFull = rasterizeRibbon(makeCenterline(fullIndices, edgeDistances, halfWidthRange, gridSize), gridSize);
  const decomposedFull = new Uint8Array(cellCount);
  orInto(orInto(decomposedFull, retainedFootprint), discardedFootprint);
  assert.deepEqual(decomposedFull, projectedFull, `FULL footprint does not equal RETAINED plus DISCARDED: ${seed}/${plateId}`);
  assert.equal(countOnes(discardedMask), discardedIndices.length);
  const sourceDistances = gridDistances(gridSize, fullMask, [candidate.source.index]);
  assert.ok(fullIndices.every(index => Number.isFinite(sourceDistances[index])));
  assert.ok(Math.abs(sourceDistances[candidate.target.index] / (gridSize - 1) - candidate.geodesicLength) < 1e-12,
    `Weighted source geodesic mismatch: ${seed}/${plateId}`);
  const priorIndices = indicesOf(priorUnion);
  const priorDistances = priorIndices.length ? gridDistances(gridSize, null, priorIndices) : null;
  const segments = connectedComponents(discardedMask, gridSize).map((indices, segmentIndex) =>
    analyzeSegment({ indices, segmentIndex: segmentIndex + 1, fullMask, retainedMask, priorUnion,
      edgeDistances, sourceDistances, priorDistances, sourceOrigin, sourceBoundaryDistance,
      minimumGeodesicLength, halfWidthRange }));
  const segmentedSkeleton = new Uint8Array(cellCount), segmentedFootprint = new Uint8Array(cellCount);
  for (const segment of segments) {
    orInto(segmentedSkeleton, segment._mask);
    orInto(segmentedFootprint, segment._footprint);
  }
  assert.deepEqual(segmentedSkeleton, discardedMask, `Discarded segment cells do not conserve geometry: ${seed}/${plateId}`);
  assert.deepEqual(segmentedFootprint, discardedFootprint, `Discarded segment footprints do not conserve geometry: ${seed}/${plateId}`);
  const publicSegments = segments.map(({ _mask, _footprint, ...segment }) => segment);
  const fullStats = maskOverlap(fullMask, priorUnion), retainedStats = maskOverlap(retainedMask, priorUnion);
  const discardedStats = maskOverlap(discardedMask, priorUnion);
  const actualStats = maskOverlap(expectedMask, priorUnion), retainedFootprintStats = maskOverlap(retainedFootprint, priorUnion);
  const discardedFootprintStats = maskOverlap(discardedFootprint, priorUnion);
  assert.deepEqual(actualStats, retainedFootprintStats, `Frozen footprint overlap mismatch: ${seed}/${plateId}`);
  const unionAreaCheck = discardedFootprintStats.priorOverlapCells + discardedFootprintStats.newAreaCells;
  assert.equal(unionAreaCheck, discardedFootprintStats.areaCells);
  assert.equal(discardedStats.priorOverlapCells + discardedStats.newAreaCells, discardedStats.areaCells);
  const sourceMetrics = angularMetrics(discardedIndices, gridSize, sourceOrigin);
  const novelSkeletonMask = new Uint8Array(cellCount), novelFootprintMask = new Uint8Array(cellCount);
  for (let index = 0; index < cellCount; index += 1) {
    if (discardedMask[index] && !priorUnion[index]) novelSkeletonMask[index] = 1;
    if (discardedFootprint[index] && !priorUnion[index]) novelFootprintMask[index] = 1;
  }
  const novelRegions = { skeleton: describeRegions(novelSkeletonMask), footprint: describeRegions(novelFootprintMask) };
  const priorDistanceMetrics = priorDistances ? summarizeValues(discardedIndices.filter(index => !priorUnion[index])
    .map(index => priorDistances[index] / (gridSize - 1))) : null;
  return { provenance: { seed, plateId, birthIndex, simulationTimeSeconds, simulationTimeMs, inputSha256 },
    priorMaterial: { plateCount: priorIds.length, plateIds: priorIds.slice(), unionCells: priorArea,
      unionFraction: priorArea / cellCount, currentBirthExcluded: !priorIds.includes(plateId) },
    full: { skeletonCellCount: fullIndices.length, prior: fullStats },
    retained: { skeletonCellCount: retainedIndices.length, prior: retainedStats,
      potentialFootprint: retainedFootprintStats },
    discarded: { skeletonCellCount: discardedIndices.length,
      fractionOfChosenComponent: fullIndices.length ? discardedIndices.length / fullIndices.length : null,
      prior: discardedStats, potentialFootprint: discardedFootprintStats,
      sourceGeometry: sourceMetrics, distanceToPriorWorld: priorDistanceMetrics, novelRegions },
    actualFrozenFootprint: { areaCells: expectedMask.reduce((sum, value) => sum + value, 0),
      prior: actualStats, exactMatchToRetainedProjection: true },
    segments: publicSegments, _visual: { priorUnion: priorUnion.slice(), fullMask, retainedMask, discardedMask,
      discardedFootprint, actualMask: expectedMask } };
}

function analyzeSegment({ indices, segmentIndex, fullMask, retainedMask, priorUnion, edgeDistances, sourceDistances,
  priorDistances, sourceOrigin, sourceBoundaryDistance, minimumGeodesicLength, halfWidthRange }) {
  const mask = maskFromIndices(indices, cellCount), distances = indices.map(index => sourceDistances[index] / (gridSize - 1));
  const attachmentEdges = [], attachmentCells = new Set(), segmentEdges = [];
  const fullEndpoints = [], interiorEndpoints = [], qualifiedInteriorEndpoints = [], localEndpoints = [];
  let boundaryCellCount = 0, graphLength = 0;
  for (const index of indices) {
    const links = neighbors8(index, gridSize);
    const fullDegree = links.reduce((sum, next) => sum + Number(Boolean(fullMask[next])), 0);
    const segmentDegree = links.reduce((sum, next) => sum + Number(Boolean(mask[next])), 0);
    if (fullDegree <= 1) {
      fullEndpoints.push(index);
      if (!nearBoundary(index, sourceBoundaryDistance)) {
        interiorEndpoints.push(index);
        if (sourceDistances[index] / (gridSize - 1) >= minimumGeodesicLength) qualifiedInteriorEndpoints.push(index);
      }
    }
    if (segmentDegree === 1) localEndpoints.push(index);
    if (nearBoundary(index, sourceBoundaryDistance)) boundaryCellCount += 1;
    for (const next of links) {
      if (next > index && mask[next]) {
        const stepLength = diagonal(index, next) ? Math.SQRT2 : 1;
        segmentEdges.push([index, next]); graphLength += stepLength / (gridSize - 1);
      }
      if (retainedMask[next]) { attachmentEdges.push([index, next]); attachmentCells.add(next); }
    }
  }
  const centerline = makeCenterline(indices, edgeDistances, halfWidthRange, gridSize);
  const footprint = rasterizeRibbon(centerline, gridSize);
  const skeletonPrior = maskOverlap(mask, priorUnion), footprintPrior = maskOverlap(footprint, priorUnion);
  assert.equal(skeletonPrior.priorOverlapCells + skeletonPrior.newAreaCells, skeletonPrior.areaCells);
  assert.equal(footprintPrior.priorOverlapCells + footprintPrior.newAreaCells, footprintPrior.areaCells);
  const outsideCells = indices.filter(index => !priorUnion[index]);
  const outsideFootprint = indicesOf(footprint).filter(index => !priorUnion[index]);
  return { segmentIndex, cellCount: indices.length, cellIndices: indices,
    graphEdgeCount: segmentEdges.length, skeletonLengthWorld: graphLength,
    endpointIndices: fullEndpoints, endpointCount: fullEndpoints.length,
    interiorEndpointIndices: interiorEndpoints, interiorEndpointCount: interiorEndpoints.length,
    geodesicEligibleInteriorEndpointIndices: qualifiedInteriorEndpoints,
    geodesicEligibleInteriorEndpointCount: qualifiedInteriorEndpoints.length,
    discardedSubgraphTerminalIndices: localEndpoints, discardedSubgraphTerminalCount: localEndpoints.length,
    attachmentRetainedCellIndices: [...attachmentCells].sort((a, b) => a - b),
    attachmentRetainedCellCount: attachmentCells.size, attachmentEdgeCount: attachmentEdges.length,
    reachesObservationBoundary: boundaryCellCount > 0, boundaryCellCount,
    sourceGeodesicWorld: summarizeValues(distances), angular: angularMetrics(indices, gridSize, sourceOrigin),
    skeletonHistoryClass: historyClass(skeletonPrior), footprintHistoryClass: historyClass(footprintPrior),
    priorMaterial: skeletonPrior, footprint: footprintPrior,
    distanceToPriorWorld: priorDistances ? summarizeValues(outsideCells.map(index => priorDistances[index] / (gridSize - 1))) : null,
    footprintDistanceToPriorWorld: priorDistances ? summarizeValues(outsideFootprint
      .map(index => priorDistances[index] / (gridSize - 1))) : null,
    _mask: mask, _footprint: footprint };
}

function summarizeRows(rows) {
  const definitions = {
    discardedFractionOfChosenComponent: row => row.discarded.fractionOfChosenComponent,
    discardedSkeletonNoveltyFraction: row => row.discarded.prior.newAreaFraction,
    discardedSkeletonPriorOverlapFraction: row => row.discarded.prior.priorOverlapFraction,
    discardedFootprintNoveltyFraction: row => row.discarded.potentialFootprint.newAreaFraction,
    discardedFootprintPriorOverlapFraction: row => row.discarded.potentialFootprint.priorOverlapFraction,
    retainedNetworkNoveltyFraction: row => row.retained.prior.newAreaFraction,
    retainedFootprintNoveltyFraction: row => row.retained.potentialFootprint.newAreaFraction,
    retainedFootprintPriorOverlapFraction: row => row.retained.potentialFootprint.priorOverlapFraction,
    discardedSkeletonCells: row => row.discarded.skeletonCellCount,
    discardedFootprintAreaCells: row => row.discarded.potentialFootprint.areaCells,
    discardedSkeletonNewCells: row => row.discarded.prior.newAreaCells,
    discardedSkeletonPriorOverlapCells: row => row.discarded.prior.priorOverlapCells,
    discardedFootprintNewAreaCells: row => row.discarded.potentialFootprint.newAreaCells,
    discardedFootprintPriorOverlapCells: row => row.discarded.potentialFootprint.priorOverlapCells,
    retainedSkeletonNewCells: row => row.retained.prior.newAreaCells,
    retainedSkeletonPriorOverlapCells: row => row.retained.prior.priorOverlapCells,
    retainedFootprintAreaCells: row => row.retained.potentialFootprint.areaCells,
    retainedFootprintNewAreaCells: row => row.retained.potentialFootprint.newAreaCells,
    retainedFootprintPriorOverlapCells: row => row.retained.potentialFootprint.priorOverlapCells,
    priorUnionCells: row => row.priorMaterial.unionCells,
    priorUnionAreaFraction: row => row.priorMaterial.unionFraction
  };
  return Object.fromEntries(Object.entries(definitions).map(([key, select]) => [key,
    summarizeValues(rows.map(row => select(row)).filter(Number.isFinite))]));
}

function temporalSummary(rows) {
  const metrics = ['discardedSkeletonNoveltyFraction', 'discardedFootprintNoveltyFraction',
    'discardedFootprintPriorOverlapFraction', 'discardedFractionOfChosenComponent', 'discardedSkeletonCells'];
  const seeds = [...new Set(rows.map(row => row.provenance.seed))].sort((a, b) => a - b);
  return seeds.map(seed => {
    const items = rows.filter(row => row.provenance.seed === seed).sort((a, b) => a.provenance.birthIndex - b.provenance.birthIndex);
    return { seed, birthCount: items.length, correlations: Object.fromEntries(metrics.map(key => {
      const series = items.map(row => metricValue(row, key));
      return [key, { birthIndex: pearsonCorrelation(items.map(row => row.provenance.birthIndex), series),
        simulationTimeSeconds: pearsonCorrelation(items.map(row => row.provenance.simulationTimeSeconds), series),
        priorUnionAreaFraction: pearsonCorrelation(items.map(row => row.priorMaterial.unionFraction), series) }];
    })) };
  });
}

function summarizeSegments(rows) {
  const segments = rows.flatMap(row => row.segments);
  return { count: segments.length,
    skeletonHistoryClasses: countClasses(segments.map(segment => segment.skeletonHistoryClass)),
    footprintHistoryClasses: countClasses(segments.map(segment => segment.footprintHistoryClass)),
    geodesicEligibleInteriorEndpointCount: segments.reduce((sum, segment) => sum + segment.geodesicEligibleInteriorEndpointCount, 0),
    eligibleEndpointSegmentsWithNewFootprint: segments.filter(segment => segment.geodesicEligibleInteriorEndpointCount > 0
      && segment.footprint.newAreaCells > 0).length,
    cellCount: summarizeValues(segments.map(segment => segment.cellCount)),
    potentialFootprintNewAreaCells: summarizeValues(segments.map(segment => segment.footprint.newAreaCells)),
    multiCellSegmentsWithNewFootprint: segments.filter(segment => segment.cellCount > 1
      && segment.footprint.newAreaCells > 0).length };
}

function summarizeNoveltyRegions(rows) {
  const summarize = key => {
    const regionsByBirth = rows.map(row => row.discarded.novelRegions[key].regions);
    const sizes = regionsByBirth.flatMap(regions => regions.map(region => region.cellCount));
    const largestShare = regionsByBirth.map(regions => {
      const total = regions.reduce((sum, region) => sum + region.cellCount, 0);
      return total ? Math.max(...regions.map(region => region.cellCount)) / total : null;
    });
    return { regionsPerBirth: summarizeValues(regionsByBirth.map(regions => regions.length)),
      connectedRegionCells: summarizeValues(sizes), largestRegionShare: summarizeValues(largestShare) };
  };
  return { discardedSkeleton: summarize('skeleton'), discardedFootprint: summarize('footprint') };
}

function chooseRepresentatives(rows) {
  const withPrior = rows.filter(row => row.priorMaterial.plateCount > 0);
  const values = withPrior.map(row => row.discarded.potentialFootprint.newAreaFraction).sort((a, b) => a - b);
  const median = summarizeValues(values).median;
  const candidates = [
    ['maxFootprintNoveltyWithPrior', [...withPrior].sort((a, b) => b.discarded.potentialFootprint.newAreaFraction
      - a.discarded.potentialFootprint.newAreaFraction || birthOrder(a, b))[0]],
    ['maxFootprintRedundancyWithPrior', [...withPrior].sort((a, b) => a.discarded.potentialFootprint.newAreaFraction
      - b.discarded.potentialFootprint.newAreaFraction || birthOrder(a, b))[0]],
    ['medianFootprintNoveltyWithPrior', [...withPrior].sort((a, b) => Math.abs(a.discarded.potentialFootprint.newAreaFraction - median)
      - Math.abs(b.discarded.potentialFootprint.newAreaFraction - median) || birthOrder(a, b))[0]],
    ['earliestBirth', [...rows].sort((a, b) => a.provenance.simulationTimeSeconds - b.provenance.simulationTimeSeconds)[0]],
    ['latestBirth', [...rows].sort((a, b) => b.provenance.simulationTimeSeconds - a.provenance.simulationTimeSeconds)[0]]
  ];
  const selected = new Map();
  for (const [key, row] of candidates) {
    if (!row) continue;
    const identity = `${row.provenance.seed}/${row.provenance.plateId}`;
    if (!selected.has(identity)) selected.set(identity, { key, row, roles: [] });
    selected.get(identity).roles.push(key);
  }
  return [...selected.values()];
}

function makeRepresentativeSvg(rows, selected) {
  const panelWidth = 162, panelHeight = 145, left = 180, top = 66, rowGap = 154;
  const panels = [
    ['Prior Plate union', row => maskSvg(row._visual.priorUnion, '#9aa0a6')],
    ['FULL chosen skeleton', row => maskSvg(row._visual.fullMask, '#333333')],
    ['RETAINED network', row => maskSvg(row._visual.retainedMask, '#1676a5')],
    ['DISCARDED skeleton', row => maskSvgLayers(row._visual.priorUnion, row._visual.discardedMask, '#dc3545', '#ff9800')],
    ['DISCARDED footprint', row => maskSvgLayers(row._visual.priorUnion, row._visual.discardedFootprint, '#8e44ad', '#ff9800')],
    ['Frozen Plate footprint', row => maskSvgLayers(row._visual.priorUnion, row._visual.actualMask, '#218838', '#218838')]
  ];
  const width = left + panels.length * panelWidth + 14, height = top + selected.length * rowGap + 12;
  const groups = selected.map(({ key, seed, plateId, criterion }, rowIndex) => {
    const row = rows.find(item => item.provenance.seed === seed && item.provenance.plateId === plateId);
    const y = top + rowIndex * rowGap;
    const label = `${seed} · ${plateId} · birth ${row.provenance.birthIndex} · ${row.provenance.simulationTimeSeconds.toFixed(1)} s`;
    const metrics = `discarded novelty skeleton ${(row.discarded.prior.newAreaFraction * 100).toFixed(1)}% · footprint ${(row.discarded.potentialFootprint.newAreaFraction * 100).toFixed(1)}% · ${criterion}`;
    return `<g><text x="8" y="${y + 18}" font-size="11">${escapeXml(label)}</text><text x="8" y="${y + 34}" font-size="9">${escapeXml(metrics)}</text>`
      + panels.map(([title, render], index) => {
        const x = left + index * panelWidth;
        return `<text x="${x}" y="${y - 9}" font-size="10">${title}</text><svg x="${x}" y="${y}" width="132" height="132" viewBox="0 0 96 96" preserveAspectRatio="none"><rect width="96" height="96" fill="#fff" stroke="#777"/>${render(row)}</svg>`;
      }).join('') + '</g>';
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><text x="8" y="24" font-size="14" font-weight="bold">Selector-discarded supported history · fixed 96×96 world grid</text>${groups}</svg>\n`;
}

function makeDistributionSvg(rows) {
  const metrics = [
    ['Discarded fraction of chosen skeleton', row => row.discarded.fractionOfChosenComponent],
    ['Discarded skeleton novelty outside prior Plate union', row => row.discarded.prior.newAreaFraction],
    ['Discarded footprint new-area fraction', row => row.discarded.potentialFootprint.newAreaFraction],
    ['Retained network skeleton novelty outside prior union', row => row.retained.prior.newAreaFraction],
    ['Retained / frozen Plate footprint new-area fraction', row => row.retained.potentialFootprint.newAreaFraction]
  ];
  const colors = new Map([[20261005, '#1769aa'], [20261006, '#c05a22'], [20261007, '#20845a']]);
  const width = 1050, left = 350, plotWidth = 520, rowHeight = 82, top = 52, height = top + metrics.length * rowHeight + 34;
  const body = metrics.map(([label, select], metricIndex) => {
    const y = top + metricIndex * rowHeight, vals = rows.map(select).filter(Number.isFinite), summary = summarizeValues(vals);
    const points = rows.filter(row => Number.isFinite(select(row))).map(row => {
      const value = select(row), jitter = ((row.provenance.birthIndex * 17 + row.provenance.seed % 97) % 23) - 11;
      const x = left + value * plotWidth, cy = y + 28 + jitter * 0.9;
      return `<circle cx="${x.toFixed(2)}" cy="${cy.toFixed(2)}" r="3.2" fill="${colors.get(row.provenance.seed)}" fill-opacity="0.72"><title>${row.provenance.seed} ${row.provenance.plateId}: ${(value * 100).toFixed(2)}%</title></circle>`;
    }).join('');
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(tick => {
      const x = left + tick * plotWidth;
      return `<line x1="${x}" y1="${y + 5}" x2="${x}" y2="${y + 53}" stroke="#ddd"/><text x="${x}" y="${y + 70}" font-size="9" text-anchor="middle">${tick.toFixed(2)}</text>`;
    }).join('');
    return `<text x="10" y="${y + 24}" font-size="11">${label}</text><text x="10" y="${y + 42}" font-size="9">n=${summary.count} · median ${(summary.median * 100).toFixed(1)}% · range ${(summary.min * 100).toFixed(1)}–${(summary.max * 100).toFixed(1)}%</text><line x1="${left}" y1="${y + 53}" x2="${left + plotWidth}" y2="${y + 53}" stroke="#333"/>${ticks}${points}`;
  }).join('');
  const legend = [[20261005, 'seed 20261005'], [20261006, 'seed 20261006'], [20261007, 'seed 20261007']]
    .map(([seed, label], index) => `<circle cx="${left + index * 160}" cy="28" r="4" fill="${colors.get(seed)}"/><text x="${left + 12 + index * 160}" y="32" font-size="10">${label}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><text x="10" y="22" font-size="14" font-weight="bold">All 100 births · shared fixed 0–1 axes</text>${legend}${body}</svg>\n`;
}

function makeTimeSvg(rows) {
  const colors = new Map([[20261005, '#1769aa'], [20261006, '#c05a22'], [20261007, '#20845a']]);
  const panels = [
    { title: 'Discarded skeleton prior overlap / novelty', maxY: 1,
      series: [['overlap', row => row.discarded.prior.priorOverlapFraction, 'square'], ['novelty', row => row.discarded.prior.newAreaFraction, 'circle']] },
    { title: 'Discarded footprint prior overlap / new area', maxY: 1,
      series: [['overlap', row => row.discarded.potentialFootprint.priorOverlapFraction, 'square'], ['new area', row => row.discarded.potentialFootprint.newAreaFraction, 'circle']] },
    { title: 'Discarded skeleton cells', maxY: Math.max(...rows.map(row => row.discarded.skeletonCellCount)),
      series: [['cells', row => row.discarded.skeletonCellCount, 'circle']] },
    { title: 'Discarded fraction of chosen skeleton', maxY: 1,
      series: [['fraction', row => row.discarded.fractionOfChosenComponent, 'circle']] }
  ];
  const width = 1060, left = 240, plotWidth = 760, top = 48, panelHeight = 132, height = top + panels.length * panelHeight + 24;
  const body = panels.map((panel, panelIndex) => {
    const y = top + panelIndex * panelHeight, plotTop = y + 10, plotBottom = y + 96;
    const yTicks = [0, 0.5, 1].map(tick => {
      const yy = plotBottom - tick * (plotBottom - plotTop), val = (panel.maxY * tick).toFixed(panel.maxY <= 1 ? 1 : 0);
      return `<line x1="${left}" y1="${yy}" x2="${left + plotWidth}" y2="${yy}" stroke="#ddd"/><text x="${left - 8}" y="${yy + 3}" font-size="9" text-anchor="end">${val}</text>`;
    }).join('');
    const points = panel.series.map(([name, select, shape], seriesIndex) => rows.map(row => {
      const value = select(row);
      if (!Number.isFinite(value)) return '';
      const x = left + row.provenance.simulationTimeSeconds / 600 * plotWidth;
      const yy = plotBottom - value / panel.maxY * (plotBottom - plotTop);
      const color = colors.get(row.provenance.seed);
      const marker = shape === 'square' ? `<rect x="${(x - 2.5).toFixed(2)}" y="${(yy - 2.5).toFixed(2)}" width="5" height="5" fill="${color}" fill-opacity="0.65"/>`
        : `<circle cx="${x.toFixed(2)}" cy="${yy.toFixed(2)}" r="2.7" fill="${color}" fill-opacity="0.65"/>`;
      return `${marker}<title>${row.provenance.seed} ${row.provenance.plateId} ${name}: ${value}</title>`;
    }).join('')).join('');
    const seriesLegend = panel.series.map(([name, , shape], index) => {
      const x = left + index * 125, marker = shape === 'square' ? `<rect x="${x}" y="${y + 2}" width="7" height="7" fill="#555"/>` : `<circle cx="${x + 3}" cy="${y + 5}" r="4" fill="#555"/>`;
      return `${marker}<text x="${x + 12}" y="${y + 9}" font-size="9">${name}</text>`;
    }).join('');
    const timeTicks = [0, 150, 300, 450, 600].map(value => {
      const x = left + value / 600 * plotWidth;
      return `<line x1="${x}" y1="${plotTop}" x2="${x}" y2="${plotBottom}" stroke="#eee"/><text x="${x}" y="${plotBottom + 13}" font-size="9" text-anchor="middle">${value}</text>`;
    }).join('');
    return `<text x="10" y="${y + 14}" font-size="11">${panel.title}</text>${seriesLegend}${yTicks}${timeTicks}${points}`;
  }).join('');
  const seedLegend = [[20261005, '05'], [20261006, '06'], [20261007, '07']].map(([seed, label], index) =>
    `<circle cx="${left + 560 + index * 54}" cy="22" r="4" fill="${colors.get(seed)}"/><text x="${left + 568 + index * 54}" y="26" font-size="9">${label}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><text x="10" y="22" font-size="14" font-weight="bold">Every birth · fixed simulation-time axis 0–600 s</text>${seedLegend}${body}</svg>\n`;
}

function maskSvg(mask, color) {
  return `<path d="${maskPath(mask)}" fill="${color}" fill-opacity="0.82" shape-rendering="crispEdges"/>`;
}

function maskSvgLayers(prior, current, overlapColor, newColor) {
  const overlap = new Uint8Array(cellCount), novel = new Uint8Array(cellCount);
  for (let index = 0; index < cellCount; index += 1) if (current[index]) {
    if (prior[index]) overlap[index] = 1; else novel[index] = 1;
  }
  return `${maskSvg(prior, '#d5d5d5')}${maskSvg(overlap, overlapColor)}${maskSvg(novel, newColor)}`;
}

function maskPath(mask) {
  let path = '';
  for (let index = 0; index < mask.length; index += 1) if (mask[index]) {
    path += `M${index % gridSize} ${Math.floor(index / gridSize)}h1v1h-1z`;
  }
  return path;
}

function indicesOf(mask) {
  const indices = [];
  for (let index = 0; index < mask.length; index += 1) if (mask[index]) indices.push(index);
  return indices;
}

function neighbors8(index, size) {
  const x = index % size, y = Math.floor(index / size), result = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < size && ny >= 0 && ny < size) result.push(ny * size + nx);
  }
  return result;
}

function diagonal(left, right) {
  return Math.abs(left % gridSize - right % gridSize) === 1
    && Math.abs(Math.floor(left / gridSize) - Math.floor(right / gridSize)) === 1;
}

function nearBoundary(index, distance) {
  const x = index % gridSize, y = Math.floor(index / gridSize);
  return Math.min(x, y, gridSize - 1 - x, gridSize - 1 - y) / (gridSize - 1) <= distance;
}

function metricValue(row, key) {
  if (key === 'discardedSkeletonNoveltyFraction') return row.discarded.prior.newAreaFraction;
  if (key === 'discardedFootprintNoveltyFraction') return row.discarded.potentialFootprint.newAreaFraction;
  if (key === 'discardedFootprintPriorOverlapFraction') return row.discarded.potentialFootprint.priorOverlapFraction;
  if (key === 'discardedFractionOfChosenComponent') return row.discarded.fractionOfChosenComponent;
  return row.discarded.skeletonCellCount;
}

function birthOrder(a, b) {
  return a.provenance.seed - b.provenance.seed || a.provenance.birthIndex - b.provenance.birthIndex;
}

function countOnes(mask) {
  let count = 0;
  for (const value of mask) if (value) count += 1;
  return count;
}

function describeRegions(mask) {
  const regions = connectedComponents(mask, gridSize).map((indices, index) => {
    const xs = indices.map(cell => cell % gridSize), ys = indices.map(cell => Math.floor(cell / gridSize));
    return { regionIndex: index + 1, cellCount: indices.length, cellIndices: indices,
      bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) } };
  });
  return { regionCount: regions.length, regionCellCounts: summarizeValues(regions.map(region => region.cellCount)), regions };
}

function historyClass(stats) {
  if (stats.priorOverlapCells === 0) return 'novel-only';
  if (stats.newAreaCells === 0) return 'prior-only';
  return 'mixed';
}

function countClasses(values) {
  return Object.fromEntries(['prior-only', 'mixed', 'novel-only'].map(key => [key,
    values.filter(value => value === key).length]));
}

async function writeChecksums(directory) {
  const rows = [];
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = resolve(folder, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name !== 'checksums.json') {
        const bytes = await readFile(path);
        rows.push({ path: relative(directory, path).split(sep).join('/'), bytes: bytes.length, sha256: sha256(bytes) });
      }
    }
  }
  await visit(directory);
  rows.sort((a, b) => a.path.localeCompare(b.path));
  await writeFile(resolve(directory, 'checksums.json'), `${JSON.stringify({ files: rows }, null, 2)}\n`);
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function escapeXml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
