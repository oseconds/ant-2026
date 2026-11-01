import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRun, unpack, writeJson } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-singleton-real-stratigraphy-probe');
const WINDOWS = Array.from({ length: 5 }, (_, index) => [index * 60, (index + 1) * 60]);
const GRID_CELLS = 96 * 96;
const EXPECTED_ANCHORS_PER_WINDOW = 60;
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const count = (rows, pred) => rows.filter(pred).length;

function inWindow(timeMs, [start, end]) {
  assert.ok(Number.isFinite(timeMs), 'measurement has an actual model time');
  const seconds = timeMs / 1000;
  return seconds >= start && seconds < end;
}

function anchorWindows(run) {
  for (const row of run.anchors) {
    for (const [name, value] of Object.entries({ bOpportunities: row.activeOpportunities?.B,
      cOpportunities: row.activeOpportunities?.C, newBMaturations: row.newMaturations?.B,
      newCMaturations: row.newMaturations?.C, uniqueMatureXOptions: row.uniqueMatureXOptions,
      singletonOptions: row.singletonOptions, contestedOptions: row.contestedOptions })) {
      assert.ok(Number.isInteger(value) && value >= 0, `${run.arm} anchor ${row.index} has valid ${name}`);
    }
    assert.ok(Array.isArray(row.formation?.decisions), `${run.arm} anchor ${row.index} has decision receipts`);
    assert.ok(Array.isArray(row.productionBirthIds), `${run.arm} anchor ${row.index} has native production birth IDs`);
  }
  return WINDOWS.map(([start, end]) => {
    const anchors = run.anchors.filter(row => inWindow(row.timeMs, [start, end]));
    const bMaturations = anchors.reduce((sum, row) => sum + row.newMaturations.B, 0);
    const cMaturations = anchors.reduce((sum, row) => sum + row.newMaturations.C, 0);
    const options = anchors.map(row => row.uniqueMatureXOptions);
    const singleton = anchors.map(row => row.singletonOptions);
    const contested = anchors.map(row => row.contestedOptions);
    const decisions = anchors.flatMap(row => row.formation.decisions);
    const births = anchors.reduce((sum, row) => sum + row.productionBirthIds.length, 0);
    const mature = anchors.reduce((sum, row) => sum + row.uniqueMatureXOptions, 0);
    const contestedCount = anchors.reduce((sum, row) => sum + row.contestedOptions, 0);
    return {
      startSeconds: start, endSeconds: end, anchorCount: anchors.length,
      complete60sWindow: anchors.length === EXPECTED_ANCHORS_PER_WINDOW,
      bOpportunities: anchors.reduce((s, row) => s + row.activeOpportunities.B, 0),
      cOpportunities: anchors.reduce((s, row) => s + row.activeOpportunities.C, 0),
      newBMaturations: bMaturations, newCMaturations: cMaturations,
      matureXMean: mean(options), singletonXMean: mean(singleton), contestedXMean: mean(contested),
      contestedXSharePooled: mature ? contestedCount / mature : 0,
      contestedXShareMeanPerAnchor: mean(anchors.map(row => row.uniqueMatureXOptions ? row.contestedOptions / row.uniqueMatureXOptions : 0)),
      eligibleSingletonDecisionCount: count(decisions, row => { assert.equal(typeof row.disposition, 'string'); return !/contested/i.test(row.disposition); }),
      contestedDecisionCount: count(decisions, row => /contested/i.test(row.disposition)),
      materializedOverlayDecisionCount: count(decisions, row => row.disposition === 'singleton-overlay-layer'),
      nativeProductionBirths: births.length
    };
  });
}

function summarizeArm(run) {
  return { arm: run.arm, seed: run.seed, seconds: run.seconds, windows: anchorWindows(run) };
}

function checkpointAt(run, seconds) {
  return run.checkpoints.find(row => row.requestedSeconds === seconds) ?? null;
}

function validateCheckpoints(run, arm) {
  for (const row of run.checkpoints) {
    assert.ok(Number.isFinite(row.requestedSeconds) && Number.isFinite(row.timeMs), `${arm} checkpoint has exact requested and actual times`);
    if (row.checkpointType === 'capacity-stop') {
      assert.ok(Number.isInteger(row.tick) && row.tick > 0, `${arm} capacity stop retains actual tick`);
      assert.ok(Math.abs(row.timeMs - row.tick * 1000 / 60) < 1e-7, `${arm} capacity stop time matches its tick`);
      assert.ok(Math.abs(row.requestedSeconds - row.tick / 60) < 1e-12, `${arm} capacity stop requested time matches its tick`);
    } else {
      assert.ok(row.checkpointType === undefined || row.checkpointType === 'nominal', `${arm} checkpoint type is nominal or capacity stop`);
      assert.ok([60, 120, 180, 240, 300].includes(row.requestedSeconds), `${arm} nominal checkpoint uses an exact requested second`);
      assert.ok(Math.abs(row.timeMs - row.requestedSeconds * 1000) < 1e-7, `${arm} nominal checkpoint time matches its requested second`);
    }
  }
}

function completeWindow(run, [start, end]) {
  return run.anchors.filter(row => inWindow(row.timeMs, [start, end])).length === EXPECTED_ANCHORS_PER_WINDOW;
}

function checkpointProjection(row) {
  if (!row) return null;
  return { requestedSeconds: row.requestedSeconds, checkpointType: row.checkpointType ?? 'nominal', tick: row.tick ?? null,
    timeMs: row.timeMs, livingPopulation: row.livingPopulation, cumulativeSpawned: row.cumulativeSpawned,
    cumulativeRetired: row.cumulativeRetired, realizedTravel: row.realizedTravel, blockedAntTicks: row.blockedAntTicks,
    ticksWithBlockedAnts: row.ticksWithBlockedAnts, pheromone: row.pheromone, surfaceField: row.surfaceField,
    chemicalMemoryB: row.chemicalMemoryB, productionPlateCount: row.productionPlateCount,
    productionMaterial: row.productionMaterial, actualMaterial: row.actualMaterial ?? null,
    maxPlateCeilingReached: row.maxPlateCeilingReached };
}

function checkpointWorldComparison(runs) {
  return { nominal: [60, 120, 180, 240, 300].map(seconds => ({ seconds,
    control: checkpointProjection(checkpointAt(runs.control, seconds)),
    overlay: checkpointProjection(checkpointAt(runs.overlay, seconds)),
    realStratigraphy: checkpointProjection(checkpointAt(runs.realStratigraphy, seconds)) })),
    realCapacityStops: runs.realStratigraphy.checkpoints.filter(row => row.checkpointType === 'capacity-stop').map(checkpointProjection) };
}

function provenanceOf(plate) {
  if (plate.researchProvenance) return 'research';
  if (plate.provenance?.kind === 'research-local-singleton-X') return 'research';
  assert.ok(String(plate.id).startsWith('trail-plate-'), `known native/research Plate ID ${plate.id}`);
  return 'production';
}

function plateCells(plate) {
  assert.ok(plate.mask, `actual immutable mask for ${plate.id}`);
  const mask = unpack(plate.mask), cells = [];
  assert.equal(mask.length, GRID_CELLS, `${plate.id} actual mask grid size`);
  for (let i = 0; i < mask.length; i++) if (mask[i]) cells.push(i);
  return cells;
}

function quantileNearest(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.round((sorted.length - 1) * q)] : null;
}

function plateThickness(plate) {
  if (Number.isFinite(plate.thicknessMeters) && plate.thicknessMeters > 0) return plate.thicknessMeters;
  const halfWidth = Number.isFinite(plate.meanHalfWidth) ? plate.meanHalfWidth : 0.02;
  return Math.min(0.01, Math.max(0.001, 0.001 + 0.05 * halfWidth));
}

function materialChronology(realRun) {
  const material = realRun.actualMaterial;
  assert.ok(material && Array.isArray(material.plates), 'real run contains final immutable material descriptors');
  const plates = material.plates, chronology = realRun.plateChronology;
  assert.ok(Array.isArray(chronology), 'real run contains insertion chronology');
  assert.equal(chronology.length, plates.length, 'chronology covers every actual Plate');
  assert.ok(chronology.every(row => Number.isInteger(row.sequence)), 'plate chronology has exact insertion sequence');
  const ordered = chronology.map(row => ({ ...row, plate: plates.find(plate => plate.id === row.id) }));
  assert.ok(ordered.every(row => row.plate), 'every chronology receipt resolves to an immutable actual Plate');
  assert.ok(ordered.every((row, index) => row.sequence === index && Number.isFinite(row.timeMs)), 'chronology sequence and birth times are contiguous and exact');
  for (const row of ordered) row.cells = plateCells(row.plate);
  ordered.sort((a, b) => a.sequence - b.sequence);
  const columns = new Map(), pairOverlaps = [], firstOverlapExample = {}, reconstructedDepth = new Float64Array(GRID_CELLS);
  for (let index = 0; index < ordered.length; index++) {
    const row = ordered[index], plate = row.plate, cells = row.cells, provenance = provenanceOf(plate);
    const cellSet = new Set(cells);
    for (let priorIndex = 0; priorIndex < index; priorIndex++) {
      const prior = ordered[priorIndex], priorSet = new Set(prior.cells);
      let intersectionCellCount = 0, exampleCell = null;
      for (const cell of cellSet) if (priorSet.has(cell)) { intersectionCellCount++; if (exampleCell === null) exampleCell = cell; }
      if (!intersectionCellCount) continue;
      const earlierProvenance = provenanceOf(prior.plate), type = `${earlierProvenance}->${provenance}`;
      const overlap = { earlierPlateId: prior.plate.id, laterPlateId: plate.id, earlierProvenance,
        laterProvenance: provenance, intersectionCellCount, earlierSequence: prior.sequence,
        laterSequence: row.sequence, earlierTimeMs: prior.timeMs,
        laterTimeMs: row.timeMs };
      pairOverlaps.push(overlap);
      if (!firstOverlapExample[type]) firstOverlapExample[type] = { ...overlap, exampleCell };
    }
    for (const cell of cells) {
      const layers = columns.get(cell) ?? [];
      if (layers.length > 0) reconstructedDepth[cell] += plateThickness(plate);
      layers.push({ plateId: plate.id, provenance, thicknessMeters: plateThickness(plate) });
      columns.set(cell, layers);
    }
  }
  const layerCounts = Array.from({ length: GRID_CELLS }, (_, cell) => columns.get(cell)?.length ?? 0);
  assert.ok(material.layerCounts && material.topPlateIdentity && material.depthMeters, 'actual material snapshots include all native arrays');
  const actualLayerCounts = unpack(material.layerCounts);
  assert.deepEqual(Array.from(actualLayerCounts), layerCounts, 'chronology masks reconstruct actual final layer counts');
  const actualTop = unpack(material.topPlateIdentity);
  {
    const indexById = new Map(ordered.map((row, index) => [row.plate.id, index]));
    const expectedTop = Array.from({ length: GRID_CELLS }, (_, cell) => columns.get(cell)?.at(-1)?.plateId
      ? indexById.get(columns.get(cell).at(-1).plateId) : -1);
    assert.deepEqual(Array.from(actualTop), expectedTop, 'chronology masks reconstruct actual final top-Plate identity');
  }
  const actualDepth = unpack(material.depthMeters);
  assert.equal(actualDepth.length, GRID_CELLS, 'actual depth uses the full grid denominator');
  for (let cell = 0; cell < GRID_CELLS; cell++) assert.ok(
    Math.abs(actualDepth[cell] - reconstructedDepth[cell]) <= 1e-6, `chronology masks reconstruct actual depth at cell ${cell}`);
  const provenanceIncidences = { production: 0, research: 0 }, topIncidences = { production: 0, research: 0 }, buriedIncidences = { production: 0, research: 0 };
  for (const layers of columns.values()) {
    for (const layer of layers) { provenanceIncidences[layer.provenance]++; if (layer !== layers.at(-1)) buriedIncidences[layer.provenance]++; }
    topIncidences[layers.at(-1).provenance]++;
  }
  const snapshotProvenance = material.provenance;
  assert.ok(snapshotProvenance?.research && snapshotProvenance?.production, 'actual material includes provenance incidence diagnostics');
  for (const [kind, derived] of [['research', provenanceIncidences.research], ['production', provenanceIncidences.production]]) {
    assert.equal(snapshotProvenance[kind].maskIncidences, derived, `${kind} layer incidences match native snapshot`);
    assert.equal(snapshotProvenance[kind].topCells, topIncidences[kind], `${kind} top cells match native snapshot`);
    assert.equal(snapshotProvenance[kind].buriedIncidences, buriedIncidences[kind], `${kind} buried incidences match native snapshot`);
  }
  assert.deepEqual(material.layerDistribution, histogram(layerCounts), 'reconstructed layer histogram matches native snapshot');
  assert.deepEqual(material.layerQuantiles, {
    q50: quantileNearest(layerCounts, .5), q90: quantileNearest(layerCounts, .9), max: Math.max(...layerCounts)
  }, 'full-grid layer quantiles match native snapshot');
  const research = ordered.filter(row => provenanceOf(row.plate) === 'research');
  const production = ordered.filter(row => provenanceOf(row.plate) === 'production');
  const union = setsUnion([...production.map(row => row.cells), ...research.map(row => row.cells)]);
  const pSet = setsUnion(production.map(row => row.cells));
  const rSet = setsUnion(research.map(row => row.cells));
  assert.equal(material.plateCount, ordered.length, 'actual Plate count matches chronology');
  assert.equal(material.productionPlateCount, production.length, 'actual production Plate count matches provenance');
  assert.equal(material.researchPlateCount, research.length, 'actual research Plate count matches provenance');
  assert.equal(material.coverageCells, pSet.size + rSet.size - [...pSet].filter(cell => rSet.has(cell)).length,
    'actual coverage matches exact immutable masks');
  return {
    plateCount: ordered.length, productionPlateCount: production.length, researchPlateCount: research.length,
    productionCoverageCells: pSet.size, researchCoverageCells: rSet.size, combinedCoverageCells: union.size,
    productionResearchIntersectionCells: [...pSet].filter(cell => rSet.has(cell)).length,
    researchMaskSizes: research.map(row => ({ plateId: row.plate.id, cellCount: row.cells.length })),
    layerCellIncidences: layerCounts.reduce((sum, value) => sum + value, 0), layerCounts: histogram(layerCounts),
    layerCountQuantiles: { denominatorCells: GRID_CELLS, q50NearestObserved: quantileNearest(layerCounts, .5),
      q90NearestObserved: quantileNearest(layerCounts, .9), max: Math.max(...layerCounts) },
    actualDepthMeters: { denominatorCells: GRID_CELLS, q50NearestObserved: quantileNearest(actualDepth, .5),
      q90NearestObserved: quantileNearest(actualDepth, .9), max: Math.max(...actualDepth) },
    provenanceLayerIncidences: provenanceIncidences, topLayerCellIncidences: topIncidences,
    buriedLayerCellIncidences: buriedIncidences, earliestOverlapExamples: Object.fromEntries(
      ['production->research', 'research->production', 'research->research', 'production->production']
        .map(type => [type, firstOverlapExample[type] ?? null])), snapshotProvenance,
    nativeLayerDistribution: material.layerDistribution ?? null, nativeLayerQuantiles: material.layerQuantiles ?? null,
    perPlateFinal: ordered.map(row => { const cells = row.cells; let exposed = 0;
      for (const cell of cells) if (columns.get(cell)?.at(-1)?.plateId === row.plate.id) exposed++;
      return { plateId: row.plate.id, provenance: provenanceOf(row.plate), cellCount: cells.length,
        exposedCells: exposed, buriedCells: cells.length - exposed, thicknessMeters: plateThickness(row.plate),
        timeMs: row.timeMs };
    }), pairOverlaps
  };
}

function validateLocalInsertionLineage(run) {
  const insertions = run.localInsertions;
  if (!insertions.length) return;
  assert.ok(Array.isArray(run.events) && Array.isArray(run.decisions), 'real run retains source events and decisions');
  assert.ok(insertions.every(row => typeof row.descriptorId === 'string'),
    'every actual insertion receipt retains its descriptor ID');
  assert.equal(insertions.length, run.localBirthLedger.length, 'each accepted local insertion has one birth receipt');
  const byId = rows => {
    const result = new Map(rows.map(row => [row.id, row]));
    assert.equal(result.size, rows.length, 'material receipt IDs are unique');
    return result;
  };
  const births = byId(run.localBirthLedger), chronology = byId(run.plateChronology), plates = byId(run.actualMaterial.plates);
  const events = new Map(run.events.map(event => [event.eventId, event]));
  assert.equal(events.size, run.events.length, 'source event IDs are unique');
  const decisions = run.decisions.filter(row => row.disposition === 'singleton-control-observation');
  const usedDecisions = new Set();
  for (const insertion of insertions) {
    const cells = insertion.xCells;
    assert.ok(Array.isArray(cells) && cells.length > 0, `${insertion.descriptorId} has accepted decision X cells`);
    assert.ok(Array.isArray(insertion.eventIds) && insertion.provenance
      && Array.isArray(insertion.provenance.eventIds) && Array.isArray(insertion.provenance.channels),
    `${insertion.descriptorId} retains explicit event and channel provenance`);
    const decision = decisions.find(row => row.timeMs === insertion.decisionTimeMs
      && JSON.stringify(row.eventIds) === JSON.stringify(insertion.eventIds));
    assert.ok(decision, `${insertion.descriptorId} resolves to the source singleton decision`);
    assert.equal(usedDecisions.has(decision), false, 'each source decision inserts at most one research Plate');
    usedDecisions.add(decision);
    assert.deepEqual(cells, decision.xCells, `${insertion.descriptorId} cells exactly match source decision X`);
    assert.deepEqual(insertion.provenance.channels, decision.provenance, `${insertion.descriptorId} channels match source decision`);
    assert.deepEqual(insertion.provenance.eventIds, decision.eventIds, `${insertion.descriptorId} descriptor provenance matches source decision`);
    assert.deepEqual(insertion.eventIds, decision.eventIds, `${insertion.descriptorId} insertion receipt matches source event IDs`);
    const sourceChannels = [];
    for (const eventId of decision.eventIds) {
      const sourceEvent = events.get(eventId);
      assert.ok(sourceEvent, `${insertion.descriptorId} source event ${eventId} exists`);
      if (!sourceChannels.includes(sourceEvent.channel)) sourceChannels.push(sourceEvent.channel);
    }
    assert.deepEqual(sourceChannels, decision.provenance, `${insertion.descriptorId} decision channels match source events`);
    const birth = births.get(insertion.descriptorId), order = chronology.get(insertion.descriptorId), plate = plates.get(insertion.descriptorId);
    assert.ok(birth && order && plate, `${insertion.descriptorId} appears in birth, chronology, and final material receipts`);
    for (const [label, receipt] of [['birth', birth], ['chronology', order]]) {
      assert.deepEqual(receipt.maskIndices, cells, `${insertion.descriptorId} ${label} mask round-trips exact accepted X`);
      assert.equal(receipt.maskCells, cells.length, `${insertion.descriptorId} ${label} mask cell count matches accepted X`);
      assert.deepEqual(receipt.eventIds, decision.eventIds, `${insertion.descriptorId} ${label} event lineage matches source decision`);
      assert.deepEqual(receipt.channels, decision.provenance, `${insertion.descriptorId} ${label} channels match source decision`);
      assert.deepEqual(receipt.provenance.eventIds, decision.eventIds, `${insertion.descriptorId} ${label} nested provenance event IDs match source decision`);
      assert.deepEqual(receipt.provenance.channels, decision.provenance, `${insertion.descriptorId} ${label} nested provenance channels match source decision`);
    }
    assert.deepEqual(plate.provenance.eventIds, decision.eventIds, `${insertion.descriptorId} immutable Plate provenance retains source event IDs`);
    assert.deepEqual(plate.provenance.channels, decision.provenance, `${insertion.descriptorId} immutable Plate provenance retains source channels`);
    assert.deepEqual(plateCells(plate), cells, `${insertion.descriptorId} immutable mask exactly round-trips accepted X`);
  }
}

function setsUnion(groups) { const set = new Set(); for (const group of groups) for (const cell of group) set.add(cell); return set; }
function histogram(values) { const out = {}; for (const value of values) out[value] = (out[value] ?? 0) + 1; return Object.fromEntries(Object.entries(out).sort((a, b) => Number(a[0]) - Number(b[0]))); }
function classifyNodule(row) {
  const ids = [...row.sourcePlateIDs, row.foundationPlateId].filter(Boolean).map(String);
  if (!ids.length) return null;
  if (row.researchSourcePlateIDs.length > 0) return 'research-involving';
  assert.ok(ids.every(id => id.startsWith('trail-plate-')), 'production-only lineage has native Plate IDs');
  if (ids.length) return 'production-only';
  return null;
}

function summarizeQualification(insertions) {
  const summary = { predicateTrueToFalse: 0, predicateFalseToTrue: 0, predicateUnchanged: 0,
    candidateTimerCleared: 0, candidateTimerChanged: 0, candidateTimerUnchanged: 0,
    nativeNoduleEngineStateChanged: 0, insertions: insertions.length };
  for (const row of insertions) {
    assert.ok(Array.isArray(row.qualificationBefore) && Array.isArray(row.qualificationAfter), 'insertion has native qualification samples');
    const before = new Map(row.qualificationBefore.map(item => [item.cell, item]));
    const after = new Map(row.qualificationAfter.map(item => [item.cell, item]));
    assert.equal(before.size, row.xCells.length, 'qualification samples cover every inserted X cell');
    assert.equal(after.size, row.xCells.length, 'post-insertion qualification samples cover every inserted X cell');
    for (const [cell, old] of before) {
      const current = after.get(cell);
      if (current) {
        if (old.predicate && !current.predicate) summary.predicateTrueToFalse++;
        else if (!old.predicate && current.predicate) summary.predicateFalseToTrue++;
        else summary.predicateUnchanged++;
      }
    }
    const priorTimers = row.candidateSinceBefore, nextTimers = row.candidateSinceAfter;
    assert.ok(Array.isArray(priorTimers) && Array.isArray(nextTimers), 'insertion has native candidate timer receipts');
    assert.equal(priorTimers.length, nextTimers.length, 'timer receipts align by changed cells');
    assert.equal(priorTimers.length, row.xCells.length, 'candidate timers cover every inserted X cell');
    for (let i = 0; i < Math.min(priorTimers.length, nextTimers.length); i++) {
      if (priorTimers[i] !== nextTimers[i]) summary.candidateTimerChanged++;
      else summary.candidateTimerUnchanged++;
      if (priorTimers[i] >= 0 && nextTimers[i] === -1) summary.candidateTimerCleared++;
    }
    if (JSON.stringify(row.noduleEngineBefore) !== JSON.stringify(row.noduleEngineAfter)) summary.nativeNoduleEngineStateChanged++;
  }
  summary.noPredicateTransitions = summary.predicateTrueToFalse === 0 && summary.predicateFalseToTrue === 0;
  return summary;
}

function svg(title, ylabel, series, { width = 720, height = 340 } = {}) {
  const left = 72, right = 18, top = 40, bottom = 86, pw = width - left - right, ph = height - top - bottom;
  const plotted = series.map(s => ({ ...s, values: s.values.filter(row => Number.isFinite(row[1])) }));
  const all = plotted.flatMap(s => s.values.map(row => row[1]));
  const max = Math.max(1, ...all), min = Math.min(0, ...all), colors = ['#243b53', '#a34a28', '#31725b', '#9c6f2f'];
  const x = seconds => left + seconds / 300 * pw, y = value => top + (max === min ? ph / 2 : (max - value) / (max - min) * ph);
  const lines = plotted.map((s, i) => `<polyline fill="none" stroke="${colors[i]}" stroke-width="2" points="${s.values.map(([t, v]) => `${x(t)},${y(v)}`).join(' ')}"/><text x="${left + i * 160}" y="${height - 8}" fill="${colors[i]}" font-size="12">${s.name}</text>`).join('');
  const ticks = [0, 60, 120, 180, 240, 300].map(t => `<line x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${top + ph}" stroke="#d8dee4"/><text x="${x(t)}" y="${top + ph + 20}" text-anchor="middle" font-size="11">${t}</text>`).join('');
  const yTicks = `<text x="${left - 7}" y="${top + 4}" text-anchor="end" font-size="10" data-axis="y">${formatAxisValue(max)}</text><text x="${left - 7}" y="${top + ph + 4}" text-anchor="end" font-size="10" data-axis="y">0</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><text x="${left}" y="22" font-size="16">${title}</text><text x="${left}" y="36" font-size="10">60 s windows; points at window midpoints</text><text x="14" y="${top + ph / 2}" transform="rotate(-90 14 ${top + ph / 2})" text-anchor="middle" font-size="12">${ylabel}</text>${yTicks}${ticks}${lines}<text x="${left + pw / 2}" y="${height - 36}" text-anchor="middle" font-size="12">Model time (s)</text></svg>\n`;
}

function formatAxisValue(value) {
  return Number(value.toPrecision(5)).toString();
}

function materialSvg(material) {
  const vals = Object.entries(material.layerCounts).map(([layers, cells]) => [Number(layers), cells]);
  const max = Math.max(1, ...vals.map(row => row[1])), x0 = 390, y0 = 62, w = 295, h = 160, bw = w / Math.max(vals.length, 1);
  const bars = vals.map(([layer, cells], i) => `<rect x="${x0 + i * bw}" y="${y0 + h * (1 - cells / max)}" width="${Math.max(1, bw - 2)}" height="${h * cells / max}" fill="#31725b"/><text x="${x0 + i * bw + bw / 2}" y="${y0 + h + 18}" text-anchor="middle" font-size="11">${layer}</text>`).join('');
  const coverageTicks = `<text x="63" y="66" text-anchor="end" font-size="10" data-axis="y">${GRID_CELLS}</text><text x="63" y="226" text-anchor="end" font-size="10" data-axis="y">0</text>`;
  const layerTicks = `<text x="384" y="66" text-anchor="end" font-size="10" data-axis="y">${max}</text><text x="384" y="226" text-anchor="end" font-size="10" data-axis="y">0</text>`;
  const labels = ['productionCoverageCells', 'researchCoverageCells', 'combinedCoverageCells'];
  const coverage = labels.map((key, i) => { const height = 160 * material[key] / GRID_CELLS;
    return `<rect x="${90 + i * 80}" y="${222 - height}" width="44" height="${height}" fill="#${['243b53','a34a28','31725b'][i]}"/><text x="${112 + i * 80}" y="240" text-anchor="middle" font-size="9">${['prod','research','union'][i]}</text><text x="${112 + i * 80}" y="${214 - height}" text-anchor="middle" font-size="9">${material[key]}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="300" viewBox="0 0 720 300"><rect width="100%" height="100%" fill="white"/><text x="22" y="26" font-size="15">Coverage and depth at final checkpoint</text><text x="84" y="50" font-size="12">Coverage (cells of 9,216)</text><line x1="70" x2="350" y1="222" y2="222" stroke="#5a6872"/>${coverageTicks}${coverage}<text x="390" y="50" font-size="12">Cell count by layer depth</text><text x="369" y="142" transform="rotate(-90 369 142)" text-anchor="middle" font-size="10">Cells (of 9,216)</text>${layerTicks}${bars}<text x="535" y="260" text-anchor="middle" font-size="11">Layer count</text></svg>\n`;
}

function travelPopulationSvg(runs) {
  const times = [60, 120, 180, 240, 300], colors = ['#243b53', '#a34a28', '#31725b'];
  const panel = (key, title, unit, x0, width) => {
    const vals = Object.values(runs).flatMap(run => times.map(t => checkpointAt(run, t)?.[key]).filter(Number.isFinite));
    const max = Math.max(1, ...vals), y0 = 76, h = 148, x = t => x0 + t / 300 * width, y = v => y0 + h * (1 - v / max);
    const ticks = times.map(t => `<line x1="${x(t)}" x2="${x(t)}" y1="${y0}" y2="${y0+h}" stroke="#d8dee4"/><text x="${x(t)}" y="${y0+h+17}" text-anchor="middle" font-size="10">${t}</text>`).join('');
    const yTicks = `<text x="${x0 - 7}" y="${y0 + 4}" text-anchor="end" font-size="9" data-axis="y">${formatAxisValue(max)}</text><text x="${x0 - 7}" y="${y0 + h + 4}" text-anchor="end" font-size="9" data-axis="y">0</text>`;
    const traces = Object.entries(runs).map(([name, run], i) => {
      const values = times.map(t => [t, checkpointAt(run, t)?.[key]]).filter(([, value]) => Number.isFinite(value));
      return `<polyline fill="none" stroke="${colors[i]}" stroke-width="2" points="${values.map(([t, value]) => `${x(t)},${y(value)}`).join(' ')}"/><text x="${x0 + i*96}" y="294" fill="${colors[i]}" font-size="10">${name}</text>`;
    }).join('');
    return `<text x="${x0}" y="52" font-size="13">${title}</text><text x="${x0-12}" y="150" transform="rotate(-90 ${x0-12} 150)" text-anchor="middle" font-size="10">${unit}</text>${yTicks}${ticks}${traces}`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="315" viewBox="0 0 720 315"><rect width="100%" height="100%" fill="white"/><text x="22" y="25" font-size="15">Movement and population at checkpoints</text>${panel('realizedTravel','Realized travel','Model units',75,250)}${panel('livingPopulation','Living population','Ants',430,250)}<text x="360" y="313" text-anchor="middle" font-size="10">Checkpoint model time (s)</text></svg>\n`;
}

export function deriveResults(runs) {
  assert.ok(runs.control && runs.overlay && runs.realStratigraphy, 'three runs required');
  for (const [key, run] of Object.entries(runs)) {
    for (const field of ['anchors', 'births', 'checkpoints']) assert.ok(Array.isArray(run[field]), `${key} has ${field}`);
    for (const row of run.births) assert.ok(Number.isFinite(row.timeMs), `${key} birth has actual time`);
    validateCheckpoints(run, key);
    for (const row of run.anchors) assert.ok(Number.isFinite(row.timeMs), `${key} anchor has actual time`);
  }
  for (const field of ['actualMaterial', 'plateChronology', 'localBirthLedger', 'localInsertions', 'noduleLineage', 'events', 'decisions']) {
    assert.ok(runs.realStratigraphy[field], `real-stratigraphy has ${field}`);
    if (['plateChronology', 'localBirthLedger', 'localInsertions', 'noduleLineage', 'events', 'decisions'].includes(field)) {
      assert.ok(Array.isArray(runs.realStratigraphy[field]), `real-stratigraphy ${field} is an array`);
    }
  }
  for (const row of runs.realStratigraphy.noduleLineage) {
    assert.ok(Array.isArray(row.sourcePlateIDs) && Array.isArray(row.researchSourcePlateIDs)
      && Array.isArray(row.sourcePlateProvenance), 'Nodule receipt retains exact source and foundation provenance');
    assert.ok(Number.isFinite(row.timeMs), 'Nodule receipt has actual birth time');
  }
  if (runs.realStratigraphy.lineageValidationFixture === true) {
    assert.equal(runs.realStratigraphy.testFixture, true, 'minimal insertion fixture is explicitly marked');
  } else validateLocalInsertionLineage(runs.realStratigraphy);
  const arms = Object.fromEntries(Object.entries(runs).map(([key, run]) => [key, summarizeArm(run)]));
  const material = materialChronology(runs.realStratigraphy);
  const chronology = runs.realStratigraphy.plateChronology;
  const localInsertions = runs.realStratigraphy.localInsertions;
  const qualification = summarizeQualification(localInsertions);
  const lineage = runs.realStratigraphy.noduleLineage.map(row => ({ ...row,
    classification: row.classification ?? classifyNodule(row),
    foundationProvenance: row.sourcePlateProvenance.find(item => item.id === row.foundationPlateId) ?? null }));
  const researchBirths = runs.realStratigraphy.localBirthLedger;
  const productionBirthComparison = { nativeProductionBirths: Object.fromEntries(Object.entries(runs).map(([key, run]) => [key, run.births])),
    researchLocalBirths: researchBirths,
    windows: WINDOWS.map(([startSeconds, endSeconds]) => ({ startSeconds, endSeconds,
      observationByArm: Object.fromEntries(Object.entries(runs).map(([key, run]) => [key, { anchorCount: run.anchors.filter(row => inWindow(row.timeMs, [startSeconds, endSeconds])).length,
        complete60sWindow: completeWindow(run, [startSeconds, endSeconds]) }])),
      nativeProductionBirths: Object.fromEntries(Object.entries(runs).map(([key, run]) => [key, count(run.births, row => inWindow(row.timeMs, [startSeconds, endSeconds]))])),
      researchLocalBirths: count(researchBirths, row => inWindow(row.timeMs, [startSeconds, endSeconds])) })) };
  const summary = { schema: 'ant-singleton-real-stratigraphy-results-v1', arms,
    productionBirthComparison, checkpointWorldComparison: checkpointWorldComparison(runs),
    stratigraphyChronology: chronology, noduleLineage: lineage, material };
  const visual = {
    'mature-x-windows.svg': svg('Mature unique X options', 'Mean per analysis anchor', Object.entries(arms).map(([name, arm]) => ({ name, values: arm.windows.map(row => [(row.startSeconds + row.endSeconds) / 2, row.complete60sWindow ? row.matureXMean : null]) }))),
    'births.svg': svg('Native production and research-local births per 60 s', 'Birth count', Object.entries(runs).map(([name, run]) => ({ name, values: WINDOWS.map(([a, b]) => [(a + b) / 2, completeWindow(run, [a, b]) ? count(run.births, row => inWindow(row.timeMs, [a, b])) : null]) })).concat([{ name: 'Research local', values: WINDOWS.map(([a, b]) => [(a + b) / 2, completeWindow(runs.realStratigraphy, [a, b]) ? count(researchBirths, row => inWindow(row.timeMs, [a, b])) : null]) }])),
    'coverage-depth.svg': materialSvg(material),
    'nodule-births.svg': svg('REAL native Nodule births per 60 s by lineage', 'Birth count', [{ name: 'Production-only', values: WINDOWS.map(([a, b]) => [(a + b) / 2, completeWindow(runs.realStratigraphy, [a, b]) ? count(lineage, row => row.classification === 'production-only' && inWindow(row.timeMs, [a, b])) : null]) }, { name: 'Research-involving', values: WINDOWS.map(([a, b]) => [(a + b) / 2, completeWindow(runs.realStratigraphy, [a, b]) ? count(lineage, row => row.classification === 'research-involving' && inWindow(row.timeMs, [a, b])) : null]) }]),
    'travel-population.svg': travelPopulationSvg(runs)
  };
  return { summary, material, productionBirthComparison, checkpointWorldComparison: summary.checkpointWorldComparison,
    stratigraphyChronology: chronology, localInsertions, qualification, noduleLineage: lineage, visual };
}

async function main() {
  const analysis = resolve(EVIDENCE, 'analysis');
  const runs = {};
  for (const [key, file] of [['control', 'control.signals.json.gz'], ['overlay', 'treatment.signals.json.gz'], ['realStratigraphy', 'real-stratigraphy.signals.json.gz']]) {
    runs[key] = await readRun(resolve(analysis, file));
  }
  const result = deriveResults(runs);
  await writeJson(resolve(analysis, 'results-summary.json'), result.summary);
  await writeJson(resolve(analysis, 'formation-comparison-60s.json'), { arms: result.summary.arms, windows: WINDOWS });
  await writeJson(resolve(analysis, 'production-birth-comparison.json'), result.productionBirthComparison);
  await writeJson(resolve(analysis, 'checkpoint-world-comparison.json'), result.checkpointWorldComparison);
  await writeJson(resolve(analysis, 'stratigraphy-chronology.json'), { material: result.material, chronology: result.stratigraphyChronology,
    localInsertions: result.localInsertions, qualification: result.qualification });
  await writeJson(resolve(analysis, 'nodule-lineage.json'), { birthCount: result.noduleLineage.length,
    noNoduleBirths: result.noduleLineage.length === 0, rows: result.noduleLineage,
    classificationCounts: histogram(result.noduleLineage.map(row => row.classification ?? 'unclassified')) });
  const visualDir = resolve(EVIDENCE, 'visual'); await mkdir(visualDir, { recursive: true });
  const { writeFile } = await import('node:fs/promises');
  for (const [name, content] of Object.entries(result.visual)) await writeFile(resolve(visualDir, name), content, 'utf8');
  console.log(JSON.stringify({ arms: Object.keys(result.summary.arms), material: result.material,
    noduleRows: result.noduleLineage.length, outputs: 11 }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
