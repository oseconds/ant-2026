import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { MaterialStratigraphy } from '../src/lib/agents/ant/MaterialStratigraphy.js';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { TRAIL_PLATE_CHEMICAL_THRESHOLD, TRAIL_PLATE_GRID_SIZE,
  TRAIL_PLATE_MAX_BIRTHS, TRAIL_PLATE_SUPPORT_THRESHOLD } from '../src/lib/agents/ant/TrailPlateBirth.js';
import { analyzePlate } from './ant-morphology-plates.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-10-08-interior-endpoint-production');
const ARGS = new Map(process.argv.slice(2).map(value => {
  const i = value.indexOf('='); return i < 0 ? [value, true] : [value.slice(0, i), value.slice(i + 1)];
}));
const REPLAY = resolve(String(ARGS.get('--input') || resolve(ROOT, 'test-results/ant-interior-endpoint-production')));
const DATA = resolve(String(ARGS.get('--data') || resolve(EVIDENCE, 'data')));
const PLOTS = resolve(String(ARGS.get('--plots') || resolve(EVIDENCE, 'plots')));
const VISUAL = resolve(EVIDENCE, 'visual');
const SEEDS = [20261005, 20261006, 20261007];
const CHECKPOINTS = [30, 60, 120, 300, 600];
const GRID = TRAIL_PLATE_GRID_SIZE;
const CELLS = GRID * GRID;
const BASELINE = resolve(ROOT, 'docs/ant/evidence/2026-10-07-social-graph/data');
const FROZEN = resolve(ROOT, 'docs/ant/evidence/2026-10-08-interior-endpoint-shadow/data');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

async function main() {
  await mkdir(DATA, { recursive: true });
  await mkdir(PLOTS, { recursive: true });
  const results = [];
  for (const seed of SEEDS) {
    const [candidateSummary, candidateBirthFile, candidateSnapshotFile, baselineRawFile, baselineSummaryFile] = await Promise.all([
      readFile(resolve(REPLAY, `seed${seed}-summary.json`)),
      readFile(resolve(REPLAY, `seed${seed}-births.json.gz`)),
      readFile(resolve(REPLAY, `seed${seed}-snapshots.bin.gz`)),
      readFile(resolve(BASELINE, `seed${seed}-on-raw-events.json.gz`)),
      readFile(resolve(FROZEN, `seed${seed}-summary.json.gz`))
    ]);
    const current = JSON.parse(candidateSummary);
    const candidateEvents = JSON.parse(gunzipSync(candidateBirthFile));
    const baselineEvents = JSON.parse(gunzipSync(baselineRawFile));
    const frozen = JSON.parse(gunzipSync(baselineSummaryFile));
    assert.equal(current.seed, seed);
    assert.equal(current.seconds, 600);
    assert.ok(current.archiveComparison.trajectoryMatch && current.archiveComparison.contactsMatch);
    assert.ok(current.mainBaselineBehaviorParity.fields.agents.match);
    assert.ok(current.mainBaselineBehaviorParity.fields.rng.match);
    await writeFile(resolve(DATA, `seed${seed}-candidate-births.json.gz`), candidateBirthFile);
    const baselinePlates = baselineEvents.births.filter(event => event.type === 'plate-birth')
      .map(event => event.payload).sort(byBirthTime);
    const candidatePlates = candidateEvents.filter(event => event.type === 'plate-birth')
      .map(event => event.payload).sort(byBirthTime);
    assert.equal(candidatePlates.length, current.candidateBirthArtifact.plateBirthCount);
    assert.equal(candidatePlates.length, current.checkpoints.at(-1).plateCount);
    assert.ok(candidatePlates.length <= TRAIL_PLATE_MAX_BIRTHS, 'candidate stays below frozen birth capacity');
    const baselineHistory = analyzeBirthHistory(baselinePlates, frozen.morphology);
    const candidateHistory = analyzeBirthHistory(candidatePlates, current.morphology);
    const baselineStratigraphy = buildStratigraphy(baselinePlates);
    const candidateStratigraphy = buildStratigraphy(candidatePlates);
    const topology = [];
    for (const count of [1, 2, 4, 8, 12]) {
      if (baselinePlates.length < count || candidatePlates.length < count) continue;
      topology.push({ plateCount: count,
        baseline: compileMetrics(baselinePlates.slice(0, count)),
        candidate: compileMetrics(candidatePlates.slice(0, count)) });
    }
    const snapshots = decodeSelectedSnapshots(current.snapshotEncoding, candidateSnapshotFile);
    const environmentalHistory = CHECKPOINTS.map(seconds => {
      const snapshot = nearestSnapshot(snapshots, seconds);
      const baselineUnion = unionAt(baselinePlates, snapshot.timeSeconds);
      const candidateUnion = unionAt(candidatePlates, snapshot.timeSeconds);
      return { requestedSeconds: seconds, actualSeconds: snapshot.timeSeconds,
        offsetSeconds: snapshot.timeSeconds - seconds,
        baselinePlateCount: countAt(baselinePlates, snapshot.timeSeconds),
        candidatePlateCount: countAt(candidatePlates, snapshot.timeSeconds),
        baseline: coverageAt(baselineUnion, snapshot), candidate: coverageAt(candidateUnion, snapshot),
        baselineUnion, candidateUnion };
    });
    const baselineOrdinal = nearestBirthOrdinal(baselinePlates, 300);
    const candidateOrdinal = nearestBirthOrdinal(candidatePlates, 300);
    const result = {
      seed, seconds: 600,
      behaviorParity: current.mainBaselineBehaviorParity,
      archiveComparison: current.archiveComparison,
      birthHistory: { baseline: baselineHistory.summary, candidate: candidateHistory.summary },
      scheduling: { baseline: summarizeSchedule(frozen.morphology), candidate: summarizeSchedule(current.morphology) },
      materialStratigraphy: { baseline: baselineStratigraphy, candidate: candidateStratigraphy },
      topologyAtEquivalentEarlyPlateCounts: topology,
      environmentalRepresentation: environmentalHistory.map(({ baselineUnion, candidateUnion, ...row }) => row),
      representativeBirthsNear300Seconds: {
        baselineOrdinal: baselineOrdinal + 1,
        candidateOrdinal: candidateOrdinal + 1,
        baselineSeconds: baselinePlates[baselineOrdinal].bornAtSimulationTimeMs / 1000,
        candidateSeconds: candidatePlates[candidateOrdinal].bornAtSimulationTimeMs / 1000
      },
      limitations: [
        'Environmental representation is a spatial coverage proxy at the nearest captured qualification analysis, not a causal attribution of individual traffic.',
        'Endpoint and junction counts are raster-graph proxies; eight-neighbor staircases can inflate junction counts.',
        'Three deterministic seeds at one 600 s horizon do not establish a general distribution.'
      ]
    };
    const inputArtifacts = {
      candidateSummary: sha256(candidateSummary), candidateBirthEvents: sha256(candidateBirthFile),
      candidateSnapshots: sha256(candidateSnapshotFile), baselineBirthEvents: sha256(baselineRawFile),
      frozenBaselineSummary: sha256(baselineSummaryFile)
    };
    result.inputSha256 = inputArtifacts;
    results.push(result);
    await writeFile(resolve(PLOTS, `births-seed${seed}.svg`), birthTimelineSvg(seed, baselinePlates, candidatePlates,
      frozen.morphology, current.morphology));
    await writeFile(resolve(PLOTS, `unions-seed${seed}.svg`), unionSvg(seed, environmentalHistory));
    await writeFile(resolve(PLOTS, `birth-comparison-seed${seed}.svg`),
      birthComparisonSvg(seed, baselineOrdinal, candidateOrdinal,
        baselinePlates[baselineOrdinal], candidatePlates[candidateOrdinal]));
    console.log(JSON.stringify({ seed, baselineBirths: baselinePlates.length, candidateBirths: candidatePlates.length,
      representativeBirthOrdinalsNear300Seconds: [baselineOrdinal + 1, candidateOrdinal + 1],
      topologyCounts: topology.map(item => item.plateCount) }));
  }
  const sourceFiles = ['src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
    'src/lib/audio/compileSurfaceTopology.js', 'scripts/ant-morphology-replay.js',
    'scripts/ant-interior-endpoint-production-analysis.js',
    'scripts/ant-interior-endpoint-production-browser.js'];
  const sources = Object.fromEntries(await Promise.all(sourceFiles.map(async path =>
    [path, sha256(await readFile(resolve(ROOT, path)))])));
  const output = { schemaVersion: 1, baselineMergeCommit: '30fe4bd8980ffd6dd13aa30a7a9f2a2676faf018',
    candidateBranch: 'ant-interior-endpoint-production-candidate', seeds: results,
    sources, metricDefinitions: {
      bornPlates: 'Only actual plate-birth events; Sphere births excluded.',
      footprintArea: 'Binary frozen mask cell count divided by 95^2.',
      networkCells: 'Frozen centerline vertex count; network links are compiled Plate edges.',
      priorUnionOverlap: 'Mask cells already in the union of earlier born Plates.',
      environmentCoverage: `Cumulative frozen Plate mask coverage of current chemicalMemory >= ${TRAIL_PLATE_CHEMICAL_THRESHOLD}, supported cells >= ${TRAIL_PLATE_SUPPORT_THRESHOLD}, their intersection, and cells with at least one FOOT_CONTACT.`
    } };
  await writeFile(resolve(DATA, 'analysis.json'), `${JSON.stringify(output, null, 2)}\n`);
  const replayManifest = JSON.parse(await readFile(resolve(REPLAY, 'manifest.json'), 'utf8'));
  replayManifest.archiveDirectory = 'docs/ant/evidence/2026-10-07-social-graph/data';
  await writeFile(resolve(DATA, 'replay-manifest.json'), `${JSON.stringify(replayManifest, null, 2)}\n`);
  const hashes = await hashFiles([...(await filesBelow(DATA)).filter(path => !path.endsWith('generated-artifact-sha256.json')),
    ...await filesBelow(PLOTS), ...await filesBelow(VISUAL)]);
  await writeFile(resolve(DATA, 'generated-artifact-sha256.json'), `${JSON.stringify(hashes, null, 2)}\n`);
}

function analyzeBirthHistory(plates, analyses) {
  const priorUnion = new Set(), earlierMasks = [], births = [];
  for (const plate of plates) {
    const result = analyzePlate(plate, priorUnion, earlierMasks);
    for (const index of result._mask) priorUnion.add(index);
    earlierMasks.push(result._mask);
    const tick = Math.round(plate.bornAtSimulationTimeMs * 60 / 1000);
    const row = analyses.find(item => item.tick === tick && item.bornThisTick);
    births.push({ timeSeconds: plate.bornAtSimulationTimeMs / 1000, tick,
      repeatedCorridor: Boolean(row?.candidateState?.repeat),
      measures: { ...result.measures, material: result.geometry.material } });
  }
  const measures = births.map(item => item.measures);
  const intervals = births.slice(1).map((item, index) => item.timeSeconds - births[index].timeSeconds);
  const widthSampleCount = measures.reduce((sum, item) => sum + item.widths.halfWidthWorldUnits.n, 0);
  const lowClampCount = measures.reduce((sum, item) => sum + item.widths.lowClampCount, 0);
  const highClampCount = measures.reduce((sum, item) => sum + item.widths.highClampCount, 0);
  const keys = {
    principalGeodesicLength: item => item.descriptorGeodesicLengthWorldUnits,
    principalTortuosity: item => item.principalTortuosity,
    footprintNormalizedArea: item => item.footprint.normalizedArea,
    networkCenterlineCells: item => item.network.centerlineCellCount,
    networkEdgeCount: item => item.network.edgeCount,
    endpointProxy: item => item.network.endpointCount,
    junctionNodeProxy: item => item.network.junctionNodeCount,
    junctionClusterProxy: item => item.network.junctionClusterCount,
    priorUnionOverlapFraction: item => item.overlap.priorUnionOverlapFraction,
    newlyOccupiedAreaPerBirth: item => item.overlap.newlyOccupiedNormalizedArea,
    sourceTargetDisplacement: item => item.endpointDistanceWorldUnits,
    medianHalfWidth: item => item.widths.halfWidthWorldUnits.p50,
    stiffness: item => item.material.stiffness,
    density: item => item.material.density,
    damping: item => item.material.damping
  };
  return { births, summary: { plateBirthCount: plates.length,
    firstBirthSeconds: plates[0]?.bornAtSimulationTimeMs / 1000 ?? null,
    lastBirthSeconds: plates.at(-1)?.bornAtSimulationTimeMs / 1000 ?? null,
    birthCadenceSeconds: distribution(intervals), repeatedCorridorBirthCount: births.filter(item => item.repeatedCorridor).length,
    finalUnionCells: priorUnion.size, finalUnionArea: priorUnion.size / (95 ** 2),
    distributions: Object.fromEntries(Object.entries(keys).map(([name, get]) => [name, distribution(measures.map(get).filter(Number.isFinite))])),
    widthClamp: { lowClampCount, highClampCount, sampleCount: widthSampleCount,
      lowClampFraction: widthSampleCount ? lowClampCount / widthSampleCount : null } } };
}

function summarizeSchedule(rows) {
  const firstFailureCounts = {};
  for (const row of rows) firstFailureCounts[row.firstFailedGate || 'ready-or-born'] =
    (firstFailureCounts[row.firstFailedGate || 'ready-or-born'] || 0) + 1;
  return { analyses: rows.length,
    candidatePresent: rows.filter(row => row.checks?.candidateExists).length,
    persistenceQualified: rows.filter(row => row.checks?.persistenceQualified).length,
    schedulerReady: rows.filter(row => row.candidateState?.birthReady).length,
    actualBirthAnalyses: rows.filter(row => row.bornThisTick).length,
    firstFailureCounts };
}

function buildStratigraphy(plates) {
  const stratigraphy = new MaterialStratigraphy(), history = [];
  for (const plate of plates) {
    assert.ok(stratigraphy.addPlate(plate), `Stratigraphy rejected ${plate.id}`);
    history.push(stratigraphyMetrics(stratigraphy.getSnapshot()));
  }
  return { plateCount: plates.length, final: history.at(-1) || stratigraphyMetrics(stratigraphy.getSnapshot()),
    checkpoints: CHECKPOINTS.map(seconds => {
      const count = countAt(plates, seconds);
      return { seconds, plateCount: count, ...(count ? history[count - 1] : stratigraphyMetrics(new MaterialStratigraphy().getSnapshot())) };
    }) };
}

function stratigraphyMetrics(snapshot) {
  const depth = [...snapshot.stratigraphy.totalDepthByCellMeters];
  const positiveDepth = depth.filter(value => value > 0);
  return { layers: snapshot.layers, depthMeters: distribution(depth), positiveDepthMeters: distribution(positiveDepth),
    buriedPlateCount: snapshot.stratigraphy.plateHistory.filter(plate => plate.buriedCellCount > 0).length };
}

function compileMetrics(plates) {
  const stratigraphy = new MaterialStratigraphy();
  for (const plate of plates) assert.ok(stratigraphy.addPlate(plate), `Stratigraphy rejected ${plate.id}`);
  const topology = compileSurfaceTopology({ plates, stratigraphy: stratigraphy.getSnapshot().stratigraphy,
    generation: plates.length });
  const arrays = Object.values(topology).filter(ArrayBuffer.isView);
  for (const array of arrays) for (const value of array) assert.ok(Number.isFinite(value), 'compiled topology values are finite');
  assert.ok([...topology.pickupNodeIndices].every(index => index < topology.nodeGridIndices.length));
  let connectedLayers = 0;
  for (let layer = 0; layer < plates.length; layer += 1) {
    const start = topology.nodeOffsets[layer], end = topology.nodeOffsets[layer + 1];
    const seen = new Set([start]), queue = [start];
    for (let head = 0; head < queue.length; head += 1) for (let direction = 0; direction < 4; direction += 1) {
      const adjacent = topology.neighborIndices[queue[head] * 4 + direction];
      if (adjacent < 0) continue;
      assert.ok(adjacent >= start && adjacent < end, 'solver neighbors stay within their Plate layer');
      if (!seen.has(adjacent)) { seen.add(adjacent); queue.push(adjacent); }
    }
    assert.equal(seen.size, end - start, `${plates[layer].id} remains connected on solver grid`);
    connectedLayers += 1;
  }
  return { solverNodeCount: topology.nodeGridIndices.length,
    compiledLinks: topology.adjacentLinkNodes.length / 2,
    neighborLinkPairs: topology.neighborIndices.filter(index => index >= 0).length / 2,
    topologyArrayBytes: arrays.reduce((sum, array) => sum + array.byteLength, 0), connectedLayers,
    plateNetworkCells: plates.reduce((sum, plate) => sum + plate.centerline.length, 0),
    plateMaskCells: plates.reduce((sum, plate) => sum + plate.mask.reduce((count, value) => count + value, 0), 0),
    pickupNodes: topology.pickupNodeIndices.length, materialCoefficients: [...topology.materialCoefficients] };
}

function decodeSelectedSnapshots(encoding, compressed) {
  const bytes = gunzipSync(compressed), targets = CHECKPOINTS.map(seconds => {
    const descriptor = [...encoding.descriptors].sort((a, b) => Math.abs(a.timeSeconds - seconds) - Math.abs(b.timeSeconds - seconds))[0];
    assert.ok(descriptor && Math.abs(descriptor.timeSeconds - seconds) <= 1);
    return descriptor.tick;
  });
  const previous = new Map(), selected = new Map();
  for (const descriptor of encoding.descriptors) {
    const arrays = {};
    for (const key of ['chemical', 'chemicalMemory', 'surface', 'support', 'contactCounts']) {
      const span = descriptor.arrays[key], current = Buffer.from(bytes.subarray(span.offset, span.offset + span.bytes));
      const prior = previous.get(key);
      if (prior) for (let i = 0; i < current.length; i += 1) current[i] ^= prior[i];
      previous.set(key, current);
      arrays[key] = current;
    }
    if (targets.includes(descriptor.tick)) selected.set(descriptor.tick, { ...descriptor, ...arrays });
  }
  return [...selected.values()];
}

function nearestSnapshot(snapshots, seconds) {
  return [...snapshots].sort((a, b) => Math.abs(a.timeSeconds - seconds) - Math.abs(b.timeSeconds - seconds))[0];
}

function coverageAt(union, snapshot) {
  const sets = { chemicalMemory: [], supported: [], joint: [], footContact: [] };
  const memory = new DataView(snapshot.chemicalMemory.buffer, snapshot.chemicalMemory.byteOffset, snapshot.chemicalMemory.byteLength);
  const support = new DataView(snapshot.support.buffer, snapshot.support.byteOffset, snapshot.support.byteLength);
  const contacts = new DataView(snapshot.contactCounts.buffer, snapshot.contactCounts.byteOffset, snapshot.contactCounts.byteLength);
  for (let index = 0; index < CELLS; index += 1) {
    const chemical = memory.getFloat32(index * 4, true) >= TRAIL_PLATE_CHEMICAL_THRESHOLD;
    const supported = support.getFloat32(index * 4, true) >= TRAIL_PLATE_SUPPORT_THRESHOLD;
    const contacted = contacts.getUint32(index * 4, true) > 0;
    if (chemical) sets.chemicalMemory.push(index);
    if (supported) sets.supported.push(index);
    if (chemical && supported) sets.joint.push(index);
    if (contacted) sets.footContact.push(index);
  }
  const count = union.size;
  const result = { unionCells: count, unionArea: count / (95 ** 2), environmentalGridFraction: count / CELLS };
  for (const [name, cells] of Object.entries(sets)) {
    let represented = 0;
    for (const index of cells) if (union.has(index)) represented += 1;
    result[name] = { cells: cells.length, representedCells: represented,
      representedFraction: cells.length ? represented / cells.length : null };
  }
  return result;
}

function unionAt(plates, seconds) {
  const union = new Set();
  for (const plate of plates) {
    if (plate.bornAtSimulationTimeMs > seconds * 1000) break;
    for (let index = 0; index < plate.mask.length; index += 1) if (plate.mask[index]) union.add(index);
  }
  return union;
}

function countAt(plates, seconds) { return plates.filter(plate => plate.bornAtSimulationTimeMs <= seconds * 1000).length; }

function nearestBirthOrdinal(plates, seconds) {
  assert.ok(plates.length, 'Representative Plate comparisons require actual births');
  return plates.reduce((best, plate, index) =>
    Math.abs(plate.bornAtSimulationTimeMs / 1000 - seconds)
      < Math.abs(plates[best].bornAtSimulationTimeMs / 1000 - seconds) ? index : best, 0);
}

function birthComparisonSvg(seed, baselineOrdinal, candidateOrdinal, baseline, candidate) {
  const width = 1000, height = 540, size = 430, y = 72;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><text x="28" y="32" font-size="22" font-family="sans-serif">Seed ${seed}: births nearest 300 s; world axes 0–1</text>${platePanel(baseline, 28, y, size, `main #${baselineOrdinal + 1}`, '#b7cadc')}${platePanel(candidate, 520, y, size, `candidate #${candidateOrdinal + 1}`, '#f2c78c')}<text x="28" y="525" font-size="13" font-family="sans-serif">Mask, retained centerline, principal path, source, target and pickups. Source and principal target retain original route selection.</text></svg>`;
}

function platePanel(plate, x, y, size, label, maskColor) {
  const pad = 28, plotX = x + pad, plotY = y + 36, plotSize = size - 42;
  const position = index => ({ x: plotX + (index % GRID) / 95 * plotSize,
    y: plotY + (1 - Math.floor(index / GRID) / 95) * plotSize });
  const nodes = new Map(plate.centerline.map(node => [node.index, node]));
  const mask = [];
  for (let index = 0; index < plate.mask.length; index += 1) if (plate.mask[index]) {
    const point = position(index);
    mask.push(`<rect x="${point.x.toFixed(2)}" y="${(point.y - plotSize / 95).toFixed(2)}" width="${(plotSize / 95 + .25).toFixed(2)}" height="${(plotSize / 95 + .25).toFixed(2)}" fill="${maskColor}"/>`);
  }
  const edges = plate.edges.map(([from, to]) => {
    const a = position(from), b = position(to);
    return `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="#28333d" stroke-width="1.1"/>`;
  }).join('');
  const path = plate.principalPath.map(index => nodes.get(index)).filter(Boolean).map((node, i, points) => {
    if (!i) return `M${position(node.index).x.toFixed(2)},${position(node.index).y.toFixed(2)}`;
    const p = position(node.index); return `L${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }).join(' ');
  const source = position(plate.principalPath[0]), target = position(plate.principalPath.at(-1));
  const pickups = plate.pickups.map(point => `<circle cx="${(plotX + point.x * plotSize).toFixed(2)}" cy="${(plotY + (1 - point.y) * plotSize).toFixed(2)}" r="4" fill="#fff" stroke="#7d2181" stroke-width="2"/>`).join('');
  const axes = `<rect x="${plotX}" y="${plotY}" width="${plotSize}" height="${plotSize}" fill="none" stroke="#333" stroke-width="1"/><text x="${plotX}" y="${plotY + plotSize + 20}" font-size="12">0</text><text x="${plotX + plotSize / 2}" y="${plotY + plotSize + 20}" font-size="12" text-anchor="middle">0.5</text><text x="${plotX + plotSize}" y="${plotY + plotSize + 20}" font-size="12" text-anchor="end">1</text><text x="${plotX - 10}" y="${plotY + 6}" font-size="12" text-anchor="end">1</text><text x="${plotX - 10}" y="${plotY + plotSize}" font-size="12" text-anchor="end">0</text>`;
  return `<g font-family="sans-serif"><text x="${x + 20}" y="${y + 20}" font-size="17">${label} · ${(plate.bornAtSimulationTimeMs / 1000).toFixed(1)} s</text>${mask.join('')}${edges}<path d="${path}" fill="none" stroke="#fff" stroke-width="5"/><path d="${path}" fill="none" stroke="#b22222" stroke-width="2.4"/>${pickups}<circle cx="${source.x}" cy="${source.y}" r="6" fill="#2b8c4b" stroke="#fff" stroke-width="1.5"/><circle cx="${target.x}" cy="${target.y}" r="6" fill="#c83737" stroke="#fff" stroke-width="1.5"/>${axes}</g>`;
}

function unionSvg(seed, milestones) {
  const width = 1180, rowHeight = 285, plotSize = 245, height = rowHeight * milestones.length + 65;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><text x="24" y="32" font-size="22" font-family="sans-serif">Seed ${seed}: cumulative Plate-mask unions; fixed 0–1 axes</text>`];
  for (let row = 0; row < milestones.length; row += 1) {
    const item = milestones[row], y = 46 + row * rowHeight;
    parts.push(`<text x="18" y="${y + 16}" font-size="14" font-family="sans-serif">${item.requestedSeconds} s (captured ${item.actualSeconds.toFixed(2)} s)</text>`);
    parts.push(unionPanel(item.baselineUnion, 35, y + 24, plotSize, `main · ${item.baseline.unionCells}`, '#68a5c8'));
    parts.push(unionPanel(item.candidateUnion, 415, y + 24, plotSize, `candidate · ${item.candidate.unionCells}`, '#e5a148'));
    parts.push(unionDifferencePanel(item.baselineUnion, item.candidateUnion, 795, y + 24, plotSize));
  }
  parts.push('</svg>');
  return parts.join('');
}

function unionPanel(cells, x, y, size, title, color) {
  const plotY = y + 18, cell = size / GRID, rects = [...cells].map(index => {
    const cx = index % GRID, cy = Math.floor(index / GRID);
    return `<rect x="${(x + cx * cell).toFixed(2)}" y="${(plotY + cy * cell).toFixed(2)}" width="${(cell + .15).toFixed(2)}" height="${(cell + .15).toFixed(2)}" fill="${color}"/>`;
  }).join('');
  return `<g font-family="sans-serif"><text x="${x}" y="${y + 13}" font-size="13">${title}</text><rect x="${x}" y="${plotY}" width="${size}" height="${size}" fill="#fafafa" stroke="#333"/>${rects}<text x="${x}" y="${plotY + size + 14}" font-size="11">x=0 → 1; y=0 → 1</text></g>`;
}

function unionDifferencePanel(baseline, candidate, x, y, size) {
  const plotY = y + 18, cell = size / GRID, rects = [];
  for (let index = 0; index < CELLS; index += 1) {
    const b = baseline.has(index), c = candidate.has(index);
    if (!b && !c) continue;
    const color = b && c ? '#8459a3' : b ? '#4386b0' : '#e2872e';
    rects.push(`<rect x="${(x + (index % GRID) * cell).toFixed(2)}" y="${(plotY + Math.floor(index / GRID) * cell).toFixed(2)}" width="${(cell + .15).toFixed(2)}" height="${(cell + .15).toFixed(2)}" fill="${color}"/>`);
  }
  return `<g font-family="sans-serif"><text x="${x}" y="${y + 13}" font-size="13">overlap purple · main-only blue · candidate-only orange</text><rect x="${x}" y="${plotY}" width="${size}" height="${size}" fill="#fafafa" stroke="#333"/>${rects.join('')}<text x="${x}" y="${plotY + size + 14}" font-size="11">x=0 → 1; y=0 → 1</text></g>`;
}

function birthTimelineSvg(seed, baseline, candidate, baselineAnalyses, candidateAnalyses) {
  const width = 1000, height = 450, left = 72, top = 52, plotW = 880, plotH = 320;
  const maxCount = Math.max(baseline.length, candidate.length) * 1.05 || 1;
  const x = seconds => left + seconds / 600 * plotW;
  const y = count => top + plotH - count / maxCount * plotH;
  const step = plates => {
    let d = `M${x(0)},${y(0)}`, count = 0;
    for (const plate of plates) { const t = plate.bornAtSimulationTimeMs / 1000; d += ` H${x(t)} V${y(++count)}`; }
    return `${d} H${x(600)}`;
  };
  const ticks = [0, 100, 200, 300, 400, 500, 600].map(seconds =>
    `<line x1="${x(seconds)}" y1="${top}" x2="${x(seconds)}" y2="${top + plotH}" stroke="#ddd"/><text x="${x(seconds)}" y="${top + plotH + 23}" text-anchor="middle" font-size="12">${seconds}</text>`).join('');
  const births = [...baseline.map(plate => `<line x1="${x(plate.bornAtSimulationTimeMs / 1000)}" y1="${top + plotH + 34}" x2="${x(plate.bornAtSimulationTimeMs / 1000)}" y2="${top + plotH + 46}" stroke="#38698a"/>`),
    ...candidate.map(plate => `<circle cx="${x(plate.bornAtSimulationTimeMs / 1000)}" cy="${top + plotH + 40}" r="3" fill="#c27b27"/>`)].join('');
  const readiness = [...baselineAnalyses.filter(row => row.candidateState?.birthReady)
    .map(row => `<circle cx="${x(row.timeSeconds)}" cy="${top + plotH + 29}" r="2" fill="#38698a"/>`),
  ...candidateAnalyses.filter(row => row.candidateState?.birthReady)
    .map(row => `<circle cx="${x(row.timeSeconds)}" cy="${top + plotH + 22}" r="2.4" fill="#558b45"/>`)].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><text x="24" y="30" font-size="22" font-family="sans-serif">Seed ${seed}: actual births and scheduling readiness</text>${ticks}<path d="${step(baseline)}" fill="none" stroke="#38698a" stroke-width="3"/><path d="${step(candidate)}" fill="none" stroke="#c27b27" stroke-width="3"/><line x1="${left}" y1="${top + plotH}" x2="${left + plotW}" y2="${top + plotH}" stroke="#333"/><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotH}" stroke="#333"/><text x="${left + 8}" y="${top + 18}" font-size="13">main ${baseline.length} plates · candidate ${candidate.length}</text><text x="${left}" y="${top + plotH + 19}" font-size="11">scheduler-ready analyses: main blue · candidate green</text>${readiness}${births}<text x="${left}" y="${top + plotH + 61}" font-size="11">births: main vertical ticks · candidate orange dots</text><text x="${left + plotW / 2}" y="${height - 12}" font-size="13" text-anchor="middle">simulation time (s)</text></svg>`;
}

function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = p => {
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * p, lower = Math.floor(position);
    return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * (position - lower);
  };
  return { n: sorted.length, min: sorted[0] ?? null, p50: at(.5), p90: at(.9), max: sorted.at(-1) ?? null };
}
function byBirthTime(a, b) { return a.bornAtSimulationTimeMs - b.bornAtSimulationTimeMs; }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
async function hashFiles(paths) {
  const result = {};
  for (const path of paths.sort()) result[relative(ROOT, path).replaceAll('\\', '/')] = sha256(await readFile(path));
  return result;
}
async function filesBelow(path) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? filesBelow(resolve(path, entry.name)) : resolve(path, entry.name)))).flat();
}
