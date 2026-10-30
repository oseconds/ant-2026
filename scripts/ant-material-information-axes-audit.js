import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { executeScenario, CHECKPOINTS } from './ant-g-production-candidate-natural.js';
import { attachTurningResponse } from './ant-material-turning-probe.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-30-material-information-axes';
const BASE = 'docs/ant/evidence/2026-10-30-material-organism-feedback-discovery/data/calibration';
const BASE_SUMMARY = resolve(ROOT, BASE, 'run-summary.json');
const BASE_AUXILIARY = resolve(ROOT, BASE, 'auxiliary.json.gz');
const SAMPLE_FIELDS = Object.freeze(['timeMs', 'tick', 'agentIndex', 'x', 'y', 'cell', 'L',
  'burialDepthMeters', 'footLoad', 'topPlateIndex', 'topAgeMs', 'topThicknessMeters',
  'topMeanChemical', 'topMeanSupport', 'topMeanHalfWidth', 'topStiffness', 'topDensity',
  'topDamping', 'surfaceCell', 'surfaceBilinearAtEntry', 'surfaceSupportAtEntry', 'contextFlags',
  'surfaceBilinearAtA', 'surfaceSupportAtA', 'surfaceBilinearAtD', 'surfaceSupportAtD', 'stackHistoryIndex']);
const FIELDS = Object.freeze(['L', 'burialDepthMeters', 'topAgeSeconds', 'topThicknessMeters',
  'topMeanHalfWidth', 'topMeanChemical', 'topMeanSupport', 'surfaceCell', 'surfaceBilinear',
  'surfaceSupport', 'footLoad']);
const CORRELATION_PAIRS = Object.freeze([
  ['L', 'burialDepthMeters'], ['L', 'topAgeSeconds'], ['L', 'topThicknessMeters'],
  ['L', 'topMeanChemical'], ['L', 'topMeanSupport'], ['L', 'surfaceCell'],
  ['L', 'surfaceSupport'], ['L', 'footLoad'],
  ['burialDepthMeters', 'surfaceSupport'], ['topMeanChemical', 'surfaceSupport'],
  ['topMeanSupport', 'surfaceSupport'], ['footLoad', 'surfaceCell']
]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const gzipJson = async path => JSON.parse(gunzipSync(await readFile(path)));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const close = (a, b, epsilon = 1e-12) => Math.abs(a - b) <= epsilon;

function binFor(point, width = 96) {
  return Math.round(point.y * (width - 1)) * width + Math.round(point.x * (width - 1));
}

function internStack(indices, record, lookup) {
  const key = indices.join(',');
  let value = lookup.get(key);
  if (value === undefined) {
    value = record.stackHistories.length;
    lookup.set(key, value);
    record.stackHistories.push(indices.slice());
  }
  return value;
}

function copyPlate(plate, index, thicknessMeters) {
  const mask = Array.from(plate.mask);
  return {
    index, id: plate.id, bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs,
    mask, maskSha256: hash(Buffer.from(mask)),
    descriptorSha256: hash(Buffer.from(JSON.stringify(plate))),
    grid: plate.grid,
    metrics: {
      meanChemical: plate.metrics?.meanChemical,
      meanSupport: plate.metrics?.meanSupport,
      meanHalfWidth: plate.metrics?.meanHalfWidth
    },
    meanHalfWidth: plate.meanHalfWidth,
    explicitThicknessMeters: Number.isFinite(plate.thicknessMeters) ? plate.thicknessMeters : null,
    thicknessMeters,
    material: {
      stiffness: plate.material?.stiffness,
      density: plate.material?.density,
      damping: plate.material?.damping
    }
  };
}

function buildFrame(record, controller, tick, timeMs, lookup) {
  const size = 96 * 96;
  const counts = new Uint16Array(size);
  const top = new Int32Array(size); top.fill(-1);
  const depth = new Float32Array(size);
  const stackCells = Array.from({ length: size }, () => []);
  for (const plate of record.plates) {
    if (!(plate.bornAtSimulationTimeMs < timeMs)) continue;
    for (let cell = 0; cell < size; cell += 1) {
      if (!plate.mask[cell]) continue;
      if (counts[cell] > 0) depth[cell] = depth[cell] + plate.thicknessMeters;
      counts[cell] += 1;
      top[cell] = plate.index;
      stackCells[cell].push(plate.index);
    }
  }
  const stackIds = new Uint32Array(size);
  for (let cell = 0; cell < size; cell += 1) if (counts[cell]) {
    stackIds[cell] = internStack(stackCells[cell], record, lookup);
  }
  const surface = controller.surfaceField.values.slice();
  const support = Float32Array.from({ length: size }, (_, cell) =>
    controller.surfaceField.sampleSupport((cell % 96) / 95, Math.floor(cell / 96) / 95, 0.025));
  return { tick, timeMs, counts, top, depth, stackIds,
    footLoad: controller.materialStratigraphy.footLoadByCell.slice(), surface, support };
}

function attachRecorder(controller, referenceFrames) {
  controller.materialLocomotionResistance = true;
  const record = {
    schema: 'ant-material-information-axes-capture-v1',
    seed: 20261005, seconds: 600, tickHz: 60, audio: 'off',
    protocol: { productionSlowdown: true, turningCandidate: false, followingCandidate: false, residence: false },
    tickEntrySnapshots: 0,
    exposureByLayer: {}, turningByLayer: {}, finiteFollowingByLayer: {},
    agents: [], stackHistories: [], plates: [], frames: [], samples: []
  };
  const expectedTicks = new Set(referenceFrames.map(frame => frame.tick));
  const agentIndex = new Map();
  const stackLookup = new Map();
  const current = new Map();
  let nextAgentIndex = 0;
  const syncPlates = () => {
    const plates = controller.trailPlateBirth.getPlates();
    while (record.plates.length < plates.length) {
      const index = record.plates.length;
      record.plates.push(copyPlate(plates[index], index,
        controller.materialStratigraphy.plateThicknessMeters[index]));
    }
  };
  const layerCount = (snapshot, point) => {
    const cell = binFor(point, snapshot.width);
    return { cell, layers: snapshot.stratigraphy.layerCountByCell[cell] || 0 };
  };
  const surfaceReadout = (point) => [controller.surfaceField.sample(point.x, point.y),
    controller.surfaceField.sampleSupport(point.x, point.y)];
  const turnHook = attachTurningResponse(controller, { enabled: false, onTurn: turn => {
    const layer = turn.layers;
    const key = String(layer);
    record.turningByLayer[key] = (record.turningByLayer[key] || 0) + 1;
    const context = current.get(turn.agent.id);
    assert(context, 'turn call has matching tick-entry agent');
    assert.equal(context.layers, layer, 'turn and observer use same tick-entry layer count');
    if (context.row) {
      context.row[21] |= 1;
      [context.row[22], context.row[23]] = surfaceReadout(turn.agent);
    }
  } });
  const tickWithTurningObserver = controller.tick;
  const occupancy = controller.occupancy;
  const nativeSense = occupancy.sense;
  occupancy.sense = function (agent, agents, ...args) {
    const result = nativeSense.call(this, agent, agents, ...args);
    const context = current.get(agent.id);
    if (context && Number.isFinite(result.followingSpeedLimit)) {
      const key = String(context.layers);
      record.finiteFollowingByLayer[key] = (record.finiteFollowingByLayer[key] || 0) + 1;
      if (context.row) {
        context.row[21] |= 2;
        [context.row[24], context.row[25]] = surfaceReadout(agent);
      }
    }
    return result;
  };
  const tick = (...args) => {
    syncPlates();
    current.clear();
    const timeMs = controller.simulationTimeMs;
    const tickIndex = record.tickEntrySnapshots;
    const snapshot = controller.materialStratigraphy.getSnapshot();
    for (const ant of controller.agents) {
      const { cell, layers } = layerCount(snapshot, ant);
      const key = String(layers);
      record.exposureByLayer[key] = (record.exposureByLayer[key] || 0) + 1;
      let ordinal = agentIndex.get(ant.id);
      if (ordinal === undefined) {
        ordinal = nextAgentIndex++;
        agentIndex.set(ant.id, ordinal);
        record.agents.push(ant.id);
      }
      let row = null;
      if (layers > 0) {
        const stratigraphy = controller.materialStratigraphy;
        const topPlateIndex = snapshot.stratigraphy.topLayerByCell[cell];
        assert(topPlateIndex >= 0 && record.plates[topPlateIndex], 'material cell has a known top Plate');
        const plate = record.plates[topPlateIndex];
        const point = { x: ant.x, y: ant.y };
        const stack = stratigraphy.columns[cell] || [];
        const [surfaceBilinearAtEntry, surfaceSupportAtEntry] = surfaceReadout(point);
        row = [timeMs, tickIndex, ordinal, ant.x, ant.y, cell, layers,
          snapshot.stratigraphy.totalDepthByCellMeters[cell], stratigraphy.footLoadByCell[cell],
          topPlateIndex, timeMs - plate.bornAtSimulationTimeMs, plate.thicknessMeters,
          plate.metrics.meanChemical, plate.metrics.meanSupport, plate.meanHalfWidth,
          plate.material.stiffness, plate.material.density, plate.material.damping,
          controller.surfaceField.values[cell], surfaceBilinearAtEntry, surfaceSupportAtEntry,
          0, null, null, null, null, internStack(stack, record, stackLookup)];
        record.samples.push(row);
      }
      current.set(ant.id, { layers, row });
    }
    record.tickEntrySnapshots += 1;
    const result = tickWithTurningObserver(...args);
    for (const context of current.values()) if (context.row) {
      assert.equal(context.row[21] & 1, 1, 'each material-exposed tick contains one native turn call');
    }
    syncPlates();
    const timeAfter = controller.simulationTimeMs;
    const finishedTick = Math.round(timeAfter / (1000 / 60));
    if (expectedTicks.has(finishedTick)) record.frames.push(buildFrame(record, controller,
      finishedTick, timeAfter, stackLookup));
    return result;
  };
  controller.tick = tick;
  return { record, finish() {
    if (controller.tick === tick) controller.tick = tickWithTurningObserver;
    occupancy.sense = nativeSense;
    turnHook.finish();
  } };
}

function averageRanks(values) {
  const order = Array.from({ length: values.length }, (_, index) => index)
    .sort((a, b) => values[a] - values[b] || a - b);
  const ranks = new Float64Array(values.length);
  for (let start = 0; start < order.length;) {
    let end = start + 1;
    while (end < order.length && values[order[end]] === values[order[start]]) end += 1;
    const rank = (start + end - 1) / 2 + 1;
    for (let i = start; i < end; i += 1) ranks[order[i]] = rank;
    start = end;
  }
  return ranks;
}

function pearson(a, b) {
  if (a.length !== b.length || a.length < 2) return null;
  let meanA = 0, meanB = 0;
  for (let i = 0; i < a.length; i += 1) { meanA += a[i]; meanB += b[i]; }
  meanA /= a.length; meanB /= b.length;
  let cross = 0, sumA = 0, sumB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const da = a[i] - meanA, db = b[i] - meanB;
    cross += da * db; sumA += da * da; sumB += db * db;
  }
  return sumA && sumB ? cross / Math.sqrt(sumA * sumB) : null;
}

function sortedStats(values) {
  if (!values.length) return { n: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const q = p => sorted[Math.floor((sorted.length - 1) * p)];
  return { n: sorted.length, min: sorted[0], p05: q(0.05), p10: q(0.1), p25: q(0.25),
    median: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95), max: sorted.at(-1),
    mean, standardDeviation: Math.sqrt(variance) };
}

function newColumns() {
  return { values: Object.fromEntries(FIELDS.map(field => [field, []])),
    topIndex: [], stackId: [], timeMs: [], tick: [], cell: [], x: [], y: [], agent: [], sourceIndex: [] };
}

function addObservation(columns, { values, topIndex, stackId, timeMs, tick, cell, x, y, agent, sourceIndex }) {
  for (const field of FIELDS) columns.values[field].push(values[field]);
  columns.topIndex.push(topIndex); columns.stackId.push(stackId); columns.timeMs.push(timeMs);
  columns.tick.push(tick); columns.cell.push(cell); columns.x.push(x); columns.y.push(y);
  columns.agent.push(agent); columns.sourceIndex.push(sourceIndex);
}

function plateValues(plate, timeMs) {
  return {
    topAgeSeconds: (timeMs - plate.bornAtSimulationTimeMs) / 1000,
    topThicknessMeters: plate.thicknessMeters,
    topMeanHalfWidth: plate.meanHalfWidth,
    topMeanChemical: plate.metrics.meanChemical,
    topMeanSupport: plate.metrics.meanSupport
  };
}

function gridColumns(capture) {
  const columns = newColumns();
  for (let frameIndex = 0; frameIndex < capture.frames.length; frameIndex += 1) {
    const frame = capture.frames[frameIndex];
    for (let cell = 0; cell < frame.counts.length; cell += 1) {
      const layers = frame.counts[cell];
      if (!layers) continue;
      const topIndex = frame.top[cell], plate = capture.plates[topIndex];
      assert(plate, `frame ${frame.tick} top Plate exists`);
      const x = (cell % 96) / 95, y = Math.floor(cell / 96) / 95;
      addObservation(columns, { values: { L: layers,
        burialDepthMeters: frame.depth[cell], ...plateValues(plate, frame.timeMs),
        surfaceCell: frame.surface[cell], surfaceBilinear: frame.surface[cell],
        surfaceSupport: frame.support[cell], footLoad: frame.footLoad[cell] },
      topIndex, stackId: frame.stackIds[cell], timeMs: frame.timeMs, tick: frame.tick,
      cell, x, y, agent: -1, sourceIndex: frameIndex });
    }
  }
  return columns;
}

function consumerColumns(capture, mode = 'exposure') {
  const columns = newColumns();
  for (let index = 0; index < capture.samples.length; index += 1) {
    const row = capture.samples[index], flags = row[21];
    if (mode === 'D' && !(flags & 2)) continue;
    const plate = capture.plates[row[9]];
    const surfaceIndex = mode === 'D' ? 24 : mode === 'A' ? 22 : 19;
    const supportIndex = mode === 'D' ? 25 : mode === 'A' ? 23 : 20;
    addObservation(columns, { values: { L: row[6], burialDepthMeters: row[7],
      topAgeSeconds: row[10] / 1000, topThicknessMeters: row[11], topMeanHalfWidth: row[14],
      topMeanChemical: row[12], topMeanSupport: row[13], surfaceCell: row[18],
      surfaceBilinear: row[surfaceIndex], surfaceSupport: row[supportIndex], footLoad: row[8] },
    topIndex: row[9], stackId: row[26], timeMs: row[0], tick: row[1], cell: row[5],
    x: row[3], y: row[4], agent: row[2], sourceIndex: index });
    assert(plate, `consumer row ${index} top Plate exists`);
  }
  return columns;
}

function analyzeColumns(name, columns, capture) {
  const groups = new Map();
  const topIds = new Map();
  const stackIds = new Map();
  const topIdCounts = new Map();
  const n = columns.values.L.length;
  for (let i = 0; i < n; i += 1) {
    const layer = columns.values.L[i];
    let group = groups.get(layer);
    if (!group) {
      group = Object.fromEntries(FIELDS.map(field => [field, []]));
      groups.set(layer, group);
      topIds.set(layer, new Set()); stackIds.set(layer, new Set()); topIdCounts.set(layer, new Map());
    }
    for (const field of FIELDS) group[field].push(columns.values[field][i]);
    const id = capture.plates[columns.topIndex[i]].id;
    topIds.get(layer).add(id); stackIds.get(layer).add(columns.stackId[i]);
    const idCounts = topIdCounts.get(layer); idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  const overall = Object.fromEntries(FIELDS.map(field => [field, sortedStats(columns.values[field])]));
  const conditionalByLayer = {};
  for (const [layer, group] of [...groups].sort((a, b) => a[0] - b[0])) {
    conditionalByLayer[layer] = {
      count: group.L.length,
      uniqueTopPlateIds: topIds.get(layer).size,
      uniqueFullColumnHistories: stackIds.get(layer).size,
      topPlateFrequencies: [...topIdCounts.get(layer)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 8).map(([id, count]) => ({ id, count })),
      distributions: Object.fromEntries(FIELDS.filter(field => field !== 'L')
        .map(field => [field, sortedStats(group[field])]))
    };
  }
  const varianceNotExplainedByL = {};
  for (const field of FIELDS.filter(field => field !== 'L')) {
    const values = columns.values[field];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const total = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
    let within = 0;
    for (const group of groups.values()) {
      const groupMean = group[field].reduce((sum, value) => sum + value, 0) / group[field].length;
      for (const value of group[field]) within += (value - groupMean) ** 2;
    }
    varianceNotExplainedByL[field] = total ? within / total : null;
  }
  const ranks = Object.fromEntries(FIELDS.map(field => [field, averageRanks(columns.values[field])]));
  const correlations = CORRELATION_PAIRS.map(([a, b]) => ({ a, b,
    pearson: pearson(columns.values[a], columns.values[b]),
    spearman: pearson(ranks[a], ranks[b]) }));
  const counterexamples = {};
  for (const field of FIELDS.filter(field => field !== 'L')) {
    const candidateLayers = [...groups.entries()].filter(([, group]) => {
      const range = minMax(group[field]);
      return range.min < range.max;
    })
      .sort((a, b) => b[1].L.length - a[1].L.length || a[0] - b[0]);
    if (!candidateLayers.length) { counterexamples[field] = null; continue; }
    const [layer] = candidateLayers[0], values = groups.get(layer)[field];
    let low = Infinity, high = -Infinity, lowIndex = -1, highIndex = -1;
    for (let i = 0; i < n; i += 1) if (columns.values.L[i] === layer) {
      if (columns.values[field][i] < low) { low = columns.values[field][i]; lowIndex = i; }
      if (columns.values[field][i] > high) { high = columns.values[field][i]; highIndex = i; }
    }
    counterexamples[field] = {
      layerCount: layer, stratumCount: values.length, shareOfView: values.length / n, minimum: low,
      maximum: high, difference: high - low,
      minimumExample: exampleAt(columns, lowIndex, capture), maximumExample: exampleAt(columns, highIndex, capture)
    };
  }
  const identityLayer = [...groups.entries()].filter(([layer]) => topIds.get(layer).size > 1)
    .sort((a, b) => b[1].L.length - a[1].L.length || a[0] - b[0])[0];
  let identityCounterexample = null;
  if (identityLayer) {
    const [layer] = identityLayer;
    const ids = [...topIdCounts.get(layer)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const selected = ids.slice(0, 2).map(([id]) => {
      for (let i = 0; i < n; i += 1) if (columns.values.L[i] === layer
        && capture.plates[columns.topIndex[i]].id === id) return exampleAt(columns, i, capture);
      return null;
    });
    identityCounterexample = { layerCount: layer, stratumCount: groups.get(layer).L.length,
      uniqueTopPlateIds: topIds.get(layer).size, uniqueFullColumnHistories: stackIds.get(layer).size,
      examples: selected };
  }
  return { name, sampleCount: n, layerCounts: Object.fromEntries([...groups].sort((a, b) => a[0] - b[0])
    .map(([layer, group]) => [layer, group.L.length])), distributions: overall, conditionalByLayer,
    varianceNotExplainedByL, correlations, sameLExamples: counterexamples, identityCounterexample };
}

function exampleAt(columns, index, capture) {
  const topIndex = columns.topIndex[index], stackId = columns.stackId[index];
  const sourceIndex = columns.sourceIndex[index];
  const history = capture.stackHistories[stackId].map(plateIndex => capture.plates[plateIndex].id);
  return {
    timeMs: columns.timeMs[index], tick: columns.tick[index], cell: columns.cell[index],
    x: columns.x[index], y: columns.y[index], agentId: columns.agent[index] >= 0
      ? capture.agents[columns.agent[index]] : null,
    topPlateId: capture.plates[topIndex].id, fullColumnPlateIdsBottomToTop: history,
    sourceIndex, values: Object.fromEntries(FIELDS.map(field => [field, columns.values[field][index]]))
  };
}

function minMax(values) {
  let min = Infinity, max = -Infinity;
  for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
  return { min, max };
}

function perAnchor(capture) {
  return capture.frames.map(frame => {
    const layerCounts = Object.create(null), topIds = new Set(), stacks = new Set();
    const sameLayerRanges = Object.fromEntries(FIELDS.filter(field => field !== 'L')
      .map(field => [field, Object.create(null)]));
    const valuesByLayer = new Map();
    for (let cell = 0; cell < frame.counts.length; cell += 1) {
      const layer = frame.counts[cell];
      if (!layer) continue;
      layerCounts[layer] = (layerCounts[layer] || 0) + 1;
      topIds.add(frame.top[cell]); stacks.add(frame.stackIds[cell]);
      const plate = capture.plates[frame.top[cell]];
      if (!valuesByLayer.has(layer)) valuesByLayer.set(layer, Object.fromEntries(FIELDS.filter(field => field !== 'L')
        .map(field => [field, []])));
      const bucket = valuesByLayer.get(layer);
      bucket.burialDepthMeters.push(frame.depth[cell]);
      bucket.topAgeSeconds.push((frame.timeMs - plate.bornAtSimulationTimeMs) / 1000);
      bucket.topThicknessMeters.push(plate.thicknessMeters);
      bucket.topMeanHalfWidth.push(plate.meanHalfWidth);
      bucket.topMeanChemical.push(plate.metrics.meanChemical);
      bucket.topMeanSupport.push(plate.metrics.meanSupport);
      bucket.surfaceCell.push(frame.surface[cell]);
      bucket.surfaceBilinear.push(frame.surface[cell]);
      bucket.surfaceSupport.push(frame.support[cell]);
      bucket.footLoad.push(frame.footLoad[cell]);
    }
    for (const [layer, bucket] of valuesByLayer) for (const field of Object.keys(bucket)) {
      const stats = sortedStats(bucket[field]);
      sameLayerRanges[field][layer] = { count: stats.n, range: stats.max - stats.min,
        interquartileRange: stats.p75 - stats.p25 };
    }
    return { tick: frame.tick, timeMs: frame.timeMs, materializedCells: Object.values(layerCounts)
      .reduce((sum, value) => sum + value, 0), layerCounts, uniqueTopPlateIds: topIds.size,
      uniqueFullColumnHistories: stacks.size, sameLayerRanges };
  });
}

function summarizeReplay(capture) {
  const grid = analyzeColumns('all_materialized_cells_across_40_late_anchors', gridColumns(capture), capture);
  const exposure = analyzeColumns('all_material_exposed_ant_ticks', consumerColumns(capture), capture);
  const following = analyzeColumns('finite_same_flow_D_opportunities', consumerColumns(capture, 'D'), capture);
  const aRows = capture.samples;
  const aSurface = sortedStats(aRows.map(row => row[22]));
  const aSupport = sortedStats(aRows.map(row => row[23]));
  const dSurface = sortedStats(aRows.filter(row => row[21] & 2).map(row => row[24]));
  const dSupport = sortedStats(aRows.filter(row => row[21] & 2).map(row => row[25]));
  return {
    schema: 'ant-material-information-axes-analysis-v1',
    sampleFields: SAMPLE_FIELDS,
    repeatedSamplingNote: 'Grid anchors and ant-ticks are repeated observations from one endogenous world, not independent trials.',
    views: { materialGrid: grid, organismExposure: exposure, AturnCalls: {
      sampleCount: aRows.length, sameStratigraphyAndFootLoadRowsAsExposure: true,
      surfaceAtTurnCall: aSurface, supportAtTurnCall: aSupport
    }, DfiniteSameFlow: following, DsurfaceAtSense: { surfaceBilinear: dSurface, surfaceSupport: dSupport } },
    perAnchor: perAnchor(capture),
    plateIdentity: {
      plateCount: capture.plates.length,
      fullColumnHistoryCountAcrossConsumerSamples: new Set(capture.samples.map(row => row[26])).size,
      stackHistoryIndexCount: capture.stackHistories.length
    }
  };
}

function assertPlateProperties(plates) {
  for (const plate of plates) {
    const chemical = clamp(plate.metrics.meanChemical, 0, 1);
    const support = clamp(plate.metrics.meanSupport / 0.08, 0, 1);
    const stiffness = clamp(0.65 + chemical * 0.5, 0.65, 1.15);
    const density = clamp(1 + support * 0.2, 1, 1.2);
    const damping = clamp(0.25 + chemical * 0.2, 0.25, 0.45);
    const thickness = plate.explicitThicknessMeters > 0 ? plate.explicitThicknessMeters
      : clamp(0.001 + 0.05 * (Number.isFinite(plate.meanHalfWidth) ? plate.meanHalfWidth : 0.02), 0.001, 0.01);
    assert(close(plate.material.stiffness, stiffness), `${plate.id} stiffness follows chemical metric`);
    assert(close(plate.material.density, density), `${plate.id} density follows support metric`);
    assert(close(plate.material.damping, damping), `${plate.id} damping follows chemical metric`);
    assert(close(plate.thicknessMeters, thickness), `${plate.id} thickness follows width/explicit thickness`);
    assert.equal(plate.metrics.meanHalfWidth, plate.meanHalfWidth);
  }
}

function stableSummary(value) {
  const { wallSeconds, ...stable } = value;
  return JSON.parse(JSON.stringify(stable));
}

async function verifySourcesAndInputs() {
  const calibration = JSON.parse(await readFile(resolve(ROOT, BASE, 'CALIBRATION.json'), 'utf8'));
  const savedSources = JSON.parse(await readFile(resolve(ROOT, BASE, 'SOURCE-HASHES.json'), 'utf8'));
  const receipts = JSON.parse(await readFile(resolve(ROOT, BASE, 'INPUT-RECEIPTS.json'), 'utf8'));
  assert.equal(calibration.calibration, 'PASS');
  assert.equal(calibration.exactRawAndCheckpointParity, true);
  assert.deepEqual(savedSources, calibration.sourceHashes);
  const actual = {};
  for (const [file, expected] of Object.entries(savedSources)) {
    actual[file] = hash(await readFile(resolve(ROOT, file)));
    assert.equal(actual[file], expected, `${file} frozen source hash`);
  }
  assert.deepEqual(receipts, calibration.inputReceipts);
  const rawBytes = await readFile(resolve(ROOT, BASE, 'seed20261005-G-raw.json.gz'));
  assert.equal(hash(rawBytes), receipts.originalRawSha256);
  const checkpoints = {};
  for (const seconds of CHECKPOINTS) {
    const file = `seed20261005-G-${seconds}s.json.gz`;
    const bytes = await readFile(resolve(ROOT, BASE, file));
    checkpoints[file] = hash(bytes);
    assert.equal(checkpoints[file], receipts.checkpointSha256[file]);
  }
  const auxiliaryBytes = await readFile(resolve(ROOT, BASE, 'auxiliary.json.gz'));
  return { calibration, savedSources, actualSources: actual, receipts, rawSha256: hash(rawBytes),
    checkpointSha256: checkpoints, auxiliarySha256: hash(auxiliaryBytes),
    lateTicks: (await gzipJson(BASE_AUXILIARY)).frames.map(frame => frame.tick) };
}

async function replay() {
  const provenance = await verifySourcesAndInputs();
  const reference = await gzipJson(BASE_AUXILIARY);
  const expectedSummary = JSON.parse(await readFile(BASE_SUMMARY, 'utf8'));
  const output = await mkdtemp(resolve(tmpdir(), 'ant-material-information-axes-'));
  let complete = false, recorder = null;
  try {
    const result = await executeScenario(20261005, 'G', 600, output, null, controller => {
      recorder = attachRecorder(controller, reference.frames);
    });
    recorder.finish();
    assert.equal(result.seconds, 600);
    assert.equal(result.ticks, 36000);
    assert.equal(result.initialStateSha256, provenance.calibration.initialStateSha256);
    assert.deepEqual(result.finalRng, expectedSummary.finalRng, 'final RNG state/call count');
    assert.deepEqual(stableSummary(result), stableSummary(expectedSummary), 'frozen run summary except wall clock');
    const parityFiles = ['seed20261005-G-raw.json.gz', ...CHECKPOINTS.map(seconds => `seed20261005-G-${seconds}s.json.gz`)];
    for (const file of parityFiles) {
      assert.deepEqual(await readFile(resolve(output, file)), await readFile(resolve(ROOT, BASE, file)),
        `${file} is byte-identical to frozen primary`);
    }
    const record = recorder.record;
    assert.equal(record.tickEntrySnapshots, 36000);
    assert.deepEqual(record.exposureByLayer, reference.layers);
    const expectedTurning = Object.fromEntries(Object.entries(reference.turning.byLayer).map(([layer, row]) => [layer, row.calls]));
    assert.deepEqual(record.turningByLayer, expectedTurning);
    const expectedFollowing = Object.fromEntries(Object.entries(reference.motorByLayer)
      .filter(([, row]) => row.finiteFollowingCalls > 0)
      .map(([layer, row]) => [layer, row.finiteFollowingCalls]));
    assert.deepEqual(record.finiteFollowingByLayer, expectedFollowing);
    assert.equal(record.frames.length, reference.frames.length);
    for (let i = 0; i < record.frames.length; i += 1) {
      const actualFrame = record.frames[i], expectedFrame = reference.frames[i];
      assert.equal(actualFrame.tick, expectedFrame.tick);
      assert(Math.abs(actualFrame.timeMs - expectedFrame.timeMs) <= 1e-6);
      assert.deepEqual(Array.from(actualFrame.counts), expectedFrame.preMaterialLayers, `late L ${actualFrame.tick}`);
      assert.deepEqual(Array.from(actualFrame.surface), expectedFrame.C, `late SurfaceField ${actualFrame.tick}`);
      assert.deepEqual(Array.from(actualFrame.support), expectedFrame.D, `late support ${actualFrame.tick}`);
    }
    const raw = await gzipJson(resolve(output, 'seed20261005-G-raw.json.gz'));
    const savedMasks = reference.actualBirthMasks;
    assert.equal(record.plates.length, raw.births.length);
    assert.equal(raw.births.length, record.plates.length);
    assert.equal(savedMasks.length, record.plates.length);
    for (let i = 0; i < record.plates.length; i += 1) {
      assert.equal(record.plates[i].id, raw.births[i].id);
      assert.equal(record.plates[i].bornAtSimulationTimeMs, raw.births[i].bornAtSimulationTimeMs);
      assert.equal(record.plates[i].maskSha256, raw.births[i].maskSha256);
      assert.deepEqual(record.plates[i].mask, savedMasks[i].mask);
    }
    assertPlateProperties(record.plates);
    const captureBytes = gzipSync(Buffer.from(JSON.stringify(record, (key, value) =>
      ArrayBuffer.isView(value) ? Array.from(value) : value) + '\n'), { level: 9, mtime: 0 });
    const packageDir = resolve(ROOT, PACKAGE), dataDir = resolve(packageDir, 'data');
    await mkdir(dataDir, { recursive: true });
    const capturePath = resolve(dataDir, 'CAPTURE.json.gz');
    await writeFile(capturePath, captureBytes, { flag: 'wx' });
    const scriptHash = hash(await readFile(resolve(ROOT, 'scripts/ant-material-information-axes-audit.js')));
    const receipts = {
      status: 'PASS', sourceAuthority: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785',
      liveOriginMain: '15667c73e9f507bf89dea645f966bc7f58301fdc',
      liveMainDelta: ['.github/workflows/deploy.yml', 'vite.config.js'],
      researchParent: '18fed8fbca82e8b86dfc88779cd6e11b797a2439',
      branch: 'codex/ant-material-information-axes-20261030',
      history: { seed: 20261005, arm: 'G', seconds: 600, tickHz: 60, audio: 'off',
        productionLayerCountSlowdown: true, A: false, D: false, residence: false,
        initialStateSha256: result.initialStateSha256, finalRng: result.finalRng,
        tickCount: result.ticks, tickEntrySnapshots: record.tickEntrySnapshots,
        materialExposedAntTicks: record.samples.length, materialGridAnchors: record.frames.map(frame => ({ tick: frame.tick, timeMs: frame.timeMs })),
        plateCount: record.plates.length },
      replayParity: { runSummaryExceptWallSeconds: true, rawAndFiveCheckpointsByteExact: true,
        finalRngExact: true, layerCountsExact: true, turnCountsByLayerExact: true,
        finiteFollowingCountsByLayerExact: true, lateSurfaceAndSupportExact: true,
        latePreMaterialLayerMapsExact: true, actualPlateIDsTimesAndMasksExact: true,
        productionBehaviorMutation: false, rngCallsAdded: 0 },
      frozenInputs: { calibration: 'docs/ant/evidence/2026-10-30-material-organism-feedback-discovery/data/calibration',
        rawSha256: provenance.rawSha256, checkpointSha256: provenance.checkpointSha256,
        auxiliarySha256: provenance.auxiliarySha256,
        initialStateSha256: provenance.calibration.initialStateSha256 },
      sourceHashes: provenance.actualSources,
      instrumentation: { script: 'scripts/ant-material-information-axes-audit.js', sha256: scriptHash,
        captureSha256: hash(captureBytes) }
    };
    await writeFile(resolve(packageDir, 'PROVENANCE.json'), JSON.stringify(receipts, null, 2) + '\n', { flag: 'wx' });
    complete = true;
    process.stdout.write(JSON.stringify({ status: 'REPLAY-PARITY-PASS', captureSha256: hash(captureBytes),
      ticks: result.ticks, materialExposedAntTicks: record.samples.length, plates: record.plates.length,
      anchors: record.frames.map(frame => frame.tick) }) + '\n');
  } finally {
    recorder?.finish();
    if (complete) {
      assert(resolve(output).startsWith(resolve(tmpdir()) + '\\'), 'cleanup remains inside system temp');
      await rm(output, { recursive: true, force: true });
    } else process.stderr.write(`Replay incomplete; temporary output retained at ${output}\n`);
  }
}

async function analyzeOnly() {
  const capturePath = resolve(ROOT, PACKAGE, 'data/CAPTURE.json.gz');
  const capture = await gzipJson(capturePath);
  assert.equal(capture.schema, 'ant-material-information-axes-capture-v1');
  assertPlateProperties(capture.plates);
  const analysis = summarizeReplay(capture);
  const output = Buffer.from(JSON.stringify(analysis, null, 2) + '\n');
  const path = resolve(ROOT, PACKAGE, 'data/ANALYSIS.json');
  try {
    assert.deepEqual(await readFile(path), output, 'analysis rerun is byte-exact');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(path, output, { flag: 'wx' });
  }
  process.stdout.write(JSON.stringify({ status: 'ANALYSIS-RERUN-PASS', sha256: hash(output),
    gridSamples: analysis.views.materialGrid.sampleCount,
    exposureTicks: analysis.views.organismExposure.sampleCount,
    AturnCalls: analysis.views.AturnCalls.sampleCount,
    DfiniteSameFlow: analysis.views.DfiniteSameFlow.sampleCount,
    anchors: analysis.perAnchor.length }) + '\n');
}

function selfTest() {
  assert.deepEqual(Array.from(averageRanks([4, 4, 9])), [1.5, 1.5, 3]);
  assert.equal(pearson([1, 2, 3], [2, 4, 6]), 1);
  assert.deepEqual(sortedStats([0, 0, 1, 2]).n, 4);
  const record = { stackHistories: [] }, lookup = new Map();
  assert.equal(internStack([0, 1], record, lookup), internStack([0, 1], record, lookup));
  assert.equal(record.stackHistories.length, 1);
  assert.equal(record.stackHistories.length, 1, 'identical bottom-to-top history interns once');
  process.stdout.write(JSON.stringify({ status: 'PASS', checks: [
    'average-ranks-tie-handling', 'pearson-perfect-linear', 'quantile-sample-count', 'stack-history-interning'
  ] }) + '\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) { selfTest(); return; }
  if (args.includes('--replay')) { await replay(); return; }
  if (args.includes('--analyze-only')) { await analyzeOnly(); return; }
  throw new Error('Use --self-test, --replay, or --analyze-only.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
