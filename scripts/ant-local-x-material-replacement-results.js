import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, readRun, unpack, writeJson } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-local-x-material-replacement');
const WINDOWS = Array.from({ length: 5 }, (_, i) => [i * 60, (i + 1) * 60]);
const SEEDS = ['20261005', '20261006', '20261007'];
const GRID = 96, CELLS = GRID ** 2, ENTRY = { x: 0.5, y: 0.72 };
const ENTRY_RADIUS = 0.15, BOUNDARY_BAND = 0.05;
const count = (rows, predicate) => rows.filter(predicate).length;
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function inWindow(timeMs, interval) {
  const seconds = timeMs / 1000;
  return seconds >= interval[0] && seconds < interval[1];
}

function inTickWindow(tick, interval) {
  return tick > interval[0] * 60 && tick <= interval[1] * 60;
}

function quantiles(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, min: null, q50: null, q90: null, max: null };
  const q = p => sorted[Math.round((sorted.length - 1) * p)];
  return { count: sorted.length, min: sorted[0], q50: q(.5), q90: q(.9), max: sorted.at(-1) };
}

function histogram(values, breaks) {
  const bins = breaks.slice(0, -1).map((lower, i) => ({ lower, upper: breaks[i + 1], count: 0 }));
  for (const value of values) {
    const index = bins.findIndex((row, i) => value >= row.lower && (value < row.upper || i === bins.length - 1));
    if (index >= 0) bins[index].count++;
  }
  return bins;
}

function movementWindow(run, interval) {
  const rows = run.tickMetrics.filter(row => inTickWindow(row.tick, interval));
  if (!rows.length) return { complete: false, ticks: 0 };
  const first = rows[0], last = rows.at(-1), priorIndex = run.tickMetrics.indexOf(first) - 1;
  const prior = priorIndex >= 0 ? run.tickMetrics[priorIndex] : null;
  return { complete: rows.length === 3600, ticks: rows.length,
    meanPopulation: mean(rows.map(row => row.livingAtEntry)),
    minPopulation: Math.min(...rows.map(row => row.livingAtEntry)),
    maxPopulation: Math.max(...rows.map(row => row.livingAtEntry)),
    endPopulation: last.livingAtEnd,
    spawned: rows.reduce((sum, row) => sum + row.spawnedThisTick, 0),
    retired: rows.reduce((sum, row) => sum + row.retiredThisTick, 0),
    realizedTravel: last.realizedTravelCumulative - (prior?.realizedTravelCumulative ?? 0),
    blockedAntTicks: rows.reduce((sum, row) => sum + row.blockedAnts, 0),
    ticksWithBlockedAnts: rows.filter(row => row.blockedAnts > 0).length };
}

function feedbackWindow(run, interval) {
  const rows = run.tickFeedback.filter(row => inTickWindow(row.tick, interval));
  const LHistogram = {};
  let antTicks = 0, exposedAntTicks = 0, speedCallsChanged = 0, aTurnRateCallsChanged = 0, dSameFlowHeadwayOpportunities = 0;
  for (const row of rows) {
    antTicks += row.livingAnts; exposedAntTicks += row.exposedAntTicks;
    speedCallsChanged += row.speedCallsChanged;
    aTurnRateCallsChanged += row.aTurnRateCallsChanged;
    dSameFlowHeadwayOpportunities += row.dSameFlowHeadwayOpportunities;
    for (const [layers, value] of Object.entries(row.LHistogram)) LHistogram[layers] = (LHistogram[layers] ?? 0) + value;
  }
  return { complete: rows.length === 3600, ticks: rows.length, antTicks, exposedAntTicks, LHistogram,
    speedCallsChanged, aTurnRateCallsChanged, dSameFlowHeadwayOpportunities };
}

function formationWindow(run, interval) {
  const events = run.events.filter(row => inWindow(row.timeMs, interval));
  const decisions = run.decisions.filter(row => inWindow(row.timeMs, interval));
  const anchors = run.anchors.filter(row => inWindow(row.timeMs, interval));
  return { bMaturations: count(events, row => row.channel === 'B'),
    cMaturations: count(events, row => row.channel === 'C'), totalMaturations: events.length,
    singletonEvents: count(decisions, row => row.disposition === 'singleton-control-observation'),
    contestedEvents: count(decisions, row => row.disposition === 'contested-no-commit'),
    coevalBCEvents: count(decisions, row => row.provenance?.length === 2
      && row.provenance[0] === 'B' && row.provenance[1] === 'C'),
    uniqueMatureXOptionsMean: mean(anchors.map(row => row.formation.uniqueMatureXOptions)),
    singletonOptionsMean: mean(anchors.map(row => row.formation.singletonOptions)),
    contestedOptionsMean: mean(anchors.map(row => row.formation.contestedOptions)) };
}

function materialWindow(run, interval) {
  const actual = run.actualBirths.filter(row => inWindow(row.timeMs, interval));
  const local = run.localXBirths.filter(row => inWindow(row.timeMs, interval));
  const shadow = run.shadowProductionBirths.filter(row => inWindow(row.timeMs, interval));
  const material = run.checkpoints.find(row => row.requestedSeconds === interval[1])?.material ?? null;
  return { actualPlateBirths: actual.length, localXActualBirths: local.length,
    shadowProductionBirths: shadow.length, localXSizeCells: quantiles(local.map(row => row.maskCells)),
    materialAtWindowEnd: material ? { timeMs: material.timeMs, plateCount: material.plateCount,
      coverageCells: material.coverageCells, layerCellIncidences: material.layerCellIncidences,
      buriedLayerCellIncidences: material.buriedLayerCellIncidences, layerQuantiles: material.layerQuantiles,
      depthAboveFoundationMeters: material.depthAboveFoundationMeters,
      topPlateCount: material.topPlateCount, partlyBuriedPlateCount: material.partlyBuriedPlateCount,
      completelyBuriedPlateCount: material.completelyBuriedPlateCount,
      fixedGridBins: material.fixedGridBins, connectedBody: material.connectedBody } : null,
    noduleBirths: count(run.noduleLineage, row => inWindow(row.timeMs, interval)),
    researchFoundedNoduleBirths: count(run.noduleLineage, row => inWindow(row.timeMs, interval)
      && row.researchSourcePlateIDs.length > 0) };
}

function fieldsAtWindowEnd(run, interval) {
  const checkpoint = run.checkpoints.find(row => row.requestedSeconds === interval[1]);
  return checkpoint ? { timeMs: checkpoint.timeMs, pheromone: checkpoint.pheromone,
    surfaceField: checkpoint.surfaceField, chemicalMemoryB: checkpoint.chemicalMemoryB } : null;
}

function summarizeWindow(run, interval) {
  const movement = movementWindow(run, interval);
  return { windowSeconds: interval, movement, formation: formationWindow(run, interval),
    material: materialWindow(run, interval), feedback: feedbackWindow(run, interval),
    fieldsAtEnd: fieldsAtWindowEnd(run, interval),
    complete: run.tickMetrics.length >= interval[1] * 60 && movement.complete };
}

function materialMap(run) { return unpack(run.finalMaterial.layerCounts); }

function maskUnion(births) {
  const cells = new Set();
  for (const row of births) for (const cell of row.maskIndices) cells.add(cell);
  return cells;
}

function coverageOverlap(leftBirths, rightBirths) {
  const left = maskUnion(leftBirths), right = maskUnion(rightBirths);
  let intersection = 0;
  for (const cell of left) intersection += Number(right.has(cell));
  const union = left.size + right.size - intersection;
  return { leftCoverageCells: left.size, rightCoverageCells: right.size, sharedCells: intersection,
    leftOnlyCells: left.size - intersection, rightOnlyCells: right.size - intersection,
    unionCells: union, jaccard: union ? intersection / union : 1,
    fractionLeftCoveredByRight: left.size ? intersection / left.size : 0,
    fractionRightCoveredByLeft: right.size ? intersection / right.size : 0 };
}

function maskIntersection(left, right) {
  let i = 0, j = 0, intersection = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { intersection++; i++; j++; }
    else if (left[i] < right[j]) i++;
    else j++;
  }
  return intersection;
}

function compareShadowBirths(localBirths, shadowBirths) {
  const pairs = [];
  for (const local of localBirths) for (const shadow of shadowBirths) {
    const intersection = maskIntersection(local.maskIndices, shadow.maskIndices);
    const union = local.maskIndices.length + shadow.maskIndices.length - intersection;
    const a = local.spatial.center, b = shadow.spatial.center;
    pairs.push({ localId: local.id, shadowId: shadow.id, localTimeMs: local.timeMs,
      shadowTimeMs: shadow.timeMs, timeDifferenceMs: local.timeMs - shadow.timeMs,
      intersectionCells: intersection, unionCells: union, jaccard: union ? intersection / union : 1,
      centerDistance: Math.hypot(a.x - b.x, a.y - b.y), localCenter: a, shadowCenter: b,
      localNearestEntryDistance: local.spatial.nearestEntryDistance,
      shadowNearestEntryDistance: shadow.spatial.nearestEntryDistance });
  }
  return { localBirthCount: localBirths.length, shadowProductionBirthCount: shadowBirths.length,
    localCoverageVsShadowCoverage: coverageOverlap(localBirths, shadowBirths),
    pairwiseAllPairsNoSelection: pairs, pairwiseJaccard: quantiles(pairs.map(row => row.jaccard)),
    pairwiseCenterDistance: quantiles(pairs.map(row => row.centerDistance)),
    pairwiseTimeDifferenceSeconds: quantiles(pairs.map(row => row.timeDifferenceMs / 1000)),
    note: 'All pairs are reported. No overlap, time, center, or entry metric selects a winner or changes local X selection.' };
}

function sourceDependency(run) {
  const rows = run.finalMaterial.plateZones, denominator = rows.length;
  const countKey = key => rows.filter(row => row[key]).length;
  return { actualPlateCount: denominator, nearEntryRadius: ENTRY_RADIUS,
    nearEntryCount: countKey('nearEntry'), nearEntryFraction: denominator ? countKey('nearEntry') / denominator : 0,
    authoredBoundaryBandDistance: BOUNDARY_BAND,
    touchingBoundaryBandCount: countKey('touchesBoundary'),
    touchingBoundaryBandFraction: denominator ? countKey('touchesBoundary') / denominator : 0,
    touchingNeitherCount: countKey('touchesNeither'),
    touchingNeitherFraction: denominator ? countKey('touchesNeither') / denominator : 0,
    spanningEntryAndBoundaryCount: countKey('spansEntryAndBoundary'),
    spanningEntryAndBoundaryFraction: denominator ? countKey('spansEntryAndBoundary') / denominator : 0,
    literalRasterEdgeCount: countKey('touchesLiteralRasterEdge'),
    literalRasterEdgeFraction: denominator ? countKey('touchesLiteralRasterEdge') / denominator : 0,
    nearestEntryDistanceDistribution: histogram(rows.map(row => row.nearestEntryDistance),
      [0, .05, .1, .15, .25, .4, .6, 1.5]), perPlate: rows };
}

function feedbackTotals(run) {
  return run.tickFeedback.reduce((out, row) => {
    out.antTicks += row.livingAnts; out.exposedAntTicks += row.exposedAntTicks;
    out.speedCallsChanged += row.speedCallsChanged; out.aTurnRateCallsChanged += row.aTurnRateCallsChanged;
    out.dSameFlowHeadwayOpportunities += row.dSameFlowHeadwayOpportunities;
    return out;
  }, { antTicks: 0, exposedAntTicks: 0, speedCallsChanged: 0,
    aTurnRateCallsChanged: 0, dSameFlowHeadwayOpportunities: 0 });
}

function summarizeArm(run) {
  const mat = run.finalMaterial, finalTick = run.checkpoints.at(-1);
  return { arm: run.arm, seed: run.seed, simulatedSeconds: run.seconds,
    firstActualPlateTimeMs: run.firstActualPlateTimeMs, actualPlateBirths: run.actualBirths.length,
    localXActualBirths: run.localXBirths.length, shadowProductionBirths: run.shadowProductionBirths.length,
    finalMaterial: { plateCount: mat.plateCount, coverageCells: mat.coverageCells,
      layerCellIncidences: mat.layerCellIncidences, buriedLayerCellIncidences: mat.buriedLayerCellIncidences,
      layerQuantiles: mat.layerQuantiles, depthAboveFoundationMeters: mat.depthAboveFoundationMeters,
      topPlateCount: mat.topPlateCount, partlyBuriedPlateCount: mat.partlyBuriedPlateCount,
      completelyBuriedPlateCount: mat.completelyBuriedPlateCount, noduleCount: mat.noduleCount,
      noduleCapacity: mat.noduleCapacity, noduleCapacityReached: mat.noduleCapacityReached,
      fixedGridBins: mat.fixedGridBins, connectedBody: mat.connectedBody },
    sourceDependency: sourceDependency(run), localXSizeCells: quantiles(run.localXBirths.map(row => row.maskCells)),
    populationFinal: { population: finalTick?.livingPopulation ?? null,
      spawned: finalTick?.cumulativeSpawned ?? null, retired: finalTick?.cumulativeRetired ?? null },
    feedback: feedbackTotals(run), topology: run.topology, validation: run.validation,
    noduleCapacityReachedAtMs: run.firstNoduleCapacityTimeMs,
    noduleLineageSummary: { total: run.noduleLineage.length,
      researchInvolving: count(run.noduleLineage, row => row.researchSourcePlateIDs.length > 0),
      rows: run.noduleLineage } };
}

function pairedMaterialComparison(control, replacement) {
  const controlMap = materialMap(control), replacementMap = materialMap(replacement);
  assert.equal(controlMap.length, CELLS); assert.equal(replacementMap.length, CELLS);
  const controlCells = new Set(), replacementCells = new Set();
  for (let i = 0; i < CELLS; i++) {
    if (controlMap[i] > 0) controlCells.add(i);
    if (replacementMap[i] > 0) replacementCells.add(i);
  }
  let shared = 0;
  for (const cell of controlCells) shared += Number(replacementCells.has(cell));
  const union = controlCells.size + replacementCells.size - shared;
  return { controlActualPlates: control.actualBirths.length,
    replacementLocalXActualPlates: replacement.localXBirths.length,
    controlCoverageCells: control.finalMaterial.coverageCells,
    replacementCoverageCells: replacement.finalMaterial.coverageCells,
    controlLayerCellIncidences: control.finalMaterial.layerCellIncidences,
    replacementLayerCellIncidences: replacement.finalMaterial.layerCellIncidences,
    coverageOverlap: { sharedCells: shared, controlOnlyCells: controlCells.size - shared,
      replacementOnlyCells: replacementCells.size - shared, unionCells: union,
      jaccard: union ? shared / union : 1 },
    entryAndBoundary: { control: sourceDependency(control), replacement: sourceDependency(replacement) },
    connectedBody: { control: control.finalMaterial.connectedBody, replacement: replacement.finalMaterial.connectedBody },
    fixedGridBins: { control: control.finalMaterial.fixedGridBins, replacement: replacement.finalMaterial.fixedGridBins },
    layerQuantiles: { control: control.finalMaterial.layerQuantiles, replacement: replacement.finalMaterial.layerQuantiles },
    noduleLineage: { control: summarizeArm(control).noduleLineageSummary,
      replacement: summarizeArm(replacement).noduleLineageSummary } };
}

function classify(rows) {
  if (rows.length !== 3 || rows.some(row => row.control?.status !== 'PASS' || row.replacement?.status !== 'PASS')) return 'INVALID';
  if (rows.some(row => row.replacementRun.firstCapacityTimeMs !== null
    && row.replacementRun.firstCapacityTimeMs < 300_000)) return 'CAPACITY BLOCKED';
  const active = rows.every(row => {
    const run = row.replacementRun, feedback = feedbackTotals(run);
    return run.anchors.length === 300 && Math.abs(run.seconds - 300) < 1e-6
      && run.localXBirths.length > 0 && run.finalMaterial.coverageCells > 0
      && feedback.exposedAntTicks > 0
      && (feedback.speedCallsChanged + feedback.aTurnRateCallsChanged + feedback.dSameFlowHeadwayOpportunities > 0)
      && run.validation.researchRngCalls === 0 && run.topology.valid;
  });
  if (!active) return 'REPLACEMENT FUNCTIONALLY WEAK';
  const control = rows.map(row => row.controlRun.finalMaterial);
  const replacement = rows.map(row => row.replacementRun.finalMaterial);
  const outsideControlPlateRange = Math.min(...replacement.map(row => row.plateCount))
    > Math.max(...control.map(row => row.plateCount));
  const outsideControlCoverageRange = Math.max(...replacement.map(row => row.coverageCells))
    < Math.min(...control.map(row => row.coverageCells));
  const noduleRegimeChanged = control.every(row => row.noduleCount > 0)
    && replacement.every(row => row.noduleCount === 0);
  const spatialRegimeChanged = rows.every(row => row.controlRun.finalMaterial.connectedBody.componentCount === 1
    && row.replacementRun.finalMaterial.connectedBody.componentCount > 1);
  return outsideControlPlateRange || outsideControlCoverageRange || noduleRegimeChanged || spatialRegimeChanged
    ? 'REPLACEMENT VIABLE BUT REGIME DISTINCT' : 'REPLACEMENT FUNCTIONALLY VIABLE';
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function svgHeader(title, width, height) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height
    + '" viewBox="0 0 ' + width + ' ' + height + '"><title>' + escapeXml(title)
    + '</title><rect width="100%" height="100%" fill="white"/>';
}

function materialMapSvg(seed, control, replacement) {
  const scale = 3, size = GRID * scale, y = 52;
  let body = svgHeader('Seed ' + seed + ' CONTROL vs REPLACEMENT actual material maps', 680, 390);
  body += '<style>text{font:12px sans-serif;fill:#111}.small{font-size:10px}</style>';
  body += '<text x="20" y="24">Seed ' + seed + ' · actual retained material · cell shade = layer count</text>';
  const panels = [{ x: 22, label: 'CONTROL · source-to-boundary', map: materialMap(control), run: control },
    { x: 350, label: 'REPLACEMENT · local singleton X', map: materialMap(replacement), run: replacement }];
  for (const panel of panels) {
    const max = Math.max(1, ...panel.map), covered = panel.run.finalMaterial.coverageCells;
    body += '<text x="' + panel.x + '" y="42">' + escapeXml(panel.label) + ' · ' + covered + ' covered cells</text>';
    for (let cell = 0; cell < CELLS; cell++) {
      const layers = panel.map[cell];
      if (!layers) continue;
      const intensity = Math.round(225 - 185 * Math.log1p(layers) / Math.log1p(max));
      body += '<rect x="' + (panel.x + (cell % GRID) * scale) + '" y="' + (y + Math.floor(cell / GRID) * scale)
        + '" width="3" height="3" fill="rgb(' + intensity + ',' + intensity + ',' + intensity + ')"/>';
    }
    body += '<circle cx="' + (panel.x + ENTRY.x * size) + '" cy="' + (y + ENTRY.y * size)
      + '" r="' + (ENTRY_RADIUS * size) + '" fill="none" stroke="#1967a3" stroke-width="1"/>';
    body += '<rect x="' + (panel.x + BOUNDARY_BAND * size) + '" y="' + (y + BOUNDARY_BAND * size)
      + '" width="' + (size * (1 - 2 * BOUNDARY_BAND)) + '" height="' + (size * (1 - 2 * BOUNDARY_BAND))
      + '" fill="none" stroke="#a33131" stroke-width="1" stroke-dasharray="3 3"/>';
    body += '<rect x="' + panel.x + '" y="' + y + '" width="' + size + '" height="' + size
      + '" fill="none" stroke="#111" stroke-width="1"/>';
    body += '<text class="small" x="' + panel.x + '" y="' + (y + size + 17)
      + '">Blue circle: entry radius 0.15 · red inset: boundary band 0.05 · shade max layers ' + max + '</text>';
  }
  return body + '</svg>\n';
}

function chartFrame(title, width, height, yLabel) {
  return svgHeader(title, width, height)
    + '<style>text{font:12px sans-serif;fill:#111}.grid{stroke:#ddd;stroke-width:1}</style>'
    + '<text x="18" y="22">' + escapeXml(title) + '</text>'
    + '<text x="18" y="42">' + escapeXml(yLabel) + '</text>';
}

function groupedBars(title, seed, series, yLabel, labels = ['W1', 'W2', 'W3', 'W4', 'W5']) {
  const width = 680, height = 340, left = 52, top = 64, plotW = 600, plotH = 220;
  const max = Math.max(1, ...series.flatMap(row => row.values)) * 1.08;
  let body = chartFrame(title + ' · seed ' + seed, width, height, yLabel);
  const colors = ['#424242', '#2166ac', '#b2182b'];
  for (let i = 0; i <= 4; i++) {
    const value = max * i / 4, yy = top + plotH - value / max * plotH;
    body += '<line class="grid" x1="' + left + '" y1="' + yy + '" x2="' + (left + plotW) + '" y2="' + yy + '"/>';
    body += '<text x="12" y="' + (yy + 4) + '">' + value.toFixed(0) + '</text>';
  }
  const groupW = plotW / labels.length, barW = Math.min(34, groupW / (series.length + 1));
  for (let i = 0; i < labels.length; i++) {
    const center = left + groupW * (i + .5);
    body += '<text x="' + (center - 17) + '" y="' + (top + plotH + 18) + '">' + escapeXml(labels[i]) + '</text>';
    for (let s = 0; s < series.length; s++) {
      const x = center + (s - (series.length - 1) / 2) * (barW + 3) - barW / 2;
      const h = series[s].values[i] / max * plotH;
      body += '<rect x="' + x + '" y="' + (top + plotH - h) + '" width="' + barW + '" height="' + h
        + '" fill="' + colors[s % colors.length] + '"><title>' + escapeXml(series[s].name + ': ' + series[s].values[i])
        + '</title></rect>';
    }
  }
  let lx = 52;
  for (let s = 0; s < series.length; s++) {
    body += '<rect x="' + lx + '" y="315" width="10" height="10" fill="' + colors[s % colors.length] + '"/>';
    body += '<text x="' + (lx + 14) + '" y="324">' + escapeXml(series[s].name) + '</text>';
    lx += Math.max(135, series[s].name.length * 7);
  }
  return body + '</svg>\n';
}

function coverageSvg(seed, controlWindows, replacementWindows) {
  const panels = [['Unique covered cells', 'coverageCells'], ['Layer-cell incidences', 'layerCellIncidences']];
  const shapes = [];
  for (let panel = 0; panel < panels.length; panel++) {
    const [label, key] = panels[panel];
    const values = [controlWindows, replacementWindows].map(rows =>
      rows.map(row => row.material.materialAtWindowEnd?.[key] ?? 0));
    const max = Math.max(1, ...values.flat()) * 1.08, left = 54, top = 66 + panel * 150, w = 594, h = 105;
    shapes.push('<text x="18" y="' + (top - 10) + '">' + label + '</text>');
    for (let i = 0; i < 5; i++) shapes.push('<text x="' + (left + i * w / 4 - 8) + '" y="' + (top + h + 18) + '">W' + (i + 1) + '</text>');
    for (let arm = 0; arm < 2; arm++) {
      const color = arm ? '#2166ac' : '#424242';
      const points = values[arm].map((value, i) =>
        (left + i * w / 4) + ',' + (top + h - value / max * h)).join(' ');
      shapes.push('<polyline points="' + points + '" fill="none" stroke="' + color + '" stroke-width="2"/>');
      values[arm].forEach((value, i) => shapes.push('<circle cx="' + (left + i * w / 4) + '" cy="'
        + (top + h - value / max * h) + '" r="3" fill="' + color + '"><title>' + value + '</title></circle>'));
    }
  }
  return chartFrame('Coverage and layering · seed ' + seed, 680, 390, 'Independent panel scales')
    + '<rect x="410" y="22" width="10" height="10" fill="#424242"/><text x="425" y="31">CONTROL</text>'
    + '<rect x="500" y="22" width="10" height="10" fill="#2166ac"/><text x="515" y="31">REPLACEMENT</text>'
    + shapes.join('') + '</svg>\n';
}

function entrySvg(seed, control, replacement) {
  const breaks = [0, .05, .1, .15, .25, .4, .6, 1.5];
  const datasets = [control, replacement].map(run =>
    histogram(run.finalMaterial.plateZones.map(row => row.nearestEntryDistance), breaks).map(row => row.count));
  return groupedBars('Nearest mask-cell distance from entry · seed ' + seed, seed,
    [{ name: 'CONTROL', values: datasets[0] }, { name: 'REPLACEMENT', values: datasets[1] }],
    'Plate count · nearest cell distance', ['0-.05', '.05-.10', '.10-.15', '.15-.25', '.25-.40', '.40-.60', '.60+']);
}

function svgFiles(seed, control, replacement, controlWindows, replacementWindows) {
  const births = [
    { name: 'CONTROL actual Plates', values: WINDOWS.map(w => count(control.actualBirths, row => inWindow(row.timeMs, w))) },
    { name: 'REPLACEMENT local X actual', values: WINDOWS.map(w => count(replacement.localXBirths, row => inWindow(row.timeMs, w))) },
    { name: 'REPLACEMENT shadow selector', values: WINDOWS.map(w => count(replacement.shadowProductionBirths, row => inWindow(row.timeMs, w))) }
  ];
  const nodules = [
    { name: 'CONTROL Nodules', values: WINDOWS.map(w => count(control.noduleLineage, row => inWindow(row.timeMs, w))) },
    { name: 'REPLACEMENT Nodules', values: WINDOWS.map(w => count(replacement.noduleLineage, row => inWindow(row.timeMs, w))) },
    { name: 'Research-founded', values: WINDOWS.map(w => count(replacement.noduleLineage,
      row => inWindow(row.timeMs, w) && row.researchSourcePlateIDs.length > 0)) }
  ];
  return {
    ['seed-' + seed + '-material-map.svg']: materialMapSvg(seed, control, replacement),
    ['seed-' + seed + '-birth-counts.svg']: groupedBars('Material births per 60 s window', seed, births, 'Birth count'),
    ['seed-' + seed + '-coverage-layering.svg']: coverageSvg(seed, controlWindows, replacementWindows),
    ['seed-' + seed + '-entry-distance.svg']: entrySvg(seed, control, replacement),
    ['seed-' + seed + '-nodule-births.svg']: groupedBars('Native Nodule births per 60 s window', seed, nodules, 'Birth count')
  };
}

function pairedRowsMarkdown(seed, controlRows, replacementRows) {
  const lines = ['### Seed ' + seed, '',
    '| Window | Arm | births / 60 s | local X | selector shadow | B/C maturations | singleton / contested | mean population | spawn / retire | travel | blocked ant-ticks | exposed ant-ticks | coverage | layer incidences | top / partly / complete buried | depth q50 / q90 / max m | q50 / q90 / max L | Nodules | research-founded Nodules |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|'];
  for (let i = 0; i < WINDOWS.length; i++) for (const [arm, row] of [
    ['CONTROL', controlRows[i]], ['REPLACEMENT', replacementRows[i]]
  ]) {
    const material = row.material.materialAtWindowEnd, q = material?.layerQuantiles, depth = material?.depthAboveFoundationMeters;
    lines.push('| ' + WINDOWS[i][0] + '–' + WINDOWS[i][1] + ' | ' + arm + ' | '
      + row.material.actualPlateBirths + ' | ' + row.material.localXActualBirths + ' | '
      + row.material.shadowProductionBirths + ' | ' + row.formation.totalMaturations + ' | '
      + row.formation.singletonEvents + ' / ' + row.formation.contestedEvents + ' | '
      + (row.movement.meanPopulation?.toFixed(2) ?? '—') + ' | ' + row.movement.spawned + ' / '
      + row.movement.retired + ' | ' + (row.movement.realizedTravel?.toFixed(5) ?? '—') + ' | '
      + row.movement.blockedAntTicks + ' | ' + row.feedback.exposedAntTicks + ' | '
      + (material?.coverageCells ?? '—') + ' | ' + (material?.layerCellIncidences ?? '—') + ' | '
      + (material ? material.topPlateCount + ' / ' + material.partlyBuriedPlateCount + ' / '
        + material.completelyBuriedPlateCount : '—') + ' | '
      + (depth ? depth.q50 + ' / ' + depth.q90 + ' / ' + depth.max : '—') + ' | '
      + (q ? q.q50 + ' / ' + q.q90 + ' / ' + q.max : '—') + ' | ' + row.material.noduleBirths
      + ' | ' + row.material.researchFoundedNoduleBirths + ' |');
  }
  return lines.join('\n');
}

function fieldRowsMarkdown(seed, controlRows, replacementRows) {
  const lines = ['### Seed ' + seed + ' — field state at each window end', '',
    '| End (s) | Pheromone max / mean / nonzero (CONTROL / REPLACEMENT) | SurfaceField max / mean / nonzero (CONTROL / REPLACEMENT) | B chemical memory max / mean / nonzero (CONTROL / REPLACEMENT) |',
    '|---:|---|---|---|'];
  const format = field => field ? field.max.toFixed(5) + ' / ' + field.mean.toFixed(5) + ' / ' + field.nonzero : '—';
  for (let i = 0; i < WINDOWS.length; i++) {
    const c = controlRows[i].fieldsAtEnd, r = replacementRows[i].fieldsAtEnd;
    lines.push('| ' + WINDOWS[i][1] + ' | ' + format(c?.pheromone) + ' / ' + format(r?.pheromone)
      + ' | ' + format(c?.surfaceField) + ' / ' + format(r?.surfaceField)
      + ' | ' + format(c?.chemicalMemoryB) + ' / ' + format(r?.chemicalMemoryB) + ' |');
  }
  return lines.join('\n');
}

function reportMarkdown(decision, summaries, windows, shadow) {
  const lines = ['# Local-X material replacement', '',
    '**Decision: ' + decision + '**', '',
    'Replacement experiment only. No production adoption follows.',
    'CONTROL retains native source-to-boundary Plates. REPLACEMENT runs the native selector as a shadow,',
    'but only accepted uncontested local X masks enter native stratigraphy. Audio is Off.',
    'Local Plates use the neutral shared coefficients and thickness contract from the validated real-stratigraphy probe. These are structural test inputs, not measured local-X properties.',
    '', '## Decision basis', '',
    'All three seeds completed 300 s with CONTROL conformance, no capacity stop, valid topology, zero research RNG, and local material exposure plus changed native material consumers. REPLACEMENT retained 137–156 local Plates per seed and recorded 22,888–61,087 exposed ant-ticks. The outcome is regime distinct: CONTROL has 7–14 Plates and 3–5 Nodules per seed, while REPLACEMENT has 137–156 Plates and zero Nodules; CONTROL material is one connected body, while local replacement material has 39–53 connected components. Local material still persists and affects native feedback, but its amount, coverage and topology occupy a different regime.',
    '', '## Paired outcomes', '',
    '| Seed | CONTROL Plates / coverage | REPLACEMENT local Plates / coverage | shadow births | near entry local / control | boundary band local / control | touching neither local / control | Nodules local / control | exposed local ant-ticks | topology |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|'];
  const countFraction = (count, total) => count + '/' + total + ' ('
    + (total ? (100 * count / total).toFixed(1) : '0.0') + '%)';
  for (const seed of SEEDS) {
    const row = summaries[seed];
    if (!row) {
      lines.push('| ' + seed + ' | unavailable | unavailable | — | — | — | — | — | — | — |');
      continue;
    }
    const c = row.control, r = row.replacement;
    lines.push('| ' + seed + ' | ' + c.finalMaterial.plateCount + ' / ' + c.finalMaterial.coverageCells
      + ' | ' + r.finalMaterial.plateCount + ' / ' + r.finalMaterial.coverageCells + ' | '
      + r.shadowProductionBirths + ' | ' + countFraction(r.sourceDependency.nearEntryCount, r.sourceDependency.actualPlateCount)
      + ' / ' + countFraction(c.sourceDependency.nearEntryCount, c.sourceDependency.actualPlateCount)
      + ' | ' + countFraction(r.sourceDependency.touchingBoundaryBandCount, r.sourceDependency.actualPlateCount)
      + ' / ' + countFraction(c.sourceDependency.touchingBoundaryBandCount, c.sourceDependency.actualPlateCount)
      + ' | ' + countFraction(r.sourceDependency.touchingNeitherCount, r.sourceDependency.actualPlateCount)
      + ' / ' + countFraction(c.sourceDependency.touchingNeitherCount, c.sourceDependency.actualPlateCount)
      + ' | ' + r.noduleLineageSummary.total + ' / ' + c.noduleLineageSummary.total
      + ' | ' + r.feedback.exposedAntTicks + ' | ' + r.topology.valid + ' |');
  }
  lines.push('', 'Entry means minimum distance from any mask cell to the authored entry point is at most 0.15, matching the locked capture radius. Boundary-band contact means at least one mask cell lies within 0.05 of a world edge, matching the native authored terminal distance. Literal raster-edge contact is also recorded. Touching neither is descriptive; it is not treated as automatically better.',
    '', '## Fixed 60-second windows', '');
  for (const seed of SEEDS) {
    if (!windows[seed]) {
      lines.push('### Seed ' + seed, '', 'No paired windows: CONTROL conformance or replacement run did not complete.', '');
      continue;
    }
    lines.push(pairedRowsMarkdown(seed, windows[seed].control, windows[seed].replacement), '',
      fieldRowsMarkdown(seed, windows[seed].control, windows[seed].replacement), '');
  }
  lines.push('## Formation, material, feedback, and spatial structure', '');
  for (const seed of SEEDS) {
    const row = summaries[seed], pair = shadow[seed];
    if (!row || !pair) continue;
    const feedback = row.replacement.feedback;
    lines.push('### Seed ' + seed, '',
      '- First actual Plate: CONTROL ' + row.control.firstActualPlateTimeMs + ' ms; REPLACEMENT local X '
        + row.replacement.firstActualPlateTimeMs + ' ms.',
      '- Local-X mask sizes: ' + JSON.stringify(row.replacement.localXSizeCells) + ' cells.',
      '- B/C maturations: ' + row.replacementRun.events.length + '; singleton events: '
        + row.replacementRun.decisions.filter(item => item.disposition === 'singleton-control-observation').length
        + '; contested events: ' + row.replacementRun.decisions.filter(item => item.disposition === 'contested-no-commit').length
        + '; local actual births: ' + row.replacement.localXActualBirths + '.',
      '- Material exposure: ' + feedback.exposedAntTicks + '/' + feedback.antTicks + ' ant-ticks; speed multiplier calls changed '
        + feedback.speedCallsChanged + ', A turn-rate calls changed ' + feedback.aTurnRateCallsChanged
        + ', D same-flow headway opportunities ' + feedback.dSameFlowHeadwayOpportunities + '.',
      '- Population: ' + row.replacement.populationFinal.spawned + ' spawned, '
        + row.replacement.populationFinal.retired + ' retired, '
        + row.replacement.populationFinal.population + ' living at end.',
      '- Nodule lineage: ' + JSON.stringify(row.replacement.noduleLineageSummary) + '.',
      '- Connected-body sizes: CONTROL ' + JSON.stringify(row.control.finalMaterial.connectedBody)
        + '; REPLACEMENT ' + JSON.stringify(row.replacement.finalMaterial.connectedBody) + '.',
      '- Fixed 8×8 grid occupancy: CONTROL ' + row.control.finalMaterial.fixedGridBins.occupied + '/64 bins, normalized coverage entropy '
        + row.control.finalMaterial.fixedGridBins.normalizedCoverageEntropy.toFixed(4) + '; REPLACEMENT '
        + row.replacement.finalMaterial.fixedGridBins.occupied + '/64 bins, normalized coverage entropy '
        + row.replacement.finalMaterial.fixedGridBins.normalizedCoverageEntropy.toFixed(4) + '.',
      '- Nearest-entry distance bins by Plate (0–.05, .05–.10, .10–.15, .15–.25, .25–.40, .40–.60, .60+): CONTROL '
        + JSON.stringify(row.control.sourceDependency.nearestEntryDistanceDistribution.map(bin => bin.count))
        + '; REPLACEMENT ' + JSON.stringify(row.replacement.sourceDependency.nearestEntryDistanceDistribution.map(bin => bin.count)) + '.',
      '- Selector shadow: ' + pair.shadowProductionBirthCount + ' attempts; local-to-shadow union-mask coverage Jaccard '
        + pair.localCoverageVsShadowCoverage.jaccard.toFixed(4) + '; all-pair X-mask Jaccard '
        + JSON.stringify(pair.pairwiseJaccard) + '.',
      '');
  }
  lines.push('## Selector shadow comparison', '',
    'Every replacement local birth is compared with every native selector shadow birth by mask overlap, spatial center, birth time, and entry distance. The full all-pairs matrix is in analysis/shadow-selector-comparison.json. No best pair or winner is selected, and shadow output does not influence local-X selection.',
    '', '## Interpretation limits', '',
    'The pass can support a functional replacement candidate only when all three seeds retain material, ants encounter it, material feedback is exercised, local/non-entry histories remain represented, and invariants hold. A different amount, spatial pattern, Nodule lineage, or organism trajectory is a regime change rather than a numeric mismatch.',
    'This experiment does not establish singleton-only as natural truth, permanent inaction for contested events, B OR C or B AND C as ontology, local-X physical coefficients, Audio-On viability, long-term turnover or capacity, or production adoption.',
    '', 'See [PROTOCOL.md](PROTOCOL.md), [VALIDATION.md](VALIDATION.md), machine-readable receipts under analysis/, the [manifest](manifest.json), and [SHA256SUMS](SHA256SUMS).',
    '');
  return lines.join('\n');
}

async function main() {
  const campaign = await readJson(resolve(EVIDENCE, 'analysis/campaign-runs.json'));
  const summaries = {}, windows = {}, shadow = {}, spatial = {}, pairs = [];
  for (const row of campaign) {
    if (row.control?.status !== 'PASS' || row.replacement?.status !== 'PASS') {
      pairs.push({ ...row, controlRun: null, replacementRun: null });
      continue;
    }
    const controlRun = await readRun(resolve(EVIDENCE, 'analysis', row.controlFile));
    const replacementRun = await readRun(resolve(EVIDENCE, 'analysis', row.replacementFile));
    assert.equal(controlRun.seed, row.seed); assert.equal(replacementRun.seed, row.seed);
    const control = summarizeArm(controlRun), replacement = summarizeArm(replacementRun);
    summaries[row.seed] = { control, replacement,
      materialComparison: pairedMaterialComparison(controlRun, replacementRun),
      controlConformance: controlRun.controlConformance, replacementRun };
    windows[row.seed] = { control: WINDOWS.map(interval => summarizeWindow(controlRun, interval)),
      replacement: WINDOWS.map(interval => summarizeWindow(replacementRun, interval)) };
    shadow[row.seed] = compareShadowBirths(replacementRun.localXBirths, replacementRun.shadowProductionBirths);
    spatial[row.seed] = { control: controlRun.finalMaterial, replacement: replacementRun.finalMaterial,
      materialComparison: summaries[row.seed].materialComparison };
    pairs.push({ ...row, controlRun, replacementRun });
  }
  const decision = classify(pairs);
  const localLedger = pairs.flatMap(pair => pair.replacementRun?.localXBirths.map(row => ({
    seed: pair.seed, arm: 'replacement', ...row,
    maturationEvents: row.provenance.eventIds.map(id => pair.replacementRun.events.find(event => event.eventId === id))
  })) ?? []);
  const shadowLedger = pairs.flatMap(pair => pair.replacementRun?.shadowProductionBirths.map(row => ({
    seed: pair.seed, arm: 'replacement', ...row
  })) ?? []);
  const chronology = pairs.map(pair => ({ seed: pair.seed,
    control: pair.controlRun?.chronology ?? null, replacement: pair.replacementRun?.chronology ?? null }));
  const noduleLineage = pairs.map(pair => ({ seed: pair.seed,
    control: pair.controlRun?.noduleLineage ?? null, replacement: pair.replacementRun?.noduleLineage ?? null }));
  const windowReceipt = Object.fromEntries(SEEDS.filter(seed => windows[seed]).map(seed => [seed, {
    windows: WINDOWS.map((interval, i) => ({ interval, control: windows[seed].control[i],
      replacement: windows[seed].replacement[i] })) }]));
  await writeJson(resolve(EVIDENCE, 'analysis/per-seed-paired-summaries.json'), {
    decision, seeds: Object.fromEntries(Object.entries(summaries).map(([seed, row]) => [seed, {
      control: row.control, replacement: row.replacement, materialComparison: row.materialComparison,
      controlConformance: row.controlConformance
    }])), campaign: pairs.map(({ controlRun, replacementRun, ...row }) => row) });
  await writeJson(resolve(EVIDENCE, 'analysis/60s-windows.json'), windowReceipt);
  await writeJson(resolve(EVIDENCE, 'analysis/local-x-birth-ledger.json'), localLedger);
  await writeJson(resolve(EVIDENCE, 'analysis/shadow-production-birth-ledger.json'), shadowLedger);
  await writeJson(resolve(EVIDENCE, 'analysis/stratigraphy-chronology.json'), chronology);
  await writeJson(resolve(EVIDENCE, 'analysis/nodule-lineage.json'), noduleLineage);
  await writeJson(resolve(EVIDENCE, 'analysis/spatial-distribution.json'), spatial);
  await writeJson(resolve(EVIDENCE, 'analysis/shadow-selector-comparison.json'), shadow);
  await writeJson(resolve(EVIDENCE, 'analysis/invariants-and-conformance.json'), pairs.map(pair => ({
    seed: pair.seed, status: pair.status, control: pair.control,
    controlInvariants: pair.controlRun?.validation ?? null,
    replacementInvariants: pair.replacementRun?.validation ?? null,
    controlTopology: pair.controlRun?.topology ?? null,
    replacementTopology: pair.replacementRun?.topology ?? null,
    capacityReachedAtMs: pair.replacementRun?.firstCapacityTimeMs ?? null,
    noduleCapacityReachedAtMs: pair.replacementRun?.firstNoduleCapacityTimeMs ?? null
  })));
  const visual = resolve(EVIDENCE, 'visual');
  await mkdir(visual, { recursive: true });
  for (const pair of pairs) if (pair.controlRun && pair.replacementRun) {
    for (const [name, svg] of Object.entries(svgFiles(pair.seed, pair.controlRun, pair.replacementRun,
      windows[pair.seed].control, windows[pair.seed].replacement))) await writeFile(resolve(visual, name), svg, 'utf8');
  }
  await writeFile(resolve(EVIDENCE, 'REPORT.md'), reportMarkdown(decision, summaries, windows, shadow), 'utf8');
  console.log(JSON.stringify({ decision, completedSeeds: Object.keys(summaries),
    localBirths: localLedger.length, shadowBirths: shadowLedger.length,
    report: 'docs/ant/evidence/2026-11-01-local-x-material-replacement/REPORT.md' }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
