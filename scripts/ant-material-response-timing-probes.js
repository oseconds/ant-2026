import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';

const materialFactor = layers => 1 + 0.5 * (1 - Math.exp(-Math.max(0, layers) / 4));
const FADE_SECONDS = 1.8;

/** Research-only method wrappers. The harness supplies tick-entry public layer counts. */
export function attachResponseTiming(controller, { kind, enabled = false, layersByAnt = new Map(), onSample = null } = {}) {
  if (kind !== 'adherence' && kind !== 'decision') throw new TypeError("kind must be 'adherence' or 'decision'");
  const method = kind === 'adherence' ? 'updateTrailAdherence' : 'updateIntention';
  const native = controller[method];
  const ownMethod = Object.getOwnPropertyDescriptor(controller, method);
  if (typeof native !== 'function') throw new TypeError(`controller.${method} must be a function`);
  const wrapped = function (...args) {
    const agent = kind === 'adherence' ? args[0] : args[0];
    const layers = Math.max(0, Number(layersByAnt.get(agent)) || 0);
    const factor = materialFactor(layers);
    if (kind === 'adherence') {
      const [targetInput, dt] = [args[1], args[2]];
      const target = Math.min(1, Math.max(0, targetInput.strength * targetInput.coherence));
      const before = agent.trailAdherence;
      const fading = target < before;
      const nativeTau = fading ? FADE_SECONDS : 0.25;
      const candidateTau = fading ? FADE_SECONDS * factor : nativeTau;
      const nativeValue = Math.min(1, Math.max(0, before + (target - before) * -Math.expm1(-dt / nativeTau)));
      const candidateValue = Math.min(1, Math.max(0, before + (target - before) * -Math.expm1(-dt / candidateTau)));
      if (enabled && fading) agent.trailAdherence = candidateValue;
      else native.apply(this, args);
      onSample?.({ kind, antId: agent.id, timeSeconds: (controller.simulationTimeMs || 0) / 1000,
        layers, eligible: fading, binding: fading && Math.abs(candidateValue - nativeValue) > 1e-15,
        changed: enabled && fading && Math.abs(candidateValue - nativeValue) > 1e-15,
        before, target, dt, nativeTau, candidateTau, nativeValue, value: agent.trailAdherence,
        delta: agent.trailAdherence - nativeValue, prospectiveValue: candidateValue });
      return;
    }

    const dt = args[3], entryDecision = agent.decisionRemaining, entryCommitted = agent.committedRemaining;
    const blocked = args[2]?.frontCrowding > 0.25, newlyBlocked = blocked && !agent.wasBlocked;
    const assignsDecision = entryDecision - dt <= 0 || entryCommitted - dt <= 0 || newlyBlocked;
    native.apply(this, args);
    if (assignsDecision) {
      const nativeValue = agent.decisionRemaining, prospectiveValue = nativeValue * factor;
      if (enabled) agent.decisionRemaining = prospectiveValue;
      onSample?.({ kind, antId: agent.id, timeSeconds: (controller.simulationTimeMs || 0) / 1000,
        layers, eligible: true, binding: !newlyBlocked && entryDecision <= dt && entryCommitted > dt,
        changed: enabled && prospectiveValue !== nativeValue, entryDecision, entryCommitted,
        committedAfter: agent.committedRemaining, blocked, newlyBlocked, dt,
        nativeValue, value: agent.decisionRemaining, delta: agent.decisionRemaining - nativeValue,
        prospectiveValue });
    }
  };
  controller[method] = wrapped;
  return { finish() {
    if (controller[method] !== wrapped) return;
    if (ownMethod) Object.defineProperty(controller, method, ownMethod);
    else delete controller[method];
  } };
}

/** Deterministic fixed-state output; no world stepping or RNG calls. */
export function runProbe() {
  const dt = 1 / 60, ant = { id: 1, trailAdherence: 0.8, decisionRemaining: 0, committedRemaining: 0,
    wasBlocked: false, randomCalls: 0 };
  const samples = [];
  const controller = { simulationTimeMs: 1234, updateTrailAdherence(a, trail, step) {
    const target = Math.min(1, Math.max(0, trail.strength * trail.coherence));
    const tau = target > a.trailAdherence ? 0.25 : FADE_SECONDS;
    a.trailAdherence += (target - a.trailAdherence) * -Math.expm1(-step / tau);
  }, updateIntention(a) { a.decisionRemaining = 0.4; a.committedRemaining = 0.9; } };
  const layersByAnt = new Map([[ant, 4]]);
  const hook = attachResponseTiming(controller, { kind: 'adherence', enabled: true, layersByAnt,
    onSample: row => samples.push(row) });
  controller.updateTrailAdherence(ant, { strength: 0.2, coherence: 1 }, dt);
  hook.finish();
  const adherence = { law: 'fade tau = 1.8 * (1 + 0.50*(1-exp(-L/4))); rise unchanged', sample: samples.pop() };
  const decisionHook = attachResponseTiming(controller, { kind: 'decision', enabled: true, layersByAnt,
    onSample: row => samples.push(row) });
  controller.updateIntention(ant, [], { frontCrowding: 0 }, dt);
  decisionHook.finish();
  return { adherence, decision: { law: 'new decisionRemaining *= 1 + 0.50*(1-exp(-L/4))', sample: samples.pop() },
    rngCallsAdded: ant.randomCalls, naturalWorldRun: false };
}

function decisionFixture(initial = {}) {
  const agent = { id: 9, x: 0.5, y: 0.5, heading: 0.2, intentHeading: 0.3, vx: 0.01, vy: 0.02,
    trailConfidence: 0, trailAdherence: 0, decisionRemaining: 0, committedRemaining: 0,
    inspectionRemaining: 100, hesitationRemaining: 0, wasBlocked: false,
    personality: { exploration: 0.2, pheromoneSensitivity: 1 }, ...initial };
  const controller = Object.create(AntController.prototype);
  controller.simulationTimeMs = 0; controller.randomCalls = 0;
  controller.random = () => { controller.randomCalls += 1; return 0.5; };
  controller.state = { behavior: { sensorDistance: 0.04 } };
  controller.occupancy = { crowdingInDirection: () => 0 };
  controller.senseTrail = () => 0;
  controller.updateTrailAdherence = () => {};
  return { controller, agent };
}

export function selfTest() {
  const ant = { id: 1, x: 0.5, y: 0.5, heading: 0.2, intentHeading: 0.3, vx: 0.01, vy: 0.02,
    trailAdherence: 0.8, decisionRemaining: 0.01, committedRemaining: 1, wasBlocked: false };
  const dt = 1 / 60, layersByAnt = new Map([[ant, 4]]), rows = [];
  const controller = { simulationTimeMs: 0, updateTrailAdherence(a, trail, step) {
    const target = trail.strength * trail.coherence, tau = target > a.trailAdherence ? 0.25 : FADE_SECONDS;
    a.trailAdherence += (target - a.trailAdherence) * -Math.expm1(-step / tau);
  } };
  const initial = ant.trailAdherence, hook = attachResponseTiming(controller, { kind: 'adherence', enabled: true, layersByAnt, onSample: r => rows.push(r) });
  controller.updateTrailAdherence(ant, { strength: 0.2, coherence: 1 }, dt); hook.finish();
  assert(rows[0].changed && rows[0].eligible && rows[0].binding);
  assert(ant.trailAdherence > rows[0].nativeValue && ant.trailAdherence < initial);
  ant.trailAdherence = 0.2;
  const riseHook = attachResponseTiming(controller, { kind: 'adherence', enabled: true, layersByAnt, onSample: r => rows.push(r) });
  controller.updateTrailAdherence(ant, { strength: 0.8, coherence: 1 }, dt); riseHook.finish();
  assert.equal(rows[1].eligible, false); assert.equal(rows[1].changed, false);

  const native = decisionFixture({ decisionRemaining: 0.5, committedRemaining: 0.6 });
  const conditioned = decisionFixture({ decisionRemaining: 0.5, committedRemaining: 0.6 });
  const decisionRows = [], eHook = attachResponseTiming(conditioned.controller, { kind: 'decision', enabled: true,
    layersByAnt: new Map([[conditioned.agent, 4]]), onSample: r => decisionRows.push(r) });
  native.controller.updateIntention(native.agent, [native.agent], { frontCrowding: 0 }, dt, { strength: 0 });
  conditioned.controller.updateIntention(conditioned.agent, [conditioned.agent], { frontCrowding: 0 }, dt, { strength: 0 });
  assert.equal(conditioned.agent.decisionRemaining, native.agent.decisionRemaining, 'skipped decision decrements stay exact');
  assert.equal(decisionRows.length, 0, 'skipped decision is not an interval assignment');
  assert.equal(conditioned.controller.randomCalls, native.controller.randomCalls);

  native.agent.decisionRemaining = conditioned.agent.decisionRemaining = dt;
  native.agent.committedRemaining = conditioned.agent.committedRemaining = 1;
  native.controller.updateIntention(native.agent, [native.agent], { frontCrowding: 0 }, dt, { strength: 0 });
  conditioned.controller.updateIntention(conditioned.agent, [conditioned.agent], { frontCrowding: 0 }, dt, { strength: 0 });
  assert.equal(conditioned.controller.randomCalls, native.controller.randomCalls, 'assigned decision uses identical draws');
  assert.equal(conditioned.agent.intentHeading, native.agent.intentHeading, 'candidate preserves the current choice');
  assert.equal(conditioned.agent.committedRemaining, native.agent.committedRemaining, 'commitment clock stays native');
  assert.equal(conditioned.agent.decisionRemaining, decisionRows[0].nativeValue * materialFactor(4));
  assert(decisionRows[0].eligible && decisionRows[0].binding && decisionRows[0].changed);
  assert.deepEqual([conditioned.agent.x, conditioned.agent.y, conditioned.agent.heading, conditioned.agent.vx, conditioned.agent.vy],
    [native.agent.x, native.agent.y, native.agent.heading, native.agent.vx, native.agent.vy]);
  eHook.finish();

  const blocked = decisionFixture({ decisionRemaining: 1, committedRemaining: 1 });
  const blockedRows = [], blockedHook = attachResponseTiming(blocked.controller, { kind: 'decision', enabled: true,
    layersByAnt: new Map([[blocked.agent, 4]]), onSample: r => blockedRows.push(r) });
  blocked.controller.updateIntention(blocked.agent, [blocked.agent], { frontCrowding: 1 }, dt, { strength: 0 });
  blockedHook.finish();
  assert.equal(blockedRows[0].binding, false, 'new blockage remains an independent decision trigger');
  assert.equal(blockedRows[0].blocked, true);

  const commitment = decisionFixture({ decisionRemaining: 1, committedRemaining: dt });
  const commitmentRows = [], commitmentHook = attachResponseTiming(commitment.controller, { kind: 'decision', enabled: true,
    layersByAnt: new Map([[commitment.agent, 4]]), onSample: r => commitmentRows.push(r) });
  commitment.controller.updateIntention(commitment.agent, [commitment.agent], { frontCrowding: 0 }, dt, { strength: 0 });
  commitmentHook.finish();
  assert.equal(commitmentRows[0].binding, false, 'commitment expiry independently triggers a decision');
  assert(commitmentRows[0].entryDecision > commitmentRows[0].entryCommitted);

  const disabled = decisionFixture({ decisionRemaining: dt, committedRemaining: 1 });
  const disabledRows = [], disabledHook = attachResponseTiming(disabled.controller, { kind: 'decision', enabled: false,
    layersByAnt: new Map([[disabled.agent, 4]]), onSample: r => disabledRows.push(r) });
  const disabledNative = AntController.prototype.updateIntention;
  disabled.controller.updateIntention(disabled.agent, [disabled.agent], { frontCrowding: 0 }, dt, { strength: 0 });
  disabledHook.finish();
  assert.equal(disabled.controller.updateIntention, disabledNative);
  assert.equal(disabled.agent.decisionRemaining, disabledRows[0].nativeValue);
  assert.equal(disabledRows[0].prospectiveValue, disabledRows[0].nativeValue * materialFactor(4));

  const parityAnt = { id: 2, trailAdherence: 0.4 }, parityNative = { ...parityAnt };
  const cues = [0.7, 0.7, 0.25, 0.9, 0.9, 0.1];
  const nativeUpdate = (a, trail, step) => {
    const target = Math.min(1, Math.max(0, trail.strength * trail.coherence));
    const tau = target > a.trailAdherence ? 0.25 : FADE_SECONDS;
    a.trailAdherence = Math.min(1, Math.max(0, a.trailAdherence
      + (target - a.trailAdherence) * -Math.expm1(-step / tau)));
  };
  const parityController = { updateTrailAdherence: nativeUpdate };
  const parityHook = attachResponseTiming(parityController, { kind: 'adherence', enabled: true,
    layersByAnt: new Map([[parityAnt, 0]]) });
  for (const cue of cues) {
    parityController.updateTrailAdherence(parityAnt, { strength: cue, coherence: 1 }, dt);
    nativeUpdate(parityNative, { strength: cue, coherence: 1 }, dt);
    assert.equal(parityAnt.trailAdherence, parityNative.trailAdherence, 'L0 cue sequence is native-exact');
  }
  parityHook.finish();
  return { adherenceFadeOnly: true, adherenceRiseNative: true, decisionAssignmentOnly: true,
    commitmentAndBlockGatesPreserved: true, disabledNativeAndProspective: true, wrapperRestored: true,
    positiveCountdownNativeExact: true, sameStateDecisionAndDraws: true, l0SequenceNativeExact: true,
    rngCallsAdded: 0 };
}

if (process.argv[1]?.endsWith('ant-material-response-timing-probes.js')) {
  process.stdout.write(JSON.stringify(process.argv[2] === '--self-test' ? selfTest() : runProbe()) + '\n');
}
