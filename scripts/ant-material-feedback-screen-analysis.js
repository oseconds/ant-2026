import assert from 'node:assert/strict';
import { descriptiveSpacing, enumeratePlateauMaxima, neighbors8 } from './ant-opportunity-core.js';

const SIZE = 96, CELLS = SIZE * SIZE, ENTRY = { x: 0.5, y: 0.72 }, ENTRY_RADIUS = 0.15;
const point = i => ({ x: (i % SIZE) / 95, y: Math.floor(i / SIZE) / 95 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sum = values => values.reduce((total, value) => total + value, 0);
const counts = values => values.reduce((total, value) => total + (value ? 1 : 0), 0);
const mean = values => values.length ? sum(values) / values.length : null;

function checkMap(values, length, label) {
  assert(Array.isArray(values) || ArrayBuffer.isView(values), `${label} must be an array`);
  assert.equal(values.length, length, `${label} length`);
  for (const value of values) assert(Number.isFinite(value), `${label} must be finite`);
}

function mapMetrics(a, b) {
  assert.equal(a.length, b.length, 'map lengths must match');
  let l1 = 0, maxAbs = 0, differingCells = 0, positiveA = 0, positiveB = 0, intersection = 0;
  for (let i = 0; i < a.length; i += 1) {
    const delta = b[i] - a[i], abs = Math.abs(delta);
    l1 += abs; maxAbs = Math.max(maxAbs, abs); differingCells += abs > 0 ? 1 : 0;
    const pa = a[i] > 0, pb = b[i] > 0;
    positiveA += pa ? 1 : 0; positiveB += pb ? 1 : 0; intersection += pa && pb ? 1 : 0;
  }
  const totalA = sum(a), totalB = sum(b);
  let normalizedL1 = null;
  if (totalA > 0 && totalB > 0) {
    normalizedL1 = 0;
    for (let i = 0; i < a.length; i += 1) normalizedL1 += Math.abs(b[i] / totalB - a[i] / totalA);
  }
  return { cells: a.length, exactParity: differingCells === 0, differingCells, l1, maxAbs, totalA, totalB,
    normalizedL1, positiveCellsA: positiveA, positiveCellsB: positiveB,
    jaccardPositiveSupport: positiveA + positiveB - intersection ? intersection / (positiveA + positiveB - intersection) : 1 };
}

function checkpointScalars(row, map) {
  const pheromone = map.pheromone.values, surface = map.surface.values;
  let chemicalCoverage004 = 0;
  for (const value of pheromone) chemicalCoverage004 += value >= 0.04 ? 1 : 0;
  const layers = row.material;
  return { seconds: row.seconds, activePopulation: row.activePopulation, totalSpawned: row.totalSpawned,
    totalRetired: row.totalRetired, recruitedThisSecond: row.recruitedThisSecond,
    totalRealizedTravel: row.totalRealizedTravel, travelPerActiveAntSecond: row.travelPerActiveAntSecond,
    pheromoneNodeSum: row.field?.sum ?? null, reconstructedIntegral: row.field?.bilinearIntegral ?? null,
    pheromoneCoverageAt004: chemicalCoverage004 / pheromone.length,
    C: { surfaceSum: row.surface?.sum ?? sum(surface), surfaceMax: row.surface?.max ?? Math.max(...surface),
      surfaceCoverage: surface.filter(value => value > 0).length / surface.length },
    material: layers ? { plateCount: layers.plateCount, noduleCount: layers.noduleCount,
      exposedCells: layers.exposedCells, buriedLayerCells: layers.buriedLayerCells,
      maxLocalLayerCount: layers.maxLocalLayerCount, totalAcceptedFootContacts: layers.totalAcceptedFootContacts,
      rejectedFootContacts: layers.rejectedFootContacts } : null };
}

function checkpointComparison(controlRows, candidateRows, controlMaps, candidateMaps) {
  const cByTime = new Map(controlRows.map(row => [row.seconds, row]));
  const cmByTime = new Map(controlMaps.map(row => [row.seconds, row]));
  const dByTime = new Map(candidateMaps.map(row => [row.seconds, row]));
  assert.equal(controlRows.length, candidateRows.length, 'checkpoint counts must match');
  return candidateRows.map(candidate => {
    const seconds = candidate.seconds, control = cByTime.get(seconds), cm = cmByTime.get(seconds), dm = dByTime.get(seconds);
    assert(control && cm && dm, `paired checkpoint ${seconds}s required`);
    const maps = {};
    for (const name of ['pheromone', 'surface']) maps[name] = mapMetrics(cm[name].values, dm[name].values);
    for (const name of ['cumulativeAntSeconds', 'recent30sAntSeconds'])
      maps[`occupancy.${name}`] = mapMetrics(cm.occupancy[name], dm.occupancy[name]);
    if (cm.persistent30sChemicalMask && dm.persistent30sChemicalMask)
      maps.persistent30sChemicalMask = mapMetrics(cm.persistent30sChemicalMask, dm.persistent30sChemicalMask);
    return { seconds, control: checkpointScalars(control, cm), candidate: checkpointScalars(candidate, dm),
      delta: { activePopulation: candidate.activePopulation - control.activePopulation,
        totalSpawned: candidate.totalSpawned - control.totalSpawned, totalRetired: candidate.totalRetired - control.totalRetired,
        recruitedThisSecond: candidate.recruitedThisSecond - control.recruitedThisSecond,
        totalRealizedTravel: candidate.totalRealizedTravel - control.totalRealizedTravel,
        pheromoneNodeSum: candidate.field.sum - control.field.sum,
        reconstructedIntegral: candidate.field.bilinearIntegral - control.field.bilinearIntegral,
        pheromoneCoverageAt004: checkpointScalars(candidate, dm).pheromoneCoverageAt004
          - checkpointScalars(control, cm).pheromoneCoverageAt004,
        CsurfaceSum: (candidate.surface?.sum ?? sum(dm.surface.values)) - (control.surface?.sum ?? sum(cm.surface.values)),
        CsurfaceMax: (candidate.surface?.max ?? Math.max(...dm.surface.values))
          - (control.surface?.max ?? Math.max(...cm.surface.values)),
        CsurfaceCoverage: (dm.surface.values.filter(value => value > 0).length / dm.surface.values.length)
          - (cm.surface.values.filter(value => value > 0).length / cm.surface.values.length),
        plateCount: candidate.material.plateCount - control.material.plateCount,
        exposedCells: candidate.material.exposedCells - control.material.exposedCells,
        buriedLayerCells: candidate.material.buriedLayerCells - control.material.buriedLayerCells,
        maxLocalLayerCount: candidate.material.maxLocalLayerCount - control.material.maxLocalLayerCount }, maps };
  });
}

function components(mask) {
  const labels = new Int32Array(CELLS).fill(-1), sizes = [];
  let id = 0;
  for (let i = 0; i < CELLS; i += 1) if (mask[i] && labels[i] < 0) {
    const queue = [i]; labels[i] = id;
    for (let head = 0; head < queue.length; head += 1) for (const next of neighbors8(queue[head]))
      if (mask[next] && labels[next] < 0) { labels[next] = id; queue.push(next); }
    sizes.push(queue.length); id += 1;
  }
  return { labels, sizes };
}

function maxOf(values, include = () => true) {
  let index = null, value = -Infinity;
  for (let i = 0; i < values.length; i += 1) if (include(i) && values[i] > value) { value = values[i]; index = i; }
  return { index, value: index === null ? null : value };
}

function regionMetrics(values) {
  let entrySum = 0, outsideSum = 0, entryCount = 0, outsideCount = 0;
  const entry = i => distance(point(i), ENTRY) <= ENTRY_RADIUS;
  for (let i = 0; i < values.length; i += 1) {
    if (entry(i)) { entrySum += values[i]; entryCount += 1; } else { outsideSum += values[i]; outsideCount += 1; }
  }
  const globalMax = maxOf(values), entryMax = maxOf(values, entry), outsideMax = maxOf(values, i => !entry(i));
  return { reference: { center: ENTRY, radius: ENTRY_RADIUS }, entry: { cells: entryCount, sum: entrySum,
    max: entryMax, maxToGlobal: globalMax.value > 0 ? entryMax.value / globalMax.value : null },
    outside: { cells: outsideCount, sum: outsideSum, max: outsideMax,
      maxToGlobal: globalMax.value > 0 ? outsideMax.value / globalMax.value : null }, total: sum(values), globalMax };
}

function frameMetrics(frame, feet) {
  for (const name of ['B', 'C', 'D', 'E', 'F', 'S', 'preMaterialLayers']) checkMap(frame[name], CELLS, `frame ${frame.tick} ${name}`);
  const F = Uint8Array.from(frame.F), S = Uint8Array.from(frame.S), { labels, sizes } = components(F);
  const peaks = enumeratePlateauMaxima({ S, values: frame.D }).peaks;
  const groups = descriptiveSpacing(peaks, labels, ENTRY_RADIUS);
  const centers = groups.representatives.map((row, rank) => {
    const p = point(row.index), index = row.index;
    return { rank: rank + 1, index, x: p.x, y: p.y, value: row.value,
      entryDistance: distance(p, ENTRY), FComponent: labels[index], FComponentSize: labels[index] >= 0 ? sizes[labels[index]] : null,
      priorLayers: frame.preMaterialLayers[index], exactFeet20s: 0, nearbyFeet20sR037: 0 };
  });
  const from = frame.timeMs - 20000;
  const exact = new Uint32Array(CELLS), nearby = new Uint32Array(CELLS);
  for (const foot of feet) if (foot.timeMs > from && foot.timeMs <= frame.timeMs) {
    const x = Math.round(foot.x * 95), y = Math.round(foot.y * 95), ix = y * SIZE + x;
    exact[ix] += 1;
    const minX = Math.max(0, Math.ceil((foot.x - 0.037) * 95)), maxX = Math.min(95, Math.floor((foot.x + 0.037) * 95));
    const minY = Math.max(0, Math.ceil((foot.y - 0.037) * 95)), maxY = Math.min(95, Math.floor((foot.y + 0.037) * 95));
    for (let cy = minY; cy <= maxY; cy += 1) for (let cx = minX; cx <= maxX; cx += 1)
      if (Math.hypot(cx / 95 - foot.x, cy / 95 - foot.y) <= 0.037) nearby[cy * SIZE + cx] += 1;
  }
  for (const row of centers) { row.exactFeet20s = exact[row.index]; row.nearbyFeet20sR037 = nearby[row.index]; }
  const top = centers.slice(0, 3), outsideCenter = centers.find(row => row.entryDistance > ENTRY_RADIUS) ?? null;
  const eligible = i => S[i] && neighbors8(i).some(j => F[j]);
  const nucleus = maxOf(frame.D, eligible).index, X = new Set();
  if (nucleus !== null) {
    const queue = [nucleus]; X.add(nucleus);
    for (let head = 0; head < queue.length; head += 1) for (const next of neighbors8(queue[head]))
      if (F[next] && !X.has(next) && Math.hypot(next % SIZE - nucleus % SIZE,
        Math.floor(next / SIZE) - Math.floor(nucleus / SIZE)) / 95 <= ENTRY_RADIUS + 1e-12) { X.add(next); queue.push(next); }
  }
  let materialOverlap = 0;
  for (const i of X) if (frame.preMaterialLayers[i] > 0) materialOverlap += 1;
  const channelContext = Object.fromEntries(['B', 'C', 'D'].map(name => [name, regionMetrics(frame[name])]));
  return { tick: frame.tick, timeMs: frame.timeMs, channels: Object.fromEntries(['B', 'C', 'D'].map(name => [name,
      { sum: sum(frame[name]), max: maxOf(frame[name]), entryOutside: channelContext[name] }])),
    masks: { E: counts(frame.E), F: counts(F), S: counts(S), FComponents: sizes.length,
      fullArraysRetainedForExactComparison: true },
    D: { separatedCenters015: centers, top2ToTop1: top[0]?.value > 0 && top[1] ? top[1].value / top[0].value : null,
      top3ToTop1: top[0]?.value > 0 && top[2] ? top[2].value / top[0].value : null,
      top2SameFComponent: top.length >= 2 ? top[0].FComponent === top[1].FComponent : null,
      top3SameFComponent: top.length >= 3 ? top.every(row => row.FComponent === top[0].FComponent) : null,
      strongestOutsideEntryCenter: outsideCenter ? { ...outsideCenter,
        ratioToTop1: top[0]?.value ? outsideCenter.value / top[0].value : null } : null,
      globalMaximumWithinS: maxOf(frame.D, i => Boolean(S[i])),
      globalOutsideEntryMaximum: maxOf(frame.D, i => distance(point(i), ENTRY) > ENTRY_RADIUS) },
    X: { nucleus, connectedFCellsWithin015: X.size, preexistingMaterialCells: materialOverlap,
      preexistingMaterialFraction: X.size ? materialOverlap / X.size : null } };
}

function maskComparison(a, b) {
  const aa = new Map(a.map(row => [row.id, row])), bb = new Map(b.map(row => [row.id, row]));
  const ids = [...new Set([...aa.keys(), ...bb.keys()])].sort((x, y) => String(x).localeCompare(String(y)));
  return ids.map(id => {
    const left = aa.get(id), right = bb.get(id), source = left?.mask ?? right?.mask ?? [];
    const lm = left?.mask ?? new Array(source.length).fill(0), rm = right?.mask ?? new Array(source.length).fill(0);
    assert.equal(lm.length, rm.length, `birth mask ${id} shape`);
    let changed = 0, union = 0, intersection = 0;
    for (let i = 0; i < lm.length; i += 1) {
      const x = Boolean(lm[i]), y = Boolean(rm[i]); changed += x !== y ? 1 : 0;
      union += x || y ? 1 : 0; intersection += x && y ? 1 : 0;
    }
    return { id, controlPresent: Boolean(left), candidatePresent: Boolean(right),
      controlBirthTimeMs: left?.bornAtSimulationTimeMs ?? null, candidateBirthTimeMs: right?.bornAtSimulationTimeMs ?? null,
      changedCells: changed, unionCells: union, intersectionCells: intersection,
      jaccard: union ? intersection / union : 1, exactMaskParity: Boolean(left && right && changed === 0) };
  });
}

function rawMetrics(control, candidate) {
  const cPos = new Map(control.positions.map(row => [row.seconds, row])), dPos = new Map(candidate.positions.map(row => [row.seconds, row]));
  const cContacts = new Map(control.contactsBySecond.map(row => [row.seconds, row]));
  const dContacts = new Map(candidate.contactsBySecond.map(row => [row.seconds, row]));
  const seconds = [...new Set([...cPos.keys(), ...dPos.keys()])].sort((a, b) => a - b);
  let firstPositionDivergence = null, firstTelemetryDivergence = null, firstAdherenceDivergence = null;
  let firstContactDivergence = null;
  const rows = seconds.map(second => {
    const a = cPos.get(second), b = dPos.get(second), ca = cContacts.get(second), cb = dContacts.get(second);
    const ac = a?.agents ?? [], bc = b?.agents ?? [], aById = new Map(ac.map(x => [x.id, x])), bById = new Map(bc.map(x => [x.id, x]));
    const samePositions = ac.length === bc.length && ac.every(x => {
      const other = bById.get(x.id); return other && x.x === other.x && x.y === other.y;
    });
    const sameAgents = ac.length === bc.length && ac.every(x => JSON.stringify(x) === JSON.stringify(bById.get(x.id)));
    const contactsSame = JSON.stringify(ca) === JSON.stringify(cb);
    if (!samePositions && firstPositionDivergence === null) firstPositionDivergence = { seconds: second,
      controlPopulation: ac.length, candidatePopulation: bc.length,
      commonAgentIds: [...aById.keys()].filter(id => bById.has(id)).length,
      sampleResolutionSeconds: 1, meaning: 'first sampled ID/x/y difference, not first causal tick' };
    if (!sameAgents && firstTelemetryDivergence === null) firstTelemetryDivergence = { seconds: second,
      controlPopulation: ac.length, candidatePopulation: bc.length,
      differingAgentIds: ac.filter(x => JSON.stringify(x) !== JSON.stringify(bById.get(x.id))).map(x => x.id).slice(0, 10) };
    const adherenceRows = ac.map(x => [x.id, x.adherence]).filter(([id, value]) => bById.has(id) && Number.isFinite(value));
    if (firstAdherenceDivergence === null && adherenceRows.some(([id, value]) => value !== bById.get(id)?.adherence))
      firstAdherenceDivergence = { seconds: second, commonAgentsWithAdherence: adherenceRows.length };
    if (!contactsSame && firstContactDivergence === null) firstContactDivergence = { seconds: second, control: ca ?? null, candidate: cb ?? null };
    return { seconds: second, controlPopulation: a?.agents.length ?? null, candidatePopulation: b?.agents.length ?? null,
      populationDelta: a && b ? b.agents.length - a.agents.length : null,
      controlContactGroups: ca?.groups ?? null, candidateContactGroups: cb?.groups ?? null,
      controlFeet: ca?.feet ?? null, candidateFeet: cb?.feet ?? null,
      controlAdherenceMean: mean((a?.agents ?? []).map(x => x.adherence).filter(Number.isFinite)),
      candidateAdherenceMean: mean((b?.agents ?? []).map(x => x.adherence).filter(Number.isFinite)) };
  });
  return { firstPositionDivergence, firstTelemetryDivergence, firstAdherenceDivergence,
    firstContactDivergence, seconds: rows,
    controlPlateBirths: control.births.length, candidatePlateBirths: candidate.births.length,
    controlNoduleBirths: control.nodules.length, candidateNoduleBirths: candidate.nodules.length,
    contactStreamSha256: { control: control.events?.contactStreamSha256 ?? null,
      candidate: candidate.events?.contactStreamSha256 ?? null,
      equal: control.events?.contactStreamSha256 === candidate.events?.contactStreamSha256 },
    plateBirthStreamSha256: { control: control.events?.plateBirthStreamSha256 ?? null,
      candidate: candidate.events?.plateBirthStreamSha256 ?? null,
      equal: control.events?.plateBirthStreamSha256 === candidate.events?.plateBirthStreamSha256 } };
}

function timelineComparison(control, candidate) {
  const c = new Map(control.map(row => [row.seconds, row])), d = new Map(candidate.map(row => [row.seconds, row]));
  const times = [...new Set([...c.keys(), ...d.keys()])].sort((a, b) => a - b);
  let firstDivergence = null;
  const rows = times.map(seconds => {
    const a = c.get(seconds), b = d.get(seconds);
    assert(a && b, `paired timeline second ${seconds} required`);
    const fields = ['population', 'totalSpawned', 'totalRetired', 'recruitedThisSecond', 'totalRealizedTravel',
      'travelPerActiveAntSecond', 'adherenceMean', 'pheromoneNodeSum', 'reconstructedIntegral',
      'pheromoneCoverageAt004', 'plateCount'];
    const delta = Object.fromEntries(fields.map(key => [key, Number.isFinite(a[key]) && Number.isFinite(b[key]) ? b[key] - a[key] : null]));
    if (firstDivergence === null && fields.some(key => delta[key] !== null && delta[key] !== 0))
      firstDivergence = { seconds, fields: fields.filter(key => delta[key] !== null && delta[key] !== 0) };
    return { seconds, control: Object.fromEntries(fields.map(key => [key, a[key] ?? null])),
      candidate: Object.fromEntries(fields.map(key => [key, b[key] ?? null])), delta };
  });
  return { firstSampledTimelineDivergence: firstDivergence, sampleResolutionSeconds: 1, rows };
}

function footMap(feetA, feetB) {
  const width = 24, a = new Uint32Array(width * width), b = new Uint32Array(width * width);
  const fill = (feet, map) => { for (const foot of feet) {
    const x = Math.min(width - 1, Math.max(0, Math.floor(foot.x * width)));
    const y = Math.min(width - 1, Math.max(0, Math.floor(foot.y * width)));
    map[y * width + x] += 1;
  } };
  fill(feetA, a); fill(feetB, b);
  const totalA = sum(a), totalB = sum(b), scale = Math.max(...a, ...b), normalizedSpatialL1 = totalA && totalB
    ? a.reduce((value, count, i) => value + Math.abs(count / totalA - b[i] / totalB), 0) : null;
  return { width, height: width, controlCounts: Array.from(a), candidateCounts: Array.from(b),
    commonFixedScale: scale, controlFeet: totalA, candidateFeet: totalB, normalizedSpatialL1 };
}

function validatePairedInput(protocol, control, candidate) {
  assert.equal(protocol.seed, 20261005); assert.equal(protocol.seconds, 600); assert.equal(protocol.tickHz, 60);
  assert.equal(protocol.lateReferenceTicks.length, 40, '40 late reference ticks required');
  for (const arm of [control, candidate]) {
    assert.equal(arm.frames.length, 40, 'two sets of twenty late reference anchors expected');
    assert.equal(arm.feet.length > 0, true, 'contact stream required for recent-foot context');
    for (const frame of arm.frames) assert.equal(frame.D.length, CELLS, 'full D map required');
  }
  assert.deepEqual(control.frames.map(row => row.tick), candidate.frames.map(row => row.tick), 'paired ticks');
  assert.deepEqual(control.frames.map(row => row.tick), protocol.lateReferenceTicks, 'captured ticks must match preregistered anchors');
}

export function analyzePairedScreen({ protocol, control, candidate, controlRaw, candidateRaw,
  controlCheckpoints, candidateCheckpoints, controlAudit = null, candidateAudit = null }) {
  validatePairedInput(protocol, control, candidate);
  assert.equal(controlCheckpoints.rows.length, 5); assert.equal(candidateCheckpoints.rows.length, 5);
  assert.equal(controlCheckpoints.maps.length, 5); assert.equal(candidateCheckpoints.maps.length, 5);
  assert.equal(controlCheckpoints.timeline.length, 600); assert.equal(candidateCheckpoints.timeline.length, 600);
  const cm = new Map(control.frames.map(frame => [frame.tick, frame]));
  const frames = candidate.frames.map(frame => {
    const baseline = cm.get(frame.tick); assert(baseline, `control frame ${frame.tick} required`);
    const c = frameMetrics(baseline, control.feet), d = frameMetrics(frame, candidate.feet);
    return { tick: frame.tick, timeMs: frame.timeMs, control: c, candidate: d,
      delta: { B: mapMetrics(baseline.B, frame.B), C: mapMetrics(baseline.C, frame.C), D: mapMetrics(baseline.D, frame.D),
        E: mapMetrics(baseline.E, frame.E), F: mapMetrics(baseline.F, frame.F), S: mapMetrics(baseline.S, frame.S),
        preMaterialLayers: mapMetrics(baseline.preMaterialLayers, frame.preMaterialLayers) } };
  });
  const checkpoints = checkpointComparison(controlCheckpoints.rows, candidateCheckpoints.rows,
    controlCheckpoints.maps, candidateCheckpoints.maps);
  const raw = rawMetrics(controlRaw, candidateRaw);
  const timeline = timelineComparison(controlCheckpoints.timeline, candidateCheckpoints.timeline);
  raw.checkpointTravelAndRecruitment = checkpoints.map(row => ({ seconds: row.seconds,
    control: { totalRealizedTravel: row.control.totalRealizedTravel,
      travelPerActiveAntSecond: row.control.travelPerActiveAntSecond, recruitedThisSecond: row.control.recruitedThisSecond,
      adherenceMean: controlCheckpoints.rows.find(x => x.seconds === row.seconds)?.adherence?.mean ?? null },
    candidate: { totalRealizedTravel: row.candidate.totalRealizedTravel,
      travelPerActiveAntSecond: row.candidate.travelPerActiveAntSecond, recruitedThisSecond: row.candidate.recruitedThisSecond,
      adherenceMean: candidateCheckpoints.rows.find(x => x.seconds === row.seconds)?.adherence?.mean ?? null } }));
  for (const row of checkpoints) {
    const c = controlCheckpoints.rows.find(x => x.seconds === row.seconds), d = candidateCheckpoints.rows.find(x => x.seconds === row.seconds);
    const capture = raw.seconds.find(x => x.seconds === row.seconds);
    if (capture) { capture.controlTravel = c.totalRealizedTravel; capture.candidateTravel = d.totalRealizedTravel;
      capture.controlTravelPerActiveAntSecond = c.travelPerActiveAntSecond;
      capture.candidateTravelPerActiveAntSecond = d.travelPerActiveAntSecond; }
  }
  const anchors = frames.map(row => ({ tick: row.tick, timeMs: row.timeMs, D: row.candidate.D,
    controlD: row.control.D, maskAndMapDeltas: { D: row.delta.D, E: row.delta.E, F: row.delta.F, S: row.delta.S } }));
  return { schema: 'ant-material-pheromone-attenuation-screen-analysis-v1', protocol,
    checkpointComparison: checkpoints, lateFrames: anchors, lateFrameDetails: frames,
    locomotionAndPopulation: { ...raw, timeline },
    sourceDose: { control: controlAudit, candidate: candidateAudit,
      conservationResiduals: { control: controlAudit?.doseConservationResidual ?? null,
        candidate: candidateAudit?.doseConservationResidual ?? null,
        finite: { control: Number.isFinite(controlAudit?.doseConservationResidual),
          candidate: Number.isFinite(candidateAudit?.doseConservationResidual) } },
      interpretation: 'source-path dose accounting is reported separately from field maps and endogenous activity' },
    footMaps: footMap(control.feet, candidate.feet),
    actualBirthMasks: maskComparison(control.actualBirthMasks, candidate.actualBirthMasks),
    method: { noSimulation: true, noCompositeScoreOrThreshold: true,
      entryReferenceDiagnosticOnly: { center: ENTRY, radius: ENTRY_RADIUS },
      frameAnchorsComparedExactly: true, channels: ['B pheromone', 'C surface support', 'D sampled support', 'E eligible mask', 'F filtered mask', 'S edge mask'],
      peakDefinition: 'exact-equal 8-neighbor D plateaus within S; greedily spaced within the same F component at 0.15',
      recentFeet: 'all observed contacts in (t-20s,t], exact nearest-cell and distance <= 0.037 for map centers',
      X: 'F component cells within 0.15 of the highest-D eligible S cell; existing material from full preMaterialLayers',
      actualBirthMasks: 'compare event masks by ID; no inference from C or a proxy mask',
      mapComparisons: 'raw L1/max absolute/count/Jaccard plus normalized-to-total L1 where totals are positive',
      footMap: '24 by 24 world bins; same absolute count scale for both arms; normalized spatial L1 reported separately' } };
}

export function selfTest() {
  assert.equal(mapMetrics([1, 0], [0, 1]).normalizedL1, 2);
  assert.equal(mapMetrics([1, 0], [2, 0]).normalizedL1, 0);
  assert.equal(mapMetrics([0, 0], [0, 0]).jaccardPositiveSupport, 1);
  const zeros = new Array(CELLS).fill(0), frame = { B: zeros, C: zeros, D: zeros, E: zeros, F: zeros, S: zeros,
    preMaterialLayers: zeros }, frames = Array.from({ length: 40 }, (_, i) => ({ ...frame, tick: i + 1, timeMs: (i + 1) * 1000 }));
  const arm = { frames, feet: [{ timeMs: 1000, x: 0.5, y: 0.72 }], actualBirthMasks: [] };
  const raw = { positions: Array.from({ length: 600 }, (_, i) => ({ seconds: i + 1, agents: [] })),
    contactsBySecond: Array.from({ length: 600 }, (_, i) => ({ seconds: i + 1, groups: 0, feet: 0 })),
    births: [], nodules: [], events: {} };
  const timeline = Array.from({ length: 600 }, (_, i) => ({ seconds: i + 1, population: 0, totalSpawned: 0,
    totalRetired: 0, recruitedThisSecond: 0, totalRealizedTravel: 0, travelPerActiveAntSecond: 0,
    adherenceMean: null, pheromoneNodeSum: 0, reconstructedIntegral: 0, pheromoneCoverageAt004: 0, plateCount: 0 }));
  const summary = { rows: [30, 60, 120, 300, 600].map(seconds => ({ seconds, activePopulation: 0,
    totalSpawned: 0, totalRetired: 0, recruitedThisSecond: 0, totalRealizedTravel: 0,
    travelPerActiveAntSecond: 0, field: { sum: 0, bilinearIntegral: 0 }, surface: { sum: 0, max: 0 },
    adherence: { mean: null }, material: { plateCount: 0, noduleCount: 0, exposedCells: 0,
      buriedLayerCells: 0, maxLocalLayerCount: 0 } })), timeline,
    maps: [30, 60, 120, 300, 600].map(seconds => ({ seconds, pheromone: { values: zeros }, surface: { values: zeros },
      occupancy: { cumulativeAntSeconds: zeros, recent30sAntSeconds: zeros } })) };
  const report = analyzePairedScreen({ protocol: { seed: 20261005, seconds: 600, tickHz: 60,
    lateReferenceTicks: frames.map(row => row.tick) }, control: arm, candidate: arm,
    controlRaw: raw, candidateRaw: raw, controlCheckpoints: summary, candidateCheckpoints: summary });
  assert.equal(report.lateFrames.length, 40); assert.equal(report.checkpointComparison.length, 5);
  assert.equal(report.lateFrameDetails[0].delta.D.differingCells, 0);
  assert.equal(report.locomotionAndPopulation.firstPositionDivergence, null);
  return { normalizedMapComparison: true, zeroSupportJaccard: true, completePairedReport: true };
}
