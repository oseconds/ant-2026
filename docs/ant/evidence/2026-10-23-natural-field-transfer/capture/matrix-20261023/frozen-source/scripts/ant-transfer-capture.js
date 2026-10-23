import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { AntController as ProductionAntController } from '../src/lib/agents/ant/AntController.js';
import {
  captureControllerState, cloneStateGraph, createSeededRandom, restoreControllerState,
  rngCheckpoint, serializeStateGraph
} from './ant-transfer-state.js';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const CONTROLLER_PATH = path.join(PROJECT_ROOT, 'src/lib/agents/ant/AntController.js');
export const ANT_MODEL_FILES = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js'
];
export const TRACE_TYPES = new Set([
  'intention-input', 'intention-updated', 'intention-no-choice', 'wide-options', 'intention-chosen',
  'local-turn', 'target-heading-base', 'target-turn', 'target-turn-applied',
  'desired-speed', 'accelerate-before', 'accelerate-after', 'collision-scales',
  'displacement', 'field-decay', 'field-deposit-write', 'gait-advance', 'foot-contact-write'
]);
export const HISTORY_TRACE_TYPES = new Set(['displacement', 'field-decay', 'field-deposit-write']);
const OMEGA_FEEDBACK = 'steeringAngularVelocity * LOCAL_TURN_DAMPING * agent.trailAdherence';
const MOVEMENT_MODES = new Set(['production', 'dtFeedback', 'dampingOff']);

function traceHelpers(movementMode) { return `
const transferTraceCallbacks = new WeakMap();
const transferEntryState = new WeakMap();
let transferTraceSequence = 0;
function traceTransfer(controller, event) {
    const entry = transferTraceCallbacks.get(controller);
    if (!entry || (entry.types && !entry.types.has(event.type))) return;
    const simulationTimeMs = controller.simulationTimeMs;
    let state = transferEntryState.get(controller);
    if (!state || state.simulationTimeMs !== simulationTimeMs) {
        state = { simulationTimeMs, entryAdherenceByAgent: new Map(), updatedAdherenceByAgent: new Map() };
        transferEntryState.set(controller, state);
    }
    if (event.type === 'intention-input') state.entryAdherenceByAgent.set(event.agentId, event.agent.trailAdherence);
    if (event.type === 'intention-updated') state.updatedAdherenceByAgent.set(event.agentId, event.updatedAdherence);
    const snapshot = encodeTraceNumbers(structuredClone(event));
    const entryAdherence = state.entryAdherenceByAgent.get(event.agentId);
    const updatedAdherence = state.updatedAdherenceByAgent.get(event.agentId);
    entry.callback({ sequence: transferTraceSequence++, simulationTimeMs,
        movementMode: '${movementMode}', ...(event.agentId === undefined ? {} : { entryAdherence }),
        ...(event.agentId === undefined || updatedAdherence === undefined ? {} : { updatedAdherence }), ...snapshot });
}
function encodeTraceNumbers(value) {
    if (typeof value === 'number') {
        if (Number.isNaN(value)) return { $antNumber: 'NaN' };
        if (value === Infinity) return { $antNumber: 'Infinity' };
        if (value === -Infinity) return { $antNumber: '-Infinity' };
        if (Object.is(value, -0)) return { $antNumber: '-0' };
        return value;
    }
    if (Array.isArray(value)) return value.map(encodeTraceNumbers);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
        .map(([key, child]) => [key, encodeTraceNumbers(child)]));
    return value;
}
export function watchTransferTrace(controller, callback, types = null) {
    if (typeof callback !== 'function') throw new TypeError('Trace callback must be a function.');
    transferTraceCallbacks.set(controller, { callback, types: types ? new Set(types) : null });
}
export function clearTransferTrace(controller) { transferTraceCallbacks.delete(controller); }
`; }

export function transformOmegaSource(source, movementMode = 'production') {
  if (!MOVEMENT_MODES.has(movementMode)) throw new RangeError(`Unsupported movement mode: ${movementMode}`);
  if (movementMode === 'production') return source;
  const replacement = movementMode === 'dtFeedback' ? `${OMEGA_FEEDBACK} * dt` : '0';
  const count = countOccurrences(source, OMEGA_FEEDBACK);
  if (count !== 1) throw new Error(`Expected exactly one production omega term, found ${count}.`);
  return source.replace(OMEGA_FEEDBACK, replacement);
}

export function instrumentControllerSource(source, sourcePath = CONTROLLER_PATH, movementMode = 'production') {
  if (!MOVEMENT_MODES.has(movementMode)) throw new RangeError(`Unsupported movement mode: ${movementMode}`);
  let instrumented = transformOmegaSource(source.replace(/\r\n/g, '\n'), movementMode);
  const feedbackExpression = movementMode === 'dampingOff'
    ? '0'
    : `-steeringAngularVelocity * LOCAL_TURN_DAMPING * agent.trailAdherence${movementMode === 'dtFeedback' ? ' * dt' : ''}`;
  const originalOmegaTerm = movementMode === 'dampingOff' ? '0'
    : `steeringAngularVelocity * LOCAL_TURN_DAMPING * agent.trailAdherence${movementMode === 'dtFeedback' ? ' * dt' : ''}`;
  const localTurnNeedle = `            const localTurn = clamp(\n`
    + `                localTrails[index].steering * (0.35 + 0.65 * agent.trailAdherence)\n`
    + `                - ${originalOmegaTerm},\n`
    + `                -LOCAL_STEERING_LIMIT,\n`
    + `                LOCAL_STEERING_LIMIT\n`
    + `            );`;
  const localTurnReplacement = `            const rawLocalCueU = localTrails[index].steering * (0.35 + 0.65 * agent.trailAdherence);\n`
    + `            const feedbackContributionV = ${feedbackExpression};\n`
    + `            const unclampedLocalTurn = rawLocalCueU + feedbackContributionV;\n`
    + `            const localTurn = clamp(\n`
    + `                unclampedLocalTurn,\n`
    + `                -LOCAL_STEERING_LIMIT,\n`
    + `                LOCAL_STEERING_LIMIT\n`
    + `            );\n`
    + `            traceTransfer(this, { type: 'local-turn', agentId: agent.id, rawLocalCueU,\n`
    + `                feedbackContributionV, unclampedLocalTurn, clampedLocalTurn: localTurn,\n`
    + `                updatedAdherence: agent.trailAdherence, previousOmega: agent.angularVelocity,\n`
    + `                clampedPreviousOmega: steeringAngularVelocity, dt });`;
  const insertions = [
    ['intention-input', '    updateIntention(agent, agents, occupancy, dt, localTrail = this.senseLocalTrail(agent)) {',
      "\n        traceTransfer(this, { type: 'intention-input', agentId: agent.id, dt, "
      + "occupancy: { frontCrowding: occupancy.frontCrowding }, localTrail, "
      + "agent: { x: agent.x, y: agent.y, heading: agent.heading, vx: agent.vx, vy: agent.vy, "
      + "intentHeading: agent.intentHeading, trailConfidence: agent.trailConfidence, "
      + "trailAdherence: agent.trailAdherence, decisionRemaining: agent.decisionRemaining, "
      + "committedRemaining: agent.committedRemaining, inspectionRemaining: agent.inspectionRemaining, "
      + "hesitationRemaining: agent.hesitationRemaining, wasBlocked: agent.wasBlocked }, rngCalls: this.random.calls });", 'after'],
    ['intention-updated', '        this.updateTrailAdherence(agent, localTrail, dt);',
      "\n        traceTransfer(this, { type: 'intention-updated', agentId: agent.id, dt, "
      + "updatedAdherence: agent.trailAdherence, trailConfidence: agent.trailConfidence, "
      + "decisionRemaining: agent.decisionRemaining, committedRemaining: agent.committedRemaining, "
      + "inspectionRemaining: agent.inspectionRemaining, hesitationRemaining: agent.hesitationRemaining, "
      + "wasBlocked: agent.wasBlocked, rngCalls: this.random.calls });", 'after'],
    ['wide-options', '        const chosen = this.random() < exploration',
      "        traceTransfer(this, { type: 'wide-options', agentId: agent.id, dt, confidence, exploration, "
      + "trailConfidence: agent.trailConfidence, trailAdherence: agent.trailAdherence, "
      + "decisionRemaining: agent.decisionRemaining, committedRemaining: agent.committedRemaining, "
      + "options: options.map(({ heading, offset, trail, crowding, score }) => ({ heading, offset, trail, crowding, score })), "
      + "rngCallsBeforeChoice: this.random.calls });\n"],
    ['intention-chosen', '        agent.intentHeading = chosen.heading;',
      "        traceTransfer(this, { type: 'intention-chosen', agentId: agent.id, chosenHeading: chosen.heading, "
      + "chosenOffset: chosen.offset, chosenTrail: chosen.trail, chosenCrowding: chosen.crowding, "
      + "chosenScore: chosen.score, decisionRemaining: agent.decisionRemaining, "
      + "committedRemaining: agent.committedRemaining, intentHeading: agent.intentHeading, "
      + "rngCallsAfterChoice: this.random.calls });\n"],
    ['intention-no-choice', '        if (agent.decisionRemaining > 0 && agent.committedRemaining > 0 && !newlyBlocked) return;',
      "        if (agent.decisionRemaining > 0 && agent.committedRemaining > 0 && !newlyBlocked) {\n"
      + "            traceTransfer(this, { type: 'intention-no-choice', agentId: agent.id, dt, blocked, newlyBlocked, "
      + "decisionRemaining: agent.decisionRemaining, committedRemaining: agent.committedRemaining, "
      + "inspectionRemaining: agent.inspectionRemaining, hesitationRemaining: agent.hesitationRemaining, "
      + "wasBlocked: agent.wasBlocked, rngCalls: this.random.calls });\n            return;\n        }"],
    ['local-turn', localTurnNeedle, localTurnReplacement, 'replace'],
    ['target-heading-base', '                + localTurn;',
      "                + localTurn;\n            traceTransfer(this, { type: 'target-heading-base', agentId: agent.id, "
      + "rawLocalCueU, feedbackContributionV, unclampedLocalTurn, clampedLocalTurn: localTurn, "
      + "updatedAdherence: agent.trailAdherence, previousOmega: agent.angularVelocity, "
      + "clampedPreviousOmega: steeringAngularVelocity, localTrail: localTrails[index], "
      + "targetHeadingBeforeCrowding: targetHeading });", 'after'],
    ['target-turn-before', '            agent.turnToward(targetHeading, dt);',
      "            traceTransfer(this, { type: 'target-turn', agentId: agent.id, headingBeforeTurn: agent.heading, "
      + "intentHeading: agent.intentHeading, localTurn, targetHeadingAfterCrowding: targetHeading, dt, "
      + "angularVelocityBeforeTurn: agent.angularVelocity, updatedAdherence: agent.trailAdherence, "
      + "occupancy: { separationX: info.separationX, separationY: info.separationY, "
      + "frontCrowding: info.frontCrowding, leftCrowding: info.leftCrowding, "
      + "rightCrowding: info.rightCrowding, followingSpeedLimit: info.followingSpeedLimit }, "
      + "separationCrowdBranch: separationMagnitude > 0.03, "
      + "frontCrowdBranch: info.frontCrowding > 0.12 && Math.abs(info.leftCrowding - info.rightCrowding) > 0.02 });\n"],
    ['target-turn-after', '            agent.turnToward(targetHeading, dt);',
      "\n            traceTransfer(this, { type: 'target-turn-applied', agentId: agent.id, "
      + "headingAfterTurn: agent.heading, currentOmega: agent.angularVelocity, dt });", 'after'],
    ['desired-speed', '            agent.targetSpeed = desiredSpeed;',
      "            traceTransfer(this, { type: 'desired-speed', agentId: agent.id, desiredSpeed, "
      + "speedPhase: agent.speedPhase, hesitationRemaining: agent.hesitationRemaining, dt, "
      + "separationMagnitude, occupancy: { frontCrowding: info.frontCrowding, "
      + "followingSpeedLimit: info.followingSpeedLimit }, localTrail: localTrails[index], "
      + "personality: { preferredSpeed: agent.personality.preferredSpeed } });\n"],
    ['accelerate-before', '            agent.accelerateToward(desiredSpeed, dt);',
      "            traceTransfer(this, { type: 'accelerate-before', agentId: agent.id, desiredSpeed, "
      + "targetSpeed: agent.targetSpeed, vx: agent.vx, vy: agent.vy, dt });\n"],
    ['accelerate-after', '            agent.vx += info.separationX * SEPARATION_ACCELERATION * dt;',
      "            traceTransfer(this, { type: 'accelerate-after', agentId: agent.id, vx: agent.vx, vy: agent.vy, "
      + "targetSpeed: agent.targetSpeed, angularVelocity: agent.angularVelocity });\n"],
    ['collision-scales', '        const collisionScales = this.occupancy.constrainDisplacements(current, displacements);',
      "\n        traceTransfer(this, { type: 'collision-scales', dt, displacements: current.map((agent, index) => ({ "
      + "agentId: agent.id, x: displacements[index].x, y: displacements[index].y, "
      + "depositionMultiplier: displacements[index].depositionMultiplier, scale: collisionScales[index] })) });", 'after'],
    ['displacement', '            const travelled = Math.hypot(to.x - from.x, to.y - from.y);',
      "\n            traceTransfer(this, { type: 'displacement', agentId: agent.id, from, "
      + "to: { x: agent.x, y: agent.y }, observedTo: to, travelled, scale, dt, "
      + "heading: agent.heading, angularVelocity: agent.angularVelocity, vx: agent.vx, vy: agent.vy, exiting });", 'after'],
    ['field-decay', '        this.field.decay(dt);',
      "\n        traceTransfer(this, { type: 'field-decay', dt });", 'after'],
    ['field-deposit-write', "            if (deposit.type === 'point') this.field?.depositPoint(deposit.position, { amount: deposit.amount, radius });\n            else this.field?.depositSegment(deposit.from, deposit.to, {\n                amountPerUnitDistance: deposit.amountPerUnitDistance, radius\n            });",
      "            const returnedDose = deposit.type === 'point'\n"
      + "                ? this.field?.depositPoint(deposit.position, { amount: deposit.amount, radius })\n"
      + "                : this.field?.depositSegment(deposit.from, deposit.to, {\n"
      + "                    amountPerUnitDistance: deposit.amountPerUnitDistance, radius\n"
      + "                });\n"
      + "            traceTransfer(this, { type: 'field-deposit-write', deposit, radius, returnedDose });", 'replace'],
    ['gait-advance', '            const contacts = this.gaitController.advance(observedAgent, travelled, dt,\n                this.simulationTimeMs + dt * 1000, { from, to });',
      "\n            traceTransfer(this, { type: 'gait-advance', agentId: agent.id, travelled, dt, from, to, contacts });", 'after'],
    ['foot-contact-write', '                this.materialStratigraphy.applyFootContact(event, this.surfaceField);',
      "\n                traceTransfer(this, { type: 'foot-contact-write', agentId: agent.id, event, responses });", 'after']
  ];
  const applied = [];
  for (const [name, needle, insertion, position = 'before'] of insertions) {
    const count = countOccurrences(instrumented, needle);
    if (count !== 1) throw new Error(`Trace injection ${name} expected one source anchor, found ${count}.`);
    instrumented = instrumented.replace(needle, position === 'after' ? `${needle}${insertion}`
      : position === 'replace' ? insertion : `${insertion}${needle}`);
    applied.push(name);
  }
  const importCount = [...instrumented.matchAll(/from\s+(['"])(\.[^'"]+)\1/g)].length;
  instrumented = instrumented.replace(/from\s+(['"])(\.[^'"]+)\1/g, (_match, quote, specifier) => {
    const resolved = pathToFileURL(path.resolve(path.dirname(sourcePath), specifier)).href;
    return `from ${quote}${resolved}${quote}`;
  });
  if (importCount < 1) throw new Error('Expected relative production imports in AntController source.');
  return { source: traceHelpers(movementMode) + instrumented,
    insertions: applied, importCount };
}

export async function loadInstrumentedAntController({ movementMode = 'production' } = {}) {
  const sourceBytes = await readFile(CONTROLLER_PATH);
  const sourceHash = sha256(sourceBytes);
  const transformed = instrumentControllerSource(sourceBytes.toString('utf8'), CONTROLLER_PATH, movementMode);
  const url = `data:text/javascript;base64,${Buffer.from(transformed.source).toString('base64')}`;
  const module = await import(url);
  return { ...module, movementMode, sourceBytes, transformedSource: transformed.source,
    sourceHash, transformedHash: sha256(transformed.source),
    insertions: transformed.insertions, importCount: transformed.importCount };
}

export async function loadPlainAntController(movementMode = 'production') {
  if (!MOVEMENT_MODES.has(movementMode)) throw new RangeError(`Unsupported movement mode: ${movementMode}`);
  const sourceBytes = await readFile(CONTROLLER_PATH);
  const source = sourceBytes.toString('utf8').replace(/\r\n/g, '\n');
  const variant = transformOmegaSource(source, movementMode);
  const absoluteImports = variant.replace(/from\s+(['"])(\.[^'"]+)\1/g, (_match, quote, specifier) => {
    const resolved = pathToFileURL(path.resolve(path.dirname(CONTROLLER_PATH), specifier)).href;
    return `from ${quote}${resolved}${quote}`;
  });
  const module = movementMode === 'production'
    ? { AntController: ProductionAntController }
    : await import(`data:text/javascript;base64,${Buffer.from(absoluteImports).toString('base64')}`);
  return { ...module, movementMode, sourceBytes, transformedSource: absoluteImports,
    sourceHash: sha256(sourceBytes), transformedHash: sha256(absoluteImports) };
}

export async function runTransferPilot({ seed = 20261005, sampleSeconds = 180,
  dtSeconds = 1 / 60, outputPath = null } = {}) {
  const sampleTick = Math.round(sampleSeconds / dtSeconds);
  if (!(sampleSeconds > 1) || !Number.isInteger(sampleTick) || sampleTick < 61) {
    throw new RangeError('Pilot time must contain at least 61 fixed ticks.');
  }
  const warmupTicks = sampleTick - 60;
  const instrumented = await loadInstrumentedAntController();
  const extraTypes = [{ Type: instrumented.AntController, id: 'InstrumentedAntController' }];
  const production = new ProductionAntController({ random: createSeededRandom(seed) });
  const observed = new instrumented.AntController({ random: createSeededRandom(seed) });
  await Promise.all([production.init(), observed.init()]);
  runTicks(production, warmupTicks, dtSeconds);
  runTicks(observed, warmupTicks, dtSeconds);

  const historyStartTimeMs = observed.simulationTimeMs;
  const fieldWindowStart = cloneStateGraph(observed.field);
  const recentTrace = [];
  instrumented.watchTransferTrace(observed, event => recentTrace.push(event), HISTORY_TRACE_TYPES);
  runTicks(production, 60, dtSeconds);
  runTicks(observed, 60, dtSeconds);
  instrumented.clearTransferTrace(observed);

  const productionBefore = captureControllerState(production);
  const observedBefore = captureControllerState(observed, { extraTypes });
  const sampleTimeBeforeTickMs = observed.simulationTimeMs;
  const rngBeforeTick = rngCheckpoint(observed.random);
  const material = observed.materialStratigraphy;
  const plateAliasCount = material.plates.filter(plate => material.plateById.get(plate.id) === plate).length;
  assert.ok(material.plates.length > 0,
    `Pilot at ${sampleSeconds}s must include at least one TrailPlate to exercise material state.`);
  assert.equal(plateAliasCount, material.plates.length,
    'every material plate array entry must alias its plateById map value');
  assertCapturesEqual(productionBefore, observedBefore, extraTypes);
  const replay = restoreControllerState(observedBefore, { extraTypes });
  const sampleTrace = [];
  instrumented.watchTransferTrace(observed, event => sampleTrace.push(event), TRACE_TYPES);
  production.tick(dtSeconds);
  observed.tick(dtSeconds);
  instrumented.clearTransferTrace(observed);
  replay.tick(dtSeconds);

  const productionAfter = captureControllerState(production);
  const observedAfter = captureControllerState(observed, { extraTypes });
  const replayAfter = captureControllerState(replay, { extraTypes });
  assertCapturesEqual(productionAfter, observedAfter, extraTypes);
  assert.deepEqual(replayAfter, observedAfter, 'restored instrumented controller diverged after one tick');
  assert.deepEqual(replay.getSnapshot(), observed.getSnapshot(), 'public snapshots differ after one tick');
  assert.deepEqual(captureControllerState(replay, { extraTypes}), captureControllerState(observed, { extraTypes}),
    'snapshot reads changed replay state differently');

  const reconstructionEvents = [...recentTrace, ...sampleTrace]
    .filter(event => event.type === 'field-decay' || event.type === 'field-deposit-write')
    .sort((a, b) => a.sequence - b.sequence);
  const reconstructedField = cloneStateGraph(fieldWindowStart);
  replayFieldWrites(reconstructedField, reconstructionEvents);
  assert.deepEqual(reconstructedField.values, observed.field.values,
    'recorded field decay and write sequence did not reconstruct the production raster');

  const files = await Promise.all(ANT_MODEL_FILES.map(async relative => [relative,
    sha256(await readFile(path.join(PROJECT_ROOT, relative)))]));
  const receipt = {
    schema: 'ant-natural-field-transfer-pilot/v2',
    contentEncoding: 'gzip',
    scope: 'one seeded natural production trajectory; frozen pre-tick exact replay; no causal ranking or adoption',
    interpretationLimit: 'same-state replay estimates one-step read-side influence; this pilot does not estimate total field-representation contribution across divergent histories',
    provenance: {
      gitHead: await readGitHead(),
      seed: seed >>> 0,
      sampleSecondsRequested: sampleSeconds,
      sampleTick,
      sampleTimeBeforeTickMs,
      dtSeconds,
      historyTicks: 60,
      plateCount: material.plates.length,
      plateMapAliasCount: plateAliasCount,
      materialCellCount: material.cellCount,
      rngBeforeTick,
      sourceHashes: Object.fromEntries(files),
      antControllerSourceSha256: instrumented.sourceHash,
      instrumentedControllerSha256: instrumented.transformedHash,
      traceInsertions: instrumented.insertions
    },
    frozenInput: observedBefore,
    previousSecond: {
      startTimeMs: historyStartTimeMs,
      startField: serializeStateGraph(fieldWindowStart),
      trace: recentTrace
    },
    oneTick: {
      trace: sampleTrace,
      productionVsInstrumentedStateSha256: hash(canonicalCapture(productionAfter, extraTypes)),
      instrumentedVsRestoredStateSha256: hash(observedAfter),
      publicSnapshotEqual: true,
      fieldWriteReconstruction: 'bit-exact Uint8 bytes / typed-array equality',
      fieldWriteCount: reconstructionEvents.filter(event => event.type === 'field-deposit-write').length,
      decayCount: reconstructionEvents.filter(event => event.type === 'field-decay').length,
      displacementCount: [...recentTrace, ...sampleTrace].filter(event => event.type === 'displacement').length,
      endingPopulation: observed.agents.length,
      traceEventCounts: countByType([...recentTrace, ...sampleTrace]),
      endingPheromoneMass: observed.field.getSnapshot().totalMass,
      endingFootContacts: observed.surfaceField.totalFootContacts
    },
    artifactStats: {
      frozenGraphNodes: observedBefore.graph.nodes.length,
      frozenGraphJsonBytes: Buffer.byteLength(JSON.stringify(observedBefore.graph)),
      startFieldValueBytes: fieldWindowStart.values.byteLength
    }
  };

  if (outputPath) {
    const resolvedOutput = path.resolve(PROJECT_ROOT, outputPath);
    await mkdir(path.dirname(resolvedOutput), { recursive: true });
    const json = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
    const compressed = gzipSync(json, { level: 9 });
    await writeFile(resolvedOutput, compressed, { flag: 'wx' });
    receipt.outputPath = path.relative(PROJECT_ROOT, resolvedOutput).replaceAll(path.sep, '/');
    receipt.outputSha256 = sha256(compressed);
    receipt.outputBytes = compressed.byteLength;
    receipt.uncompressedBytes = json.byteLength;
  }
  await Promise.all([production.destroy(), observed.destroy(), replay.destroy()]);
  return receipt;
}

function runTicks(controller, count, dtSeconds) {
  for (let index = 0; index < count; index += 1) controller.tick(dtSeconds);
}

export function replayFieldWrites(field, events) {
  for (const event of events) {
    if (event.type === 'field-decay') field.decay(event.dt);
    else if (event.type === 'field-deposit-write') {
      const { deposit, radius } = event;
      if (deposit.type === 'point') field.depositPoint(deposit.position, { amount: deposit.amount, radius });
      else field.depositSegment(deposit.from, deposit.to, { amountPerUnitDistance: deposit.amountPerUnitDistance, radius });
    }
  }
}

function countByType(events) {
  return Object.fromEntries([...events.reduce((counts, event) => {
    counts.set(event.type, (counts.get(event.type) || 0) + 1);
    return counts;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export async function readGitHead() {
  let gitDirectory = path.join(PROJECT_ROOT, '.git');
  try {
    const marker = (await readFile(gitDirectory, 'utf8')).trim();
    const match = marker.match(/^gitdir:\s*(.+)$/i);
    if (match) gitDirectory = path.resolve(PROJECT_ROOT, match[1]);
  } catch { /* A normal checkout has a .git directory rather than a gitdir marker file. */ }
  const commonDirectoryPath = path.join(gitDirectory, 'commondir');
  let commonDirectory = gitDirectory;
  try { commonDirectory = path.resolve(gitDirectory, (await readFile(commonDirectoryPath, 'utf8')).trim()); }
  catch { /* A normal checkout stores refs directly under .git. */ }
  const head = (await readFile(path.join(gitDirectory, 'HEAD'), 'utf8')).trim();
  if (/^[0-9a-f]{40}$/i.test(head)) return head.toLowerCase();
  const ref = head.match(/^ref:\s*(.+)$/i)?.[1];
  if (!ref) throw new Error('Unable to resolve .git/HEAD for capture provenance.');
  for (const directory of new Set([gitDirectory, commonDirectory])) {
    try { return (await readFile(path.join(directory, ref), 'utf8')).trim(); }
    catch { /* The ref may be packed or live in the common Git directory. */ }
    try {
      const packed = await readFile(path.join(directory, 'packed-refs'), 'utf8');
      const line = packed.split(/\r?\n/).find(candidate => candidate.endsWith(` ${ref}`));
      if (line) return line.slice(0, line.indexOf(' '));
    } catch { /* Try the next ref directory. */ }
  }
  throw new Error(`Unable to resolve Git reference ${ref} for capture provenance.`);
}

export function assertCapturesEqual(left, right, extraTypes = []) {
  assert.deepEqual(canonicalCapture(left, extraTypes), canonicalCapture(right, extraTypes));
}

export function canonicalCapture(capture) {
  const copy = structuredClone(capture);
  for (const node of copy.graph.nodes) {
    if (['InstrumentedAntController', 'VariantAntController'].includes(node.prototype)) node.prototype = 'AntController';
  }
  return copy;
}

function countOccurrences(source, needle) {
  let count = 0, offset = 0;
  while ((offset = source.indexOf(needle, offset)) !== -1) { count += 1; offset += needle.length; }
  return count;
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function hash(value) { return sha256(JSON.stringify(value)); }

const DEFAULT_OUTPUT = 'docs/ant/evidence/2026-10-23-natural-field-transfer/capture/pilot-seed-20261005-180s-v2.json.gz';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputPath = process.argv[2] || DEFAULT_OUTPUT;
  const seed = Number(process.argv[3] || 20261005);
  const sampleSeconds = Number(process.argv[4] || 180);
  runTransferPilot({ seed, sampleSeconds, outputPath }).then(receipt => {
    process.stdout.write(`transfer pilot: ${receipt.outputPath} (${receipt.outputSha256})\n`);
    process.stdout.write(`exact production/instrumented/replay parity; ${receipt.oneTick.fieldWriteCount} field writes, `
      + `${receipt.oneTick.displacementCount} displacement records\n`);
  }).catch(error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
