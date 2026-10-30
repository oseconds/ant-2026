import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { ANT_MAX_TURN_RATE } from '../src/lib/agents/ant/AntAgent.js';
import { executeScenario, CHECKPOINTS, DT } from './ant-g-production-candidate-natural.js';
import { attachTurningResponse } from './ant-material-turning-probe.js';
import { attachFlowVelocity } from './ant-material-flow-velocity-probes.js';
import { descriptiveSpacing, enumeratePlateauMaxima, neighbors8 } from './ant-opportunity-core.js';
import { verifyBaselineInputs, verifySourceAuthority } from './ant-material-organism-feedback-screen.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-30-material-feedback-ad-composition';
const DATA = `${PACKAGE}/data/ad`;
const PARENT = 'codex/ant-organism-feedback-candidate-survey-20261030@9b5ef8d6247fc3c9d6237d9d0c9082d8c3546a49';
const MAIN = '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785';
const ARMS = Object.freeze({
  N: 'docs/ant/evidence/2026-10-30-material-organism-feedback-discovery/data/control',
  A: 'docs/ant/evidence/2026-10-30-material-organism-feedback-discovery/data/turning',
  D: 'docs/ant/evidence/2026-10-30-organism-feedback-candidate-survey/data/following',
});
const SOURCES = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'scripts/ant-founder-evidence.js', 'docs/ant/README.md',
  'scripts/ant-g-production-candidate-natural.js', 'scripts/ant-material-turning-probe.js',
  'scripts/ant-material-flow-velocity-probes.js', 'scripts/ant-opportunity-core.js',
  'scripts/ant-material-feedback-screen-analysis.js', 'scripts/ant-material-organism-feedback-screen.js',
  'scripts/ant-material-feedback-ad-composition.js'
];
const N = 96, CELLS = N * N, DT_MS = 1000 / 60, TURN_EPS = 1e-12;
const qA = layers => 1 - 0.50 * (1 - Math.exp(-layers / 4));
const hD = layers => 0.4 * (1 + 0.50 * (1 - Math.exp(-layers / 4)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const point = i => ({ x: (i % N) / 95, y: Math.floor(i / N) / 95 });
const angleDelta = (a, b) => ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const writeNew = (path, bytes) => writeFile(path, bytes, { flag: 'wx' });
const gzipRead = async path => JSON.parse(gunzipSync(await readFile(path)));

function stats(values) {
  if (!values.length) return { n: 0 };
  const rows = values.slice().sort((a, b) => a - b), at = p => rows[Math.round((rows.length - 1) * p)];
  return { n: rows.length, min: rows[0], p10: at(.1), p25: at(.25), median: at(.5), p75: at(.75),
    p90: at(.9), p95: at(.95), p99: at(.99), max: rows.at(-1), mean: values.reduce((a, b) => a + b, 0) / values.length };
}

function contextName(a, d) { return a ? (d ? 'both' : 'A-only') : (d ? 'D-only' : 'neither'); }

function loadThinner(source) {
  const math = Object.create(Math);
  math.random = () => { throw new Error('RNG use is forbidden in the read-only atlas observer.'); };
  return runInNewContext(source.replace(/^export /gm, '') + '\n({zhangSuen})', { Math: math }).zhangSuen;
}

function components(F) {
  const labels = new Int32Array(CELLS).fill(-1), sizes = [];
  let id = 0;
  for (let start = 0; start < CELLS; start += 1) if (F[start] && labels[start] < 0) {
    const queue = [start]; labels[start] = id;
    for (let head = 0; head < queue.length; head += 1) for (const next of neighbors8(queue[head]))
      if (F[next] && labels[next] < 0) { labels[next] = id; queue.push(next); }
    sizes.push(queue.length); id += 1;
  }
  return { labels, sizes };
}

function captureOpportunityFrame(controller, tick, thinner) {
  const timeMs = controller.simulationTimeMs, surface = controller.surfaceField;
  const E = controller.trailPlateBirth.buildSupportedMask(surface).mask;
  const F = thinner(E), S = new Uint8Array(CELLS), D = new Float32Array(CELLS);
  for (let i = 0; i < CELLS; i += 1) {
    if (F[i] && neighbors8(i).some(j => F[j])) S[i] = 1;
    D[i] = Math.fround(surface.sampleSupport(i % N / 95, Math.floor(i / N) / 95, 0.025));
  }
  const plates = controller.trailPlateBirth.getPlates().filter(plate => plate.bornAtSimulationTimeMs < timeMs);
  const preMaterialLayers = new Uint8Array(CELLS);
  for (const plate of plates) for (let i = 0; i < CELLS; i += 1) if (plate.mask[i]) preMaterialLayers[i] += 1;
  return { tick, timeMs, B: controller.trailPlateBirth.chemicalMemory.slice(), C: surface.values.slice(), D,
    E, F, S, preMaterialLayers, materialIds: plates.map(plate => plate.id) };
}

function makeRecord(expectedTicks, thinner) {
  const record = { protocol: { seed: 20261005, seconds: 600, tickRate: 60, audio: 'Off', slowdown: false,
    residence: false, A: 'qA(L)=1-.50*(1-exp(-L/4)); multiply native 4.5 rad/s turn ceiling',
    D: 'hD(L)=.4*(1+.50*(1-exp(-L/4))); multiply native same-flow .4 s headway only',
    tickEntryLayerCount: true, directThreshold: 'parent consumer probe 1e-12 exact-difference convention' },
    tickEntrySnapshots: 0, ticks: 0, movementObservations: 0,
    A: { calls: 0, materialCalls: 0, nativeCapBinding: 0, candidateCapBinding: 0, changedMaterialCalls: 0,
      ratesNative: [], ratesActual: [], angleDifferences: [], capSuppression: [], byLayer: {} },
    D: { senseCalls: 0, materialSenseCalls: 0, finiteSameFlowCalls: 0, materialFiniteSameFlowCalls: 0,
      materialHeadwayExpanded: 0, finalTargetCalls: 0, materialFinalTargetCalls: 0, changedMaterialTargets: 0,
      targetReduction: [], byLayer: {}, shadowMatches: { native: 0, candidate: 0, candidateMismatches: 0 } },
    joint: { partitionTotals: { 'A-only': 0, 'D-only': 0, both: 0, neither: 0 }, perSecond: [],
      firstEvents: { A: null, D: null, joint: null } },
    frames: [], feet: [], footContactGroups: 0, footStreamSha256: null };
  const layersByAnt = new Map(), antsById = new Map();
  const footHash = createHash('sha256');
  let current = null, tickEntrySnapshots = 0;
  const bucket = (table, key) => table[key] ||= { calls: 0, changed: 0, capBinding: 0, candidateCapBinding: 0,
    response: [], nativeRate: [], actualRate: [], delta: [] };
  const noteFirst = (name, row) => {
    if (!record.joint.firstEvents[name]) record.joint.firstEvents[name] = row;
  };

  return { record, install(controller) {
    controller.materialLocomotionResistance = false;
    const originalGuard = controller.occupancy.constrainDisplacements;
    const turn = attachTurningResponse(controller, { enabled: true, onTurn(row) {
      assert(current, 'turn measurement occurs inside registered tick');
      assert.equal(row.factor, qA(row.layers), 'A uses its registered layer-count law');
      const targetError = Math.abs(angleDelta(row.beforeHeading, row.targetHeading));
      const nativeRate = Math.abs(row.nativeAngularVelocity), actualRate = Math.abs(row.angularVelocity);
      const difference = Math.abs(angleDelta(row.nativeHeading, row.afterHeading));
      const nativeBinds = targetError > ANT_MAX_TURN_RATE * row.dtSeconds + TURN_EPS;
      const candidateCap = ANT_MAX_TURN_RATE * qA(row.layers);
      const candidateBinds = targetError > candidateCap * row.dtSeconds + TURN_EPS;
      const changed = row.layers > 0 && difference > TURN_EPS;
      const ant = current.rows.get(row.agent) || { layers: row.layers, A: false, D: false };
      ant.layers = row.layers; ant.A = changed; ant.turn = row;
      current.rows.set(row.agent, ant);
      const layer = bucket(record.A.byLayer, row.layers);
      record.A.calls += 1; layer.calls += 1;
      if (row.layers > 0) {
        record.A.materialCalls += 1;
        if (nativeBinds) record.A.nativeCapBinding += 1;
        if (candidateBinds) record.A.candidateCapBinding += 1;
        if (changed) {
          record.A.changedMaterialCalls += 1; layer.changed += 1;
          const suppression = Math.max(0, nativeRate - actualRate);
          record.A.angleDifferences.push(difference); record.A.capSuppression.push(suppression);
          record.A.ratesNative.push(nativeRate); record.A.ratesActual.push(actualRate);
          layer.response.push(difference); layer.nativeRate.push(nativeRate); layer.actualRate.push(actualRate);
          layer.delta.push(suppression);
        }
        if (nativeBinds) layer.capBinding += 1;
        if (candidateBinds) layer.candidateCapBinding += 1;
      }
      if (changed) noteFirst('A', { tick: current.tick, timeMs: current.timeMs, antId: row.agent.id,
        layers: row.layers, q: row.factor, position: { x: row.agent.x, y: row.agent.y }, targetHeading: row.targetHeading,
        targetErrorRad: targetError, nativeRateRadPerSecond: nativeRate, actualRateRadPerSecond: actualRate,
        nativeCapRadPerSecond: ANT_MAX_TURN_RATE, candidateCapRadPerSecond: candidateCap,
        nativeCapBinds: nativeBinds, candidateCapBinds: candidateBinds, headingDifferenceRad: difference });
    } });
    const flow = attachFlowVelocity(controller, { kind: 'following', enabled: true, layersByAnt,
      onSample(row) {
        assert(current, 'following measurement occurs inside registered tick');
        const ant = antsById.get(row.antId);
        assert(ant, `live ant ${row.antId} is available for same-tick context`);
        const state = current.rows.get(ant) || { layers: row.layers, A: false, D: false };
        state.layers = row.layers; current.rows.set(ant, state);
        if (row.stage !== 'final-target') {
          record.D.senseCalls += 1;
          if (row.layers > 0) record.D.materialSenseCalls += 1;
          if (row.eligible) record.D.finiteSameFlowCalls += 1;
          if (row.layers > 0 && row.eligible) record.D.materialFiniteSameFlowCalls += 1;
          if (row.layers > 0 && row.eligible && row.changed) record.D.materialHeadwayExpanded += 1;
          if (row.layers > 0) assert.equal(row.candidateHeadwayTerm,
            Math.max(row.personality.personalSpacing * 0.6, Math.hypot(ant.vx ?? 0, ant.vy ?? 0) * hD(row.layers)),
            'D uses the registered headway formula');
          state.sense = row;
          return;
        }
        record.D.finalTargetCalls += 1;
        if (row.layers > 0) record.D.materialFinalTargetCalls += 1;
        assert(row.actualMatchesProspective, 'actual AD final target matches D prospective target');
        record.D.shadowMatches.candidate += Number(row.actualMatchesProspective);
        record.D.shadowMatches.native += Number(row.actualMatchesNative);
        record.D.shadowMatches.candidateMismatches += Number(!row.actualMatchesProspective);
        const changed = row.layers > 0 && row.eligible && row.changed;
        state.D = changed; state.target = row;
        const layer = bucket(record.D.byLayer, row.layers);
        layer.calls += 1;
        if (changed) {
          record.D.changedMaterialTargets += 1; layer.changed += 1;
          const reduction = row.nativeDesiredSpeed - row.prospectiveDesiredSpeed;
          record.D.targetReduction.push(reduction); layer.delta.push(reduction);
          noteFirst('D', { tick: current.tick, timeMs: current.timeMs, antId: row.antId, layers: row.layers,
            headwayNativeSeconds: 0.4, headwayCandidateSeconds: hD(row.layers),
            nativeFollowingCap: row.nativeFollowingSpeedLimit,
            candidateFollowingCap: row.candidateFollowingSpeedLimit,
            finalTargetNative: row.nativeDesiredSpeed, finalTargetCandidate: row.prospectiveDesiredSpeed,
            targetReduction: reduction, sameFlowEligible: row.eligible,
            neighbors: state.sense?.info?.neighbors ?? null, frontCrowding: state.sense?.info?.frontCrowding ?? null,
            separation: state.sense?.info ? Math.hypot(state.sense.info.separationX, state.sense.info.separationY) : null,
            position: { x: ant.x, y: ant.y } });
        }
      } });
    const beforeOuter = controller.tick;
    controller.subscribe(event => {
      if (event.type !== 'foot-contact') return;
      const payload = event.payload;
      if (payload?.type !== 'FOOT_CONTACT' || !Array.isArray(payload.contacts)) return;
      record.footContactGroups += 1;
      for (const contact of payload.contacts) {
        const { x, y } = contact?.position || {};
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) continue;
        const foot = { timeMs: payload.simulationTimeMs, x, y };
        record.feet.push(foot); footHash.update(JSON.stringify(foot) + '\n');
      }
    });
    controller.tick = (...args) => {
      const timeMs = controller.simulationTimeMs, tick = ++record.ticks;
      const agents = controller.agents.slice(), snapshot = controller.materialStratigraphy.getSnapshot();
      current = { tick, timeMs, rows: new Map() };
      layersByAnt.clear(); antsById.clear();
      for (const ant of agents) {
        const index = Math.round(ant.y * 95) * N + Math.round(ant.x * 95);
        const layers = snapshot.stratigraphy.layerCountByCell[index] || 0;
        layersByAnt.set(ant, layers); antsById.set(ant.id, ant);
        current.rows.set(ant, { layers, A: false, D: false, position: { x: ant.x, y: ant.y } });
      }
      record.tickEntrySnapshots += 1; tickEntrySnapshots += 1;
      const result = beforeOuter(...args);
      const second = Math.floor(timeMs / 1000), sec = record.joint.perSecond[second] ||= {
        second, movementObservations: 0, contexts: { 'A-only': 0, 'D-only': 0, both: 0, neither: 0 },
        contains: { 'A-only': false, 'D-only': false, both: false }, A: 0, D: 0, joint: 0 };
      for (const ant of agents) {
        const state = current.rows.get(ant) || { layers: layersByAnt.get(ant) || 0, A: false, D: false };
        const name = contextName(state.A, state.D);
        record.joint.partitionTotals[name] += 1; sec.contexts[name] += 1;
        record.movementObservations += 1; sec.movementObservations += 1;
        if (state.A) sec.A += 1;
        if (state.D) sec.D += 1;
        if (state.A && state.D) sec.joint += 1;
        if (name !== 'neither') sec.contains[name] = true;
        if (state.A && state.D) noteFirst('joint', { tick, timeMs, antId: ant.id, layers: state.layers,
          position: state.position, positionSource: 'tick-entry snapshot', A: true, D: true });
      }
      if (expectedTicks.has(Math.round(controller.simulationTimeMs / DT_MS)))
        record.frames.push(captureOpportunityFrame(controller, Math.round(controller.simulationTimeMs / DT_MS), thinner));
      current = null;
      return result;
    };
    return { finish() {
      controller.tick = beforeOuter; flow.finish(); turn.finish();
      assert.equal(controller.occupancy.constrainDisplacements, originalGuard, 'native swept collision guard function remains installed');
      record.footStreamSha256 = footHash.digest('hex');
      assert.equal(tickEntrySnapshots, 36000); assert.equal(record.frames.length, 40);
    } };
  } };
}

function analyzeOpportunityFrame(frame) {
  const F = Uint8Array.from(frame.F), S = Uint8Array.from(frame.S), D = Float64Array.from(frame.D);
  assert.equal(F.length, CELLS); assert.equal(S.length, CELLS); assert.equal(D.length, CELLS);
  const { labels, sizes } = components(F), { peaks, zeroMaxContextCount } = enumeratePlateauMaxima({ S, values: D });
  const spaced = descriptiveSpacing(peaks, labels, 0.15), centers = spaced.representatives;
  const allCenters = centers.map((row, index) => ({ rank: index + 1, index: row.index, value: row.value,
    component: labels[row.index], entryDistance: Math.hypot(point(row.index).x - 0.5, point(row.index).y - 0.72),
    materialLayers: frame.preMaterialLayers[row.index] })), top = allCenters.slice(0, 3);
  return { tick: frame.tick, timeMs: frame.timeMs, sizes: { E: frame.E.filter(Boolean).length,
    F: frame.F.filter(Boolean).length, S: frame.S.filter(Boolean).length, FComponents: sizes.length },
    D: { finitePeaks: peaks.length, zeroMaxContexts: zeroMaxContextCount, separatedCenters: centers.length,
      top2ToTop1: centers[0]?.value > 0 && centers[1] ? centers[1].value / centers[0].value : null,
      winner: top[0] ?? null, top, strongestNonwinnerMaterialFree: allCenters.slice(1).find(x => x.materialLayers === 0) ?? null } };
}

function firstWorldComparison(summaries) {
  const metrics = {};
  for (const [arm, run] of Object.entries(summaries)) {
    const last = run.checkpoints.at(-1), raw = run.movement, events = run.events;
    metrics[arm] = { initialStateSha256: run.initialStateSha256, finalRng: run.finalRng,
      movement: { totalDistance: raw.totalDistance, activeAntSeconds: raw.activeAntSeconds, blockedFrames: raw.blockedFrames,
        maximumSpeed: raw.maximumSpeed, maximumTurnRate: raw.maximumTurnRate,
        minimumOneSecondDisplacement: raw.oneSecondDisplacement?.observedMin ?? null,
        meanOneSecondDisplacement: raw.oneSecondDisplacement?.mean ?? null },
      events: { contactGroups: events.contactGroups, individualFeet: events.individualFeet,
        plateBirths: events.plateBirths, firstPlateSeconds: events.firstPlateSeconds, sphereBirths: events.sphereBirths },
      end: { activePopulation: last.activePopulation, pheromoneNodeSum: last.field.sum,
        pheromoneBilinearIntegral: last.field.bilinearIntegral, SurfaceFieldC: last.surface.sum,
        surfaceMax: last.surface.max, plateCount: last.material.plateCount, noduleCount: last.material.noduleCount,
        exposedCells: last.material.exposedCells, buriedLayerCells: last.material.buriedLayerCells,
        maxLocalLayerCount: last.material.maxLocalLayerCount, acceptedFootContacts: last.material.totalAcceptedFootContacts } };
  }
  const base = metrics.N;
  for (const row of Object.values(metrics)) row.deltaFromN = {
    travel: row.movement.totalDistance - base.movement.totalDistance,
    activeAntSeconds: row.movement.activeAntSeconds - base.movement.activeAntSeconds,
    contactGroups: row.events.contactGroups - base.events.contactGroups,
    individualFeet: row.events.individualFeet - base.events.individualFeet,
    plateBirths: row.events.plateBirths - base.events.plateBirths,
    pheromoneNodeSum: row.end.pheromoneNodeSum - base.end.pheromoneNodeSum,
    SurfaceFieldC: row.end.SurfaceFieldC - base.end.SurfaceFieldC,
    buriedLayerCells: row.end.buriedLayerCells - base.end.buriedLayerCells };
  return metrics;
}

function mapDifference(a, b) {
  assert.equal(a.length, b.length);
  let l1 = 0, totalA = 0, totalB = 0, differing = 0;
  for (let i = 0; i < a.length; i += 1) { const x = Number(a[i]), y = Number(b[i]);
    l1 += Math.abs(y - x); totalA += x; totalB += y; differing += x !== y ? 1 : 0; }
  let normalizedL1 = null;
  if (totalA > 0 && totalB > 0) for (let i = 0; i < a.length; i += 1)
    normalizedL1 = (normalizedL1 ?? 0) + Math.abs(Number(a[i]) / totalA - Number(b[i]) / totalB);
  return { cells: a.length, differing, l1, totalA, totalB, normalizedL1 };
}

function footGrid(feet) {
  const cells = new Uint32Array(CELLS);
  for (const foot of feet) cells[Math.round(foot.y * 95) * N + Math.round(foot.x * 95)] += 1;
  return cells;
}

function summarizeFrames(frames) {
  const rows = frames.map(analyzeOpportunityFrame), winners = rows.map(row => row.D.winner?.index ?? null);
  return { count: rows.length, firstTimeMs: rows[0]?.timeMs ?? null, lastTimeMs: rows.at(-1)?.timeMs ?? null,
    D: { finitePeakCounts: stats(rows.map(row => row.D.finitePeaks)), spacedCenterCounts: stats(rows.map(row => row.D.separatedCenters)),
      top2ToTop1: stats(rows.map(row => row.D.top2ToTop1).filter(Number.isFinite)),
      winnerEntryDistance: stats(rows.map(row => row.D.winner?.entryDistance).filter(Number.isFinite)),
      winnerMaterialFrames: rows.filter(row => (row.D.winner?.materialLayers ?? 0) > 0).length,
      materialFreeNonwinnerFrames: rows.filter(row => row.D.strongestNonwinnerMaterialFree).length,
      exactWinnerCellChanges: winners.slice(1).filter((value, i) => value !== winners[i]).length }, rows };
}

async function readFrozen() {
  const frozen = {}, hashes = {}, aux = {};
  for (const [arm, dir] of Object.entries(ARMS)) {
    const [runBytes, rawBytes, auxBytes] = await Promise.all(['run-summary.json', 'seed20261005-G-raw.json.gz', 'auxiliary.json.gz']
      .map(file => readFile(resolve(ROOT, dir, file))));
    const run = JSON.parse(runBytes), raw = JSON.parse(gunzipSync(rawBytes)), auxiliary = JSON.parse(gunzipSync(auxBytes));
    assert.equal(run.seconds, 600); assert.equal(run.seed, 20261005); assert.equal(raw.seed, 20261005);
    assert.equal(auxiliary.frames.length, 40, `${arm} frozen opportunity anchors`);
    frozen[arm] = { run, raw, frames: auxiliary.frames, feet: auxiliary.feet };
    aux[arm] = auxiliary;
    hashes[arm] = { runSummarySha256: hash(runBytes), rawSha256: hash(rawBytes), auxiliarySha256: hash(auxBytes) };
    for (const file of ['PROVENANCE.json', 'PARITY.json', 'SOURCE-HASHES.json', 'INPUT-RECEIPTS.json']) {
      try { hashes[arm][file] = hash(await readFile(resolve(ROOT, dir, file))); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  assert.equal(frozen.N.run.initialStateSha256, frozen.A.run.initialStateSha256);
  assert.equal(frozen.N.run.initialStateSha256, frozen.D.run.initialStateSha256);
  const ticks = frozen.N.frames.map(frame => frame.tick);
  assert.deepEqual(frozen.A.frames.map(frame => frame.tick), ticks);
  assert.deepEqual(frozen.D.frames.map(frame => frame.tick), ticks);
  assert.deepEqual(frozen.N.raw.positions.filter(row => row.seconds <= 84), frozen.A.raw.positions.filter(row => row.seconds <= 84));
  assert.deepEqual(frozen.N.raw.positions.filter(row => row.seconds <= 84), frozen.D.raw.positions.filter(row => row.seconds <= 84));
  assert.deepEqual(frozen.N.raw.contactsBySecond.filter(row => row.seconds <= 84), frozen.A.raw.contactsBySecond.filter(row => row.seconds <= 84));
  assert.deepEqual(frozen.N.raw.contactsBySecond.filter(row => row.seconds <= 84), frozen.D.raw.contactsBySecond.filter(row => row.seconds <= 84));
  const AParity = JSON.parse(await readFile(resolve(ROOT, ARMS.A, 'PARITY.json'), 'utf8'));
  const DParity = JSON.parse(await readFile(resolve(ROOT, ARMS.D, 'PARITY.json'), 'utf8'));
  assert.equal(AParity.commonControlInitialState, true); assert.equal(AParity.preMaterialPositionParityThroughSecond, 84);
  assert.equal(DParity.status, 'PASS'); assert.equal(DParity.preMaterialPositionParityThroughSecond, 84);
  assert(Math.abs(DParity.firstPlateTimeMs - frozen.N.run.events.firstPlateSeconds * 1000) < 1e-9);
  return { frozen, aux, ticks, hashes };
}

async function analyzeSaved() {
  const output = resolve(ROOT, DATA), frozenData = await readFrozen();
  const adRun = JSON.parse(await readFile(resolve(output, 'run-summary.json'), 'utf8'));
  const adRaw = await gzipRead(resolve(output, 'seed20261005-G-raw.json.gz'));
  const adAux = await gzipRead(resolve(output, 'auxiliary.json.gz'));
  const adFrames = await gzipRead(resolve(output, 'opportunity-frames.json.gz'));
  const runProvenance = JSON.parse(await readFile(resolve(output, 'PROVENANCE.json'), 'utf8'));
  assert.equal(adRun.initialStateSha256, frozenData.frozen.N.run.initialStateSha256);
  assert.deepEqual(adRaw.positions.filter(row => row.seconds <= 84), frozenData.frozen.N.raw.positions.filter(row => row.seconds <= 84));
  assert.deepEqual(adRaw.contactsBySecond.filter(row => row.seconds <= 84), frozenData.frozen.N.raw.contactsBySecond.filter(row => row.seconds <= 84));
  assert.deepEqual(adFrames.map(frame => frame.tick), frozenData.ticks);
  const arms = { ...Object.fromEntries(Object.entries(frozenData.frozen).map(([arm, row]) => [arm, row.frames])), AD: adFrames };
  const opportunity = Object.fromEntries(Object.entries(arms).map(([arm, frames]) => [arm, summarizeFrames(frames)]));
  const direct = { AD: {
    movementObservations: adAux.movementObservations,
    contexts: adAux.joint.partitionTotals,
    perSecondContains: Object.fromEntries(['A-only', 'D-only', 'both'].map(key => [key,
      adAux.joint.perSecond.filter(row => row.contains[key]).length])),
    firstEvents: adAux.joint.firstEvents,
    eventWindows: Object.fromEntries(Object.entries(adAux.joint.firstEvents).map(([name, event]) => {
      if (!event) return [name, null];
      const firstSecond = Math.floor(event.timeMs / 1000);
      return [name, { containingSecond: firstSecond, oneSecondBins: adAux.joint.perSecond
        .filter(row => row.second >= firstSecond && row.second <= firstSecond + 10) }];
    })),
    A: { calls: adAux.A.calls, materialCalls: adAux.A.materialCalls, nativeCapBinding: adAux.A.nativeCapBinding,
      candidateCapBinding: adAux.A.candidateCapBinding, changedMaterialCalls: adAux.A.changedMaterialCalls,
      headingDifferenceRad: stats(adAux.A.angleDifferences), nativeRateRadPerSecond: stats(adAux.A.ratesNative),
      actualRateRadPerSecond: stats(adAux.A.ratesActual), rateSuppressionRadPerSecond: stats(adAux.A.capSuppression),
      byLayer: Object.fromEntries(Object.entries(adAux.A.byLayer).map(([key, row]) => [key, {
        calls: row.calls, changed: row.changed, capBinding: row.capBinding, candidateCapBinding: row.candidateCapBinding,
        headingDifferenceRad: stats(row.response), rateSuppressionRadPerSecond: stats(row.delta) }])) },
    D: { senseCalls: adAux.D.senseCalls, materialSenseCalls: adAux.D.materialSenseCalls,
      finiteSameFlowCalls: adAux.D.finiteSameFlowCalls, materialFiniteSameFlowCalls: adAux.D.materialFiniteSameFlowCalls,
      materialHeadwayExpanded: adAux.D.materialHeadwayExpanded, finalTargetCalls: adAux.D.finalTargetCalls,
      materialFinalTargetCalls: adAux.D.materialFinalTargetCalls, changedMaterialTargets: adAux.D.changedMaterialTargets,
      targetReduction: stats(adAux.D.targetReduction), targetShadowMatches: adAux.D.shadowMatches,
      byLayer: Object.fromEntries(Object.entries(adAux.D.byLayer).map(([key, row]) => [key, {
        calls: row.calls, changed: row.changed, targetReduction: stats(row.delta) }])) }
  }, frozenSingleLawReferences: {
    A: { calls: frozenData.aux.A.turning.calls,
      materialCalls: Object.entries(frozenData.aux.A.turning.byLayer).filter(([layers]) => Number(layers) > 0)
        .reduce((n, [, row]) => n + row.calls, 0), changedMaterialCalls: frozenData.aux.A.turning.changedCalls,
      firstChanged: frozenData.aux.A.turning.firstChanged,
      maxObservedSameStateHeadingDifferenceRad: frozenData.aux.A.turning.maxNativeHeadingDifference },
    D: (() => { const row = frozenData.aux.D.candidates['following:final-target'];
      return { finalTargetCalls: row.total.numeric.layers.n, materialFinalTargetCalls: row.total.numeric.layers.materialN,
        finiteSameFlowCalls: row.total.flags.eligible.true,
        materialFiniteSameFlowCalls: row.total.flags.eligible.materialTrue,
        changedMaterialTargets: row.total.flags.changed.materialTrue, firstChanged: row.firstChanged }; })()
  } };
  const world = { ...firstWorldComparison(Object.fromEntries(Object.entries(frozenData.frozen).map(([arm, row]) => [arm, row.run]))),
    AD: firstWorldComparison({ N: frozenData.frozen.N.run, AD: adRun }).AD };
  const feet = Object.fromEntries([...Object.entries(frozenData.frozen).map(([arm, row]) => [arm, row.feet]), ['AD', adAux.feet]]);
  const footMaps = Object.fromEntries(Object.entries(feet).map(([arm, values]) => [arm, footGrid(values)]));
  const footDistribution = Object.fromEntries(Object.entries(footMaps).map(([arm, grid]) => [arm, {
    totalFeet: feet[arm].length, distributionVsN: arm === 'N' ? null : mapDifference(footMaps.N, grid) }]));
  const framesByArm = Object.fromEntries(Object.entries(arms).map(([arm, frames]) => [arm,
    Object.fromEntries(frames.map(frame => [frame.tick, frame]))]));
  const frameComparison = {};
  for (const arm of ['A', 'D', 'AD']) frameComparison[arm] = frozenData.ticks.map(tick => {
    const a = framesByArm.N[tick], b = framesByArm[arm][tick];
    return { tick, timeMs: b.timeMs, B: mapDifference(a.B, b.B), C: mapDifference(a.C, b.C),
      D: mapDifference(a.D, b.D), E: mapDifference(a.E, b.E), F: mapDifference(a.F, b.F),
      S: mapDifference(a.S, b.S), preMaterialLayers: mapDifference(a.preMaterialLayers, b.preMaterialLayers) };
  });
  const analysis = { schema: 'ant-material-feedback-ad-composition-analysis-v1',
    runInstrumentationSourceSha256: runProvenance.sourceHashes['scripts/ant-material-feedback-ad-composition.js'],
    postprocessingSourceSha256: hash(await readFile(resolve(ROOT, 'scripts/ant-material-feedback-ad-composition.js'))),
    frozenAnchorTicks: frozenData.ticks, direct, world, footDistribution, opportunity, frameComparison,
    interpretationGuard: 'Candidate worlds are single-seed endogenous trajectories. Direct consumer shadows are paired within AD; cross-arm world differences are descriptive, not independent trials.' };
  return { analysis, adRun, adAux, frozenData };
}

async function sourceHashes() {
  return Object.fromEntries(await Promise.all(SOURCES.map(async file => [file, hash(await readFile(resolve(ROOT, file)))])));
}

async function correctJointPosition() {
  const output = resolve(ROOT, DATA), path = resolve(output, 'auxiliary.json.gz');
  const originalBytes = await readFile(path), originalSha256 = hash(originalBytes);
  const record = JSON.parse(gunzipSync(originalBytes));
  const joint = record.joint.firstEvents.joint, directD = record.joint.firstEvents.D;
  assert(joint && directD && joint.tick === directD.tick && joint.timeMs === directD.timeMs && joint.antId === directD.antId,
    'first joint event shares exact tick and ant with first D direct sample');
  if (joint.positionSource === 'tick-entry snapshot') return null;
  if (!joint.positionSource) {
    joint.postTickPosition = joint.position;
    joint.position = directD.position;
    joint.positionSource = 'same-tick D final-target sample before movement; turn call changes heading but not position';
    const correctedBytes = gzipSync(JSON.stringify(record), { level: 9, mtime: 0 });
    await writeFile(path, correctedBytes);
    const correction = { schema: 'ant-material-feedback-ad-composition-correction-v1',
      correction: 'joint first-event location changed from post-tick observation to same-tick D pre-movement consumer sample',
      tick: joint.tick, timeMs: joint.timeMs, antId: joint.antId, postTickPosition: joint.postTickPosition,
      correctedTickEntryPosition: joint.position, basis: joint.positionSource,
      originalAuxiliarySha256: originalSha256, correctedAuxiliarySha256: hash(correctedBytes),
      runInstrumentationSourceSha256: JSON.parse(await readFile(resolve(output, 'PROVENANCE.json'), 'utf8'))
        .sourceHashes['scripts/ant-material-feedback-ad-composition.js'],
      postprocessingSourceSha256: hash(await readFile(resolve(ROOT, 'scripts/ant-material-feedback-ad-composition.js'))),
      simulationRerun: false, otherRunArtifactsChanged: false };
    await writeFile(resolve(output, 'CORRECTIONS.json'), JSON.stringify(correction, null, 2) + '\n');
    return correction;
  }
  const correction = JSON.parse(await readFile(resolve(output, 'CORRECTIONS.json'), 'utf8'));
  assert.equal(correction.correctedAuxiliarySha256, originalSha256, 'saved correction receipt matches corrected auxiliary');
  return correction;
}

async function selfTest() {
  assert.equal(qA(0), 1); assert.equal(hD(0), .4);
  for (let layers = 0; layers < 100; layers += 1) {
    assert(qA(layers + 1) <= qA(layers) && qA(layers + 1) >= .5);
    assert(hD(layers + 1) >= hD(layers) && hD(layers + 1) <= .6);
  }
  assert(Math.abs(qA(1e9) - .5) < 1e-12); assert(Math.abs(hD(1e9) - .6) < 1e-12);
  assert.deepEqual(['A-only', 'D-only', 'both', 'neither'], [contextName(true, false), contextName(false, true),
    contextName(true, true), contextName(false, false)]);
  return { status: 'PASS', checks: ['A/D-L0-identity', 'monotonic-bounds', 'A-half-asymptote', 'D-0.6s-asymptote',
    'four-way-context-partition'], nativeTurnRate: ANT_MAX_TURN_RATE, DNativeHeadwaySeconds: .4 };
}

async function run() {
  const check = await selfTest();
  const frozenData = await readFrozen();
  const output = resolve(ROOT, DATA);
  await mkdir(output, { recursive: true });
  for (const name of ['run-summary.json', 'auxiliary.json.gz', 'opportunity-frames.json.gz', 'seed20261005-G-raw.json.gz'])
    await assert.rejects(readFile(resolve(output, name)), { code: 'ENOENT' }, `${name} must not exist before the one AD run`);
  const hashes = await sourceHashes(), inputReceipts = await verifyBaselineInputs(), sourceAuthority = await verifySourceAuthority();
  const thinner = loadThinner(await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8'));
  const expectedTicks = new Set(frozenData.ticks);
  const instrumentation = makeRecord(expectedTicks, thinner);
  const provenance = { schema: 'ant-material-feedback-ad-composition-v1', productionMain: MAIN,
    researchParent: PARENT, branch: 'codex/ant-material-feedback-ad-composition-20261030',
    seed: 20261005, seconds: 600, tickRate: 60, audio: 'Off', baselineArm: 'G',
    productionLocomotionResistance: false, chemicalResidence: false, otherCandidateLaws: 'Off',
    laws: { A: { formula: 'qA(L)=1-.50*(1-exp(-L/4))', consumer: 'native 4.5 rad/s angular turn ceiling', L: 'tick-entry layerCountByCell' },
      D: { formula: 'hD(L)=.4*(1+.50*(1-exp(-L/4)))', consumer: 'native same-flow .4 s comfortable headway', L: 'tick-entry layerCountByCell' } },
    sourceHashes: hashes, sourceAuthority, frozenInputReceipts: inputReceipts, frozenArmArtifacts: frozenData.hashes,
    frozenInitialStateSha256: frozenData.frozen.N.run.initialStateSha256,
    frozenFirstPlateSeconds: frozenData.frozen.N.run.events.firstPlateSeconds,
    opportunityAnchorTicks: frozenData.ticks,
    observer: { rngCalls: 0, productionBehaviorChanged: false, nativeSweptGuardPreserved: true,
      scope: 'turn and same-flow following consumers; FOOT_CONTACT positions; existing late E/F/S/B/C/D observer' },
    selfTest: check };
  await writeNew(resolve(output, 'PROVENANCE.json'), Buffer.from(JSON.stringify(provenance, null, 2) + '\n'));
  const hook = { current: null };
  const result = await executeScenario(20261005, 'G', 600, output, null, controller => { hook.current = instrumentation.install(controller); });
  hook.current.finish();
  assert.equal(result.seed, 20261005); assert.equal(result.arm, 'G'); assert.equal(result.seconds, 600);
  assert.equal(result.initialStateSha256, frozenData.frozen.N.run.initialStateSha256, 'same initial world state');
  assert.equal(instrumentation.record.ticks, 36000); assert.equal(instrumentation.record.joint.perSecond.length, 600);
  const raw = await gzipRead(resolve(output, 'seed20261005-G-raw.json.gz'));
  assert.deepEqual(raw.positions.filter(row => row.seconds <= 84), frozenData.frozen.N.raw.positions.filter(row => row.seconds <= 84),
    'AD positions equal the frozen neutral world through the first Plate event');
  assert.deepEqual(raw.contactsBySecond.filter(row => row.seconds <= 84), frozenData.frozen.N.raw.contactsBySecond.filter(row => row.seconds <= 84),
    'AD contact buckets equal neutral through the first Plate event');
  assert.equal(result.movement.finiteViolations, 0); assert.equal(result.movement.speedCapViolations, 0);
  assert.equal(result.movement.turnCapViolations, 0); assert.equal(result.movement.overlapViolations, 0);
  assert.equal(result.movement.populationCeilingViolations, 0); assert.equal(result.events.individualFeet, instrumentation.record.feet.length);
  assert.equal(result.events.contactGroups, instrumentation.record.footContactGroups);
  assert.equal(instrumentation.record.D.shadowMatches.candidateMismatches, 0);
  await writeNew(resolve(output, 'run-summary.json'), Buffer.from(JSON.stringify(result, null, 2) + '\n'));
  const { frames: _frames, ...auxiliary } = instrumentation.record;
  await writeNew(resolve(output, 'auxiliary.json.gz'), gzipSync(JSON.stringify(auxiliary), { level: 9, mtime: 0 }));
  await writeNew(resolve(output, 'opportunity-frames.json.gz'), gzipSync(JSON.stringify(instrumentation.record.frames,
    (key, value) => ArrayBuffer.isView(value) ? Array.from(value) : value), { level: 9, mtime: 0 }));
  const { analysis } = await analyzeSaved();
  await writeNew(resolve(output, 'ANALYSIS.json'), Buffer.from(JSON.stringify(analysis, null, 2) + '\n'));
  const stableAnalysis = await analyzeSaved();
  assert.deepEqual(stableAnalysis.analysis, analysis, 'measurement rerun is byte-value deterministic');
  console.log(JSON.stringify({ status: 'AD-SCREEN-PASS', runSeconds: result.seconds, direct: analysis.direct.AD,
    world: analysis.world.AD, opportunityFrames: analysis.opportunity.AD.count, output }, null, 2));
}

async function analyzeOnly() {
  await correctJointPosition();
  const { analysis } = await analyzeSaved();
  await writeFile(resolve(ROOT, DATA, 'ANALYSIS.json'), JSON.stringify(analysis, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'ANALYSIS-PASS', frames: analysis.opportunity.AD.count,
    sha256: hash(await readFile(resolve(ROOT, DATA, 'ANALYSIS.json'))), path: resolve(ROOT, DATA, 'ANALYSIS.json') }));
}

const mode = process.argv[2] || '--run';
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (mode === '--self-test') console.log(JSON.stringify(await selfTest(), null, 2));
  else if (mode === '--analyze-only') await analyzeOnly();
  else { assert.equal(mode, '--run'); await run(); }
}
