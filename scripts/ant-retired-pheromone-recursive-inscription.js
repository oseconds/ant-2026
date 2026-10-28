import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { auditState, countedLcg, forkController } from './ant-material-causal-tail.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASE = resolve(ROOT, 'docs/ant/evidence/2026-10-28-retired-pheromone-recursive-inscription');
const DATA = resolve(BASE, 'data');
const PRIOR = '58382d4075a170b4ca1c63cbd75f0b196067a13b';
const MAIN = '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785';
const SEED = 20261005;
const DT = 1 / 60;
const TARGET_TICK = 555;
const PREFIX_TICKS = TARGET_TICK - 1;
const TARGET_ID = 'ant-1';
const TOLERANCES = { sensor: 1e-8, coordinate: 1e-12, state: 1e-12 };
const MOTOR_FLOORS = { position: 1e-8, velocity: 1e-7, heading: 1e-6,
  angularVelocity: 6e-5, displacement: 1e-8 };
const SHAM_CEILINGS = { position: 1e-8, velocity: 1e-7, heading: 1e-6, angularVelocity: 6e-5 };
const SOURCE_PATHS = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/LocalOccupancy.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'src/lib/agents/ant/ColonyActivation.js', 'scripts/ant-material-causal-tail.js',
  'scripts/ant-retired-pheromone-recursive-inscription.js'];
const casePath = 'docs/ant/evidence/2026-10-28-causal-memory-responsibilities/data/';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

export function selectEarliestChangedChoice(items) {
  const eligible = items.filter(item => item.fullOption !== item.noRetiredOption);
  assert.ok(eligible.length, 'no changed-choice cases');
  return [...eligible].sort((a, b) => a.timestamp - b.timestamp
    || numericAntId(a.antId) - numericAntId(b.antId))[0];
}

export function residualFreeRead(read) {
  assert.ok(read.self >= 0 && read.aliveOther >= 0 && read.retired >= 0,
    'author contributions must be non-negative');
  const fullAuthorSum = read.self + read.aliveOther + read.retired;
  const noRetired = fullAuthorSum - read.retired;
  assert.ok(Number.isFinite(fullAuthorSum) && Number.isFinite(noRetired));
  return { fullAuthorSum, noRetired };
}

async function main() {
  if (process.argv.includes('--prepare-target')) return prepareTarget();
  if (process.argv.includes('--inspect-target')) return inspectTarget(true);
  if (process.argv.includes('--analyze')) return analyze();
  if (process.argv.includes('--check')) return check();
  throw new Error('Use --prepare-target, --inspect-target, --analyze, or --check.');
}

async function prepareTarget() {
  const readPrior = path => execFileSync('git', ['show', `${PRIOR}:${casePath}${path}`],
    { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  const packetBytes = readPrior('frozen-cases.json.gz');
  const receipt = parseJson(readPrior('capture.json'));
  assert.equal(sha(packetBytes), receipt.packetSha256, 'prior packet checksum');
  const packet = parseJson(gunzipSync(packetBytes));
  const validityBytes = readPrior('residual-validity.json');
  const validity = parseJson(validityBytes);
  const wideCases = packet.cases.map((item, packetCaseIndex) => ({ item, packetCaseIndex }))
    .filter(row => row.item.wideCase);
  assert.equal(wideCases.length, validity.wide.cases);
  assert.equal(wideCases.length, 1507);
  const originalChanged = [], cleanChanged = [], candidates = [];
  for (let wideChoiceIndex = 0; wideChoiceIndex < wideCases.length; wideChoiceIndex += 1) {
    const { item, packetCaseIndex } = wideCases[wideChoiceIndex];
    const row = validity.wideCases[wideChoiceIndex];
    const originalChangedChoice = row.original.full !== row.original.removeRetired;
    const cleanChangedChoice = row.clean.full !== row.clean.removeRetired;
    if (originalChangedChoice) originalChanged.push(wideChoiceIndex);
    if (cleanChangedChoice) cleanChanged.push(wideChoiceIndex);
    if (cleanChangedChoice) candidates.push({ timestamp: item.fieldTimeSeconds, antId: item.before.id,
      fullOption: row.clean.full, noRetiredOption: row.clean.removeRetired, packetCaseIndex,
      wideChoiceIndex, item, row });
  }
  assert.deepEqual(cleanChanged, originalChanged, 'prior residual-free and original changed-choice indices');
  assert.equal(cleanChanged.length, 284);
  assert.equal(validity.wide.originalVersusResidualFreeRemovalChoiceChanged, 0);
  const selected = selectEarliestChangedChoice(candidates);
  assert.equal(selected.antId, TARGET_ID);
  assert.equal(selected.packetCaseIndex, 120);
  assert.equal(selected.wideChoiceIndex, 62);
  assert.equal(selected.item.tick, TARGET_TICK);
  assert.equal(selected.fullOption, 2);
  assert.equal(selected.noRetiredOption, 1);
  const input = {
    schema: 'ant-retired-pheromone-recursive-target-v1',
    source: { commit: PRIOR, evidence: `docs/ant/evidence/2026-10-28-causal-memory-responsibilities/`,
      packetSha256: receipt.packetSha256, residualValiditySha256: sha(validityBytes),
      summarySha256: sha(readPrior('decision-summary.json')) },
    selection: { population: 284, sourceWideChoices: 1507,
      rule: 'earliest model timestamp among residual-free Fhat/Rhat option changes; numeric ant ID tie-break',
      packetCaseIndex: selected.packetCaseIndex, wideChoiceIndex: selected.wideChoiceIndex,
      timestamp: selected.timestamp, antId: selected.antId,
      FhatOptionIndex: selected.fullOption, RhatOptionIndex: selected.noRetiredOption,
      residualFreeIndicesEqualOriginalRemovalIndices: true },
    frozenCase: selected.item
  };
  await mkdir(DATA, { recursive: true });
  const path = resolve(DATA, 'target-input.json');
  await writeFile(path, json(input), { flag: 'wx' });
  console.log(JSON.stringify({ selection: input.selection, targetInputSha256: sha(await readFile(path)) }, null, 2));
}

async function inspectTarget(write) {
  const input = await loadTarget();
  const natural = await replayPrefix();
  try {
    const item = input.frozenCase;
    const ant = natural.agents.find(value => value.id === TARGET_ID);
    assert.ok(ant, 'target active at tick entry');
    assert.equal(natural.simulationTimeMs, item.modelTimeBeforeUpdateMs);
    assert.deepEqual(projectAgent(ant, item.before), item.before, 'frozen target tick-entry state');
    const info = natural.occupancy.sense(ant, natural.agents);
    assert.equal(info.frontCrowding, item.info.frontCrowding, 'frozen consumer-visible occupancy input');
    const crowding = item.wide.map(profile => ({ heading: profile.heading,
      value: natural.occupancy.crowdingInDirection(ant, natural.agents, profile.heading,
        natural.state.behavior.sensorDistance * 1.45) }));
    assert.deepEqual(crowding, item.crowding, 'five candidate crowding values');
    const probeRandom = countedLcg(natural.random.state(), natural.random.calls);
    const randomTape = Array.from({ length: item.randomTape.length }, () => probeRandom());
    assert.deepEqual(randomTape, item.randomTape, 'next target random tape');
    const sensor = forkController(natural);
    sensor.field.decay(DT);
    const sensorAnt = sensor.agents.find(value => value.id === TARGET_ID);
    const local = sensor.senseLocalTrail(sensorAnt);
    assert.deepEqual(local, item.local, 'actual full local profile after production decay');
    const reads = [];
    const sample = sensor.field.sample;
    sensor.field.sample = function (x, y) {
      const value = sample.call(this, x, y);
      reads.push({ x, y, value });
      return value;
    };
    const profiles = item.wide.map((profile, profileIndex) => {
      const start = reads.length;
      const signal = sensor.senseTrail(sensorAnt, profile.heading);
      const actual = reads.slice(start);
      const expected = profile.reads.filter(validRead);
      assert.equal(actual.length, expected.length, `sensor read count for heading ${profileIndex}`);
      for (let i = 0; i < expected.length; i += 1) {
        assert.ok(Math.abs(actual[i].x - expected[i].x) <= TOLERANCES.coordinate);
        assert.ok(Math.abs(actual[i].y - expected[i].y) <= TOLERANCES.coordinate);
        assert.ok(Math.abs(actual[i].value - expected[i].full) <= TOLERANCES.sensor,
          `production sensor value mismatch at ${profileIndex}:${i}`);
      }
      assert.ok(Math.abs(signal - profile.fullSignal) <= TOLERANCES.sensor,
        `production signal mismatch at heading ${profileIndex}`);
      return { heading: profile.heading, reads: actual, signal };
    });
    const gait = natural.gaitController.ants.get(TARGET_ID);
    const deposition = natural.gasterDeposition.ants.get(TARGET_ID);
    assert.ok(gait && deposition, 'target gait and dab accumulators exist at the preregistered tick');
    const nextHalfBoundary = (Math.floor(gait.phase * 2) + 1) / 2;
    const result = {
      schema: 'ant-retired-pheromone-recursive-precondition-v1',
      source: { main: MAIN, sourceHashes: await sourceHashes() },
      replay: { seed: SEED, hz: 60, prefixTicks: PREFIX_TICKS, tickEntry: TARGET_TICK,
        modelTimeMs: natural.simulationTimeMs, audio: 'Off; no audio bridge',
        prefixStateSha256: hash(stable(auditState(natural))), rng: rng(natural) },
      target: { id: TARGET_ID, before: projectAgent(ant, item.before), info, local,
        wideProfiles: profiles, crowding, randomTape,
        gait: { ...gait, nextHalfBoundary,
          distanceToNextBoundary: (nextHalfBoundary - gait.phase) * gait.strideCycleLength },
        deposition: { ...deposition, mode: natural.gasterDeposition.mode,
          spacing: natural.gasterDeposition.spacing,
          distanceToNextDab: natural.gasterDeposition.spacing - deposition.distance } }
    };
    assert.deepEqual(rng(natural), result.replay.rng, 'precondition observer did not use RNG');
    if (write) {
      const path = resolve(DATA, 'precondition.json');
      await writeFile(path, json(result));
      await writeFile(resolve(DATA, 'precondition-validation.json'), json({ deterministic: true,
        targetAndSensorParity: true, noConditionForkRan: true,
        preconditionSha256: sha(await readFile(path)), runnerSha256: await hashFile(fileURLToPath(import.meta.url)) }));
    }
    return result;
  } finally { await natural.destroy(); }
}

async function analyze() {
  await assertProductionUnchanged();
  const targetInputPath = resolve(DATA, 'target-input.json');
  const targetInputBytes = await readFile(targetInputPath);
  const targetInputSha256 = sha(targetInputBytes);
  const input = parseJson(targetInputBytes);
  const preconditionPath = resolve(DATA, 'precondition.json');
  const recordedPrecondition = parseJson(await readFile(preconditionPath));
  const preconditionSha256 = await hashFile(preconditionPath);
  const currentPrecondition = await inspectTarget(false);
  assert.equal(json(currentPrecondition), json(recordedPrecondition), 'target precondition receipt');
  const first = await runAnalysis(input);
  const second = await runAnalysis(input);
  assert.equal(json(first), json(second), 'duplicate frozen replay result');
  const targetInputUnchanged = sha(await readFile(targetInputPath)) === targetInputSha256;
  assert.equal(targetInputUnchanged, true, 'target input changed during replay');
  const resultPath = resolve(DATA, 'results.json');
  await writeFile(resultPath, json(first), { flag: 'wx' });
  await writeFile(resolve(DATA, 'analysis-validation.json'), json({ deterministicDuplicate: true,
    targetInputUnchanged, targetInputSha256, preconditionSha256, productionSourceUnchanged: true,
    completeWorldAndRngParity: first.validity.completeWorldAndRngParity,
    observerOnOffParity: first.validity.observerOnOffParity,
    exactChangedChoiceReproduced: first.validity.exactChangedChoiceReproduced,
    conditionalContinuationRan: first.continuation.ran,
    resultSha256: sha(await readFile(resultPath)), runnerSha256: await hashFile(fileURLToPath(import.meta.url)) }));
  console.log(JSON.stringify({ status: first.status, selection: first.selection, validity: first.validity,
    oneTick: { selected: first.oneTick.selected, sham: first.oneTick.numericShamFToFhat,
      primary: first.oneTick.primaryFhatToRhat, thresholds: first.oneTick.motorThresholds },
    continuation: { summary: first.continuation.summary, firstInscription: first.continuation.firstInscription,
      firstDivergence: first.continuation.firstDivergence } }, null, 2));
}

async function check() {
  const result = parseJson(await readFile(resolve(DATA, 'results.json')));
  const validation = parseJson(await readFile(resolve(DATA, 'analysis-validation.json')));
  assert.equal(sha(await readFile(resolve(DATA, 'results.json'))), validation.resultSha256);
  assert.equal(validation.targetInputUnchanged, true);
  assert.equal(await hashFile(resolve(DATA, 'target-input.json')), validation.targetInputSha256);
  assert.equal(await hashFile(resolve(DATA, 'precondition.json')), validation.preconditionSha256);
  assert.deepEqual(await hashFiles(SOURCE_PATHS), result.sourceHashes);
  console.log(JSON.stringify({ status: result.status, hashes: 'match', selection: result.selection }, null, 2));
}

async function runAnalysis(input) {
  const prefix = await replayPrefix();
  try {
    const naturalState = auditState(prefix);
    const arms = Object.fromEntries(['plain', 'F', 'Fhat', 'Rhat'].map(name => [name, forkController(prefix)]));
    for (const arm of Object.values(arms)) assert.ok(isDeepStrictEqual(naturalState, auditState(arm)));
    const rows = { plain: plainStep(arms.plain, input.frozenCase.before.id) };
    for (const name of ['F', 'Fhat', 'Rhat']) rows[name] = stepArm(arms[name], name, input.frozenCase, 0);
    const sham = compareMotor(rows.F, rows.Fhat);
    const motor = compareMotor(rows.Fhat, rows.Rhat);
    const sameWorld = isDeepStrictEqual(auditState(arms.F), auditState(arms.plain));
    const sameEvents = isDeepStrictEqual(rows.F.events, rows.plain.events);
    const sameRng = isDeepStrictEqual(rows.F.rngAfter, rows.plain.rngAfter);
    const targetTapeMatches = isDeepStrictEqual(rows.F.targetRandomTape, input.frozenCase.randomTape)
      && isDeepStrictEqual(rows.Fhat.targetRandomTape, rows.F.targetRandomTape)
      && isDeepStrictEqual(rows.Rhat.targetRandomTape, rows.F.targetRandomTape);
    const primaryRngAligned = isDeepStrictEqual(rows.Fhat.rngAfter, rows.Rhat.rngAfter);
    const inputFieldParity = rows.F.targetFieldBeforeSenseSha256 === rows.Fhat.targetFieldBeforeSenseSha256
      && rows.Fhat.targetFieldBeforeSenseSha256 === rows.Rhat.targetFieldBeforeSenseSha256;
    const surfaceInputParity = rows.F.surfaceWrite.postRelaxFieldSha256 === rows.Fhat.surfaceWrite.postRelaxFieldSha256
      && rows.Fhat.surfaceWrite.postRelaxFieldSha256 === rows.Rhat.surfaceWrite.postRelaxFieldSha256;
    const surfaceWritesValid = ['F', 'Fhat', 'Rhat'].every(key => {
      const row = rows[key], write = row.surfaceWrite;
      return write.contactCountDelta === write.eventContactPointCount
        && write.targetContactPointCount === row.focalContacts.reduce((sum, event) => sum + event.contacts.length, 0)
        && write.targetContactWrites.length === row.focalContacts.length
        && row.focalContacts.every((event, index) => write.targetContactWrites[index].contactPointCount
          === event.contacts.length && write.targetContactWrites[index].changedNodeCount > 0);
    });
    const targetBeforeMatches = ['F', 'Fhat', 'Rhat'].every(key =>
      isDeepStrictEqual(rows[key].targetBefore, input.frozenCase.before));
    const localMatches = ['F', 'Fhat', 'Rhat'].every(key => isDeepStrictEqual(rows[key].targetLocal, input.frozenCase.local));
    const geometryMatches = ['F', 'Fhat', 'Rhat'].every(key =>
      isDeepStrictEqual(queryHeadings(rows[key].queries), input.frozenCase.wide.map(q => q.heading))
      && isDeepStrictEqual(rows[key].crowding, input.frozenCase.crowding));
    const fullMatchesFrozenAfter = isDeepStrictEqual(rows.F.targetAfterIntention, input.frozenCase.after);
    const selected = { F: rows.F.selectedOptionIndex, Fhat: rows.Fhat.selectedOptionIndex,
      Rhat: rows.Rhat.selectedOptionIndex };
    const shamWithin = Object.fromEntries(Object.entries(SHAM_CEILINGS).map(([key, limit]) => [key, sham[key] <= limit]));
    const shamValid = selected.F === selected.Fhat && Object.values(shamWithin).every(Boolean);
    const exactChoice = rows.Fhat.selectedOptionIndex === 2 && rows.Rhat.selectedOptionIndex === 1;
    const inputValid = sameWorld && sameEvents && sameRng && targetTapeMatches && targetBeforeMatches
      && localMatches && geometryMatches && fullMatchesFrozenAfter && shamValid && exactChoice
      && primaryRngAligned && inputFieldParity && surfaceInputParity && surfaceWritesValid;
    let continuation = { ran: false, summary: { reason: 'Gate B not positive or upstream validity failed' }, records: [] };
    let status = 'INCONCLUSIVE';
    if (inputValid && motorPositive(motor, sham)) {
      continuation = continuePair(arms.Fhat, arms.Rhat, input.frozenCase.before.id, rows.Fhat, rows.Rhat);
      status = continuation.summary.contactDifferenceBeforeCensor
        ? 'SUPPORTED — bounded motor-to-SurfaceField contact inscription'
        : continuation.summary.dabDifferenceBeforeCensor
          ? 'SUPPORTED — bounded motor-to-stored-pheromone inscription'
          : 'PARTIAL — motor transmission only';
    } else if (inputValid) status = 'BOUNDED NEGATIVE';
    const result = {
      schema: 'ant-retired-pheromone-recursive-results-v1', status,
      sourceHashes: await hashFiles(SOURCE_PATHS),
      selection: input.selection,
      validity: { completeWorldAndRngParity: sameWorld && sameEvents && sameRng,
        observerOnOffParity: sameWorld && sameEvents && sameRng,
        targetStateParity: targetBeforeMatches, localProfileParity: localMatches,
        candidateGeometryAndCrowdingParity: geometryMatches, targetRandomTapeParity: targetTapeMatches,
        primaryFhatRhatRngAligned: primaryRngAligned,
        targetSensorFieldParity: inputFieldParity,
        targetSurfaceFieldInputParity: surfaceInputParity,
        contactEventsReachSurfaceField: surfaceWritesValid,
        FReproducedFrozenAfterState: fullMatchesFrozenAfter,
        FhatNumericalSham: { selectedOptionUnchanged: selected.F === selected.Fhat,
          metricsWithinCeilings: shamWithin, ceiling: SHAM_CEILINGS },
        exactChangedChoiceReproduced: exactChoice,
        allConditionsReadOnlyAttribution: ['F', 'Fhat', 'Rhat'].every(key => rows[key].targetReadFieldUnchanged),
        validForGateC: inputValid && motorPositive(motor, sham) },
      oneTick: { selected, numericShamFToFhat: sham, primaryFhatToRhat: motor,
        motorThresholds: MOTOR_FLOORS, random: Object.fromEntries(['F', 'Fhat', 'Rhat'].map(k => [k,
          { before: rows[k].rngBefore, after: rows[k].rngAfter, targetTape: rows[k].targetRandomTape }])),
        arms: Object.fromEntries(['F', 'Fhat', 'Rhat'].map(k => [k, rows[k]])),
        plainObserverControl: { wholeWorldExact: sameWorld, eventsExact: sameEvents, rngExact: sameRng } },
      continuation
    };
    return result;
  } finally { await prefix.destroy(); }
}

function stepArm(controller, condition, targetCase, offset) {
  const focalId = targetCase.before.id, events = [], restores = [], randomTrace = [], targetRandomTape = [];
  const result = { condition, offset, modelTimeMsBefore: controller.simulationTimeMs,
    rngBefore: rng(controller), targetBefore: null, targetLocal: null, targetAfterIntention: null,
    queries: [], crowding: [], intentions: [], events, deposits: [], movement: null };
  let activeAgent = null, pendingDeposit = null, activeDeposit = null, fieldBeforeTargetSense = null;
  const surfaceBefore = controller.surfaceField.values.slice();
  const totalFootContactsBefore = controller.surfaceField.totalFootContacts;
  let surfaceAfterRelax = null, eventContactPointCount = 0, targetContactPointCount = 0;
  const targetContactWrites = [];
  const restore = (object, key, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    restores.push(() => descriptor ? Object.defineProperty(object, key, descriptor) : delete object[key]);
    object[key] = value;
  };
  const baseRandom = controller.random;
  const tracedRandom = () => {
    const value = baseRandom();
    randomTrace.push({ agentId: activeAgent, value });
    if (activeAgent === focalId) targetRandomTape.push(value);
    return value;
  };
  tracedRandom.state = baseRandom.state;
  Object.defineProperty(tracedRandom, 'calls', { get: () => baseRandom.calls });
  restore(controller, 'random', tracedRandom);
  const originalSurfaceRelax = controller.surfaceField.relax;
  restore(controller.surfaceField, 'relax', function (...args) {
    const value = originalSurfaceRelax.apply(this, args);
    surfaceAfterRelax = this.values.slice();
    return value;
  });
  const originalSurfaceContact = controller.surfaceField.applyFootContact;
  restore(controller.surfaceField, 'applyFootContact', function (event, ...args) {
    const before = this.values.slice();
    const responses = originalSurfaceContact.call(this, event, ...args);
    eventContactPointCount += responses.length;
    if (event?.antId === focalId) {
      targetContactPointCount += responses.length;
      const changed = changedNodes(before, this.values);
      targetContactWrites.push({ contactPointCount: responses.length,
        changedNodeCount: changed.changedNodeCount, storedDeltaSum: changed.storedDeltaSum,
        maxNodeDelta: changed.maxNodeDelta });
    }
    return responses;
  });
  const originalLocal = controller.senseLocalTrail;
  restore(controller, 'senseLocalTrail', function (agent, ...args) {
    const value = originalLocal.call(this, agent, ...args);
    if (agent.id === focalId) result.targetLocal = value;
    return value;
  });
  const originalSense = controller.senseTrail;
  let profileIndex = 0;
  restore(controller, 'senseTrail', function (agent, heading) {
    if (offset !== 0 || !['F', 'Fhat', 'Rhat'].includes(condition)
      || agent.id !== focalId || activeAgent !== focalId) return originalSense.call(this, agent, heading);
    const profile = targetCase.wide[profileIndex++];
    assert.ok(profile, 'unexpected extra target wide-sensor call');
    assert.ok(Math.abs(angleDelta(heading, profile.heading)) <= TOLERANCES.state);
    const field = this.field, originalSample = field.sample;
    const sampleDescriptor = Object.getOwnPropertyDescriptor(field, 'sample');
    const reads = profile.reads.filter(validRead);
    let index = 0;
    field.sample = function (x, y) {
      const expected = reads[index++];
      assert.ok(expected, 'unexpected production field sample');
      assert.ok(Math.abs(x - expected.x) <= TOLERANCES.coordinate);
      assert.ok(Math.abs(y - expected.y) <= TOLERANCES.coordinate);
      const production = originalSample.call(this, x, y);
      assert.ok(Math.abs(production - expected.full) <= TOLERANCES.sensor,
        `production wide read mismatch at ${profileIndex - 1}:${index - 1}`);
      const authors = residualFreeRead(expected);
      const value = condition === 'Fhat' ? authors.fullAuthorSum
        : condition === 'Rhat' ? authors.noRetired : production;
      result.queries.push({ profile: profileIndex - 1, heading, x, y, production,
        self: expected.self, aliveOther: expected.aliveOther, retired: expected.retired,
        residual: expected.residual, used: value });
      return value;
    };
    try {
      const signal = originalSense.call(this, agent, heading);
      assert.equal(index, reads.length, 'all frozen in-domain reads consumed');
      result.queries.at(-1).signal = signal;
      if (!result.queries.length || result.queries.at(-1).profile !== profileIndex - 1) {
        result.queries.push({ profile: profileIndex - 1, heading, signal, reads: 0 });
      }
      return signal;
    } finally {
      if (sampleDescriptor) Object.defineProperty(field, 'sample', sampleDescriptor);
      else delete field.sample;
    }
  });
  const originalUpdate = controller.updateIntention;
  restore(controller, 'updateIntention', function (agent, agents, info, dt, local) {
    const previous = activeAgent;
    activeAgent = agent.id;
    if (agent.id === focalId) {
      result.targetBefore = projectAgent(agent, targetCase.before); result.targetInfo = info;
      fieldBeforeTargetSense = this.field.values.slice();
      result.targetFieldBeforeSenseSha256 = typedArraySha(fieldBeforeTargetSense);
    }
    try { return originalUpdate.call(this, agent, agents, info, dt, local); }
    finally {
      result.intentions.push({ id: agent.id, intentHeading: agent.intentHeading,
        trailConfidence: agent.trailConfidence, trailAdherence: agent.trailAdherence,
        decisionRemaining: agent.decisionRemaining, committedRemaining: agent.committedRemaining });
      if (agent.id === focalId) {
        result.targetAfterIntention = projectAgent(agent, targetCase.after);
        result.selectedOptionIndex = optionIndex(agent.intentHeading, targetCase.wide.map(row => row.heading));
        result.targetReadFieldUnchanged = isDeepStrictEqual(fieldBeforeTargetSense, this.field.values);
      }
      activeAgent = previous;
    }
  });
  const originalCrowding = controller.occupancy.crowdingInDirection;
  restore(controller.occupancy, 'crowdingInDirection', function (agent, agents, heading, lookahead) {
    const value = originalCrowding.call(this, agent, agents, heading, lookahead);
    if (activeAgent === focalId) result.crowding.push({ heading, value });
    return value;
  });
  const originalConstraint = controller.occupancy.constrainDisplacements;
  restore(controller.occupancy, 'constrainDisplacements', function (agents, displacements) {
    const scales = originalConstraint.call(this, agents, displacements);
    const index = agents.findIndex(agent => agent.id === focalId);
    result.movement = { focalIndex: index, proposed: displacements[index] && { ...displacements[index] },
      collisionScale: scales[index], allCollisionScales: Array.from(scales),
      allProposals: displacements.map(value => ({ ...value })) };
    return scales;
  });
  const originalAdvance = controller.gasterDeposition.advance;
  restore(controller.gasterDeposition, 'advance', function (antId, ...args) {
    const value = originalAdvance.call(this, antId, ...args);
    pendingDeposit = { antId, kind: 'advance', requests: structuredClone(value) };
    return value;
  });
  const originalRetire = controller.gasterDeposition.retire;
  restore(controller.gasterDeposition, 'retire', function (antId, ...args) {
    const value = originalRetire.call(this, antId, ...args);
    pendingDeposit = { antId, kind: 'retire', requests: structuredClone(value) };
    return value;
  });
  const originalApply = controller.applyDeposits;
  restore(controller, 'applyDeposits', function (deposits) {
    const batch = pendingDeposit; pendingDeposit = null;
    if (batch?.antId !== focalId) return originalApply.call(this, deposits);
    const record = { kind: batch.kind, requests: structuredClone(deposits), calls: [],
      stored: { changedNodeCount: 0, storedDeltaSum: 0, maxNodeDelta: 0, changedIndices: [] } };
    const before = this.field?.values.slice(); activeDeposit = record;
    try { originalApply.call(this, deposits); }
    finally { activeDeposit = null; }
    if (before) record.stored = changedNodes(before, this.field.values);
    result.deposits.push(record);
  });
  const point = controller.field.depositPoint, segment = controller.field.depositSegment;
  restore(controller.field, 'depositPoint', function (position, options) {
    const value = point.call(this, position, options);
    if (activeDeposit) activeDeposit.calls.push({ type: 'point', position: { ...position }, options: { ...options }, accepted: value });
    return value;
  });
  restore(controller.field, 'depositSegment', function (from, to, options) {
    const value = segment.call(this, from, to, options);
    if (activeDeposit) activeDeposit.calls.push({ type: 'segment', from: { ...from }, to: { ...to }, options: { ...options }, accepted: value });
    return value;
  });
  const unsubscribe = controller.subscribe(({ type, payload }) => events.push({ type, payload: structuredClone(payload) }));
  try {
    controller.tick(DT);
  } finally {
    unsubscribe();
    for (const undo of restores.reverse()) undo();
  }
  if (offset === 0 && ['F', 'Fhat', 'Rhat'].includes(condition)) {
    assert.equal(profileIndex, targetCase.wide.length, 'all five registered target headings consumed');
    assert.equal(result.targetReadFieldUnchanged, true, 'sensor intervention did not write production field');
  }
  const after = controller.agents.find(agent => agent.id === focalId);
  const before = result.targetBefore || projectAgent(targetCase.before, targetCase.before);
  result.targetRandomTape = targetRandomTape;
  result.randomTrace = randomTrace;
  result.rngAfter = rng(controller);
  result.targetAfter = after ? projectAgent(after, targetCase.before) : null;
  result.realizedDisplacement = after ? { x: after.x - before.x, y: after.y - before.y } : null;
  result.focalContacts = events.filter(event => event.type === 'foot-contact' && event.payload.antId === focalId)
    .map(event => event.payload);
  result.nonFocalEvents = events.filter(event => event.payload?.antId !== focalId);
  result.scheduleAfter = schedule(controller);
  result.gaitAfter = controller.gaitController.ants.get(focalId) || null;
  result.depositionAfter = controller.gasterDeposition.ants.get(focalId) || null;
  assert.ok(surfaceAfterRelax, 'production SurfaceField relaxation ran before contacts');
  const contactWrite = changedNodes(surfaceAfterRelax, controller.surfaceField.values);
  result.surfaceWrite = { preTickFieldSha256: typedArraySha(surfaceBefore),
    postRelaxFieldSha256: typedArraySha(surfaceAfterRelax),
    postTickFieldSha256: typedArraySha(controller.surfaceField.values),
    totalFootContactsBefore, totalFootContactsAfter: controller.surfaceField.totalFootContacts,
    contactCountDelta: controller.surfaceField.totalFootContacts - totalFootContactsBefore,
    eventContactPointCount, targetContactPointCount, targetContactWrites,
    contactWrite: { changedNodeCount: contactWrite.changedNodeCount,
      storedDeltaSum: contactWrite.storedDeltaSum, maxNodeDelta: contactWrite.maxNodeDelta } };
  return result;
}

function continuePair(fhat, rhat, focalId, initialFhat, initialRhat) {
  const records = [], first = { Fhat: firstInscription(initialFhat), Rhat: firstInscription(initialRhat) };
  const firstDivergence = { rng: null, scheduling: null, nonFocalState: null, nonFocalEvents: null };
  for (let offset = 1; offset <= 30
    && !(first.Fhat.contact && first.Fhat.dab && first.Rhat.contact && first.Rhat.dab); offset += 1) {
    const pre = { Fhat: { rng: rng(fhat), schedule: schedule(fhat), others: nonFocalState(fhat, focalId) },
      Rhat: { rng: rng(rhat), schedule: schedule(rhat), others: nonFocalState(rhat, focalId) } };
    if (!isDeepStrictEqual(pre.Fhat.rng, pre.Rhat.rng) && !firstDivergence.rng) {
      firstDivergence.rng = { tickOffset: offset, Fhat: pre.Fhat.rng, Rhat: pre.Rhat.rng };
      break;
    }
    if (!isDeepStrictEqual(pre.Fhat.schedule, pre.Rhat.schedule) && !firstDivergence.scheduling) {
      firstDivergence.scheduling = { tickOffset: offset, Fhat: pre.Fhat.schedule, Rhat: pre.Rhat.schedule };
      break;
    }
    if (!isDeepStrictEqual(pre.Fhat.others, pre.Rhat.others) && !firstDivergence.nonFocalState) {
      firstDivergence.nonFocalState = { tickOffset: offset };
      break;
    }
    const a = stepArm(fhat, 'continuation', { before: fhat.agents.find(x => x.id === focalId),
      after: {}, wide: [] }, offset);
    const b = stepArm(rhat, 'continuation', { before: rhat.agents.find(x => x.id === focalId),
      after: {}, wide: [] }, offset);
    const traceAligned = isDeepStrictEqual(a.randomTrace, b.randomTrace);
    const scheduleAligned = isDeepStrictEqual(a.scheduleAfter, b.scheduleAfter);
    const nonFocalAligned = isDeepStrictEqual(nonFocalState(fhat, focalId), nonFocalState(rhat, focalId));
    const nonFocalEventsAligned = isDeepStrictEqual(a.nonFocalEvents, b.nonFocalEvents);
    records.push({ tickOffset: offset, modelTimeMsBefore: a.modelTimeMsBefore,
      traceAligned, rngAlignedAfter: isDeepStrictEqual(a.rngAfter, b.rngAfter),
      scheduleAligned, nonFocalAligned, nonFocalEventsAligned,
      collisionScales: { Fhat: a.movement?.allCollisionScales, Rhat: b.movement?.allCollisionScales },
      surfaceWrites: { Fhat: a.surfaceWrite, Rhat: b.surfaceWrite },
      Fhat: continuationSummary(a, focalId), Rhat: continuationSummary(b, focalId) });
    for (const [key, row] of [['Fhat', a], ['Rhat', b]]) {
      if (!first[key].contact && row.focalContacts.length) first[key].contact = contactInscription(row,
        row.focalContacts[0], offset);
      if (!first[key].dab) {
        const dab = row.deposits.find(isStoredDeposit);
        if (dab) first[key].dab = { tickOffset: offset, modelTimeMsBefore: row.modelTimeMsBefore, record: dab };
      }
    }
    if (!traceAligned && !firstDivergence.rng) firstDivergence.rng = { tickOffset: offset,
      firstDifferentDraw: firstTraceDifference(a.randomTrace, b.randomTrace) };
    if (!scheduleAligned && !firstDivergence.scheduling) firstDivergence.scheduling = { tickOffset: offset };
    if (!nonFocalAligned && !firstDivergence.nonFocalState) firstDivergence.nonFocalState = { tickOffset: offset };
    if (!nonFocalEventsAligned && !firstDivergence.nonFocalEvents) firstDivergence.nonFocalEvents = { tickOffset: offset };
    if (first.Fhat.contact && first.Rhat.contact && first.Fhat.dab && first.Rhat.dab) break;
    if (firstDivergence.rng || firstDivergence.scheduling || firstDivergence.nonFocalState || firstDivergence.nonFocalEvents) break;
  }
  const censored = Boolean(firstDivergence.rng || firstDivergence.scheduling
    || firstDivergence.nonFocalState || firstDivergence.nonFocalEvents);
  const differentContact = !isDeepStrictEqual(first.Fhat.contact?.event, first.Rhat.contact?.event);
  const differentDab = !sameDab(first.Fhat.dab, first.Rhat.dab);
  const surfaceContactWriteVerified = Boolean(first.Fhat.contact?.surfaceContactWriteVerified
    && first.Rhat.contact?.surfaceContactWriteVerified);
  const divergenceTick = [firstDivergence.rng?.tickOffset, firstDivergence.scheduling?.tickOffset,
    firstDivergence.nonFocalState?.tickOffset, firstDivergence.nonFocalEvents?.tickOffset]
    .filter(Number.isFinite).reduce((min, value) => Math.min(min, value), Infinity);
  const contactDifferenceBeforeCensor = differentContact && surfaceContactWriteVerified
    && (!first.Fhat.contact || !first.Rhat.contact
    ? !censored : Math.max(first.Fhat.contact.tickOffset, first.Rhat.contact.tickOffset) < divergenceTick);
  const dabDifferenceBeforeCensor = differentDab && (!first.Fhat.dab || !first.Rhat.dab
    ? !censored : Math.max(first.Fhat.dab.tickOffset, first.Rhat.dab.tickOffset) < divergenceTick);
  return { ran: true, firstInscription: first, firstDivergence,
    summary: { maxTicks: 30, observedTicks: records.length,
      stopReason: censored ? 'matched-fork censoring condition' : records.length === 30
        ? 'registered 30-tick boundary' : 'both arms reached first FOOT_CONTACT and stored pheromone dab',
      censored, differentContact, differentStoredDab: differentDab,
      surfaceContactWriteVerified,
      contactDifferenceBeforeCensor, dabDifferenceBeforeCensor,
      differentInscription: (differentContact && surfaceContactWriteVerified) || differentDab,
      validDifferenceBeforeCensor: contactDifferenceBeforeCensor || dabDifferenceBeforeCensor,
      firstContactTickOffsets: { Fhat: first.Fhat.contact?.tickOffset ?? null, Rhat: first.Rhat.contact?.tickOffset ?? null },
      firstDabTickOffsets: { Fhat: first.Fhat.dab?.tickOffset ?? null, Rhat: first.Rhat.dab?.tickOffset ?? null } }, records };
}

function firstInscription(row) {
  const contact = row.focalContacts[0] ? contactInscription(row, row.focalContacts[0], 0) : null;
  const dab = row.deposits.find(isStoredDeposit);
  return { contact, dab: dab ? { tickOffset: 0, modelTimeMsBefore: row.modelTimeMsBefore, record: dab } : null };
}

function contactInscription(row, event, tickOffset) {
  const surfaceWrite = row.surfaceWrite.targetContactWrites[0] || null;
  return { tickOffset, modelTimeMsBefore: row.modelTimeMsBefore, event, surfaceWrite,
    surfaceContactWriteVerified: Boolean(surfaceWrite && surfaceWrite.contactPointCount === event.contacts.length
      && surfaceWrite.changedNodeCount > 0) };
}

function plainStep(controller, focalId) {
  const events = [];
  const unsubscribe = controller.subscribe(({ type, payload }) => events.push({ type, payload: structuredClone(payload) }));
  const result = { condition: 'plain', modelTimeMsBefore: controller.simulationTimeMs,
    rngBefore: rng(controller) };
  try { controller.tick(DT); } finally { unsubscribe(); }
  result.rngAfter = rng(controller);
  result.events = events;
  result.focalContacts = events.filter(event => event.type === 'foot-contact' && event.payload.antId === focalId)
    .map(event => event.payload);
  result.nonFocalEvents = events.filter(event => event.payload?.antId !== focalId);
  result.scheduleAfter = schedule(controller);
  return result;
}

function compareMotor(a, b) {
  const aa = a.targetAfter, bb = b.targetAfter;
  if (!aa || !bb) return { different: false, missingFocal: true };
  return {
    position: Math.hypot(aa.x - bb.x, aa.y - bb.y),
    velocity: Math.hypot(aa.vx - bb.vx, aa.vy - bb.vy),
    heading: Math.abs(angleDelta(aa.heading, bb.heading)),
    angularVelocity: Math.abs(aa.angularVelocity - bb.angularVelocity),
    displacement: Math.hypot(a.realizedDisplacement.x - b.realizedDisplacement.x,
      a.realizedDisplacement.y - b.realizedDisplacement.y),
    proposedDisplacement: Math.hypot(a.movement.proposed.x - b.movement.proposed.x,
      a.movement.proposed.y - b.movement.proposed.y),
    collisionScale: Math.abs(a.movement.collisionScale - b.movement.collisionScale)
  };
}

function motorPositive(primary, sham) {
  if (primary.missingFocal) return false;
  return ['position', 'velocity', 'heading', 'angularVelocity', 'displacement']
    .some(key => primary[key] > MOTOR_FLOORS[key] && primary[key] > (sham[key] || 0));
}

function changedNodes(before, after) {
  const changedIndices = []; let storedDeltaSum = 0, maxNodeDelta = 0;
  for (let i = 0; i < before.length; i += 1) {
    const delta = after[i] - before[i];
    if (delta !== 0) { changedIndices.push(i); storedDeltaSum += delta; maxNodeDelta = Math.max(maxNodeDelta, delta); }
  }
  return { changedNodeCount: changedIndices.length, storedDeltaSum, maxNodeDelta, changedIndices };
}

function isStoredDeposit(record) {
  return record.calls.some(call => call.accepted > 0) && record.stored.changedNodeCount > 0;
}

function sameDab(a, b) {
  if (!a || !b) return a === b;
  return isDeepStrictEqual(a, b);
}

function continuationSummary(row, id) {
  const agent = row.targetAfter;
  return { modelTimeMsAfter: row.modelTimeMsBefore + DT * 1000, focal: agent,
    displacement: row.realizedDisplacement, proposed: row.movement?.proposed,
    collisionScale: row.movement?.collisionScale, contacts: row.focalContacts,
    deposits: row.deposits.filter(isStoredDeposit), gait: row.gaitAfter, deposition: row.depositionAfter,
    nonFocalIds: row.scheduleAfter.agentIds.filter(value => value !== id) };
}

function firstTraceDifference(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) if (!isDeepStrictEqual(a[i], b[i])) return { index: i, Fhat: a[i], Rhat: b[i] };
  return a.length === b.length ? null : { index: n, FhatLength: a.length, RhatLength: b.length };
}

function projectAgent(agent, shape) {
  return Object.fromEntries(Object.keys(shape).map(key => [key, key === 'personality'
    ? { ...agent.personality } : agent[key]]));
}

function optionIndex(heading, candidates) {
  const matches = candidates.map((value, index) => Math.abs(angleDelta(heading, value)) <= 1e-10 ? index : -1)
    .filter(index => index >= 0);
  return matches.length === 1 ? matches[0] : null;
}

function queryHeadings(queries) {
  return [...new Map(queries.map(query => [query.profile, query.heading])).values()];
}

async function replayPrefix() {
  const controller = new AntController({ random: countedLcg(SEED), audioBridge: null });
  await controller.init();
  for (let tick = 0; tick < PREFIX_TICKS; tick += 1) controller.tick(DT);
  return controller;
}

function validRead(read) { return read.x >= 0 && read.x <= 1 && read.y >= 0 && read.y <= 1; }
function numericAntId(id) { const match = /^ant-(\d+)$/.exec(id); assert.ok(match, `invalid ant ID: ${id}`); return Number(match[1]); }
function rng(controller) { return { state: controller.random.state(), calls: controller.random.calls }; }
function schedule(controller) { return { time: controller.simulationTimeMs, nextSpawnTimeMs: controller.nextSpawnTimeMs,
  nextAgentId: controller.nextAgentId, totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired,
  agentIds: controller.agents.map(agent => agent.id) }; }
function nonFocalState(controller, id) { return controller.agents.filter(agent => agent.id !== id); }
function angleDelta(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }

async function loadTarget() { return parseJson(await readFile(resolve(DATA, 'target-input.json'))); }
async function assertProductionUnchanged() {
  assert.equal(git(['merge-base', '--is-ancestor', MAIN, 'HEAD']).trim(), '', 'main must be an ancestor');
  for (const path of [...SOURCE_PATHS.filter(path => path.startsWith('src/')), 'docs/ant/README.md']) {
    const working = (await readFile(resolve(ROOT, path), 'utf8')).replaceAll('\r\n', '\n');
    const base = execFileSync('git', ['show', `${MAIN}:${path}`], { cwd: ROOT, encoding: 'utf8' }).replaceAll('\r\n', '\n');
    assert.equal(working, base, `production source changed: ${path}`);
  }
}
async function sourceHashes() { return hashFiles(SOURCE_PATHS); }
async function hashFiles(paths) { return Object.fromEntries(await Promise.all(paths.map(async path => [path,
  await hashFile(resolve(ROOT, path))]))); }
async function hashFile(path) { return sha(await readFile(path)); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function typedArraySha(value) { return sha(Buffer.from(value.buffer, value.byteOffset, value.byteLength)); }
function hash(value) { return sha(Buffer.from(json(value))); }
function stable(value, parents = new WeakSet()) {
  if (typeof value === 'function') return `[Function:${value.name}]`;
  if (value === null || typeof value !== 'object') return value;
  if (parents.has(value)) return '[Circular]'; parents.add(value);
  let result;
  if (ArrayBuffer.isView(value)) result = { type: value.constructor.name, values: Array.from(value) };
  else if (value instanceof ArrayBuffer) result = { type: 'ArrayBuffer', bytes: Array.from(new Uint8Array(value)) };
  else if (value instanceof Map) result = { type: 'Map', values: [...value].map(([k, v]) => [stable(k, parents), stable(v, parents)]) };
  else if (value instanceof Set) result = { type: 'Set', values: [...value].map(v => stable(v, parents)) };
  else if (Array.isArray(value)) result = value.map(v => stable(v, parents));
  else result = Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key], parents)]));
  parents.delete(value); return result;
}
function json(value) { return JSON.stringify(value, (_key, item) => Object.is(item, -0) ? { $antNegativeZero: true }
  : typeof item === 'number' && !Number.isFinite(item) ? { $antNonFiniteNumber: String(item) } : item, 2) + '\n'; }
function parseJson(value) { return JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : value, (_key, item) => {
  if (item && typeof item === 'object' && Object.keys(item).length === 1 && item.$antNegativeZero === true) return -0;
  if (item && typeof item === 'object' && Object.keys(item).length === 1 && item.$antNonFiniteNumber)
    return item.$antNonFiniteNumber === 'Infinity' ? Infinity : item.$antNonFiniteNumber === '-Infinity' ? -Infinity : NaN;
  return item;
}); }
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
