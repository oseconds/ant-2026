import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';
import { decodeTrajectory, maskMetrics, measurePath, measureTracks, measureWeightedGrid,
  occupancyWindow, sampleFullSupportGrid, validateProductionSupport } from './ant-morphology-attribution-analysis.js';
import { makeDiagnosticSelector, runPair, serializeSnapshots, sha256 } from './ant-morphology-replay.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = new Map(process.argv.slice(2).map(value => {
  const at = value.indexOf('=');
  return at < 0 ? [value, true] : [value.slice(0, at), value.slice(at + 1)];
}));
const evidence = resolve(String(args.get('--evidence') || resolve(root, 'docs/ant/evidence/2026-10-13-morphology-attribution')));
const output = resolve(evidence, 'data');
const visualOutput = resolve(evidence, 'visuals');
const seeds = String(args.get('--seeds') || '20261005,20261006,20261007').split(',').map(Number);
const seconds = Number(args.get('--seconds') || 600);
const gridSize = 96;
const sourcePaths = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/agents/ant/GaitController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/ColonyActivation.js'];

await mkdir(output, { recursive: true });
await mkdir(visualOutput, { recursive: true });
assert.ok(Number.isInteger(seconds) && seconds > 0);
assert.ok(seeds.length && seeds.every(seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff));
assert.equal(execFileSync('git', ['rev-parse', 'origin/main'], { cwd: root, encoding: 'utf8' }).trim(),
  'd45823d40c9a87c1b333fa9872f3c897ee9ab01b', 'Verified origin/main changed since baseline inspection');
execFileSync('git', ['diff', '--quiet', 'origin/main', '--', 'src/lib/agents/ant'], { cwd: root });
const selectorSource = await readFile(resolve(root, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
const selectors = await makeDiagnosticSelector(selectorSource, { includeShadow: false });
const { AntController } = await import(pathToFileURL(resolve(root, 'src/lib/agents/ant/AntController.js')).href);
const allBirths = [], perSeed = [], representatives = [];

for (const seed of seeds) {
  const replay = await runPair({ AntController, seed, seconds, output, ...selectors,
    materialLocomotionResistance: true, includeShadow: false, captureBirthsOnly: true, saveDiagnostics: false });
  assert.equal(replay.summary.parity.everyTick, true);
  assert.equal(replay.summary.parity.finalWorldSnapshot, true);
  assert.ok(replay.summary.runs.baseline.materialLocomotionResistance);
  assert.ok(replay.summary.runs.instrumented.materialLocomotionResistance);
  assert.equal(replay.summary.morphology.length, replay.births.filter(event => event.type === 'plate-birth').length,
    'One captured funnel per production Plate birth');

  const trajectory = decodeTrajectory(replay.trajectory);
  const byBirth = replay.summary.morphology.map((capture, index) =>
    analyzeBirth({ seed, index, capture, snapshot: replay.snapshots[index], trajectory, birthEvents: replay.births }));
  const snapshotEncoding = serializeSnapshots(replay.snapshots);
  const trajectoryName = `seed${seed}-trajectory.anttraj.gz`;
  const snapshotsName = `seed${seed}-birth-inputs.xor.gz`;
  const replayName = `seed${seed}-replay-provenance.json`;
  await writeFile(resolve(output, trajectoryName), gzipSync(replay.trajectory, { level: 6 }));
  await writeFile(resolve(output, snapshotsName), gzipSync(snapshotEncoding.bytes, { level: 6 }));
  await writeFile(resolve(output, replayName), `${JSON.stringify({ schemaVersion: 1, seed, seconds,
    parity: replay.summary.parity, runs: replay.summary.runs, checkpoints: replay.summary.checkpoints,
    snapshotEncoding: snapshotEncoding.encoding, trajectoryHash: sha256(replay.trajectory),
    capturedBirths: byBirth.length, rawContactRecords: replay.contacts.length,
    rawBirthEvents: replay.births.length }, null, 2)}\n`);
  const seedSummary = { seed, seconds, birthCount: byBirth.length,
    plateIds: byBirth.map(row => row.provenance.plateId),
    birthTimesSeconds: byBirth.map(row => row.provenance.simulationTimeSeconds),
    stageSummary: summarizeStages(byBirth),
    files: { trajectory: trajectoryName, birthInputs: snapshotsName, replay: replayName } };
  await writeFile(resolve(output, `seed${seed}-stage-summary.json`), `${JSON.stringify(seedSummary, null, 2)}\n`);
  perSeed.push(seedSummary);
  allBirths.push(...byBirth);
  if (byBirth.length) representatives.push(byBirth[Math.floor((byBirth.length - 1) / 2)]);
  console.log(JSON.stringify({ seed, seconds, birthCount: byBirth.length,
    parity: replay.summary.parity, wallSeconds: replay.summary.runs.instrumented.wallSeconds }));
}

const measurements = { schemaVersion: 1, baseline: { main: 'd45823d40c9a87c1b333fa9872f3c897ee9ab01b',
  dtSeconds: 1 / 60, materialLocomotionResistance: true },
  method: 'Natural runs only; read-only instrumentation. Each birth uses trajectory frames in (birthTime-20s, birthTime], including birth-tick movement and contact but ending before the new material is inserted, plus that tick chemical, mechanical, selector, and frozen descriptor state.',
  births: allBirths.map(({ visualFields, birthIndex, ...row }) => row) };
assertAllFinite(measurements);
await writeFile(resolve(output, 'birth-measurements.json'), `${JSON.stringify(measurements)}\n`);
const scales = makeVisualScales(allBirths);
await writeFile(resolve(visualOutput, 'funnel-representatives.svg'), makeFunnelSvg(representatives, scales));
await writeFile(resolve(visualOutput, 'seed-stage-distributions.svg'), makeStageSvg(allBirths));
const summary = { schemaVersion: 1, productionMain: 'd45823d40c9a87c1b333fa9872f3c897ee9ab01b',
  taskBase: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  node: process.version, seeds, seconds, dtSeconds: 1 / 60, materialLocomotionResistance: true,
  sourceHashes: Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path,
    sha256(await readFile(resolve(root, path)))]))),
  diagnosticToolHashes: Object.fromEntries(await Promise.all([
    'scripts/ant-morphology-replay.js', 'scripts/ant-morphology-attribution-analysis.js',
    'scripts/ant-morphology-current-attribution.js'
  ].map(async path => [path, sha256(await readFile(resolve(root, path)))]))),
  selectorDiagnosticSha256: selectors.transformedSourceHash, birthCount: allBirths.length,
  perSeed, visualScales: scales, optionalPheromoneAblation: { run: false,
    reason: 'This pass measures where the natural spatial funnel narrows; it does not claim the upstream differences are causal.' },
  files: ['birth-measurements.json', ...perSeed.flatMap(row => Object.values(row.files).map(path => `data/${path}`)),
    'visuals/funnel-representatives.svg', 'visuals/seed-stage-distributions.svg'] };
await writeFile(resolve(evidence, 'manifest.json'), `${JSON.stringify(summary, null, 2)}\n`);

function analyzeBirth({ seed, index, capture, snapshot, trajectory, birthEvents }) {
  assert.equal(capture.bornThisTick, true);
  assert.equal(capture.tick, snapshot.tick);
  assert.equal(capture.timeSeconds, snapshot.timeSeconds);
  const descriptor = capture.birthDescriptor;
  assert.ok(descriptor?.id, 'Frozen Plate descriptor is present at the birth tick');
  const event = birthEvents.find(item => item.type === 'plate-birth' && item.payload.id === descriptor.id);
  assert.ok(event, `Production event exists for ${descriptor.id}`);
  assert.deepEqual(descriptor, event.payload, 'Captured frozen descriptor equals production event payload');
  assert.equal(Math.abs(descriptor.bornAtSimulationTimeMs / 1000 - capture.timeSeconds) < 1e-12, true);

  const requirements = capture.requirements;
  const origin = requirements.sourceAnnulus.origin;
  const occupancy = occupancyWindow(trajectory, capture.timeSeconds, 20, gridSize);
  const chemicalMemory = float32(snapshot.chemicalMemory);
  const productionSupport = float32(snapshot.support);
  const surface = new SurfaceField();
  surface.values.set(float32(snapshot.surface));
  const fullSupport = sampleFullSupportGrid(surface, gridSize, 0.025);
  const qualification = validateProductionSupport({ chemicalMemory, productionSupports: productionSupport,
    fullSupport, chemicalThreshold: requirements.chemicalThreshold, supportThreshold: requirements.supportThreshold });
  assert.deepEqual(qualification.mismatches, [], 'Full support reconstruction matches production on chemically qualified cells');
  assert.deepEqual(Buffer.from(qualification.supportedMask), Buffer.from(snapshot.supportedMask),
    'Chemical-plus-mechanical mask equals production mask');

  const skeletonMask = new Uint8Array(gridSize * gridSize), sourceMask = new Uint8Array(skeletonMask.length);
  const boundaryMask = new Uint8Array(skeletonMask.length);
  for (const component of capture.funnel.components) {
    for (const cell of component.skeletonIndices) skeletonMask[cell] = 1;
    for (const cell of component.sourceIndices || []) sourceMask[cell] = 1;
    for (const cell of component.boundaryIndices || []) boundaryMask[cell] = 1;
  }
  const selectedNetwork = new Uint8Array(skeletonMask.length);
  const selectedSkeletonComponent = new Uint8Array(skeletonMask.length);
  const selectedPath = new Uint8Array(skeletonMask.length);
  const candidate = capture.candidate;
  for (const cell of candidate.prePruneSkeletonIndices) selectedSkeletonComponent[cell] = 1;
  for (const cell of candidate.skeletonIndices) selectedNetwork[cell] = 1;
  for (const cell of candidate.path) selectedPath[cell] = 1;
  const frozenMask = Uint8Array.from(descriptor.mask);
  const candidateRibbon = Buffer.from(candidate.ribbonMask, 'base64');
  assert.deepEqual(Buffer.from(frozenMask), candidateRibbon, 'Frozen Plate raster equals selector ribbon output');
  assert.deepEqual([...descriptor.centerline.map(point => point.index)], [...candidate.skeletonIndices].sort((a, b) => a - b),
    'Frozen centerline nodes equal selected production network nodes');
  assert.deepEqual(descriptor.principalPath, candidate.path, 'Frozen principal path equals selected candidate path');

  const stages = {
    movementOccupancy: { ...measureWeightedGrid(occupancy.values, gridSize, origin),
      path: measureTracks(occupancy.tracks, origin), cellFraction: 0 },
    pheromone: measureWeightedGrid(float32(snapshot.chemical), gridSize, origin),
    chemicalMemory: measureWeightedGrid(chemicalMemory, gridSize, origin),
    mechanicalSupport: measureWeightedGrid(fullSupport, gridSize, origin),
    chemicalQualified: maskMetrics(qualification.chemicalQualifiedMask, gridSize, origin),
    combinedSupported: maskMetrics(qualification.supportedMask, gridSize, origin),
    skeleton: maskMetrics(skeletonMask, gridSize, origin),
    sourceConnectedSupportedComponent: maskMetrics(Uint8Array.from(Buffer.from(candidate.supportedMask, 'base64')),
      gridSize, origin),
    selectedSkeletonComponent: maskMetrics(selectedSkeletonComponent, gridSize, origin),
    sourceQualified: maskMetrics(sourceMask, gridSize, origin),
    boundaryQualified: maskMetrics(boundaryMask, gridSize, origin),
    selectedNetwork: maskMetrics(selectedNetwork, gridSize, origin),
    selectedPrincipalPath: { ...maskMetrics(selectedPath, gridSize, origin),
      path: measurePath(candidate.path.map(cell => [cell % gridSize / (gridSize - 1),
        Math.floor(cell / gridSize) / (gridSize - 1)]), origin) },
    frozenPlate: { ...maskMetrics(frozenMask, gridSize, origin),
      path: measurePath(descriptor.principalPath.map(cell => [cell % gridSize / (gridSize - 1),
        Math.floor(cell / gridSize) / (gridSize - 1)]), origin) }
  };
  const chemicalCells = stages.chemicalQualified.positiveCells;
  const supportedCells = stages.combinedSupported.positiveCells;
  const visualFields = { occupancy: occupancy.values, pheromone: float32(snapshot.chemical),
    chemicalMemory, mechanicalSupport: fullSupport, chemicalQualified: qualification.chemicalQualifiedMask,
    combinedSupported: qualification.supportedMask, skeleton: skeletonMask, sourceQualified: sourceMask,
    boundaryQualified: boundaryMask, selectedComponent: selectedSkeletonComponent,
    selectedNetwork, selectedPath, frozenPlate: frozenMask };
  const provenance = { seed, plateId: descriptor.id, simulationTimeSeconds: capture.timeSeconds,
    simulationTimeMs: descriptor.bornAtSimulationTimeMs, tick: capture.tick, birthIndex: index + 1,
    trajectoryWindow: { startExclusiveSeconds: occupancy.startSeconds, endInclusiveSeconds: occupancy.endSeconds,
      frames: occupancy.includedFrames, agentFrames: occupancy.agentFrames },
    source: candidate.source, target: candidate.target };
  const result = { provenance, stageMetrics: stages,
    mechanicalQualificationWithinChemical: { chemicalCells, supportedCells,
      rejectedCells: chemicalCells - supportedCells, retainedFraction: chemicalCells ? supportedCells / chemicalCells : 0 },
    funnel: { summary: capture.funnel, selectedCandidate: candidate }, frozenPlate: descriptor,
    supportValidation: { comparedChemicallyQualifiedCells: qualification.chemicalQualifiedMask.reduce((sum, value) => sum + value, 0),
      mismatchCount: qualification.mismatches.length } };
  assertAllFinite(result);
  return { ...result, visualFields, birthIndex: index };
}

function summarizeStages(births) {
  return Object.fromEntries(Object.keys(births[0]?.stageMetrics || {}).map(stage => {
    const rows = births.map(row => row.stageMetrics[stage]);
    return [stage, { births: rows.length,
      medianAngularSpanRad: median(rows.map(row => row.angularSpanRad)),
      medianAngularDispersion: median(rows.map(row => row.angularDispersion)),
      medianMeanRadius: median(rows.map(row => row.meanRadius)),
      medianEffectiveCells: median(rows.map(row => row.effectiveCells)),
      medianPositiveCells: median(rows.map(row => row.positiveCells)),
      medianTortuosity: rows.some(row => row.path) ? median(rows.map(row => row.path?.tortuosity ?? row.path?.meanTortuosity ?? 0)) : null,
      medianRadialAlignment: rows.some(row => row.path) ? median(rows.map(row => row.path?.radialAlignment ?? 0)) : null }];
  }));
}

function makeVisualScales(births) {
  const max = key => {
    let result = 0;
    for (const birth of births) for (const value of birth.visualFields[key]) result = Math.max(result, value);
    return result;
  };
  return { occupancyMax: roundedScale(max('occupancy')),
    pheromoneMax: 8, chemicalMemoryMax: 1, mechanicalSupportMax: 1, binaryMax: 1,
    occupancyScaleSource: 'maximum cell count over all 20 s birth windows; same scale for every representative',
    pheromoneScaleSource: 'PheromoneField production maximum is 8',
    normalizedFieldScale: '[0,1]' };
}

function makeFunnelSvg(representatives, scales) {
  const panels = [
    ['ANT occupancy · 20 s', 'occupancy', scales.occupancyMax, '#5688bf'],
    ['Pheromone', 'pheromone', scales.pheromoneMax, '#bc8058'],
    ['Chemical memory', 'chemicalMemory', 1, '#cf9f4e'],
    ['Mechanical support', 'mechanicalSupport', 1, '#4ba493'],
    ['Chemical-qualified cells', 'chemicalQualified', 1, '#94a45b'],
    ['Chemical + mechanical', 'combinedSupported', 1, '#4a9ca5'],
    ['Skeleton / components', 'skeleton', 1, '#5e9abe'],
    ['Source annulus / boundary', 'sourceBoundary', 1, '#7d78b2'],
    ['Selected path / network', 'selected', 1, '#d18e53'],
    ['Frozen Plate', 'frozenPlate', 1, '#596f9d']
  ];
  const cell = 2, panelWidth = 218, rowHeight = 258;
  const height = Math.max(1, representatives.length) * rowHeight + 54;
  const body = representatives.map((birth, rowIndex) => {
    const y = 42 + rowIndex * rowHeight;
    const maps = panels.map(([label, key, scale, color], panelIndex) => {
      const x = 8 + panelIndex * panelWidth;
      const svg = key === 'sourceBoundary'
        ? drawComposite([{ values: birth.visualFields.sourceQualified, color: '#f2b45a' },
          { values: birth.visualFields.boundaryQualified, color: '#57bdca' }], x, y + 38, cell)
        : key === 'skeleton'
          ? drawComposite([{ values: birth.visualFields.skeleton, color: '#5e9abe' },
            { values: birth.visualFields.selectedComponent, color: '#e6c25b' }], x, y + 38, cell)
        : key === 'selected'
          ? drawComposite([{ values: birth.visualFields.selectedNetwork, color: '#d7a05e' },
            { values: birth.visualFields.selectedPath, color: '#fff2c4' }], x, y + 38, cell)
          : drawGrid(birth.visualFields[key], x, y + 38, cell, scale, color);
      return `<text x="${x}" y="${y + 30}" class="label">${escapeXml(label)}</text>${svg}`;
    }).join('');
    return `<text x="8" y="${y + 13}" class="seed">seed ${birth.provenance.seed} · ${escapeXml(birth.provenance.plateId)} · ${birth.provenance.simulationTimeSeconds.toFixed(1)} s</text>${maps}`;
  }).join('');
  return svgDocument(8 + panels.length * panelWidth, height,
    `<text x="8" y="20" class="title">ANT natural morphology funnel · fixed world coordinates, 96×96</text>${body}`);
}

function makeStageSvg(births) {
  const stageNames = Object.keys(births[0]?.stageMetrics || {});
  const metrics = [['angularDispersion', 'Angular dispersion (0=concentrated)'],
    ['angularSpanRad', 'Angular span (radians)'], ['meanRadius', 'Mean source radius'],
    ['effectiveCells', 'Effective occupied cells']];
  const colors = new Map([[20261005, '#d45c46'], [20261006, '#4a89b5'], [20261007, '#499b72']]);
  const left = 92, right = 18, width = 1740, plotWidth = width - left - right;
  const rowHeight = 190, top = 40, height = top + metrics.length * rowHeight + 54;
  const rows = metrics.map(([key, label], metricIndex) => {
    const y0 = top + metricIndex * rowHeight;
    const values = births.flatMap(birth => stageNames.map(stage => birth.stageMetrics[stage][key]));
    const maxValue = roundedScale(Math.max(0, ...values));
    const stageWidth = plotWidth / stageNames.length;
    const dots = births.flatMap(birth => stageNames.map((stage, index) => {
      const value = birth.stageMetrics[stage][key];
      const jitter = ((birth.provenance.birthIndex * 37 + birth.provenance.seed) % 23) - 11;
      const x = left + (index + 0.5) * stageWidth + jitter * 0.55;
      const y = y0 + rowHeight - 30 - value / maxValue * (rowHeight - 58);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.1" fill="${colors.get(birth.provenance.seed)}" opacity=".60"/>`;
    }).join('')).join('');
    const labels = stageNames.map((name, index) => {
      const x = left + (index + 0.5) * stageWidth;
      return `<text x="${x.toFixed(2)}" y="${y0 + rowHeight - 10}" class="axis" transform="rotate(-28 ${x.toFixed(2)} ${y0 + rowHeight - 10})">${escapeXml(name)}</text>`;
    }).join('');
    const legend = [...colors].map(([seed, color], index) =>
      `<circle cx="${width - 240 + index * 78}" cy="${y0 + 13}" r="4" fill="${color}"/><text x="${width - 232 + index * 78}" y="${y0 + 17}" class="axis">${String(seed).slice(-2)}</text>`).join('');
    return `<text x="8" y="${y0 + 14}" class="label">${label} · shared 0–${maxValue}</text><line x1="${left}" x2="${width - right}" y1="${y0 + rowHeight - 30}" y2="${y0 + rowHeight - 30}" stroke="#9da5ac"/>${dots}${labels}${legend}`;
  }).join('');
  return svgDocument(width, height,
    `<text x="8" y="22" class="title">Per-birth stage distributions · one dot per seed / birth / stage</text>${rows}`);
}

function drawGrid(values, x, y, cell, scale, color) {
  const rects = [];
  for (let index = 0; index < values.length; index += 1) {
    const alpha = Math.max(0, Math.min(1, values[index] / scale));
    if (!alpha) continue;
    rects.push(`<rect x="${x + index % gridSize * cell}" y="${y + Math.floor(index / gridSize) * cell}" width="${cell}" height="${cell}" fill="${color}" opacity="${alpha.toFixed(3)}"/>`);
  }
  return `<rect x="${x}" y="${y}" width="${gridSize * cell}" height="${gridSize * cell}" fill="#151b21"/>${rects.join('')}`;
}

function drawComposite(layers, x, y, cell) {
  const rects = [];
  for (const { values, color } of layers) for (let index = 0; index < values.length; index += 1) {
    if (values[index]) rects.push(`<rect x="${x + index % gridSize * cell}" y="${y + Math.floor(index / gridSize) * cell}" width="${cell}" height="${cell}" fill="${color}"/>`);
  }
  return `<rect x="${x}" y="${y}" width="${gridSize * cell}" height="${gridSize * cell}" fill="#151b21"/>${rects.join('')}`;
}

function svgDocument(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font:11px system-ui,sans-serif;fill:#20272d}.title{font-size:15px;font-weight:600}.seed{font-size:12px;font-weight:600}.axis{font-size:9px}.label{font-size:10px;font-weight:600}</style><rect width="100%" height="100%" fill="#f6f7f8"/>${body}</svg>`;
}

function float32(buffer) {
  if (buffer.length % 4) throw new Error('Expected four-byte float array');
  return new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

function roundedScale(value) {
  if (!(value > 0)) return 1;
  const unit = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / unit) * unit;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function assertAllFinite(value, path = 'root') {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `Non-finite number at ${path}`);
  else if (Array.isArray(value)) value.forEach((item, index) => assertAllFinite(item, `${path}[${index}]`));
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) assertAllFinite(child, `${path}.${key}`);
}

function escapeXml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
