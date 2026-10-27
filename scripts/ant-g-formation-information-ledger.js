import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync, gunzipSync, gzipSync } from 'node:zlib';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import {
  TRAIL_PLATE_CHEMICAL_THRESHOLD,
  TRAIL_PLATE_CHEMICAL_HALF_SATURATION,
  TRAIL_PLATE_SUPPORT_THRESHOLD,
  TRAIL_PLATE_SUPPORT_RADIUS,
  TRAIL_PLATE_SOURCE_ORIGIN,
  TRAIL_PLATE_SOURCE_RADII,
  TRAIL_PLATE_TARGET_EDGE_DISTANCE,
  TRAIL_PLATE_MIN_GEODESIC_LENGTH,
  TRAIL_PLATE_GRID_SIZE
} from '../src/lib/agents/ant/TrailPlateBirth.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const evidence = resolve(root, 'docs/ant/evidence/2026-10-27-g-formation-information-ledger');
const seed = 20261005;
const seconds = 120;
const ticks = seconds * 60;
const dt = 1 / 60;
const analysisGrid = TRAIL_PLATE_GRID_SIZE;
const analysisCells = analysisGrid ** 2;
const canvasSize = 320;
const candidateReviewSeconds = 60;
const analysisFieldNames = ['A_native', 'A_projection96', 'B_memory', 'B_mask', 'C_surface', 'D_support',
  'E_qualified', 'F_skeleton', 'G_source_connected', 'H_boundary_length_eligible', 'I_retained_network',
  'I_principal_path', 'J_candidate_ribbon', 'J_frozen_first_plate', 'J_frozen_birth_union',
  'J_frozen_material_union'];
const sourcePaths = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/LocalOccupancy.js',
  'src/lib/agents/ant/ColonyActivation.js'
];
const args = new Map(process.argv.slice(2).map(value => {
  const split = value.indexOf('=');
  return split < 0 ? [value, true] : [value.slice(0, split), value.slice(split + 1)];
}));

async function main() {
  await mkdir(resolve(evidence, 'data'), { recursive: true });
  await mkdir(resolve(evidence, 'review'), { recursive: true });
  const selectorSource = await readFile(resolve(root, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
  const selector = await makeDiagnosticSelector(selectorSource);
  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
    [path, sha256(await readFile(resolve(root, path)))])));
  const frozen120 = JSON.parse(gunzipSync(await readFile(resolve(evidence,
    '../2026-10-25-g-production-candidate-review/data/seed20261005-G-120s.json.gz'))));
  const frozenRaw = JSON.parse(gunzipSync(await readFile(resolve(evidence,
    '../2026-10-25-g-production-candidate-review/data/seed20261005-G-raw.json.gz'))));

  assert.equal(TRAIL_PLATE_CHEMICAL_THRESHOLD, 0.30);
  assert.equal(TRAIL_PLATE_CHEMICAL_HALF_SATURATION, 0.04);
  assert.equal(TRAIL_PLATE_SUPPORT_THRESHOLD, 0.015);
  assert.equal(TRAIL_PLATE_SUPPORT_RADIUS, 0.025);
  assert.deepEqual(TRAIL_PLATE_SOURCE_ORIGIN, { x: 0.5, y: 0.72 });
  assert.deepEqual(TRAIL_PLATE_SOURCE_RADII, [0.055, 0.115]);
  assert.equal(TRAIL_PLATE_TARGET_EDGE_DISTANCE, 0.05);
  assert.equal(TRAIL_PLATE_MIN_GEODESIC_LENGTH, 0.30);

  const observerOff = await runScenario({ observe: false, selector });
  const observerOn = await runScenario({ observe: true, selector });
  const parity = compareTickRows(observerOff.rows, observerOn.rows);
  assert.ok(parity.equalEveryTick, 'Read-only ledger must preserve every production tick');
  assert.equal(observerOff.rngCalls, observerOn.rngCalls);
  assert.equal(observerOff.rngState, observerOn.rngState);
  assert.deepEqual(observerOff.events, observerOn.events);
  const frozenChecks = compareFrozenInputs(observerOn, frozen120, frozenRaw);
  assert.ok(frozenChecks.endpointPheromoneExact, 'Current-G 120 s pheromone endpoint matches frozen packet');
  assert.ok(frozenChecks.endpointSurfaceExact, 'Current-G 120 s SurfaceField endpoint matches frozen packet');
  assert.ok(frozenChecks.firstPlateReceiptExact, 'First current-G Plate time and mask match frozen packet');
  assert.ok(frozenChecks.contactPrefixCountsExact, '120 s contact group/foot totals match frozen raw input');

  const analyses = observerOn.analyses;
  assert.ok(analyses.length >= 100 && analyses.length <= 121, 'Expected one production analysis per second');
  assert.ok(analyses.some(row => row.birthsThisTick > 0), 'First natural Plate birth is inside the 120 s window');
  const firstBirth = observerOn.births.find(item => item.type === 'plate-birth')?.payload;
  assert.ok(firstBirth, 'Expected the first natural Plate birth');
  const checkpoints = selectCheckpoints(analyses, firstBirth.bornAtSimulationTimeMs);
  const anchorCheckpoint = closestAnalysis(analyses, candidateReviewSeconds * 1000);
  const ridgeAnchors = selectRidgeAnchors(anchorCheckpoint.maps.A_projection96, analysisGrid);
  const crossSections = checkpoints.map(checkpoint => measureCrossSections(checkpoint, ridgeAnchors));
  const continuity = summarizeContinuity(analyses);
  const stageRows = analyses.map(({ maps, ...row }) => row);
  const summary = {
    schema: 'ant-g-formation-information-ledger-v1',
    status: 'valid',
    provenance: {
      freshMain: 'aeefa12d8de9da400cb8a2a3d4b5080a21ba0292',
      researchParent: 'aeefa12d8de9da400cb8a2a3d4b5080a21ba0292',
      branch: 'codex/ant-g-formation-information-ledger-20261027',
      startingWorkBranch: 'codex/ant-delayed-contact-history-reveal-20261027',
      startingWorkHead: 'a6e56de22ea7be6aa4ea9355188d93cf8cd757cf',
      sourceHashes,
      diagnosticRunnerSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
      transformedSelectorSha256: selector.transformedSourceHash,
      frozen120Sha256: sha256(await readFile(resolve(evidence,
        '../2026-10-25-g-production-candidate-review/data/seed20261005-G-120s.json.gz'))),
      frozenRawSha256: sha256(await readFile(resolve(evidence,
        '../2026-10-25-g-production-candidate-review/data/seed20261005-G-raw.json.gz')))
    },
    method: { seed, seconds, ticks, tickRate: 60, audioBridge: null,
      materialLocomotionResistance: true, defaults: 'AntController defaults; no state patch or source override',
      firstAnalysisMs: analyses[0]?.simulationTimeMs ?? null,
      finalSimulationTimeMs: observerOn.final.simulationTimeMs,
      latestAnalysisAtOrBefore120Ms: analyses.at(-1)?.simulationTimeMs ?? null,
      nativePheromone: '316x316 Float32; exact bytes retained at selected analyses',
      analysisGrid: '96x96 at normalized node coordinates; raw chemical projection uses production bilinear field.sample',
      supportMap: 'Full diagnostic sampleSupport map for spatial comparison; production buildSupportedMask values asserted equal on chemical-qualified cells',
      continuity: 'maximum Jaccard overlap against any component at immediately preceding production analysis; descriptive only',
      ridgeSelection: { atMs: anchorCheckpoint.simulationTimeMs, algorithm: 'positive raw-chemical 8-neighbor maxima; plateau ties choose lower row-major index; sort by value descending/index ascending; greedily keep anchors more than 3 cells apart; at most 12',
        count: ridgeAnchors.length, anchors: ridgeAnchors } },
    frozenChecks,
    observerParity: parity,
    stateAudit: { observerStateUnchangedAtEachAnalysis: observerOn.observerStateUnchanged,
      diagnosticSelectorMatchesLiveCandidate: observerOn.selectorParity,
      productionAnalyzedRows: analyses.length,
      rngCalls: observerOn.rngCalls, rngState: observerOn.rngState,
      contactGroups: observerOn.events.contactGroups, individualFeet: observerOn.events.individualFeet,
      firstPlate: { id: firstBirth.id, bornAtSimulationTimeMs: firstBirth.bornAtSimulationTimeMs,
        source: firstBirth.source, target: firstBirth.target, geodesicLength: firstBirth.geodesicLength,
        maskCells: countMask(firstBirth.mask), maskSha256: sha256(Buffer.from(firstBirth.mask)) },
      plateBirths: observerOn.births.filter(item => item.type === 'plate-birth').map(({ payload }) => ({
        id: payload.id, bornAtSimulationTimeMs: payload.bornAtSimulationTimeMs,
        source: payload.source, target: payload.target, geodesicLength: payload.geodesicLength,
        stableSeconds: payload.provenance?.stableSeconds, maskCells: countMask(payload.mask),
        maskSha256: sha256(Buffer.from(payload.mask))
      })),
      plateCountAt120s: observerOn.final.plateCount, sphereBirthCount: observerOn.events.sphereBirthCount,
      finalPheromoneSha256: sha256(floatBytes(observerOn.final.pheromone)),
      finalSurfaceSha256: sha256(floatBytes(observerOn.final.surface)),
      finalMaterialStratigraphySha256: observerOn.final.materialSha256 },
    checkpoints: checkpoints.map(({ maps, ...row }) => row),
    crossSectionMethod: { anchorsSelectedAtMs: anchorCheckpoint.simulationTimeMs,
      normal: 'minor eigenvector of value-weighted covariance within 11x11 raw-chemical projection window; isotropic covariance tie uses +x',
      offsetsGridCells: { start: -8, end: 8, step: 0.5 },
      values: 'raw chemical projection, raw compaction, and full diagnostic sampleSupport; no value threshold added',
      results: crossSections },
    temporalContinuity: continuity,
    stages: stageRows,
    interpretation: {
      implementation: 'Current production transforms and thresholds are unchanged; the observer exposes their intermediate maps and selector counts.',
      existingEvidence: 'The 2026-10-08 local-accretion shadow is pre-G and branch-only. Its outcomes are not current-G natural evidence.',
      newMeasurement: 'Single current-G seed 20261005, one 0-120 s run, with exact observer-off/on parity and a frozen 120 s receipt.',
      modelingHypothesis: null,
      artisticInterpretation: 'Not evaluated; no formation candidate or renderer was tested.'
    }
  };

  await writeFile(resolve(evidence, 'data/formation-ledger.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(resolve(evidence, 'data/observer-parity.json'), `${JSON.stringify(parity, null, 2)}\n`);
  await writeFile(resolve(evidence, 'data/frozen-input-parity.json'), `${JSON.stringify(frozenChecks, null, 2)}\n`);
  await writeFile(resolve(evidence, 'data/continuity.json'), `${JSON.stringify(continuity, null, 2)}\n`);
  await writeFile(resolve(evidence, 'data/cross-sections.json'), `${JSON.stringify(crossSections, null, 2)}\n`);
  await writeCheckpointPacket(checkpoints);
  await renderReview(checkpoints);
  console.log(JSON.stringify({ status: summary.status, analyses: analyses.length, checkpoints: summary.checkpoints,
    observerParity: parity.equalEveryTick, frozenChecks, firstPlate: summary.stateAudit.firstPlate,
    rngCalls: observerOn.rngCalls, output: evidence }, null, 2));
}

async function runScenario({ observe, selector }) {
  let rngState = seed >>> 0, rngCalls = 0;
  const random = () => {
    rngCalls += 1;
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
    return rngState / 0x100000000;
  };
  const controller = new AntController({ random });
  const rows = [], analyses = [], births = [], pendingContacts = [], pendingBirths = [];
  const contactHash = createHash('sha256'), birthHash = createHash('sha256');
  let contactGroups = 0, individualFeet = 0, sphereBirthCount = 0, observerStateUnchanged = true;
  let selectorParity = true, lastAnalysisMs = null;
  const continuityState = { previousComponents: [] };
  const priorIds = new Set();
  controller.subscribe(event => {
    if (event.type === 'foot-contact') {
      pendingContacts.push(event.payload);
      contactGroups += 1;
      individualFeet += Array.isArray(event.payload?.contacts) ? event.payload.contacts.length : 0;
      contactHash.update(JSON.stringify(event.payload) + '\n');
    } else if (event.type === 'plate-birth' || event.type === 'sphere-birth') {
      pendingBirths.push({ type: event.type, payload: event.payload });
      births.push({ type: event.type, payload: event.payload });
      birthHash.update(JSON.stringify({ type: event.type, payload: event.payload }) + '\n');
      if (event.type === 'sphere-birth') sphereBirthCount += 1;
    }
  });
  await controller.init();
  const totalTicks = ticks;
  for (let tick = 0; tick <= totalTicks; tick += 1) {
    if (tick > 0) controller.tick(dt);
    const currentIds = new Set(controller.agents.map(agent => agent.id));
    const lifecycle = {
      entered: [...currentIds].filter(id => !priorIds.has(id)).sort(),
      exited: [...priorIds].filter(id => !currentIds.has(id)).sort()
    };
    const hashes = stateHashes(controller, rngState, rngCalls, pendingContacts, pendingBirths, lifecycle);
    rows.push({ tick, simulationTimeMs: controller.simulationTimeMs, hashes });
    priorIds.clear(); for (const id of currentIds) priorIds.add(id);

    const birth = controller.trailPlateBirth;
    if (observe && birth.lastAnalysisTimeMs !== null && birth.lastAnalysisTimeMs !== lastAnalysisMs) {
      const before = stateHashes(controller, rngState, rngCalls, pendingContacts, pendingBirths, lifecycle);
      const { nextComponents, ...analysis } = inspectAnalysis(controller, selector, pendingBirths,
        continuityState.previousComponents);
      const after = stateHashes(controller, rngState, rngCalls, pendingContacts, pendingBirths, lifecycle);
      if (JSON.stringify(before) !== JSON.stringify(after)) observerStateUnchanged = false;
      assert.deepEqual(after, before, `Read-only observer mutated state at tick ${tick}`);
      selectorParity &&= analysis.selectorMatchesLive;
      assert.ok(analysis.selectorMatchesLive, `Diagnostic selector differs from live production at tick ${tick}`);
      continuityState.previousComponents = nextComponents;
      analyses.push(analysis);
      lastAnalysisMs = birth.lastAnalysisTimeMs;
    }
    pendingContacts.length = 0;
    pendingBirths.length = 0;
  }
  const material = controller.materialStratigraphy;
  const final = { simulationTimeMs: controller.simulationTimeMs, plateCount: controller.trailPlateBirth.plates.length,
    pheromone: controller.field.values.slice(), surface: controller.surfaceField.values.slice(),
    materialSha256: materialStateHash(material) };
  const events = { contactGroups, individualFeet, sphereBirthCount,
    contactStreamSha256: contactHash.digest('hex'), birthStreamSha256: birthHash.digest('hex'),
    plateBirths: births.filter(item => item.type === 'plate-birth').length };
  await controller.destroy();
  return { rows, analyses, births, events, final, rngState, rngCalls, observerStateUnchanged, selectorParity };
}

function inspectAnalysis(controller, selector, birthsThisTick, previousComponents) {
  const birth = controller.trailPlateBirth;
  const surface = controller.surfaceField;
  const build = birth.buildSupportedMask(surface);
  const funnel = {};
  const candidate = selector.selectCandidateDiagnostic(build.mask, build.supports, birth.chemicalMemory, funnel);
  const selectorMatchesLive = candidatesEqual(candidate, birth.candidate);
  const chemical = birth.chemicalMemory;
  const chemicalMask = Uint8Array.from(chemical, value => value >= TRAIL_PLATE_CHEMICAL_THRESHOLD ? 1 : 0);
  const projection = projectChemical(controller.field, analysisGrid);
  const projectionPositive = Uint8Array.from(projection, value => value > 0 ? 1 : 0);
  const chemicalPositive = Uint8Array.from(chemical, value => value > 0 ? 1 : 0);
  const support = new Float32Array(analysisCells);
  for (let row = 0; row < analysisGrid; row += 1) {
    const y = row / (analysisGrid - 1);
    for (let column = 0; column < analysisGrid; column += 1) {
      const index = row * analysisGrid + column;
      const x = column / (analysisGrid - 1);
      support[index] = Math.max(0, surface.sampleSupport(x, y, TRAIL_PLATE_SUPPORT_RADIUS));
      if (chemical[index] >= TRAIL_PLATE_CHEMICAL_THRESHOLD) {
        assert.equal(support[index], build.supports[index], `Production support sample differs at cell ${index}`);
      }
    }
  }
  const skeleton = new Uint8Array(analysisCells);
  const sourceConnected = new Uint8Array(analysisCells);
  const boundaryLengthEligible = new Uint8Array(analysisCells);
  for (const component of funnel.components) {
    for (const index of component.skeletonIndices) {
      skeleton[index] = 1;
      if (component.sourceCount > 0) sourceConnected[index] = 1;
      if (component.sourceCount > 0 && component.qualifiedBoundaryTargets > 0) boundaryLengthEligible[index] = 1;
    }
  }
  const retainedNetwork = new Uint8Array(analysisCells);
  const principalPath = new Uint8Array(analysisCells);
  if (candidate) {
    for (const index of candidate.skeletonIndices) retainedNetwork[index] = 1;
    for (const index of candidate.path) principalPath[index] = 1;
  }
  const materialUnion = Uint8Array.from(controller.materialStratigraphy.layerCountByCell,
    value => value > 0 ? 1 : 0);
  const firstPlate = birth.plates[0];
  const frozenFirstPlate = firstPlate ? Uint8Array.from(firstPlate.mask) : new Uint8Array(analysisCells);
  const frozenBirthUnion = new Uint8Array(analysisCells);
  for (const plate of birth.plates) for (let index = 0; index < analysisCells; index += 1) {
    if (plate.mask[index]) frozenBirthUnion[index] = 1;
  }
  for (const event of birthsThisTick) if (event.type === 'plate-birth') {
    assert.ok(candidate && arraysEqual(candidate.mask, Uint8Array.from(event.payload.mask)),
      'Production candidate ribbon must equal the just-frozen Plate raster at birth');
  }
  const candidateRibbon = candidate ? Uint8Array.from(candidate.mask) : new Uint8Array(analysisCells);
  const surfaceValues = surface.values;
  const inputDiagnostics = { ...birth.lastInputDiagnostics };
  assert.deepEqual(build.diagnostics, inputDiagnostics, 'Rebuilt production inputs match live diagnostics');
  const componentSummary = summarizeFunnel(funnel);
  const metrics = {
    A_native: describeFloat(controller.field.values),
    A_projection96: describeFloat(projection), A_projection96Positive: topology(projectionPositive, false),
    B_memory: describeFloat(chemical), B_positive: topology(chemicalPositive, false),
    B_productionThreshold: topology(chemicalMask, false), B_thresholdCells: countMask(chemicalMask),
    C_surface: describeFloat(surfaceValues),
    C_rawPositive: topology(Uint8Array.from(surfaceValues, value => value > 0 ? 1 : 0), false),
    C_rawAtSupportThreshold: topology(Uint8Array.from(surfaceValues,
      value => value >= TRAIL_PLATE_SUPPORT_THRESHOLD ? 1 : 0), false),
    C_rawAboveSupportThreshold: countAtLeast(surfaceValues, TRAIL_PLATE_SUPPORT_THRESHOLD),
    D_supportAllCells: describeFloat(support), D_positive: topology(Uint8Array.from(support,
      value => value > 0 ? 1 : 0), false),
    D_atSupportThreshold: topology(Uint8Array.from(support,
      value => value >= TRAIL_PLATE_SUPPORT_THRESHOLD ? 1 : 0), false),
    D_allCellsAboveSupportThreshold: countAtLeast(support, TRAIL_PLATE_SUPPORT_THRESHOLD),
    D_productionQueries: inputDiagnostics.chemicalQualifiedCells,
    E_qualifiedCells: countMask(build.mask),
    F_skeleton: topology(skeleton), G_sourceConnected: { cells: countMask(sourceConnected), ...componentSummary.source },
    H_boundaryLengthEligible: { cells: countMask(boundaryLengthEligible), ...componentSummary.boundaryLength },
    I_retainedNetwork: topology(retainedNetwork),
    I_principalPathCells: countMask(principalPath),
    J_candidateRibbon: topology(candidateRibbon, false), J_frozenFirstPlate: topology(frozenFirstPlate, false),
    J_frozenBirthUnion: topology(frozenBirthUnion, false),
    J_frozenMaterialUnion: topology(materialUnion, false),
    candidate: candidate ? { source: candidate.source, target: candidate.target,
      geodesicLength: candidate.geodesicLength, skeletonCells: candidate.skeletonIndices.length,
      principalPathLengthWorldUnits: pathLength(candidate.path) / (analysisGrid - 1),
      meanChemical: candidate.meanChemical, meanSupport: candidate.meanSupport,
      corridorCells: countMask(candidate.supportedMask),
      ribbonOutsideCorridorCells: countOutside(candidate.mask, candidate.supportedMask),
      ribbonIntersectionCells: intersectionCount(candidate.mask, candidate.supportedMask),
      widthDistribution: candidateWidths(candidate, selector),
      candidateCorridorIoU: maskIoU(candidate.mask, candidate.supportedMask) } : null,
    inputDiagnostics
  };
  const temporal = componentContinuity(funnel.components, previousComponents);
  const nextComponents = funnel.components.map(component => component.skeletonIndices.slice());
  const births = birthsThisTick.filter(item => item.type === 'plate-birth');
  const row = { tick: Math.round(controller.simulationTimeMs / (1000 / 60)),
    simulationTimeMs: birth.lastAnalysisTimeMs, simulationSeconds: birth.lastAnalysisTimeMs / 1000,
    birthsThisTick: births.length, plateCount: birth.plates.length,
    candidate: birth.candidate ? { stableSeconds: birth.candidate.stableSeconds,
      startedAtMs: birth.candidate.startedAtMs, similarity: birth.candidate.similarity } : null,
    metrics, componentContinuity: temporal, selectorMatchesLive,
    topologyAtSnapshot: { E: topology(build.mask, false), F: topology(skeleton),
      G: topology(sourceConnected), H: topology(boundaryLengthEligible), I: topology(retainedNetwork),
      Jcandidate: topology(candidateRibbon, false), JfirstPlate: topology(frozenFirstPlate, false),
      JbirthUnion: topology(frozenBirthUnion, false), Jmaterial: topology(materialUnion, false) } };
  return { ...row, nextComponents, maps: {
    A_native: controller.field.values.slice(), A_projection96: projection,
    B_memory: chemical.slice(), B_mask: chemicalMask,
    C_surface: surfaceValues.slice(), D_support: support,
    E_qualified: Uint8Array.from(build.mask), F_skeleton: skeleton,
    G_source_connected: sourceConnected, H_boundary_length_eligible: boundaryLengthEligible,
    I_retained_network: retainedNetwork, I_principal_path: principalPath,
    J_candidate_ribbon: candidateRibbon, J_frozen_first_plate: frozenFirstPlate,
    J_frozen_birth_union: frozenBirthUnion,
    J_frozen_material_union: materialUnion
  } };
}

function summarizeFunnel(funnel) {
  const components = funnel.components || [];
  const source = components.filter(row => row.sourceCount > 0);
  const withBoundary = source.filter(row => row.boundaryCount > 0);
  const withLength = source.filter(row => row.qualifiedBoundaryTargets > 0);
  return {
    componentCount: components.length,
    source: { componentCount: source.length, disconnectedComponentCount: components.length - source.length,
      skeletonCells: source.reduce((sum, row) => sum + row.skeletonPixels, 0),
      componentSizes: source.map(row => row.skeletonPixels).sort((a, b) => a - b) },
    boundaryLength: { sourceComponentsWithBoundary: withBoundary.length,
      sourceComponentsPassingMinLength: withLength.length,
      componentsFailingBoundaryOrLength: source.length - withLength.length,
      boundaryTargets: withBoundary.reduce((sum, row) => sum + row.boundaryCount, 0),
      qualifyingBoundaryTargets: withLength.reduce((sum, row) => sum + row.qualifiedBoundaryTargets, 0),
      eligibleSkeletonCells: withLength.reduce((sum, row) => sum + row.skeletonPixels, 0),
      maximumGeodesicLengthWorldUnits: maxOrNull(withLength.map(row => row.geodesicLength)),
      rejected: components.filter(row => row.rejection).reduce((out, row) => {
        out[row.rejection] = (out[row.rejection] || 0) + 1; return out;
      }, {}) }
  };
}

function candidatesEqual(a, b) {
  if (!a || !b) return a === b;
  return JSON.stringify({ source: a.source, target: a.target, geodesicLength: a.geodesicLength,
    meanSupport: a.meanSupport, meanChemical: a.meanChemical, path: a.path,
    skeletonIndices: [...a.skeletonIndices], mask: [...a.mask], supportedMask: [...a.supportedMask],
    component: [...a.component] }) === JSON.stringify({ source: b.source, target: b.target,
    geodesicLength: b.geodesicLength, meanSupport: b.meanSupport, meanChemical: b.meanChemical,
    path: b.path, skeletonIndices: [...b.skeletonIndices], mask: [...b.mask],
    supportedMask: [...b.supportedMask], component: [...b.component] });
}

function stateHashes(controller, rngState, rngCalls, contacts, births, lifecycle) {
  const agents = controller.agents.slice().sort((a, b) => String(a.id).localeCompare(String(b.id))).map(agent => ({
    ...agent,
    gait: controller.gaitController.ants.get(agent.id) || null,
    bodyPose: controller.bodyPoseController.ants.get(agent.id) || null
  }));
  const gaster = [...controller.gasterDeposition.ants.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)));
  const material = controller.materialStratigraphy;
  const birth = controller.trailPlateBirth;
  const birthState = { lastAnalysisTimeMs: birth.lastAnalysisTimeMs, lastBirthTimeMs: birth.lastBirthTimeMs,
    lastInputDiagnostics: birth.lastInputDiagnostics, candidate: digestCandidate(birth.candidate),
    plates: birth.plates.map(descriptorDigest), birthRecords: birth.birthRecords.map(record => ({
      id: record.id, bornAtSimulationTimeMs: record.bornAtSimulationTimeMs,
      corridorMask: sha256(Buffer.from(record.corridorMask)), principalPath: hashJson(record.principalPath),
      footContactsAtBirth: record.footContactsAtBirth
    })) };
  return {
    agents: hashJson(agents),
    controller: hashJson({ time: controller.simulationTimeMs, state: controller.state,
      totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired,
      nextAgentId: controller.nextAgentId, nextSpawnTimeMs: controller.nextSpawnTimeMs,
      recruitmentLimit: controller.recruitmentLimit, activation: controller.colonyActivation,
      occupancy: controller.occupancy, gaster: { mode: controller.gasterDeposition.mode,
        spacing: controller.gasterDeposition.spacing, ants: gaster }, lifecycle }),
    rng: hashJson({ rngState, rngCalls }),
    pheromone: sha256(floatBytes(controller.field.values)),
    surface: hashJson({ values: sha256(floatBytes(controller.surfaceField.values)),
      totalFootContacts: controller.surfaceField.totalFootContacts }),
    chemicalMemory: sha256(floatBytes(birth.chemicalMemory)),
    contactCounts: sha256(floatBytes(birth.footContactCounts)),
    birthState: hashJson(birthState),
    material: materialStateHash(material),
    events: hashJson({ contacts, births })
  };
}

function digestCandidate(candidate) {
  if (!candidate) return null;
  return { scalars: { source: candidate.source, target: candidate.target,
    geodesicLength: candidate.geodesicLength, meanSupport: candidate.meanSupport,
    meanChemical: candidate.meanChemical, startedAtMs: candidate.startedAtMs,
    stableSeconds: candidate.stableSeconds, similarity: candidate.similarity,
    footContacts: candidate.footContacts, repeatDiagnostics: candidate.repeatDiagnostics },
  path: candidate.path, skeletonIndices: candidate.skeletonIndices,
  mask: sha256(floatBytes(candidate.mask)), supportedMask: sha256(floatBytes(candidate.supportedMask)),
  component: sha256(floatBytes(candidate.component)) };
}

function descriptorDigest(descriptor) {
  if (!descriptor) return null;
  return { id: descriptor.id, bornAtSimulationTimeMs: descriptor.bornAtSimulationTimeMs,
    source: descriptor.source, target: descriptor.target,
    mask: sha256(Buffer.from(descriptor.mask)), principalPath: hashJson(descriptor.principalPath),
    centerline: hashJson(descriptor.centerline), edges: hashJson(descriptor.edges),
    provenance: descriptor.provenance, metrics: descriptor.metrics, material: descriptor.material };
}

function materialStateHash(material) {
  return hashJson({ revision: material.revision, noduleRevision: material.noduleRevision,
    simulationTimeMs: material.simulationTimeMs, lastAdvanceTimeMs: material.lastAdvanceTimeMs,
    lastNoduleEvaluationTimeMs: material.lastNoduleEvaluationTimeMs,
    totalAcceptedFootContacts: material.totalAcceptedFootContacts,
    rejectedFootContacts: material.rejectedFootContacts,
    qualifiedNoduleCandidateCount: material.qualifiedNoduleCandidateCount,
    layerCountByCell: sha256(floatBytes(material.layerCountByCell)),
    topLayerByCell: sha256(floatBytes(material.topLayerByCell)),
    totalDepthByCellMeters: sha256(floatBytes(material.totalDepthByCellMeters)),
    footLoadByCell: sha256(floatBytes(material.footLoadByCell)),
    candidateSinceMs: sha256(floatBytes(material.candidateSinceMs)),
    columns: hashJson(material.columns), plates: material.plates.map(descriptorDigest),
    nodules: hashJson(material.nodules) });
}

function compareTickRows(a, b) {
  if (a.length !== b.length) return { equalEveryTick: false, mismatch: { length: [a.length, b.length] }, comparedTicks: Math.min(a.length, b.length) };
  const fields = Object.keys(a[0].hashes);
  const chains = Object.fromEntries(fields.map(field => [field, createHash('sha256')]));
  for (let tick = 0; tick < a.length; tick += 1) {
    if (a[tick].tick !== b[tick].tick || a[tick].simulationTimeMs !== b[tick].simulationTimeMs) {
      return { equalEveryTick: false, mismatch: { tick, field: 'clock' }, comparedTicks: tick };
    }
    for (const field of fields) {
      chains[field].update(a[tick].hashes[field] + '\n');
      if (a[tick].hashes[field] !== b[tick].hashes[field]) {
        return { equalEveryTick: false, mismatch: { tick, field,
          observerOff: a[tick].hashes[field], observerOn: b[tick].hashes[field] }, comparedTicks: tick };
      }
    }
  }
  return { equalEveryTick: true, comparedTicks: a.length,
    fields: Object.fromEntries(fields.map(field => [field, chains[field].digest('hex')])) };
}

function compareFrozenInputs(run, frozen120, frozenRaw) {
  const projection = projectChemical({ width: run.final.pheromone.length === 316 ** 2 ? 316 : 0,
    height: 316, values: run.final.pheromone, sample: makeBilinearSampler(run.final.pheromone, 316, 316) }, 96);
  const frozenPheromone = Float32Array.from(frozen120.pheromone.values);
  const frozenSurface = Float32Array.from(frozen120.surface.values);
  const actualFirst = run.births.find(item => item.type === 'plate-birth')?.payload;
  const expectedFirst = frozenRaw.births[0];
  const maskSha = actualFirst ? sha256(Buffer.from(actualFirst.mask)) : null;
  const birthMatches = Boolean(actualFirst && expectedFirst
    && actualFirst.id === expectedFirst.id
    && actualFirst.bornAtSimulationTimeMs === expectedFirst.bornAtSimulationTimeMs
    && JSON.stringify(actualFirst.source) === JSON.stringify(expectedFirst.source)
    && JSON.stringify(actualFirst.target) === JSON.stringify(expectedFirst.target)
    && maskSha === expectedFirst.maskSha256);
  const expectedContactDigest = frozenRaw.events.contactStreamSha256;
  const expectedPrefixCounts = frozenRaw.contactsBySecond.slice(0, seconds).reduce((sum, row) => ({
    contactGroups: sum.contactGroups + row.groups, individualFeet: sum.individualFeet + row.feet
  }), { contactGroups: 0, individualFeet: 0 });
  return {
    frozenPacketSeconds: frozen120.seconds,
    endpointSimulationTimeMs: run.final.simulationTimeMs,
    endpointPheromoneExact: arraysEqual(projection, frozenPheromone),
    endpointSurfaceExact: arraysEqual(run.final.surface, frozenSurface),
    firstPlateReceiptExact: birthMatches,
    firstPlate: actualFirst ? { id: actualFirst.id, bornAtSimulationTimeMs: actualFirst.bornAtSimulationTimeMs,
      expectedBornAtSimulationTimeMs: expectedFirst?.bornAtSimulationTimeMs,
      maskSha256: maskSha, expectedMaskSha256: expectedFirst?.maskSha256 } : null,
    contactDigestReceiptExact: null,
    contactPrefixCountsExact: run.events.contactGroups === expectedPrefixCounts.contactGroups
      && run.events.individualFeet === expectedPrefixCounts.individualFeet,
    expectedPrefixCounts,
    observedPrefixCounts: { contactGroups: run.events.contactGroups, individualFeet: run.events.individualFeet },
    contactDigestComparison: 'Unavailable: the frozen packet stores only a 600 s digest. The 120 s event prefix is checked internally between observer OFF/ON, and first-120 s archived group/foot totals are compared.',
    frozenContactDigestSha256: expectedContactDigest,
    observed120sContactPrefixSha256: run.events.contactStreamSha256,
    note: 'Projection uses the frozen G runner 96-grid bilinear coordinates; endpoint array comparisons are exact Float32 values.'
  };
}

function selectCheckpoints(analyses, firstBirthMs) {
  const candidates = [
    { label: 'near-30s', row: closestAnalysis(analyses, 30000) },
    { label: 'candidate-stable-10s', row: analyses.find(row => row.candidate?.stableSeconds >= 10) || null },
    { label: 'pre-first-Plate', row: [...analyses].reverse().find(row => row.simulationTimeMs < firstBirthMs) || null },
    { label: 'first-Plate-birth', row: analyses.find(row => row.simulationTimeMs === firstBirthMs) || null },
    { label: 'last-analysis-through-120s', row: [...analyses].reverse().find(row => row.simulationTimeMs <= seconds * 1000) || null }
  ];
  const byTick = new Map();
  for (const { label, row } of candidates) {
    if (!row) continue;
    const entry = byTick.get(row.tick) || { ...row, labels: [] };
    entry.labels.push(label);
    byTick.set(row.tick, entry);
  }
  assert.equal(byTick.size, new Set([...byTick.values()].map(row => row.tick)).size);
  return [...byTick.values()].sort((a, b) => a.simulationTimeMs - b.simulationTimeMs);
}

function closestAnalysis(rows, targetMs) {
  return rows.reduce((best, row) => Math.abs(row.simulationTimeMs - targetMs)
    < Math.abs(best.simulationTimeMs - targetMs) ? row : best, rows[0]);
}

function selectRidgeAnchors(values, size) {
  const peaks = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!(value > 0)) continue;
    const x = index % size, y = Math.floor(index / size);
    let isPeak = true;
    for (let dy = -1; dy <= 1 && isPeak; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      const neighbor = ny * size + nx;
      if (values[neighbor] > value || (values[neighbor] === value && neighbor < index)) { isPeak = false; break; }
    }
    if (isPeak) peaks.push({ index, x, y, value });
  }
  peaks.sort((a, b) => b.value - a.value || a.index - b.index);
  const selected = [];
  for (const peak of peaks) {
    if (selected.some(other => Math.hypot(peak.x - other.x, peak.y - other.y) <= 3)) continue;
    const normal = ridgeNormal(values, size, peak.x, peak.y);
    selected.push({ ...peak, normal, eigenvalueRatio: normal.ratio });
    if (selected.length === 12) break;
  }
  return selected;
}

function ridgeNormal(values, size, x0, y0) {
  let total = 0, meanX = 0, meanY = 0;
  for (let y = Math.max(0, y0 - 5); y <= Math.min(size - 1, y0 + 5); y += 1) {
    for (let x = Math.max(0, x0 - 5); x <= Math.min(size - 1, x0 + 5); x += 1) {
      const weight = Math.max(0, values[y * size + x]);
      total += weight; meanX += x * weight; meanY += y * weight;
    }
  }
  if (!total) return { x: 1, y: 0, ratio: 1 };
  meanX /= total; meanY /= total;
  let xx = 0, yy = 0, xy = 0;
  for (let y = Math.max(0, y0 - 5); y <= Math.min(size - 1, y0 + 5); y += 1) {
    for (let x = Math.max(0, x0 - 5); x <= Math.min(size - 1, x0 + 5); x += 1) {
      const weight = Math.max(0, values[y * size + x]);
      xx += weight * (x - meanX) ** 2; yy += weight * (y - meanY) ** 2;
      xy += weight * (x - meanX) * (y - meanY);
    }
  }
  xx /= total; yy /= total; xy /= total;
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  let nx = -Math.sin(angle), ny = Math.cos(angle);
  const lambdaMax = (xx + yy + Math.hypot(xx - yy, 2 * xy)) * 0.5;
  const lambdaMin = Math.max(0, (xx + yy - Math.hypot(xx - yy, 2 * xy)) * 0.5);
  if (lambdaMin > lambdaMax - 1e-12) { nx = 1; ny = 0; }
  if (nx < 0 || (Math.abs(nx) < 1e-12 && ny < 0)) { nx *= -1; ny *= -1; }
  return { x: nx, y: ny, ratio: lambdaMin > 1e-12 ? lambdaMax / lambdaMin : null };
}

function measureCrossSections(checkpoint, anchors) {
  const maps = checkpoint.maps;
  const profiles = anchors.map(anchor => {
    const samples = [];
    for (let step = -16; step <= 16; step += 1) {
      const offsetCells = step / 2;
      const x = anchor.x + anchor.normal.x * offsetCells;
      const y = anchor.y + anchor.normal.y * offsetCells;
      samples.push({ offsetCells, rawChemical: sampleGrid(maps.A_projection96, x, y),
        chemicalMemory: sampleGrid(maps.B_memory, x, y),
        rawCompaction: sampleGrid(maps.C_surface, x, y),
        supportReadout: sampleGrid(maps.D_support, x, y) });
    }
    return { anchorIndex: anchor.index, x: anchor.x, y: anchor.y, anchorChemicalAt60s: anchor.value,
      normal: anchor.normal, eigenvalueRatio: anchor.eigenvalueRatio,
      centerValues: samples.find(sample => sample.offsetCells === 0), samples,
      peakOffsets: Object.fromEntries(['rawChemical', 'chemicalMemory', 'rawCompaction', 'supportReadout']
        .map(name => [name, peakOffset(samples, name)])) };
  });
  return { label: checkpoint.labels, tick: checkpoint.tick, simulationTimeMs: checkpoint.simulationTimeMs,
    pearsonAcross96: { rawChemicalRawCompaction: pearson(maps.A_projection96, maps.C_surface),
      rawChemicalSupportReadout: pearson(maps.A_projection96, maps.D_support),
      chemicalMemoryRawCompaction: pearson(maps.B_memory, maps.C_surface),
      chemicalMemorySupportReadout: pearson(maps.B_memory, maps.D_support) },
    peakOffsetDistributions96Cells: Object.fromEntries(['rawChemical', 'chemicalMemory', 'rawCompaction', 'supportReadout']
      .map(name => [name, distribution(profiles.map(row => row.peakOffsets[name]?.offsetCells))])),
    exactCenterPeakCounts: Object.fromEntries(['rawChemical', 'chemicalMemory', 'rawCompaction', 'supportReadout']
      .map(name => [name, profiles.filter(row => row.peakOffsets[name]?.offsetCells === 0).length])),
    profiles };
}

function peakOffset(samples, field) {
  const valid = samples.filter(row => Number.isFinite(row[field]));
  if (!valid.length) return null;
  valid.sort((a, b) => b[field] - a[field] || Math.abs(a.offsetCells) - Math.abs(b.offsetCells)
    || a.offsetCells - b.offsetCells);
  return { offsetCells: valid[0].offsetCells, value: valid[0][field] };
}

function summarizeContinuity(analyses) {
  return analyses.map(row => ({ tick: row.tick, simulationTimeMs: row.simulationTimeMs,
    componentContinuity: row.componentContinuity }));
}

function componentContinuity(current, previous) {
  if (!previous.length) return { priorComponentCount: 0, currentComponentCount: current.length,
    componentsWithSharedCells: 0, bestJaccard: distribution([]) };
  const matched = current.map(component => {
    let best = 0, shared = 0;
    const set = new Set(component.skeletonIndices);
    for (const other of previous) {
      let intersection = 0;
      for (const index of other) if (set.has(index)) intersection += 1;
      const union = set.size + other.length - intersection;
      const iou = union ? intersection / union : 0;
      if (iou > best) { best = iou; shared = intersection; }
    }
    return { bestJaccard: best, sharedCells: shared, cells: component.skeletonPixels };
  });
  return { priorComponentCount: previous.length, currentComponentCount: current.length,
    componentsWithSharedCells: matched.filter(row => row.sharedCells > 0).length,
    bestJaccard: distribution(matched.map(row => row.bestJaccard)), matches: matched };
}

async function writeCheckpointPacket(checkpoints) {
  const chunks = [], descriptors = [];
  let offset = 0;
  for (const checkpoint of checkpoints) {
    const fields = {};
    for (const name of analysisFieldNames) {
      const values = checkpoint.maps[name];
      const bytes = floatBytes(values);
      fields[name] = { offset, byteLength: bytes.length, type: values instanceof Float32Array ? 'Float32LE-native' : 'Uint8',
        length: values.length, sha256: sha256(bytes) };
      chunks.push(bytes); offset += bytes.length;
    }
    descriptors.push({ labels: checkpoint.labels, tick: checkpoint.tick,
      simulationTimeMs: checkpoint.simulationTimeMs, fields });
  }
  const raw = Buffer.concat(chunks);
  await writeFile(resolve(evidence, 'data/checkpoint-arrays.bin.gz'), gzipSync(raw, { level: 9 }));
  await writeFile(resolve(evidence, 'data/checkpoint-arrays-index.json'), `${JSON.stringify({
    encoding: 'Concatenated exact typed-array bytes, gzip compressed; Float32 byte order is the little-endian runtime used by the replay.',
    uncompressedBytes: raw.length, compressedSha256: sha256(gzipSync(raw, { level: 9 })),
    fieldsOrder: analysisFieldNames, checkpoints: descriptors
  }, null, 2)}\n`);
}

async function renderReview(checkpoints) {
  const stages = [
    ['A_native', 'A · native chemical 316'], ['A_projection96', 'A′ · chemical projection 96'],
    ['B_memory', 'B · chemical memory'], ['B_mask', 'B · production chemical threshold'],
    ['C_surface', 'C · raw SurfaceField'], ['D_support', 'D · sampleSupport'],
    ['E_qualified', 'E · qualified mask'], ['F_skeleton', 'F · full skeleton'],
    ['G_source_connected', 'G · source-annulus components'], ['H_boundary_length_eligible', 'H · boundary + length eligible'],
    ['I_retained_network', 'I · retained network'], ['I_principal_path', 'I · principal path'],
    ['J_candidate_ribbon', 'J · candidate ribbon'], ['J_frozen_first_plate', 'J · first frozen Plate mask'],
    ['J_frozen_birth_union', 'J · union of frozen Plate masks'],
    ['J_frozen_material_union', 'J · frozen material union']
  ];
  const markup = [];
  for (let checkpointIndex = 0; checkpointIndex < checkpoints.length; checkpointIndex += 1) {
    const checkpoint = checkpoints[checkpointIndex];
    const slug = checkpoint.labels.join('_').replace(/[^a-z0-9_-]+/gi, '-');
    const cards = [];
    for (const [field, title] of stages) {
      const values = checkpoint.maps[field];
      const nativeSize = field === 'A_native' ? 316 : 96;
      const maxValue = field === 'A_native' ? 8 : 1;
      const isMask = !(values instanceof Float32Array);
      const image = gridImage(values, nativeSize, isMask ? 1 : maxValue, canvasSize, isMask);
      const path = `review/${slug}-${field}.png`;
      await writePng(resolve(evidence, path), canvasSize, canvasSize, image);
      cards.push(`<figure><figcaption>${escapeHtml(title)}</figcaption><a href="${path}"><img loading="lazy" width="320" height="320" src="${path}" alt="${escapeHtml(title)}"></a></figure>`);
    }
    markup.push(`<section><h2>${escapeHtml(checkpoint.labels.join(' · '))} — ${(checkpoint.simulationTimeMs / 1000).toFixed(6)} s</h2><div class="grid">${cards.join('')}</div></section>`);
  }
  const html = `<!doctype html><meta charset="utf-8"><title>G formation information ledger</title>
<style>body{font:15px system-ui,sans-serif;margin:24px;color:#222}section{margin:2rem 0 4rem}h1,h2{font-weight:600}.grid{display:grid;grid-template-columns:repeat(5,minmax(160px,1fr));gap:16px}figure{margin:0}figcaption{min-height:2.5em;font-size:13px}img{width:100%;height:auto;image-rendering:pixelated;background:white;border:1px solid #bbb}p{max-width:75ch;line-height:1.5}@media(max-width:900px){.grid{grid-template-columns:repeat(2,minmax(130px,1fr))}}</style>
<h1>G formation information ledger</h1><p>Technical stage maps from one current-G seed 20261005 replay. Every map shares normalized 0–1 world coordinates. Continuous maps use fixed linear grayscale: native chemical 0–8; chemical memory, compaction, and support 0–1. Binary maps are black where occupied. Each map is nearest-sampled for display; exact arrays and statistics are in the evidence data.</p>
${markup.join('\n')}`;
  await writeFile(resolve(evidence, 'review.html'), `${html}\n`);
}

async function writePng(path, width, height, pixels) {
  const raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y += 1) raw[y * (width + 1)] = 0;
  for (let y = 0; y < height; y += 1) Buffer.from(pixels.buffer, pixels.byteOffset + y * width,
    width).copy(raw, y * (width + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 0;
  const chunks = [pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))];
  await writeFile(path, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), ...chunks]));
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function gridImage(values, sourceSize, maximum, targetSize, binary) {
  const output = new Uint8Array(targetSize * targetSize);
  for (let y = 0; y < targetSize; y += 1) for (let x = 0; x < targetSize; x += 1) {
    const sx = Math.round(x * (sourceSize - 1) / (targetSize - 1));
    const sy = Math.round(y * (sourceSize - 1) / (targetSize - 1));
    const value = values[sy * sourceSize + sx];
    output[y * targetSize + x] = binary ? (value ? 0 : 255)
      : 255 - Math.round(255 * Math.max(0, Math.min(1, value / maximum)));
  }
  return output;
}

function projectChemical(field, size) {
  const result = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    result[y * size + x] = field.sample(x / (size - 1), y / (size - 1));
  }
  return result;
}

function makeBilinearSampler(values, width, height) {
  return (x, y) => {
    if (x < 0 || x > 1 || y < 0 || y > 1) return 0;
    const gx = x * (width - 1), gy = y * (height - 1);
    const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
    const tx = gx - x0, ty = gy - y0;
    const top = values[y0 * width + x0] * (1 - tx) + values[y0 * width + x1] * tx;
    const bottom = values[y1 * width + x0] * (1 - tx) + values[y1 * width + x1] * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

function sampleGrid(values, x, y) {
  if (x < 0 || x > analysisGrid - 1 || y < 0 || y > analysisGrid - 1) return null;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(analysisGrid - 1, x0 + 1), y1 = Math.min(analysisGrid - 1, y0 + 1);
  const tx = x - x0, ty = y - y0;
  const a = values[y0 * analysisGrid + x0] * (1 - tx) + values[y0 * analysisGrid + x1] * tx;
  const b = values[y1 * analysisGrid + x0] * (1 - tx) + values[y1 * analysisGrid + x1] * tx;
  return a * (1 - ty) + b * ty;
}

function topology(mask, graph = true) {
  const components = maskComponents(mask, 8);
  let endpoints = 0, junctionNodes = 0;
  const junctionMask = new Uint8Array(mask.length);
  if (graph) for (let index = 0; index < mask.length; index += 1) if (mask[index]) {
    const degree = neighbors(index, 8).filter(next => mask[next]).length;
    if (degree === 1) endpoints += 1;
    if (degree >= 3) { junctionNodes += 1; junctionMask[index] = 1; }
  }
  return { cells: countMask(mask), components: components.length,
    componentSize: distribution(components.map(component => component.length)),
    endpoints8NeighborProxy: graph ? endpoints : null, junctionNodes8NeighborProxy: graph ? junctionNodes : null,
    junctionClusters8NeighborProxy: graph ? maskComponents(junctionMask, 8).length : null,
    holes4ConnectedBackground: holeCount(mask) };
}

function maskComponents(mask, connectivity) {
  const seen = new Uint8Array(mask.length), result = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || seen[index]) continue;
    const queue = [index], component = []; seen[index] = 1;
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head]; component.push(current);
      for (const next of neighbors(current, connectivity)) if (mask[next] && !seen[next]) {
        seen[next] = 1; queue.push(next);
      }
    }
    result.push(component);
  }
  return result;
}

function neighbors(index, connectivity) {
  const x = index % analysisGrid, y = Math.floor(index / analysisGrid), out = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (!dx && !dy) continue;
    if (connectivity === 4 && Math.abs(dx) + Math.abs(dy) !== 1) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < analysisGrid && ny >= 0 && ny < analysisGrid) out.push(ny * analysisGrid + nx);
  }
  return out;
}

function holeCount(mask) {
  const seen = new Uint8Array(mask.length);
  let holes = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] || seen[index]) continue;
    const queue = [index]; seen[index] = 1; let touchesEdge = false;
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head], x = current % analysisGrid, y = Math.floor(current / analysisGrid);
      if (x === 0 || y === 0 || x === analysisGrid - 1 || y === analysisGrid - 1) touchesEdge = true;
      for (const next of neighbors(current, 4)) if (!mask[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
    }
    if (!touchesEdge) holes += 1;
  }
  return holes;
}

function candidateWidths(candidate, selector) {
  const distances = selector.distanceToCorridorEdgeDiagnostic(candidate.supportedMask);
  const widths = candidate.skeletonIndices.map(index => Math.max(0.012,
    Math.min(0.030, distances[index] / (analysisGrid - 1))));
  return distribution(widths);
}

function pathLength(indices) {
  let length = 0;
  for (let i = 1; i < indices.length; i += 1) {
    const dx = Math.abs(indices[i] % analysisGrid - indices[i - 1] % analysisGrid);
    const dy = Math.abs(Math.floor(indices[i] / analysisGrid) - Math.floor(indices[i - 1] / analysisGrid));
    length += dx && dy ? Math.SQRT2 : 1;
  }
  return length;
}

function describeFloat(values) {
  let n = 0, min = Infinity, max = -Infinity, sum = 0, positiveCells = 0;
  for (const value of values) if (Number.isFinite(value)) {
    n += 1; sum += value; min = Math.min(min, value); max = Math.max(max, value);
    if (value > 0) positiveCells += 1;
  }
  return { n, min: n ? min : null, mean: n ? sum / n : null,
    max: n ? max : null, positiveCells };
}

function distribution(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  return { n: clean.length, min: clean[0] ?? null, p25: quantile(clean, 0.25),
    p50: quantile(clean, 0.5), p75: quantile(clean, 0.75), max: clean.at(-1) ?? null };
}
function quantile(sorted, p) { return sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null; }
function countMask(mask) { let count = 0; for (const value of mask) if (value) count += 1; return count; }
function countAtLeast(values, threshold) { let count = 0; for (const value of values) if (value >= threshold) count += 1; return count; }
function countOutside(mask, region) { let count = 0; for (let i = 0; i < mask.length; i += 1) if (mask[i] && !region[i]) count += 1; return count; }
function intersectionCount(a, b) { let count = 0; for (let i = 0; i < a.length; i += 1) if (a[i] && b[i]) count += 1; return count; }
function maskIoU(a, b) { let intersection = 0, union = 0; for (let i = 0; i < a.length; i += 1) { intersection += Boolean(a[i] && b[i]); union += Boolean(a[i] || b[i]); } return union ? intersection / union : 1; }
function maxOrNull(values) { return values.length ? Math.max(...values) : null; }
function pearson(a, b) {
  if (a.length !== b.length || !a.length) return null;
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let covariance = 0, varianceA = 0, varianceB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const da = a[i] - meanA, db = b[i] - meanB;
    covariance += da * db; varianceA += da * da; varianceB += db * db;
  }
  return varianceA && varianceB ? covariance / Math.sqrt(varianceA * varianceB) : null;
}
function arraysEqual(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }
function floatBytes(values) { return Buffer.from(values.buffer, values.byteOffset, values.byteLength); }
function hashJson(value) { return sha256(Buffer.from(JSON.stringify(value))); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

async function makeDiagnosticSelector(source) {
  let code = source.replace(/\r\n/g, '\n');
  code = replaceOnce(code, 'function selectCandidate(mask, supports, chemicalMemory) {',
    "function selectCandidate(mask, supports, chemicalMemory, funnel = null, endpointMode = 'boundary') {");
  code = replaceOnce(code, '  const components = skeletonComponents(skeleton);\n  let best = null;',
    '  const components = skeletonComponents(skeleton);\n  const componentRows = [];\n  const candidateRows = [];\n  let best = null;');
  code = replaceOnce(code, '  for (const component of components) {\n    const componentSet',
    '  for (const component of components) {\n    const row = { skeletonPixels: component.length, skeletonIndices: component };\n    componentRows.push(row);\n    const supportedComponent = maskComponent(mask, component[0]);\n    row.supportedComponentIndices = [];\n    for (let i = 0; i < supportedComponent.length; i += 1) if (supportedComponent[i]) row.supportedComponentIndices.push(i);\n    const componentSet');
  code = replaceOnce(code, '    if (!sourceIndices.length || !targetIndices.length) continue;',
    "    row.sourceCount = sourceIndices.length; row.boundaryCount = targetIndices.length;\n    if (!sourceIndices.length || (endpointMode !== 'shadow' && !targetIndices.length)) { row.rejection = sourceIndices.length ? 'missing-boundary-target' : 'missing-source'; continue; }");
  code = replaceOnce(code, '    let target = -1;\n    let farthest = -Infinity;\n    for (const index of targetIndices.sort((a, b) => a - b)) {',
    "    const interiorGraphEndpointIndices = component.filter(index => !nearObservationBoundary(gridPoint(index))\n      && neighbors(index).filter(adjacent => componentSet[adjacent]).length === 1);\n    const interiorEndpointIndices = interiorGraphEndpointIndices.filter(index => Number.isFinite(distance[index])\n      && distance[index] / (TRAIL_PLATE_GRID_SIZE - 1) >= TRAIL_PLATE_MIN_GEODESIC_LENGTH);\n    row.interiorGraphEndpointCount = interiorGraphEndpointIndices.length;\n    row.interiorEndpointIndices = interiorEndpointIndices;\n    row.interiorEndpointCount = interiorEndpointIndices.length;\n    row.gainsInteriorEndpointFamily = interiorEndpointIndices.length > 0;\n    const selectionTargetIndices = endpointMode === 'shadow'\n      ? [...new Set([...targetIndices, ...interiorEndpointIndices])].sort((a, b) => a - b) : targetIndices;\n    if (!selectionTargetIndices.length) {\n      row.rejection = interiorGraphEndpointIndices.length ? 'below-min-geodesic' : 'missing-boundary-target';\n      continue;\n    }\n    let target = -1;\n    let farthest = -Infinity;\n    for (const index of selectionTargetIndices.sort((a, b) => a - b)) {");
  code = replaceOnce(code, '    const geodesicLength = farthest / (TRAIL_PLATE_GRID_SIZE - 1);\n    if (target < 0 || geodesicLength < TRAIL_PLATE_MIN_GEODESIC_LENGTH) continue;',
    '    const geodesicLength = farthest / (TRAIL_PLATE_GRID_SIZE - 1);\n    row.target = target; row.geodesicLength = geodesicLength;\n    row.qualifiedBoundaryTargets = targetIndices.filter(index => distance[index] / (TRAIL_PLATE_GRID_SIZE - 1) >= TRAIL_PLATE_MIN_GEODESIC_LENGTH).length;\n    row.selectedEndpointCount = selectionTargetIndices.filter(index => distance[index] / (TRAIL_PLATE_GRID_SIZE - 1) >= TRAIL_PLATE_MIN_GEODESIC_LENGTH).length;\n    if (target < 0 || geodesicLength < TRAIL_PLATE_MIN_GEODESIC_LENGTH) { row.rejection = \'below-min-geodesic\'; continue; }');
  code = replaceOnce(code, '    for (const endpoint of targetIndices) {',
    '    for (const endpoint of selectionTargetIndices) {');
  code = replaceOnce(code, '    const candidate = {\n      mask: ribbonMask,',
    '    row.retainedSkeletonPixels = networkIndices.length;\n    row.unretainedSkeletonPixels = component.length - networkIndices.length;\n    row.unretainedSkeletonRatio = component.length ? row.unretainedSkeletonPixels / component.length : 0;\n    row.corridorSupportedCells = supportCells;\n    row.candidateSourceIndex = source;\n    row.selectedInteriorEndpointIndices = interiorEndpointIndices.filter(index => network[index]);\n    row.rejection = null;\n    const candidate = {\n      mask: ribbonMask,');
  code = replaceOnce(code, '      skeletonIndices: networkIndices,\n      component: networkComponent,',
    '      skeletonIndices: networkIndices,\n      component: networkComponent,\n      selectedEndpointIndices: selectionTargetIndices.filter(index => network[index]),\n      selectedInteriorEndpointIndices: interiorEndpointIndices.filter(index => network[index]),');
  code = replaceOnce(code, '    if (!best || candidate.geodesicLength > best.geodesicLength\n      || (candidate.geodesicLength === best.geodesicLength && source < best.source.index)) best = candidate;\n  }\n  return best;\n}',
    '    candidateRows.push({ source: candidate.source, target: candidate.target, geodesicLength: candidate.geodesicLength, path: candidate.path, networkIndices: candidate.skeletonIndices, ribbonCells: candidate.mask.reduce((sum, value) => sum + value, 0), corridorSupportedCells: supportCells, selectedInteriorEndpointIndices: candidate.selectedInteriorEndpointIndices, ribbonMask: candidate.mask, supportedMask: candidate.supportedMask, component: candidate.component });\n    if (!best || candidate.geodesicLength > best.geodesicLength\n      || (candidate.geodesicLength === best.geodesicLength && source < best.source.index)) best = candidate;\n  }\n  if (funnel) { const winner = candidateRows.findIndex(row => row.source.index === best?.source.index); funnel.skeletonPixels = skeleton.reduce((sum, value) => sum + value, 0); funnel.componentCount = components.length; funnel.components = componentRows; funnel.candidateComponentCount = candidateRows.length; funnel.candidates = candidateRows.map(({ source, target, geodesicLength, path, networkIndices, ribbonCells, corridorSupportedCells, selectedInteriorEndpointIndices }) => ({ source, target, geodesicLength, path, networkIndices, ribbonCells, corridorSupportedCells, selectedInteriorEndpointIndices })); funnel.winner = winner; funnel.losers = candidateRows.length - (best ? 1 : 0); }\n  return best;\n}');
  code += '\nexport { selectCandidate as selectCandidateDiagnostic, distanceToCorridorEdge as distanceToCorridorEdgeDiagnostic };\n';
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return { selectCandidateDiagnostic: module.selectCandidateDiagnostic,
    distanceToCorridorEdgeDiagnostic: module.distanceToCorridorEdgeDiagnostic, transformedSourceHash: sha256(code) };
}

function replaceOnce(source, before, after) {
  assert.ok(source.includes(before), `Diagnostic hook missing: ${before.slice(0, 80)}`);
  return source.replace(before, after);
}

async function selfcheck() {
  const ring = new Uint8Array(analysisCells);
  for (let y = 10; y < 13; y += 1) for (let x = 10; x < 13; x += 1) {
    if (x !== 11 || y !== 11) ring[y * analysisGrid + x] = 1;
  }
  assert.equal(topology(ring).components, 1);
  assert.equal(topology(ring).holes4ConnectedBackground, 1);
  assert.equal(pathLength([10 * analysisGrid + 10, 10 * analysisGrid + 11, 11 * analysisGrid + 12]), 1 + Math.SQRT2);
  assert.equal(countAtLeast(Float32Array.from([0, 0.015625, 1]), 0.015), 2);
  const selectorSource = await readFile(resolve(root, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
  const selector = await makeDiagnosticSelector(selectorSource);
  const result = selector.selectCandidateDiagnostic(new Uint8Array(analysisCells),
    new Float32Array(analysisCells), new Float32Array(analysisCells), {});
  assert.equal(result, null);
  const pixels = gridImage(ring, analysisGrid, 1, 8, true);
  const pngPath = resolve(root, 'test-results/ant-ledger-selfcheck.png');
  await mkdir(resolve(root, 'test-results'), { recursive: true });
  await writePng(pngPath, 8, 8, pixels);
  const png = await readFile(pngPath);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  console.log(JSON.stringify({ selfcheck: 'pass', checks: 7, transformedSelectorSha256: selector.transformedSourceHash }));
}

function distributionNoMutation(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function arraysSame(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }
function maxOrNullSafe(values) { return values.length ? Math.max(...values) : null; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (args.has('--selfcheck')) await selfcheck();
  else await main();
}
