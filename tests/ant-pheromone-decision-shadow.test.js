import assert from 'node:assert/strict';
import test from 'node:test';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { runFrozenDecision, runFrozenLocal } from '../scripts/lib/antPheromoneDecisionShadow.js';

function makeAgent() {
  return { id: 'a', x: 0.5, y: 0.5, heading: 0, intentHeading: 0,
    personality: Object.freeze({ exploration: 0.2, pheromoneSensitivity: 1.5 }),
    trailConfidence: 0, trailAdherence: 0.25, decisionRemaining: 0,
    committedRemaining: 0, inspectionRemaining: 10, hesitationRemaining: 0,
    wasBlocked: false };
}
const controller = { state: { behavior: { sensorDistance: 0.04, sensorWidth: 0.02 } },
  random: () => { throw new Error('Controller RNG must not be read.'); },
  occupancy: { crowdingInDirection: () => 0 },
  updateTrailAdherence: AntController.prototype.updateTrailAdherence };
const sensedOccupancy = { frontCrowding: 0 };
const offsets = [-0.92, -0.47, 0, 0.47, 0.92];

function captureProduction(beforeAgent, randomTape, valueAt) {
  let randomCalls = 0;
  const profiles = [];
  const facade = Object.create(controller);
  facade.random = () => {
    if (randomCalls >= randomTape.length) throw new Error('Fixture tape exhausted.');
    return randomTape[randomCalls++];
  };
  facade.field = { sample(x, y) {
    const values = valueAt(x, y);
    profiles.at(-1).reads.push({ x, y, ...values });
    return values.full;
  } };
  facade.senseTrail = (target, heading) => {
    profiles.push({ heading, reads: [] });
    return AntController.prototype.senseTrail.call(facade, target, heading);
  };
  const clone = { ...beforeAgent, personality: beforeAgent.personality };
  AntController.prototype.updateIntention.call(facade, clone, [clone], sensedOccupancy, 1 / 60,
    { strength: 0.2, coherence: 0.4 });
  return { agentAfter: clone, profiles, randomCalls };
}

function oldField(x, y) {
  const bump = 0.9 * Math.exp(-((x - 0.54) ** 2 / 0.00004 + (y - 0.5) ** 2 / 0.000032));
  const retired = bump * 0.98;
  const aliveOther = 0.02 + bump - retired;
  return { full: 0.02 + bump, self: 0, aliveOther, retired, residual: 0 };
}

test('full replay equals an independently captured production decision and preserves inputs/RNG', () => {
  const before = makeAgent();
  const agents = [{ ...before }, { ...makeAgent(), id: 'neighbor' }];
  const original = structuredClone({ before, agents, sensedOccupancy });
  const roomyTape = Array(80).fill(0.5);
  const captured = captureProduction(before, roomyTape, () => ({
    full: 0.2, self: 0.05, aliveOther: 0.05, retired: 0.1, residual: 0
  }));
  const exactTape = roomyTape.slice(0, captured.randomCalls);
  const baseline = captureProduction(before, exactTape, () => ({
    full: 0.2, self: 0.05, aliveOther: 0.05, retired: 0.1, residual: 0
  }));
  const result = runFrozenDecision(controller, before, agents, sensedOccupancy, 1 / 60,
    { strength: 0.2, coherence: 0.4 }, baseline.profiles, exactTape);
  assert.deepEqual(result.conditions.full.agentAfter, baseline.agentAfter);
  assert.equal(result.conditions.full.randomCalls, exactTape.length);
  assert.deepEqual(result.conditions.full.wideSignals.map(item => item.heading),
    baseline.profiles.map(profile => profile.heading));
  assert.deepEqual({ before, agents, sensedOccupancy }, original);
});

test('zero retired input is identical across conditions; raw flat budget is reported', () => {
  const before = makeAgent();
  const tape = Array(80).fill(0.5);
  const captured = captureProduction(before, tape, () => ({
    full: 0.2, self: 0.05, aliveOther: 0.15, retired: 0, residual: 0
  }));
  const result = runFrozenDecision(controller, before, [before], sensedOccupancy, 1 / 60,
    { strength: 0.2, coherence: 0.4 }, captured.profiles, tape.slice(0, captured.randomCalls));
  assert.deepEqual(result.conditions.full.wideSignals, result.conditions.removeRetired.wideSignals);
  assert.deepEqual(result.conditions.full.agentAfter, result.conditions.flatRetired.agentAfter);
  assert.equal(result.rawBudget.retiredRawSum, 0);
  assert.equal(result.rawBudget.relativeError, 0);
  assert.match(result.rawBudget.note, /not physical field mass/);
});

test('boundary profiles retain empty sensor calls and candidate-heading order', () => {
  const before = { ...makeAgent(), x: 0.99 };
  const roomyTape = Array(80).fill(0.5);
  const captured = captureProduction(before, roomyTape, () => ({
    full: 0.2, self: 0, aliveOther: 0.2, retired: 0, residual: 0
  }));
  assert.ok(captured.profiles.some(profile => profile.reads.length === 0));
  const exactTape = roomyTape.slice(0, captured.randomCalls);
  const result = runFrozenDecision(controller, before, [before], sensedOccupancy, 1 / 60,
    { strength: 0.2, coherence: 0.4 }, captured.profiles, exactTape);
  const signals = result.conditions.full.wideSignals;
  assert.equal(signals.length, 5);
  assert.deepEqual(signals.map(item => item.heading), captured.profiles.map(profile => profile.heading));
  for (const profile of captured.profiles.filter(profile => !profile.reads.length)) {
    assert.equal(signals.find(item => item.heading === profile.heading).signal, 0);
  }
});

test('removing a strong retired old-direction cue changes the selected option', () => {
  const before = makeAgent();
  // Exact candidate headings and query coordinates come from the production capture itself.
  const tape = [...Array(5).fill(0.5), 0.5, 0.5, 0.999, 0.5, 0.5, 0.5, 0.5, 0.99, 0.01];
  const captured = captureProduction(before, tape, oldField);
  const result = runFrozenDecision(controller, before, [before], sensedOccupancy, 1 / 60,
    { strength: 0, coherence: 0 }, captured.profiles, tape);
  assert.notEqual(result.conditions.full.selectedOptionIndex,
    result.conditions.removeRetired.selectedOptionIndex);
});

test('frozen local profile uses production reads and rejects non-finite adherence', () => {
  const before = makeAgent();
  const reads = [];
  const dx = Math.cos(before.heading), dy = Math.sin(before.heading), nx = -dy, ny = dx;
  for (const distance of [0.016, 0.028]) for (const side of [-1, 0, 1]) {
    const x = before.x + dx * distance + nx * 0.009 * side;
    const y = before.y + dy * distance + ny * 0.009 * side;
    for (const offset of [-1, 0, 1]) reads.push({ x: x + nx * 0.003 * offset,
      y: y + ny * 0.003 * offset, full: 0.4, self: 0.1,
      aliveOther: 0.1, retired: 0.2, residual: 0 });
  }
  const result = runFrozenLocal(controller, before, reads);
  assert.ok(Number.isFinite(result.trailAdherenceAfter));
  assert.throws(() => runFrozenLocal(controller, before, reads.map(read => ({ ...read, full: NaN }))),
    /Non-finite captured read/);
  assert.throws(() => runFrozenLocal(controller, before, reads.map(read => ({ ...read,
    full: 1e308, self: 1e308, aliveOther: 0, retired: 0, residual: 0 }))),
  error => error instanceof RangeError && /numerically undefined/.test(error.message));
});

test('query mismatch, exhausted tape and leftover tape are rejected', () => {
  const before = makeAgent();
  const roomyTape = Array(80).fill(0.5);
  const captured = captureProduction(before, roomyTape, () => ({
    full: 0.2, self: 0, aliveOther: 0.2, retired: 0, residual: 0
  }));
  const exactTape = roomyTape.slice(0, captured.randomCalls);
  const args = [controller, before, [before], sensedOccupancy, 1 / 60,
    { strength: 0.2, coherence: 0.4 }];
  assert.throws(() => runFrozenDecision(...args,
    captured.profiles.map((profile, i) => i ? profile : { ...profile,
      reads: profile.reads.map((read, j) => j ? read : { ...read, x: read.x + 0.01 }) }), exactTape),
  /Sensor query mismatch/);
  assert.throws(() => runFrozenDecision(...args, captured.profiles, exactTape.slice(0, -1)), /Random tape exhausted/);
  assert.throws(() => runFrozenDecision(...args, captured.profiles, [...exactTape, 0.5]), /tape length mismatch/);
});
