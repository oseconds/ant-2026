import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { AntController } from '../src/lib/agents/ant/AntController.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-11-02-multiphysics-first-pass/orientation');
const MAIN_AUTHORITY = '5bdd516b412d03d78c2511ceb372180941206968';
const PRODUCTION_AUTHORITY = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const REFERENCE_COMMIT = '918764c';
const REFERENCE_PATH = 'docs/ant/evidence/2026-11-01-local-x-audio-reassessment/analysis/seed-20261005-control-capture.json.gz';
const REFERENCE_SHA256 = '4871d4d24b4f235b9626f1e95baa3b79f81ec1c4ad800fc57187202fbfcb1003';
const SEED = 20261005;
const SECONDS = 300;
const TICKS = SECONDS * 60;
const DT = 1 / 60;
const SOURCES = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js'
];
const CLI = new Map(process.argv.slice(2).map(arg => {
  const i = arg.indexOf('=');
  return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)];
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

async function main() {
  if (CLI.has('--selfcheck')) {
    selfcheck();
    console.log(JSON.stringify({ selfcheck: 'passed' }));
    return;
  }
  const referencePath = CLI.get('--reference-capture');
  assert.equal(typeof referencePath, 'string', 'pass the extracted pinned 918764c control capture');
  const output = resolve(CLI.get('--output') || EVIDENCE);
  await mkdir(output, { recursive: true });

  const referenceBytes = await readFile(referencePath);
  assert.equal(sha256(referenceBytes), REFERENCE_SHA256, 'pinned reference capture bytes');
  const reference = JSON.parse(gunzipSync(referenceBytes).toString('utf8'));
  assert.equal(reference.schema, 'ant-local-x-audio-world-v1');
  assert.equal(String(reference.seed), String(SEED));
  assert.equal(reference.arm, 'control');
  assert.equal(reference.durationSeconds, SECONDS);
  const sourceHashesBefore = await hashSources();

  const observedRng = countedLcg(SEED);
  const plainRng = countedLcg(SEED);
  const observed = new AntController({ random: observedRng.random });
  const plain = new AntController({ random: plainRng.random });
  const observedEvents = eventRecorder(observed);
  const plainEvents = eventRecorder(plain);
  const digestRows = [];
  const trajectoryRows = [];
  const materialRevisions = new Map();
  const topologyStates = [];
  let initialObservedHash;
  let initialPlainHash;
  let mismatch;
  let lastRevision;
  let lastNoduleRevision;
  let previousIds = new Set();
  let initialIds = [];
  let zeroLengthSegments = 0;
  const nativeMathRandom = Math.random;
  let globalMathRandomCalls = 0;

  Math.random = function (...args) {
    globalMathRandomCalls += 1;
    return nativeMathRandom.apply(Math, args);
  };
  try {
    await observed.init();
    await plain.init();
    topologyStates.push(topologyState(observed, 0, 0, 'initial'));
    initialObservedHash = stateHash(observed, observedRng);
    initialPlainHash = stateHash(plain, plainRng);
    digestRows.push({ tick: 0, observed: initialObservedHash, plain: initialPlainHash });
    mismatch = initialObservedHash === initialPlainHash ? null : { tick: 0,
      observed: initialObservedHash, plain: initialPlainHash };
    lastRevision = observed.materialStratigraphy.revision;
    lastNoduleRevision = observed.materialStratigraphy.noduleRevision;
    const initialMaterial = materialUnion(observed);
    materialRevisions.set(initialMaterial.revision, initialMaterial);
    previousIds = new Set(observed.agents.map(agent => agent.id));
    initialIds = [...previousIds].sort();

    for (let tick = 1; tick <= TICKS && !mismatch; tick += 1) {
      observedEvents.tick = tick;
      plainEvents.tick = tick;
      const entryMaterial = observed.materialStratigraphy.revision;
      if (!materialRevisions.has(entryMaterial)) {
        const row = materialUnion(observed);
        materialRevisions.set(row.revision, row);
      }
      const beforeIds = previousIds;
      observed.tick(DT);
      plain.tick(DT);

      const segments = filterKnownSegments(observed.completedMovementSegments || [], beforeIds);
      zeroLengthSegments += segments.filter(segment => segment.dx === 0 && segment.dy === 0).length;
      previousIds = new Set(observed.agents.map(agent => agent.id));
      trajectoryRows.push({ tick, timeSeconds: (tick - 0.5) / 60,
        materialRevision: entryMaterial, activeIdsAfterTick: [...previousIds].sort(),
        segments: segments.map(segment => ({ id: segment.id,
          from: [segment.from.x, segment.from.y], to: [segment.to.x, segment.to.y], dt: segment.dt })) });

      const observedHash = stateHash(observed, observedRng);
      const plainHash = stateHash(plain, plainRng);
      digestRows.push({ tick, observed: observedHash, plain: plainHash });
      if (observedHash !== plainHash) mismatch = { tick, observed: observedHash, plain: plainHash };

      const currentRevision = observed.materialStratigraphy.revision;
      const currentNoduleRevision = observed.materialStratigraphy.noduleRevision;
      if (currentRevision !== lastRevision || currentNoduleRevision !== lastNoduleRevision) {
        topologyStates.push(topologyState(observed, tick, observed.simulationTimeMs, 'afterTick'));
        lastRevision = currentRevision;
        lastNoduleRevision = currentNoduleRevision;
      }
    }
  } finally {
    Math.random = nativeMathRandom;
  }

  const sourceHashesAfter = await hashSources();
  const sourceUnchanged = stable(sourceHashesBefore) === stable(sourceHashesAfter);
  const currentContacts = observedEvents.contacts.map(({ tick, sequence, payload }) => ({
    tick, sequence, controllerTimeAtEmissionMs: observedEvents.contactTimes[sequence].controllerTimeAtEmissionMs,
    payloadSimulationTimeMs: payload.simulationTimeMs,
    mappedModelTimeMs: tick * 1000 / 60, payload: pack(payload)
  }));
  const plainContacts = plainEvents.contacts.map(({ tick, sequence, payload }) => ({
    tick, sequence, controllerTimeAtEmissionMs: plainEvents.contactTimes[sequence].controllerTimeAtEmissionMs,
    payloadSimulationTimeMs: payload.simulationTimeMs,
    mappedModelTimeMs: tick * 1000 / 60, payload: pack(payload)
  }));
  const currentBirths = observedEvents.plates.map(({ tick, modelTimeMs, payload }) => ({
    tick, modelTimeMs, plate: pack(payload)
  }));
  const currentNodules = observedEvents.nodules.map(({ tick, modelTimeMs, payload }) => ({
    tick, modelTimeMs, nodule: pack(payload)
  }));
  const peerContactEqual = hashCanonical(currentContacts) === hashCanonical(plainContacts);
  const currentContactHash = hashCanonical(currentContacts);
  const referenceContacts = reference.contacts.map(({ tick, sequence, controllerTimeAtEmissionMs,
    payloadSimulationTimeMs, mappedModelTimeMs, payload }) => ({
    tick, sequence, controllerTimeAtEmissionMs, payloadSimulationTimeMs, mappedModelTimeMs, payload
  }));
  const referenceBirths = deriveBirths(reference.topologyStates, 'plates', 'plate');
  const referenceNodules = deriveBirths(reference.topologyStates, 'nodules', 'nodule');
  const contactMatch = currentContacts.length === referenceContacts.length
    && currentContactHash === hashCanonical(referenceContacts);
  const topologyMatch = topologyStates.length === reference.topologyStates.length
    && hashCanonical(topologyStates) === hashCanonical(reference.topologyStates);
  const birthMatch = currentBirths.length === referenceBirths.length
    && hashCanonical(currentBirths) === hashCanonical(referenceBirths);
  const noduleMatch = currentNodules.length === referenceNodules.length
    && hashCanonical(currentNodules) === hashCanonical(referenceNodules);
  const complete = trajectoryRows.length === TICKS && digestRows.length === TICKS + 1;
  const status = !sourceUnchanged || mismatch || !complete || globalMathRandomCalls !== 0 || !peerContactEqual
    || !contactMatch || !topologyMatch || !birthMatch || !noduleMatch
    ? 'PROVENANCE-BLOCKED' : 'PASS';

  const materials = { schema: 'ant-multiphysics-orientation-material-union-v1', width: 96, height: 96,
    revisions: [...materialRevisions.values()].sort((a, b) => a.revision - b.revision) };
  const events = { schema: 'ant-multiphysics-orientation-events-v1', contacts: currentContacts,
    eventOrder: observedEvents.eventOrder,
    plateBirths: currentBirths, noduleBirths: currentNodules };
  const dataFiles = {
    'TRAJECTORY.ndjson.gz': gzip(Buffer.from(ndjsonText(trajectoryRows))),
    'MATERIALS.json.gz': gzip(Buffer.from(stable(materials) + '\n')),
    'EVENTS.json.gz': gzip(Buffer.from(stable(events) + '\n')),
    'TOPOLOGY.json.gz': gzip(Buffer.from(stable(topologyStates) + '\n')),
    'STATE-DIGESTS.jsonl.gz': gzip(Buffer.from(ndjsonText(digestRows)))
  };
  for (const [name, bytes] of Object.entries(dataFiles)) await writeFile(resolve(output, name), bytes);

  const referenceResult = {
    schema: 'ant-multiphysics-orientation-reference-check-v1',
    commit: REFERENCE_COMMIT, file: REFERENCE_PATH, sha256: REFERENCE_SHA256,
    sourceAuthority: PRODUCTION_AUTHORITY,
    note: 'The reference AntController includes a default-off research hook. Only shared outputs are compared; current production authority is checked independently.',
    contacts: { currentCount: currentContacts.length, referenceCount: referenceContacts.length,
      currentSha256: currentContactHash, referenceSha256: hashCanonical(referenceContacts), match: contactMatch,
      observerPlainMatch: peerContactEqual },
    topologyStates: { currentCount: topologyStates.length, referenceCount: reference.topologyStates.length,
      currentSha256: hashCanonical(topologyStates), referenceSha256: hashCanonical(reference.topologyStates), match: topologyMatch },
    plateBirths: { currentCount: currentBirths.length, referenceCount: referenceBirths.length,
      currentSha256: hashCanonical(currentBirths), referenceSha256: hashCanonical(referenceBirths), match: birthMatch },
    noduleBirths: { currentCount: currentNodules.length, referenceCount: referenceNodules.length,
      currentSha256: hashCanonical(currentNodules), referenceSha256: hashCanonical(referenceNodules), match: noduleMatch }
  };
  const run = {
    schema: 'ant-multiphysics-orientation-run-v1', status,
    mainAuthority: MAIN_AUTHORITY, productionAuthority: PRODUCTION_AUTHORITY,
    seed: SEED, seconds: SECONDS, ticksRequested: TICKS, ticksCompleted: trajectoryRows.length,
    dtSeconds: DT, audio: 'Off', renderer: 'absent', productionControllerOverrides: {},
    observedSegments: trajectoryRows.reduce((sum, row) => sum + row.segments.length, 0),
    zeroLengthSegments, activeIdsInitial: initialIds,
    activeIdsFinal: [...previousIds].sort(), globalMathRandomCalls,
    rng: { observedCalls: observedRng.calls, observedState: observedRng.state(),
      plainCalls: plainRng.calls, plainState: plainRng.state() },
    peerParity: { initialObservedSha256: initialObservedHash, initialPlainSha256: initialPlainHash,
      equalEveryTick: !mismatch, mismatch, stateDigestRows: digestRows.length,
      digestStreamSha256: hashCanonical(digestRows) },
    sourceHashesBefore, sourceHashesAfter, sourceUnchanged,
    eventCounts: { contacts: currentContacts.length, plateBirths: currentBirths.length,
      noduleBirths: currentNodules.length, topologyStates: topologyStates.length },
    outputHashes: Object.fromEntries(Object.entries(dataFiles).map(([name, bytes]) => [name, sha256(bytes)]))
  };
  await writeFile(resolve(output, 'REFERENCE.json'), stable(referenceResult, 2) + '\n');
  await writeFile(resolve(output, 'RUN.json'), stable(run, 2) + '\n');
  await writeManifest(output, Object.keys(dataFiles).concat('REFERENCE.json', 'RUN.json'));

  console.log(JSON.stringify({ status, ticksCompleted: run.ticksCompleted,
    contacts: referenceResult.contacts, topologyStates: referenceResult.topologyStates,
    plateBirths: referenceResult.plateBirths, output }));
}

export function filterKnownSegments(segments, previousIds) {
  return segments.filter(segment => previousIds.has(segment.id));
}

export function countedLcg(seed) {
  let state = seed >>> 0, calls = 0;
  return {
    random() { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; },
    get calls() { return calls; }, state() { return state; }
  };
}

export function ndjsonText(rows) {
  return rows.map(row => stable(row)).join('\n') + '\n';
}

function eventRecorder(controller) {
  const recorder = { tick: 0, contacts: [], plates: [], nodules: [], contactTimes: [], eventOrder: [] };
  controller.subscribe(({ type, payload }) => {
    if (type === 'foot-contact' && payload?.type === 'FOOT_CONTACT') {
      const sequence = recorder.contacts.length;
      recorder.contacts.push({ tick: recorder.tick, sequence, payload: pack(payload) });
      recorder.contactTimes.push({ controllerTimeAtEmissionMs: controller.simulationTimeMs });
      recorder.eventOrder.push({ order: recorder.eventOrder.length, tick: recorder.tick, type, sequence });
    } else if (type === 'plate-birth') {
      recorder.plates.push({ tick: recorder.tick, modelTimeMs: controller.simulationTimeMs, payload });
      recorder.eventOrder.push({ order: recorder.eventOrder.length, tick: recorder.tick, type,
        sequence: recorder.plates.length - 1 });
    } else if (type === 'sphere-birth') {
      recorder.nodules.push({ tick: recorder.tick, modelTimeMs: controller.simulationTimeMs, payload });
      recorder.eventOrder.push({ order: recorder.eventOrder.length, tick: recorder.tick, type,
        sequence: recorder.nodules.length - 1 });
    }
  });
  return recorder;
}

function materialUnion(controller) {
  const snapshot = controller.materialStratigraphy.getSnapshot();
  const union = Uint8Array.from(snapshot.stratigraphy.layerCountByCell, value => Number(value > 0));
  return { revision: snapshot.revision, width: snapshot.width, height: snapshot.height,
    plateIds: snapshot.plates.map(plate => plate.id),
    unionBase64: Buffer.from(union.buffer, union.byteOffset, union.byteLength).toString('base64') };
}

function topologyState(controller, tick, modelTimeMs, phase) {
  const state = controller.materialStratigraphy.getAudioState();
  return { tick, modelTimeMs, phase, state: pack({
    width: state.width, height: state.height, version: state.version, revision: state.revision,
    noduleRevision: state.noduleRevision, coordinateScaleMetersPerUnit: state.coordinateScaleMetersPerUnit,
    plates: state.plates, nodules: state.nodules, stratigraphy: {
      version: state.stratigraphy.version, revision: state.stratigraphy.revision,
      layerOrder: state.stratigraphy.layerOrder, topLayerByCell: state.stratigraphy.topLayerByCell,
      layerCountByCell: state.stratigraphy.layerCountByCell,
      totalDepthByCellMeters: state.stratigraphy.totalDepthByCellMeters
    }
  }) };
}

function deriveBirths(topologyStates, property, label) {
  const seen = new Set(), births = [];
  for (const row of topologyStates) for (const object of row.state[property]) {
    if (seen.has(object.id)) continue;
    seen.add(object.id);
    births.push({ tick: row.tick, modelTimeMs: row.modelTimeMs, [label]: object });
  }
  return births;
}

function stateHash(controller, rng) {
  const projection = {
    controller: {
      state: controller.state, simulationTimeMs: controller.simulationTimeMs,
      nextSpawnTimeMs: controller.nextSpawnTimeMs, totalSpawned: controller.totalSpawned,
      totalRetired: controller.totalRetired, nextAgentId: controller.nextAgentId,
      recruitmentLimit: controller.recruitmentLimit, initialized: controller.initialized,
      running: controller.running, destroyed: controller.destroyed,
      completedMovementSegments: controller.completedMovementSegments
    },
    rng: { calls: rng.calls, state: rng.state() },
    agents: controller.agents, field: controller.field, surfaceField: controller.surfaceField,
    trailPlateBirth: controller.trailPlateBirth, materialStratigraphy: controller.materialStratigraphy,
    gaitController: controller.gaitController, bodyPoseController: controller.bodyPoseController,
    gasterDeposition: controller.gasterDeposition, colonyActivation: controller.colonyActivation,
    occupancy: controller.occupancy
  };
  return sha256(Buffer.from(stable(projection)));
}

function serializable(value, stack = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (typeof value === 'bigint') return value.toString();
  if (ArrayBuffer.isView(value)) return { type: value.constructor.name, length: value.length ?? value.byteLength,
    sha256: sha256(Buffer.from(value.buffer, value.byteOffset, value.byteLength)) };
  if (value instanceof ArrayBuffer) return { type: 'ArrayBuffer', byteLength: value.byteLength,
    sha256: sha256(Buffer.from(value)) };
  if (stack.has(value)) return { cycle: value.constructor?.name || 'object' };
  stack.add(value);
  let output;
  if (Array.isArray(value)) output = value.map(child => serializable(child, stack) ?? null);
  else if (value instanceof Map) output = { type: 'Map', entries: [...value.entries()]
    .map(([key, child]) => [serializable(key, stack), serializable(child, stack)])
    .sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0]))) };
  else if (value instanceof Set) output = { type: 'Set', values: [...value].map(child => serializable(child, stack))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
  else output = Object.fromEntries(Object.keys(value).sort().flatMap(key => {
    if (key === 'listeners') return [];
    const child = serializable(value[key], stack);
    return child === undefined ? [] : [[key, child]];
  }));
  stack.delete(value);
  return output;
}

function pack(value) {
  if (ArrayBuffer.isView(value)) return { __typedArray: value.constructor.name,
    length: value.length, data: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64') };
  if (Array.isArray(value)) return value.map(pack);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== undefined).map(([key, child]) => [key, pack(child)]));
  return value;
}

function filterKnownSegmentsSelfcheck() {
  const previous = new Set(['ant-1', 'ant-3']);
  const rows = [
    { id: 'ant-1', dx: 0.001 }, { id: 'ant-2', dx: 0.001 }, { id: 'ant-3', dx: 0 }
  ];
  assert.deepEqual(filterKnownSegments(rows, previous), [rows[0], rows[2]], 'birth-step IDs without a prior pose are excluded');
}

function selfcheck() {
  filterKnownSegmentsSelfcheck();
  const rng = countedLcg(SEED);
  const values = [rng.random(), rng.random()];
  assert.deepEqual(values, [0.43773177452385426, 0.7180572913493961]);
  assert.equal(hashCanonical({ a: 1, b: [2, 3] }), hashCanonical({ b: [2, 3], a: 1 }));
}

async function hashSources() {
  const hashes = {};
  for (const path of SOURCES) hashes[path] = sha256(await readFile(resolve(ROOT, path)));
  return hashes;
}

async function writeManifest(output, names) {
  const entries = [];
  for (const name of [...new Set(names)].sort()) entries.push(`${sha256(await readFile(resolve(output, name)))}  ${name}`);
  await writeFile(resolve(output, 'MANIFEST.sha256'), entries.join('\n') + '\n');
}

function stable(value, indent = 0) {
  return JSON.stringify(serializable(value), null, indent);
}
function hashCanonical(value) { return sha256(Buffer.from(stable(value))); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function gzip(bytes) { return gzipSync(bytes, { level: 9, mtime: 0 }); }
