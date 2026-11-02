import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SurfaceAudioBridge } from '../src/lib/audio/SurfaceAudioBridge.js';
import { productionOps } from './ant-local-opportunity-capture.js';
import { readRun, sha256, writeJson, writeRun } from './ant-local-opportunity-io.js';
import { runArm, validateControlAgainstFrozen, verifyAuthorityReceipts } from './ant-local-x-material-replacement.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BRANCH = 'codex/ant-local-x-audio-reassessment-20261101';
const AUTHORITY = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const BASE = 'd0481760fd44052acbeaaf88c3b171ab2a625601';
const SEEDS = ['20261005', '20261006', '20261007'];
const ARMS = ['control', 'replacement'];
const TICKS = 300 * 60, RATE = 48_000, FRAMES = 300 * RATE, FRAMES_PER_TICK = RATE / 60;
const WINDOWS = [[50, 60], [110, 120], [170, 180], [230, 240], [290, 300]];
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-local-x-audio-reassessment');
const RUNS = resolve(ROOT, '.cache/local-x-audio-reassessment/reproduced-runs');
const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = value => Buffer.from(value.buffer, value.byteOffset, value.byteLength);
const maskBytes = value => Buffer.from(value);

function pack(value) {
  if (ArrayBuffer.isView(value)) return { __typedArray: value.constructor.name, length: value.length,
    data: bytes(value).toString('base64') };
  if (Array.isArray(value)) return value.map(pack);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== undefined).map(([key, child]) => [key, pack(child)]));
  return value;
}

export function audioFrameForTick(tick) {
  if (!Number.isInteger(tick) || tick < 0 || tick > TICKS) throw new RangeError('tick must be an integer from 0 through 18000');
  return tick * FRAMES_PER_TICK;
}

function audioStateSnapshot(controller) {
  const state = controller.materialStratigraphy.getAudioState();
  return pack({ width: state.width, height: state.height, version: state.version, revision: state.revision,
    noduleRevision: state.noduleRevision, coordinateScaleMetersPerUnit: state.coordinateScaleMetersPerUnit,
    plates: state.plates, nodules: state.nodules, stratigraphy: {
      version: state.stratigraphy.version, revision: state.stratigraphy.revision,
      layerOrder: state.stratigraphy.layerOrder, topLayerByCell: state.stratigraphy.topLayerByCell,
      layerCountByCell: state.stratigraphy.layerCountByCell,
      totalDepthByCellMeters: state.stratigraphy.totalDepthByCellMeters } });
}

function countComponents(mask, width, height) {
  const seen = new Uint8Array(mask.length), stack = [];
  let components = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    components++;
    seen[start] = 1; stack.push(start);
    while (stack.length) {
      const cell = stack.pop(), x = cell % width, y = Math.floor(cell / width);
      for (const next of [x ? cell - 1 : -1, x + 1 < width ? cell + 1 : -1,
        y ? cell - width : -1, y + 1 < height ? cell + width : -1]) {
        if (next >= 0 && mask[next] && !seen[next]) { seen[next] = 1; stack.push(next); }
      }
    }
  }
  return components;
}

function countLayerComponents(topology, layer) {
  const start = topology.nodeOffsets[layer], end = topology.nodeOffsets[layer + 1];
  const seen = new Uint8Array(end - start), stack = [];
  let components = 0;
  for (let first = start; first < end; first++) {
    if (seen[first - start]) continue;
    components++; seen[first - start] = 1; stack.push(first);
    while (stack.length) {
      const node = stack.pop();
      for (let direction = 0; direction < 4; direction++) {
        const next = topology.neighborIndices[node * 4 + direction];
        if (next >= start && next < end && !seen[next - start]) {
          seen[next - start] = 1; stack.push(next);
        }
      }
    }
  }
  return components;
}

export function topologyMetrics(state, topology, tick) {
  const indexById = new Map(state.plates.map((plate, index) => [plate.id, index]));
  const compiledIndexById = new Map(topology.layerIds.map((id, index) => [id, index]));
  const top = state.stratigraphy.topLayerByCell;
  const exposed = new Map(state.plates.map(plate => [plate.id, 0]));
  for (const index of top) if (index >= 0) {
    const id = state.plates[index]?.id;
    if (id) exposed.set(id, exposed.get(id) + 1);
  }
  const plates = state.plates.map(plate => {
    const geometry = { geometrySha256: hash(maskBytes(plate.mask)),
      maskCells: plate.mask.reduce((sum, value) => sum + Number(value === 1), 0),
      maskComponents4Connected: countComponents(plate.mask, 96, 96) };
    const layer = compiledIndexById.get(plate.id);
    assert.ok(layer >= 0, `compiled layer exists for ${plate.id}`);
    const nodeStart = topology.nodeOffsets[layer], nodeEnd = topology.nodeOffsets[layer + 1];
    const coarseCells = topology.nodeGridIndices.subarray(nodeStart, nodeEnd);
    const coarseMask = Buffer.alloc(32 * 32);
    for (const cell of coarseCells) coarseMask[cell] = 1;
    const coarseXY = Array.from(coarseCells, cell => [cell % 32, Math.floor(cell / 32)]);
    const minX = Math.min(...coarseXY.map(([x]) => x)), minY = Math.min(...coarseXY.map(([, y]) => y));
    const relativeGeometry = coarseXY.map(([x, y]) => [x - minX, y - minY]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const pickupNodeIndices = Array.from(topology.pickupNodeIndices.subarray(layer * 2, layer * 2 + 2));
    const pickupSolverCells = pickupNodeIndices.map(index => topology.nodeGridIndices[index]);
    return { id: plate.id, ...geometry, material: plate.material, pickups: plate.pickups,
      exposedSourceCells: exposed.get(plate.id) || 0, compiledLayerIndex: layer,
      solverNodeCount: nodeEnd - nodeStart, solverComponents4Connected: countLayerComponents(topology, layer),
      solverGeometrySha256: hash(coarseMask), relativeSolverGeometrySha256: hash(JSON.stringify(relativeGeometry)),
      pickupNodeIndices, pickupSolverCells, pickupsCoincident: pickupNodeIndices[0] === pickupNodeIndices[1],
      sourceCellsPerSolverNode: geometry.maskCells / Math.max(1, nodeEnd - nodeStart) };
  });
  const neighborSlots = topology.neighborIndices.reduce((sum, index) => sum + Number(index >= 0), 0);
  const geometryCounts = new Map();
  for (const plate of plates) geometryCounts.set(plate.geometrySha256, (geometryCounts.get(plate.geometrySha256) || 0) + 1);
  const solverGeometryCounts = new Map();
  for (const plate of plates) solverGeometryCounts.set(plate.solverGeometrySha256,
    (solverGeometryCounts.get(plate.solverGeometrySha256) || 0) + 1);
  const relativeGeometryCounts = new Map();
  for (const plate of plates) relativeGeometryCounts.set(plate.relativeSolverGeometrySha256,
    (relativeGeometryCounts.get(plate.relativeSolverGeometrySha256) || 0) + 1);
  return { tick, modelTimeMs: tick * 1000 / 60, plateCount: plates.length, noduleCount: state.nodules.length,
    totalSolverNodes: topology.nodeGridIndices.length, inPlateEdges: neighborSlots / 2,
    adjacentCouplingLinks: topology.adjacentLinkCoefficients.length,
    sphereFoundationLinks: Array.from(topology.noduleFoundationLayerIndices).filter(index => index >= 0).length,
    duplicateGeometryGroups: [...geometryCounts.values()].filter(count => count > 1).length,
    duplicateSolverGeometryGroups: [...solverGeometryCounts.values()].filter(count => count > 1).length,
    duplicateRelativeSolverGeometryGroups: [...relativeGeometryCounts.values()].filter(count => count > 1).length,
    oneNodeLayers: plates.filter(plate => plate.solverNodeCount === 1).length,
    plates, compiledLayerIds: topology.layerIds };
}

function createCapture(seed, arm) {
  const data = { schema: 'ant-local-x-audio-world-v1', seed, arm, durationSeconds: 300,
    audioDuringSimulation: 'Off', modelTimeMapping: 'tick k events dispatched at completed-tick frame k*800; FOOT_CONTACT payload time is retained as a separate field',
    contacts: [], topologyStates: [], windowsSeconds: WINDOWS.map(row => [...row]) };
  let tickNow = 0, controller;
  const responses = new WeakMap();
  function topology(target, tick, time, phase) {
    data.topologyStates.push({ tick, modelTimeMs: time, phase, state: audioStateSnapshot(target) });
  }
  return { data,
    attach(target) {
      controller = target;
      const surface = target.surfaceField, apply = surface.applyFootContact.bind(surface);
      surface.applyFootContact = event => {
        const rows = apply(event); responses.set(event, rows); return rows;
      };
      target.subscribe(({ type, payload }) => {
        if (type !== 'foot-contact' || payload?.type !== 'FOOT_CONTACT') return;
        data.contacts.push({ tick: tickNow, sequence: data.contacts.length,
          controllerTimeAtEmissionMs: controller.simulationTimeMs,
          payloadSimulationTimeMs: payload.simulationTimeMs,
          mappedModelTimeMs: tickNow * 1000 / 60,
          payload: structuredClone(payload), responses: structuredClone(responses.get(payload) || []) });
      });
    },
    beforeTick(target, tick, entryTime) {
      tickNow = tick;
      if (tick === 1) topology(target, 0, entryTime, 'initial');
    },
    afterTick(target, tick, time) {
      const state = target.materialStratigraphy.getAudioState();
      const last = data.topologyStates.at(-1)?.state;
      if (!last || state.revision !== last.revision || state.noduleRevision !== last.noduleRevision)
        topology(target, tick, time, 'afterTick');
    } };
}

export function buildReplaySchedule(capture, run) {
  const initial = capture.topologyStates.find(row => row.phase === 'initial');
  assert.ok(initial, 'initial empty material state captured at tick zero');
  const bridge = new SurfaceAudioBridge({ audioEngine: {} });
  const events = [], routeRows = [], topologyRows = [], timeline = [];
  bridge._enabled = true; bridge._loading = false; bridge.worklet = {};
  let currentFrame = 0;
  bridge.post = (type, payload) => { events.push({ frame: currentFrame, message: { type, payload: pack(payload) } }); return true; };
  const sync = row => {
    currentFrame = audioFrameForTick(row.tick);
    const state = unpack(row.state);
    assert.equal(bridge.syncMaterial(state), true, `compile captured topology at tick ${row.tick}`);
    if (row.phase === 'initial') assert.equal(bridge.topology.layerIds.length, 0, 'initial topology is empty');
    topologyRows.push(topologyMetrics(state, bridge.topology, row.tick));
    timeline.push({ frame: currentFrame, tick: row.tick, kind: 'topology', phase: row.phase });
  };
  sync(initial);
  const contacts = new Map(), changes = new Map();
  for (const contact of capture.contacts) {
    const list = contacts.get(contact.tick) || []; list.push(contact); contacts.set(contact.tick, list);
  }
  for (const row of capture.topologyStates) if (row.phase === 'afterTick') {
    const list = changes.get(row.tick) || []; list.push(row); changes.set(row.tick, list);
  }
  const ticks = [...new Set([...contacts.keys(), ...changes.keys()])].sort((a, b) => a - b);
  for (const tick of ticks) {
    currentFrame = audioFrameForTick(tick);
    for (const contact of contacts.get(tick) || []) {
      const before = events.length;
      const routed = bridge.handleFootContact(contact.payload, { responses: contact.responses });
      const strikes = events.slice(before).filter(row => row.message.type === 'strike');
      assert.equal(Boolean(routed), strikes.length > 0, 'contact routing agrees with emitted strike messages');
      routeRows.push({ sequence: contact.sequence, tick, mappedFrame: currentFrame,
        controllerTimeAtEmissionMs: contact.controllerTimeAtEmissionMs,
        payloadSimulationTimeMs: contact.payloadSimulationTimeMs, routed: Boolean(routed),
        strikeCount: strikes.length });
      timeline.push({ frame: currentFrame, tick, kind: 'contact', sequence: contact.sequence,
        routed: Boolean(routed), strikeCount: strikes.length });
    }
    for (const row of changes.get(tick) || []) sync(row);
  }
  assert.ok(Math.abs(run.seconds - 300) < 1e-9, 'source world completed 300 simulation seconds');
  assert.equal(capture.contacts.length, routeRows.length);
  assert.ok(events.every(row => Number.isInteger(row.frame) && row.frame >= 0 && row.frame <= FRAMES));
  assert.equal(events[0].frame, 0, 'initial empty topology installed at frame zero');
  assert.equal(events[0].message.type, 'topology');
  assert.equal(events[0].message.payload.layerIds.length, 0);
  assert.equal(bridge.diagnostics.dropped, 0, 'native bridge reports no dropped topology or contact inputs');
  assert.equal(bridge.diagnostics.capacityRejectedLayers, 0, 'native bridge rejected no material layers');
  return { events, routeRows, topologyRows, timeline, metrics: { totalFrames: FRAMES, sampleRate: RATE,
    framesPerTick: FRAMES_PER_TICK, contactGroups: routeRows.length,
    routedContactGroups: routeRows.filter(row => row.routed).length,
    strikeMessages: events.filter(row => row.message.type === 'strike').length,
    topologyInstalls: events.filter(row => row.message.type === 'topology').length,
    maximumLayers: Math.max(...topologyRows.map(row => row.plateCount)),
    maximumNodes: Math.max(...topologyRows.map(row => row.totalSolverNodes)),
    maximumAdjacentLinks: Math.max(...topologyRows.map(row => row.adjacentCouplingLinks)) } };
}

function unpack(value) {
  if (ArrayBuffer.isView(value)) return value;
  if (Array.isArray(value)) return value.map(unpack);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.__typedArray === 'string') {
    const types = { Float32Array, Float64Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array };
    const Type = types[value.__typedArray]; assert.ok(Type, `supported typed array ${value.__typedArray}`);
    const data = Buffer.from(value.data, 'base64');
    assert.equal(data.byteLength, value.length * Type.BYTES_PER_ELEMENT);
    const copy = Uint8Array.from(data); return new Type(copy.buffer);
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, unpack(child)]));
}

async function run() {
  await mkdir(RUNS, { recursive: true });
  const authority = await verifyAuthorityReceipts(BRANCH);
  assert.equal(authority.requestedAuthority, AUTHORITY);
  execFileSync('git', ['merge-base', '--is-ancestor', BASE, 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
  const executionHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const ops = productionOps(await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8'));
  const receipts = [];
  for (const seed of SEEDS) for (const arm of ARMS) {
    const capture = createCapture(seed, arm);
    console.log(JSON.stringify({ phase: 'world-start', seed, arm, ticks: TICKS }));
    const result = await runArm(seed, arm, ops, { outDir: RUNS, avCapture: capture });
    const baselinePath = resolve(ROOT, 'docs/ant/evidence/2026-11-01-local-x-material-replacement/analysis/runs',
      `seed-${seed}-${arm}.signals.json.gz`);
    const prior = await readRun(baselinePath);
    if (arm === 'control') {
      const conformance = await validateControlAgainstFrozen(result.run, authority);
      result.run.controlConformance = conformance;
    }
    const runPath = resolve(RUNS, `seed-${seed}-${arm}.signals.json.gz`);
    await writeRun(runPath, result.run, 20);
    assert.deepEqual(await readRun(runPath), prior, `${seed} ${arm} rerun matches the frozen replacement run`);
    const replay = buildReplaySchedule(result.av, result.run);
    const capturePath = resolve(EVIDENCE, 'analysis', `seed-${seed}-${arm}-capture.json.gz`);
    const replayPath = resolve(EVIDENCE, 'analysis', `seed-${seed}-${arm}-schedule.json.gz`);
    await writeJson(capturePath, result.av);
    await writeJson(replayPath, { schema: 'ant-local-x-audio-world-schedule-v1', seed, arm,
      authority: AUTHORITY, replacementEvidence: BASE,
      executionHead,
      world: { seconds: 300, ticks: TICKS, sampleRate: RATE, frames: FRAMES,
        frameMapping: 'completed tick k maps to audio frame k*800; all same-tick contacts precede afterTick topology install; tick-18000 frame is endpoint outside rendered samples' },
      windowsSeconds: WINDOWS, events: replay.events, routeRows: replay.routeRows,
      topologyChronology: replay.topologyRows, scheduleTimeline: replay.timeline, metrics: replay.metrics });
    receipts.push({ seed, arm, status: 'PASS', baselineRunSha256: sha256(await readFile(baselinePath)),
      replayRunSha256: sha256(await readFile(runPath)),
      capture: { file: `analysis/seed-${seed}-${arm}-capture.json.gz`, sha256: sha256(await readFile(capturePath)) },
      schedule: { file: `analysis/seed-${seed}-${arm}-schedule.json.gz`, sha256: sha256(await readFile(replayPath)) },
      metrics: replay.metrics });
    console.log(JSON.stringify({ phase: 'world-complete', seed, arm, status: 'PASS', ...replay.metrics }));
  }
  await writeJson(resolve(EVIDENCE, 'analysis/receipts.json'), { status: 'PASS', branch: BRANCH,
    authority: AUTHORITY, replacementEvidence: BASE, executionHead, continuousHistoryCaptured: true,
    audioRenderedDuringWorldCapture: false, windowsSeconds: WINDOWS, worlds: receipts });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
