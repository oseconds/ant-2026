import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createShadowTemporalQualifier } from './ant-morphology-shadow-temporal.js';
import { measureShadowCandidate } from './ant-morphology-shadow-analysis.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = new Map(process.argv.slice(2).map(value => {
  const at = value.indexOf('=');
  return at < 0 ? [value, true] : [value.slice(0, at), value.slice(at + 1)];
}));
const output = resolve(String(args.get('--output') || resolve(root, 'test-results/ant-morphology-replay')));
const archive = resolve(String(args.get('--archive') || resolve(root, 'docs/ant/evidence/2026-10-07-social-graph/data')));
const seeds = String(args.get('--seeds') || '20261005,20261006,20261007').split(',').map(Number);
const seconds = Number(args.get('--seconds') || 600);
const DT = 1 / 60;
const HASH_FIELDS = ['agents', 'rng', 'chemical', 'surface', 'chemicalMemory', 'birthState', 'contactCounts', 'contacts', 'births', 'lifecycle'];
const CHECKPOINTS = new Set([30, 60, 120, 300, 600]);
const SOURCE_PATHS = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/agents/ant/GaitController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/ColonyActivation.js'];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (args.has('--selfcheck')) selfcheck();
  else await main();
}

async function main() {
  assert.ok(Number.isInteger(seconds) && seconds > 0, '--seconds must be a positive integer');
  assert.ok(seeds.length && seeds.every(seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff),
    '--seeds must contain unsigned 32-bit integers');
  await mkdir(output, { recursive: true });
  const source = await readFile(resolve(root, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
  const sourceHash = sha256(source);
  const { selectCandidateDiagnostic, selectCandidateShadowDiagnostic, corridorSimilarityDiagnostic,
    distanceToCorridorEdgeDiagnostic, transformedSourceHash } = await makeDiagnosticSelector(source);
  const { AntController } = await import(pathToFileURL(resolve(root, 'src/lib/agents/ant/AntController.js')).href);
  const sourceHashes = Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path =>
    [path, sha256(await readFile(resolve(root, path)))])));
  const runnerHash = sha256(await readFile(fileURLToPath(import.meta.url)));
  const diagnosticToolHashes = Object.fromEntries(await Promise.all([
    'scripts/ant-morphology-shadow-temporal.js', 'scripts/ant-morphology-shadow-analysis.js',
    'scripts/ant-morphology-shadow-plots.js', 'scripts/ant-morphology-plates.js'
  ].map(async path => [path, sha256(await readFile(resolve(root, path)))])));
  const manifest = { schemaVersion: 1, commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    node: process.version, seeds, seconds, dtSeconds: DT, sourceHashes, runnerHash, transformedSourceHash, diagnosticToolHashes,
    method: 'Fresh natural default controller; injected LCG; AudioBridge absent; paired plain and diagnostic runs. Production selector is checked unchanged; shadow selector runs on the same supported mask, support, and chemical-memory arrays.',
    snapshots: 'Exact Float32 chemical field, persistent chemical memory, surface field, supported-mask support, and Uint32 contact-count arrays at each actual qualification analysis tick. Array rows are lossless XOR deltas from prior snapshot, gzip compressed.',
    hashFields: HASH_FIELDS, checkpointSeconds: [...CHECKPOINTS], archiveDirectory: archive, files: [] };
  for (const seed of seeds) {
    const result = await runPair({ AntController, seed, seconds, output, selectCandidateDiagnostic,
      selectCandidateShadowDiagnostic, corridorSimilarityDiagnostic, distanceToCorridorEdgeDiagnostic });
    const archiveResult = await compareArchive(seed, result, archive, seconds);
    result.summary.archiveComparison = archiveResult;
    await writeFile(resolve(output, `seed${seed}-summary.json`), `${JSON.stringify(result.summary, null, 2)}\n`);
    manifest.files.push(result.files);
    console.log(JSON.stringify({ seed, seconds, parity: result.summary.parity,
      archiveComparison: archiveResult, wallSeconds: result.summary.runs.instrumented.wallSeconds,
      bytes: result.files.bytes }));
  }
  manifest.createdAt = new Date().toISOString();
  await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function runPair({ AntController, seed, seconds, output, selectCandidateDiagnostic,
  selectCandidateShadowDiagnostic, corridorSimilarityDiagnostic, distanceToCorridorEdgeDiagnostic }) {
  const baseline = await runScenario({ AntController, seed, seconds, instrument: false, selectCandidateDiagnostic,
    selectCandidateShadowDiagnostic, corridorSimilarityDiagnostic, distanceToCorridorEdgeDiagnostic });
  const instrumented = await runScenario({ AntController, seed, seconds, instrument: true, selectCandidateDiagnostic,
    selectCandidateShadowDiagnostic, corridorSimilarityDiagnostic, distanceToCorridorEdgeDiagnostic });
  const parity = compareRows(baseline.rows, instrumented.rows);
  assert.deepEqual(parity.firstMismatch, {}, `Instrumented replay mismatch for seed ${seed}`);
  assert.equal(baseline.trajectoryHash, instrumented.trajectoryHash, 'Trajectory bytes match');
  assert.deepEqual(baseline.contacts, instrumented.contacts, 'All raw contact records match');
  assert.deepEqual(baseline.births, instrumented.births, 'All raw birth descriptor records match');
  const payload = { schemaVersion: 1, seed, seconds, parity: { everyTick: true, comparedTicks: parity.comparedTicks,
    fields: parity.fieldChains, trajectory: true, behavior: true, rng: true, chemical: true, surface: true,
    chemicalMemory: true, contactCounts: true, contacts: true, births: true },
    runs: { baseline: baseline.provenance, instrumented: instrumented.provenance },
    checkpoints: instrumented.checkpoints, morphology: instrumented.morphology,
    rawArchive: { path: `docs/ant/evidence/2026-10-07-social-graph/data/seed${seed}-on-raw-events.json.gz`,
      contacts: instrumented.contacts.length, births: instrumented.births.length } };
  const diagnostic = serializeSnapshots(instrumented.snapshots);
  const summary = { ...payload, snapshotEncoding: diagnostic.encoding };
  const files = { summary: `seed${seed}-summary.json`, snapshots: `seed${seed}-snapshots.bin.gz`, bytes: {} };
  await writeFile(resolve(output, files.snapshots), gzipSync(diagnostic.bytes, { level: 6 }));
  files.bytes = { snapshots: (await stat(resolve(output, files.snapshots))).size };
  await writeFile(resolve(output, files.summary), `${JSON.stringify(summary, null, 2)}\n`);
  return { summary, files, trajectory: instrumented.trajectory, contacts: instrumented.contacts, births: instrumented.births };
}

async function runScenario({ AntController, seed, seconds, instrument, selectCandidateDiagnostic,
  selectCandidateShadowDiagnostic, corridorSimilarityDiagnostic, distanceToCorridorEdgeDiagnostic }) {
  const started = performance.now();
  let rngState = seed >>> 0, rngCalls = 0;
  const controller = new AntController({ materialLocomotionResistance: false, random: () => {
    rngCalls += 1;
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
    return rngState / 0x100000000;
  } });
  const rows = [], contacts = [], births = [], trajectoryChunks = [];
  const snapshots = [], morphology = [], checkpoints = [];
  const shadowTemporal = instrument ? createShadowTemporalQualifier(corridorSimilarityDiagnostic) : null;
  const productionPlateUnion = new Set();
  let unionPlateCount = 0;
  let pendingContacts = [], pendingBirths = [], pendingLifecycle = [];
  const active = new Set();
  controller.subscribe(event => {
    if (event.type === 'foot-contact') pendingContacts.push(event.payload);
    if (event.type === 'plate-birth' || event.type === 'sphere-birth') pendingBirths.push({ type: event.type, payload: event.payload });
  });
  await controller.init();
  const birthSystem = controller.trailPlateBirth;
  let lastMaskBuild = null;
  if (instrument) {
    const build = birthSystem.buildSupportedMask.bind(birthSystem);
    birthSystem.buildSupportedMask = surface => {
      lastMaskBuild = build(surface);
      return lastMaskBuild;
    };
  }
  const ids = new Map();
  let frame = trajectoryFrame(0, controller.agents, ids);
  pendingLifecycle = lifecycleDelta(active, new Set(frame.agents.map(agent => agent.id)), 0, new Map(), controller.agents);
  record(0, controller, frame);
  trajectoryChunks.push(trajectoryHeader(), trajectoryFrameBytes(frame));
  const totalTicks = seconds * 60;
  try {
    for (let tick = 1; tick <= totalTicks; tick += 1) {
      const before = new Map(controller.agents.map(agent => [agent.id, agent]));
      controller.tick(DT);
      const timeSeconds = controller.simulationTimeMs / 1000;
      frame = trajectoryFrame(timeSeconds, controller.agents, ids);
      pendingLifecycle = lifecycleDelta(active, new Set(frame.agents.map(agent => agent.id)), timeSeconds, before, controller.agents);
      if (instrument && lastMaskBuild) {
        const bornThisTick = hasPlateBirth(pendingBirths);
        while (unionPlateCount < birthSystem.plates.length) {
          const mask = birthSystem.plates[unionPlateCount++].mask;
          for (let index = 0; index < mask.length; index += 1) if (mask[index]) productionPlateUnion.add(index);
        }
        morphology.push(captureMorphology({ controller, build: lastMaskBuild, timeSeconds, tick, bornThisTick,
          selectCandidateDiagnostic, selectCandidateShadowDiagnostic, shadowTemporal,
          distanceToCorridorEdgeDiagnostic, productionPlateUnion }));
        snapshots.push(captureSnapshot(controller, lastMaskBuild, tick, timeSeconds));
        lastMaskBuild = null;
      }
      record(tick, controller, frame);
      trajectoryChunks.push(trajectoryFrameBytes(frame));
      if (tick % 60 === 0 && CHECKPOINTS.has(tick / 60)) checkpoints.push({ seconds: tick / 60,
        tick, population: controller.agents.length, totalSpawned: controller.totalSpawned,
        totalRetired: controller.totalRetired, totalFootContacts: controller.surfaceField.totalFootContacts,
        plateCount: birthSystem.plates.length, candidate: compactCandidate(birthSystem.candidate),
        inputDiagnostics: birthSystem.lastInputDiagnostics });
      if (tick % 600 === 0) console.log(JSON.stringify({ seed, mode: instrument ? 'diagnostic' : 'baseline',
        seconds: timeSeconds, wallSeconds: (performance.now() - started) / 1000, population: controller.agents.length }));
    }
    const trajectory = Buffer.concat(trajectoryChunks);
    const provenance = { seed, instrumented: instrument, rngState, rngCalls, simulationTimeMs: controller.simulationTimeMs,
      initialState: controller.getState(), stateSha256: sha256(JSON.stringify(controller.getState())),
      finalActiveAgents: controller.agents.length, tickCount: totalTicks, frameCount: rows.length,
      trajectoryHash: sha256(trajectory), wallSeconds: (performance.now() - started) / 1000 };
    return { rows, contacts, births, trajectory, trajectoryHash: provenance.trajectoryHash,
      snapshots, morphology, checkpoints, provenance };
  } finally {
    await controller.destroy();
  }

  function record(tick, controller, frame) {
    const state = controller.agents.slice().sort(byId).map(fullState);
    const hashes = [
      digest(JSON.stringify(state)), digest(`${rngState},${rngCalls}\n`), digest(floatBytes(controller.field.values)),
      digest(floatBytes(controller.surfaceField.values)), digest(floatBytes(controller.trailPlateBirth.chemicalMemory)),
      digest(candidateStateBytes(controller.trailPlateBirth)), digest(floatBytes(controller.trailPlateBirth.footContactCounts)),
      digest(JSON.stringify(pendingContacts)), digest(JSON.stringify(pendingBirths)), digest(JSON.stringify(pendingLifecycle))
    ];
    rows.push(Buffer.concat(hashes));
    contacts.push(...pendingContacts);
    births.push(...pendingBirths);
    pendingContacts = []; pendingBirths = []; pendingLifecycle = [];
    active.clear(); for (const agent of frame.agents) active.add(agent.id);
  }
}

function captureMorphology({ controller, build, timeSeconds, tick, bornThisTick, selectCandidateDiagnostic,
  selectCandidateShadowDiagnostic, shadowTemporal, distanceToCorridorEdgeDiagnostic, productionPlateUnion }) {
  const birth = controller.trailPlateBirth;
  const funnel = {};
  const candidate = selectCandidateDiagnostic(build.mask, build.supports, birth.chemicalMemory, funnel);
  const shadowFunnel = {};
  const shadowCandidate = selectCandidateShadowDiagnostic(build.mask, build.supports, birth.chemicalMemory, shadowFunnel);
  for (const row of funnel.components) {
    const bbox = { minX: 96, maxX: -1, minY: 96, maxY: -1 };
    for (const index of row.skeletonIndices) {
      const x = index % 96, y = Math.floor(index / 96);
      bbox.minX = Math.min(bbox.minX, x); bbox.maxX = Math.max(bbox.maxX, x);
      bbox.minY = Math.min(bbox.minY, y); bbox.maxY = Math.max(bbox.maxY, y);
    }
    row.bbox = bbox;
  }
  funnel.candidates = funnel.candidates.map(item => ({ ...item,
    prePruneSkeletonIndices: funnel.components.find(row => row.candidateSourceIndex === item.source.index)?.skeletonIndices || [] }));
  assert.deepEqual(candidate ? serializeComparableCandidate(candidate, funnel) : null,
    birth.candidate ? serializeComparableCandidate(birth.candidate, funnel) : null,
    'Diagnostic selector geometry matches live production candidate');
  const live = birth.getSnapshot();
  const shadowTemporalResult = shadowTemporal.advance(shadowCandidate, timeSeconds * 1000, birth.footContactCounts);
  const productionComponent = funnel.components.find(row => row.candidateSourceIndex === candidate?.source.index);
  const shadowComponent = shadowFunnel.components.find(row => row.candidateSourceIndex === shadowCandidate?.source.index);
  const productionMeasures = measureShadowCandidate(candidate, { tick, distanceToCorridorEdgeDiagnostic,
    productionPlateUnion, sourceConnectedSkeleton: productionComponent?.skeletonIndices || [] });
  const shadowMeasures = measureShadowCandidate(shadowCandidate, { tick, distanceToCorridorEdgeDiagnostic,
    productionPlateUnion, sourceConnectedSkeleton: shadowComponent?.skeletonIndices || [] });
  const previousCandidate = birth.candidate;
  const qualified = Boolean(candidate);
  const stableSeconds = previousCandidate?.stableSeconds ?? null;
  const similarity = previousCandidate?.similarity ?? null;
  const repeat = previousCandidate?.repeatDiagnostics || null;
  const checks = {
    candidateExists: qualified,
    persistenceQualified: Boolean(qualified && stableSeconds + 1e-9 >= 20),
    globalGapOpen: bornThisTick || birth.lastBirthTimeMs === null || timeSeconds * 1000 - birth.lastBirthTimeMs >= 10000 - 1e-9,
    sameCorridorRefractoryOpen: !repeat || repeat.refractoryRemainingSeconds <= 1e-9,
    enoughNewFootContacts: !repeat || repeat.newFootContacts >= 30,
    belowBirthCap: birth.plates.length < birth.maxBirths
  };
  const firstFailedGate = bornThisTick ? null : !qualified ? 'no-candidate' : !checks.persistenceQualified ? 'persistence'
    : !checks.globalGapOpen ? 'global-gap' : !checks.sameCorridorRefractoryOpen ? 'same-corridor-refractory'
      : !checks.enoughNewFootContacts ? 'new-foot-contacts' : !checks.belowBirthCap ? 'birth-cap' : null;
  return { tick, timeSeconds, inputDiagnostics: live.inputDiagnostics, funnel, shadowFunnel,
    candidate: candidate ? serializeCandidate(candidate, funnel) : null,
    shadowCandidate: shadowCandidate ? serializeCandidate(shadowCandidate, shadowFunnel) : null,
    candidateState: live.candidate, shadowTemporal: shadowTemporalResult,
    geometryComparison: compareCandidateGeometry(candidate, shadowCandidate),
    productionMeasures, shadowMeasures, checks, firstFailedGate,
    bornThisTick, birthCount: birth.plates.length, birthRecordCount: birth.birthRecords.length };
}

function captureSnapshot(controller, build, tick, timeSeconds) {
  return { tick, timeSeconds, chemical: u32Bytes(controller.field.values),
    chemicalMemory: u32Bytes(controller.trailPlateBirth.chemicalMemory), surface: u32Bytes(controller.surfaceField.values),
    support: u32Bytes(build.supports), contactCounts: u32Bytes(controller.trailPlateBirth.footContactCounts) };
}

function serializeCandidate(candidate, funnel) {
  return { source: candidate.source, target: candidate.target, geodesicLength: candidate.geodesicLength,
    meanChemical: candidate.meanChemical, meanSupport: candidate.meanSupport, path: candidate.path,
    prePruneSkeletonIndices: funnel.components.find(row => row.candidateSourceIndex === candidate.source.index)?.skeletonIndices || [],
    selectedEndpointIndices: candidate.selectedEndpointIndices || [],
    selectedInteriorEndpointIndices: candidate.selectedInteriorEndpointIndices || [],
    skeletonIndices: candidate.skeletonIndices, supportedMask: Buffer.from(candidate.supportedMask).toString('base64'),
    ribbonMask: Buffer.from(candidate.mask).toString('base64'), component: Buffer.from(candidate.component).toString('base64') };
}

function serializeComparableCandidate(candidate, funnel) {
  const serialized = serializeCandidate(candidate, funnel);
  delete serialized.selectedEndpointIndices;
  delete serialized.selectedInteriorEndpointIndices;
  return serialized;
}

function compareCandidateGeometry(production, shadow) {
  if (!production || !shadow) return { differs: production !== shadow,
    productionExists: Boolean(production), shadowExists: Boolean(shadow), additionalNetworkCells: null,
    additionalRibbonCells: null };
  const productionNetwork = new Set(production.skeletonIndices);
  let additionalNetworkCells = 0, additionalRibbonCells = 0;
  for (const index of shadow.skeletonIndices) if (!productionNetwork.has(index)) additionalNetworkCells += 1;
  for (let index = 0; index < production.mask.length; index += 1) {
    if (shadow.mask[index] && !production.mask[index]) additionalRibbonCells += 1;
  }
  const differs = production.source.index !== shadow.source.index || production.target.index !== shadow.target.index
    || !sameValues(production.path, shadow.path) || !sameValues(production.skeletonIndices, shadow.skeletonIndices)
    || !sameValues(production.mask, shadow.mask);
  return { differs, productionExists: true, shadowExists: true, additionalNetworkCells, additionalRibbonCells,
    definition: 'Exact selected geometry comparison: source, target, principal path, retained skeleton indices, or ribbon-mask cell differs.' };
}

function sameValues(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function compactCandidate(candidate) {
  if (!candidate) return null;
  return { source: candidate.source, target: candidate.target, geodesicLength: candidate.geodesicLength,
    meanChemical: candidate.meanChemical, meanSupport: candidate.meanSupport, path: candidate.path,
    skeletonIndices: candidate.skeletonIndices };
}

async function compareArchive(seed, result, archive, seconds) {
  const summary = JSON.parse(await readFile(resolve(archive, `seed${seed}-summary.json`), 'utf8'));
  const raw = JSON.parse(gunzipSync(await readFile(resolve(archive, `seed${seed}-on-raw-events.json.gz`))));
  const trajectory = gunzipSync(await readFile(resolve(archive, `seed${seed}-trajectory.f64.gz`)));
  const archivedContacts = raw.contacts;
  const archivedBirths = raw.births;
  const archiveEligible = seconds === summary.seconds;
  const trajectoryMatch = archiveEligible && sha256(result.trajectory) === sha256(trajectory);
  const contactsMatch = archiveEligible && JSON.stringify(result.contacts) === JSON.stringify(archivedContacts);
  const birthsMatch = archiveEligible && JSON.stringify(result.births) === JSON.stringify(archivedBirths);
  if (archiveEligible) {
    assert.ok(trajectoryMatch, `Seed ${seed} trajectory differs from archived natural run`);
    assert.ok(contactsMatch, `Seed ${seed} raw contacts differ from archived natural run`);
    assert.ok(birthsMatch, `Seed ${seed} born descriptors differ from archived natural run`);
  }
  return { archiveControllerSha256: summary.runs.on.controllerSha256, archiveEligible, trajectoryMatch, contactsMatch, birthsMatch,
    archivedContactGroups: archivedContacts.length, archivedBirthEvents: archivedBirths.length };
}

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
    '    candidateRows.push({ source: candidate.source, target: candidate.target, geodesicLength: candidate.geodesicLength, path: candidate.path, networkIndices: candidate.skeletonIndices, ribbonCells: candidate.mask.reduce((sum, value) => sum + value, 0), corridorSupportedCells: supportCells, selectedInteriorEndpointIndices: candidate.selectedInteriorEndpointIndices, ribbonMask: candidate.mask, supportedMask: candidate.supportedMask, component: candidate.component });\n    if (!best || candidate.geodesicLength > best.geodesicLength\n      || (candidate.geodesicLength === best.geodesicLength && source < best.source.index)) best = candidate;\n  }\n  if (funnel) { const winner = candidateRows.indexOf(candidateRows.find(row => row.source.index === best?.source.index)); funnel.skeletonPixels = skeleton.reduce((sum, value) => sum + value, 0); funnel.componentCount = components.length; funnel.components = componentRows; funnel.candidateComponentCount = candidateRows.length; funnel.candidates = candidateRows.map(({ source, target, geodesicLength, path, networkIndices, ribbonCells, corridorSupportedCells, selectedInteriorEndpointIndices }) => ({ source, target, geodesicLength, path, networkIndices, ribbonCells, corridorSupportedCells, selectedInteriorEndpointIndices })); funnel.winner = winner; funnel.losers = candidateRows.length - (best ? 1 : 0); }\n  return best;\n}');
  code += "\nconst selectCandidateShadowDiagnostic = (mask, supports, chemicalMemory, funnel = null) =>\n  selectCandidate(mask, supports, chemicalMemory, funnel, 'shadow');\n";
  code += '\nexport { selectCandidate as selectCandidateDiagnostic, selectCandidateShadowDiagnostic, maskComponent, corridorSimilarity, distanceToCorridorEdge };\n';
  const encoded = Buffer.from(code).toString('base64');
  const module = await import(`data:text/javascript;base64,${encoded}`);
  return { selectCandidateDiagnostic: module.selectCandidateDiagnostic,
    selectCandidateShadowDiagnostic: module.selectCandidateShadowDiagnostic,
    corridorSimilarityDiagnostic: module.corridorSimilarity,
    distanceToCorridorEdgeDiagnostic: module.distanceToCorridorEdge, maskComponent: module.maskComponent,
    transformedSourceHash: sha256(code) };
}

function serializeSnapshots(snapshots) {
  const chunks = [], previous = new Map();
  const descriptors = [];
  let offset = 0;
  for (const snapshot of snapshots) {
    const entries = {};
    for (const key of ['chemical', 'chemicalMemory', 'surface', 'support', 'contactCounts']) {
      const bytes = snapshot[key], prior = previous.get(key);
      const encoded = xorBytes(bytes, prior);
      entries[key] = { offset, bytes: encoded.length };
      offset += encoded.length;
      chunks.push(encoded); previous.set(key, bytes);
    }
    descriptors.push({ tick: snapshot.tick, timeSeconds: snapshot.timeSeconds, arrays: entries });
  }
  const bytes = Buffer.concat(chunks);
  return { bytes, encoding: { type: 'per-array XOR delta of exact Float32/Uint32 bytes, concatenated in snapshot order',
    arrayOrder: ['chemical', 'chemicalMemory', 'surface', 'support', 'contactCounts'], descriptors } };
}

function xorBytes(bytes, prior) {
  const result = Buffer.from(bytes);
  if (prior) for (let i = 0; i < result.length; i += 1) result[i] ^= prior[i];
  return result;
}

function compareRows(a, b) {
  assert.equal(a.length, b.length, 'Equal number of tick rows');
  const mismatches = {};
  const offChains = Object.fromEntries(HASH_FIELDS.map(name => [name, createHash('sha256')]));
  const onChains = Object.fromEntries(HASH_FIELDS.map(name => [name, createHash('sha256')]));
  for (let tick = 0; tick < a.length; tick += 1) for (let field = 0; field < HASH_FIELDS.length; field += 1) {
    const offset = field * 32;
    offChains[HASH_FIELDS[field]].update(a[tick].subarray(offset, offset + 32));
    onChains[HASH_FIELDS[field]].update(b[tick].subarray(offset, offset + 32));
    if (!a[tick].subarray(offset, offset + 32).equals(b[tick].subarray(offset, offset + 32))) {
      (mismatches[HASH_FIELDS[field]] ||= []).push(tick);
    }
  }
  const fieldChains = Object.fromEntries(HASH_FIELDS.map(name => [name, { baseline: offChains[name].digest('hex'),
    instrumented: onChains[name].digest('hex'), match: !mismatches[name] }]));
  return { firstMismatch: mismatches, fieldChains, comparedTicks: a.length };
}

function hasPlateBirth(events) {
  return events.some(event => event.type === 'plate-birth');
}

function trajectoryFrame(timeSeconds, agents, idMap) {
  const sorted = [...agents].sort(byId);
  for (const agent of sorted) if (!idMap.has(agent.id)) idMap.set(agent.id, idMap.size);
  return { timeSeconds, agents: sorted.map(agent => ({ id: agent.id, idIndex: idMap.get(agent.id), x: agent.x, y: agent.y,
    vx: agent.vx, vy: agent.vy, heading: agent.heading, radius: agent.radius })) };
}

function trajectoryHeader() {
  const header = Buffer.alloc(20);
  Buffer.from('ANTTRJ01').copy(header, 0);
  header.writeUInt32LE(1, 8); header.writeUInt32LE(60, 12); header.writeUInt32LE(52, 16);
  return header;
}

function trajectoryFrameBytes(frame) {
  const buffer = Buffer.allocUnsafe(12 + frame.agents.length * 52);
  buffer.writeDoubleLE(frame.timeSeconds, 0); buffer.writeUInt32LE(frame.agents.length, 8);
  let offset = 12;
  for (const agent of frame.agents) {
    buffer.writeUInt32LE(agent.idIndex, offset); offset += 4;
    for (const value of [agent.x, agent.y, agent.vx, agent.vy, agent.heading, agent.radius]) {
      buffer.writeDoubleLE(value, offset); offset += 8;
    }
  }
  return buffer;
}

function lifecycleDelta(previous, next, timeSeconds, before, after) {
  const events = [];
  for (const id of [...next].filter(id => !previous.has(id)).sort()) events.push({ type: 'NODE_ENTER', timeSeconds, antId: id });
  for (const id of [...previous].filter(id => !next.has(id)).sort()) {
    const agent = before.get(id), outOfBounds = agent && (agent.x < 0 || agent.x > 1 || agent.y < 0 || agent.y > 1);
    events.push({ type: 'NODE_EXIT', timeSeconds, antId: id, reason: outOfBounds ? 'out-of-bounds' : 'retired' });
  }
  return events;
}

function fullState(agent) {
  return { id: agent.id, x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy, heading: agent.heading,
    angularVelocity: agent.angularVelocity, radius: agent.radius, personality: agent.personality,
    targetSpeed: agent.targetSpeed, speedPhase: agent.speedPhase, speedCycle: agent.speedCycle,
    hesitationRemaining: agent.hesitationRemaining, inspectionRemaining: agent.inspectionRemaining,
    decisionRemaining: agent.decisionRemaining, intentHeading: agent.intentHeading,
    trailConfidence: agent.trailConfidence, trailAdherence: agent.trailAdherence, committedRemaining: agent.committedRemaining };
}

function digest(value) { return createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest(); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function floatBytes(values) { return Buffer.from(values.buffer, values.byteOffset, values.byteLength); }
function u32Bytes(values) { return Buffer.from(new Uint8Array(values.buffer, values.byteOffset, values.byteLength)); }
function candidateStateBytes(birth) {
  const candidate = birth.candidate;
  const scalars = candidate ? { ...candidate, mask: undefined, supportedMask: undefined,
    component: undefined, skeletonIndices: undefined, path: undefined } : null;
  const prefix = Buffer.from(JSON.stringify({ candidate: scalars, input: birth.lastInputDiagnostics,
    lastAnalysisTimeMs: birth.lastAnalysisTimeMs, lastBirthTimeMs: birth.lastBirthTimeMs,
    plates: birth.plates.length, birthRecords: birth.birthRecords.length, path: candidate?.path || [],
    skeletonIndices: candidate?.skeletonIndices || [] }));
  const arrays = candidate ? [candidate.mask, candidate.supportedMask, candidate.component]
    .map(values => Buffer.from(new Uint8Array(values.buffer, values.byteOffset, values.byteLength))) : [];
  return Buffer.concat([prefix, ...arrays]);
}
function byId(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }
function replaceOnce(source, before, after) {
  assert.ok(source.includes(before), `Diagnostic source hook missing: ${before.slice(0, 90)}`);
  return source.replace(before, after);
}

function selfcheck() {
  const input = Buffer.from([1, 2, 3, 4]), next = Buffer.from([1, 4, 3, 9]);
  const delta = xorBytes(next, input);
  assert.deepEqual(xorBytes(delta, input), next);
  const encoded = serializeSnapshots([{ tick: 60, chemical: input, chemicalMemory: input, surface: input, support: next, contactCounts: next },
    { tick: 120, chemical: next, chemicalMemory: next, surface: input, support: next, contactCounts: input }]);
  assert.equal(encoded.encoding.descriptors[0].arrays.chemical.offset, 0);
  assert.equal(encoded.encoding.descriptors[0].arrays.chemicalMemory.offset, input.length);
  assert.equal(encoded.encoding.descriptors[0].arrays.surface.offset, input.length * 2);
  assert.equal(encoded.encoding.descriptors[1].arrays.chemical.offset, input.length * 5);
  const descriptor = encoded.encoding.descriptors[1].arrays.chemical;
  assert.deepEqual(xorBytes(encoded.bytes.subarray(descriptor.offset, descriptor.offset + descriptor.bytes), input), next);
  assert.equal(compareRows([Buffer.alloc(320)], [Buffer.alloc(320)]).comparedTicks, 1);
  const changed = Buffer.alloc(320); changed[0] = 1;
  const mismatch = compareRows([Buffer.alloc(320)], [changed]);
  assert.deepEqual(mismatch.firstMismatch, { agents: [0] });
  assert.equal(mismatch.fieldChains.agents.match, false);
  console.log('ANT morphology replay parity and lossless snapshot selfchecks passed.');
}

export { compareRows, hasPlateBirth, makeDiagnosticSelector, serializeSnapshots, u32Bytes, xorBytes };
