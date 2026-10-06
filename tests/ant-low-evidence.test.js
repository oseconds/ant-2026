import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';

const DT = 1 / 60;
const conditions = [
  { raw: 0, evidence: 0, decision: 0.368, committed: 0.6, baseline: 0.375 },
  { raw: 0.018, evidence: 0.5, decision: 0.414, committed: 0.675, baseline: 0.4375 },
  { raw: 0.18, evidence: 1000 / 1001, decision: 0.4599080919080919,
    committed: 0.7498501498501499, baseline: 0.49987512487512487 }
];

function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} versus ${expected}`);
}

async function fixture(raw, adherence = 0) {
  let draws = 0;
  const controller = new AntController({ random: () => { draws += 1; return 0.5; },
    state: { population: { activationFeedback: false }, pheromone: { depositionMode: 'continuous' } } });
  await controller.init();
  controller.syncRecruitment = () => {};
  controller.nextSpawnTimeMs = null;
  const ant = controller.agents[0];
  ant.x = ant.y = 0.5;
  ant.heading = ant.intentHeading = 0;
  ant.vx = 0.08; ant.vy = 0;
  ant.trailAdherence = adherence;
  ant.decisionRemaining = ant.committedRemaining = 0;
  ant.inspectionRemaining = 100;
  ant.hesitationRemaining = 0;
  controller.field.sample = () => raw;
  return { controller, ant, draws: () => draws };
}

async function decision(raw) {
  const { controller, ant, draws } = await fixture(raw);
  try {
    const local = controller.senseLocalTrail(ant);
    const before = draws();
    controller.updateIntention(ant, controller.agents,
      controller.occupancy.sense(ant, controller.agents), DT, local);
    return { local, confidence: ant.trailConfidence, adherence: ant.trailAdherence,
      decision: ant.decisionRemaining, committed: ant.committedRemaining,
      draws: draws() - before, intent: ant.intentHeading };
  } finally { await controller.destroy(); }
}

async function depositedMultiplier(raw, adherence = 0) {
  const { controller, ant } = await fixture(raw, adherence);
  try {
    ant.decisionRemaining = ant.committedRemaining = 100;
    const advance = controller.gasterDeposition.advance.bind(controller.gasterDeposition);
    let dose = 0;
    controller.gasterDeposition.advance = (...args) => {
      const deposits = advance(...args);
      for (const deposit of deposits) dose += deposit.type === 'point' ? deposit.amount
        : Math.hypot(deposit.to.x - deposit.from.x, deposit.to.y - deposit.from.y)
          * deposit.amountPerUnitDistance;
      return deposits;
    };
    const before = { x: ant.x, y: ant.y };
    controller.tick(DT);
    const distance = Math.hypot(ant.x - before.x, ant.y - before.y);
    assert.ok(distance > 0 && dose > 0, 'real thorax travel produces real gaster dose');
    assert.ok(controller.field.getSnapshot().totalMass > 0, 'the real pheromone field receives the dose');
    return { multiplier: dose / distance / 4.5, adherence: ant.trailAdherence };
  } finally { await controller.destroy(); }
}

test('absolute uniform evidence adds neither route confidence nor adherence nor random draws', async () => {
  const captures = await Promise.all(conditions.map(({ raw }) => decision(raw)));
  for (let index = 0; index < captures.length; index += 1) {
    const capture = captures[index];
    near(capture.local.strength, conditions[index].evidence, 'absolute local evidence');
    assert.equal(capture.local.coherence, 0);
    assert.equal(capture.local.steering, 0);
    assert.equal(capture.confidence, 0, 'uniform evidence has no preferred direction');
    assert.equal(capture.adherence, 0, 'absolute evidence does not claim route following');
    assert.equal(capture.draws, 14, 'the existing decision consumes the same random draws');
    assert.equal(capture.intent, captures[0].intent, 'uniform evidence adds no directional bias');
  }
});

test('weak evidence shortens decision clocks and intermediate evidence restores them continuously', async () => {
  const captures = await Promise.all(conditions.map(({ raw }) => decision(raw)));
  for (let index = 0; index < captures.length; index += 1) {
    near(captures[index].decision, conditions[index].decision, 'decision duration');
    near(captures[index].committed, conditions[index].committed, 'committed duration');
    assert.ok(captures[index].decision >= 0.368 && captures[index].decision <= 0.46);
    assert.ok(captures[index].committed >= 0.6 && captures[index].committed <= 0.75);
    if (index > 0) {
      assert.ok(captures[index].decision > captures[index - 1].decision);
      assert.ok(captures[index].committed > captures[index - 1].committed);
    }
  }
});

test('weak evidence reduces only the baseline trace and intermediate evidence restores it continuously', async () => {
  const captures = await Promise.all(conditions.map(({ raw }) => depositedMultiplier(raw)));
  for (let index = 0; index < captures.length; index += 1) {
    near(captures[index].multiplier, conditions[index].baseline, 'distance-normalized baseline dose');
    assert.equal(captures[index].adherence, 0);
    assert.ok(captures[index].multiplier >= 0.375 - 1e-10 && captures[index].multiplier <= 0.5 + 1e-10);
    if (index > 0) assert.ok(captures[index].multiplier > captures[index - 1].multiplier);
  }
});

test('absolute evidence preserves the full quadratic adherence reinforcement increment', async () => {
  for (const { raw } of conditions) {
    const baseline = await depositedMultiplier(raw);
    const reinforced = await depositedMultiplier(raw, 0.6);
    near(reinforced.adherence, 0.6 * Math.exp(-DT / 1.8), 'the existing adherence fade is unchanged');
    near(reinforced.multiplier - baseline.multiplier, 5 * reinforced.adherence ** 2,
      'absolute evidence does not multiply or attenuate reinforcement');
  }
});
