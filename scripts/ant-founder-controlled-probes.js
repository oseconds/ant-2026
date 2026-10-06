import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const paths = {
  baseline: resolve('test-results/founder-baseline/src/lib/agents/ant/AntController.js'),
  current: resolve('src/lib/agents/ant/AntController.js')
};
const output = resolve('docs/ant/evidence/2026-10-07-founder-effect-refinement/controlled-probes.json');
const dt = 1 / 60, seeds = [19, 61, 193, 20261005, 20261006];
const controllers = {}, sourceHashes = {};
for (const [label, path] of Object.entries(paths)) {
  controllers[label] = (await import(pathToFileURL(path).href)).AntController;
  sourceHashes[label] = createHash('sha256').update(await readFile(path)).digest('hex');
}

async function fixture(label, seed, continuous = false) {
  let value = seed >>> 0, draws = 0;
  const random = () => { draws++; value = (1664525 * value + 1013904223) >>> 0; return value / 0x100000000; };
  const controller = new controllers[label]({ random, state: { population: { activationFeedback: false },
    pheromone: { depositionMode: continuous ? 'continuous' : 'dab' } } });
  await controller.init();
  const ant = controller.agents[0];
  Object.assign(ant, { x: .35, y: .507, heading: 0, intentHeading: 0, vx: .08, vy: 0,
    trailAdherence: 0, trailConfidence: 0, decisionRemaining: 0, committedRemaining: 0 });
  controller.agents = [ant];
  controller.syncRecruitment = () => { controller.nextSpawnTimeMs = null; };
  controller.syncRecruitment();
  controller.bodyPoseController.reset();
  let intendedDose = 0, distance = 0, groups = 0, feet = 0;
  const advance = controller.gasterDeposition.advance.bind(controller.gasterDeposition);
  controller.gasterDeposition.advance = (...args) => {
    distance += args[1]; intendedDose += args[1] * args[4]; return advance(...args);
  };
  controller.subscribe(event => { if (event.type === 'foot-contact') {
    groups++; feet += event.payload.contacts.length;
  } });
  return { controller, ant, draws: () => draws, measures: () => ({ distance, intendedDose, groups, feet }) };
}

async function uniformProbe(label, signal) {
  const f = await fixture(label, 75, true), { controller: c, ant: a } = f;
  Object.assign(a, { x: .5, y: .5, hesitationRemaining: 0, inspectionRemaining: 1000 });
  c.field.sample = () => signal;
  const near = c.senseLocalTrail(a), beforeDraws = f.draws();
  c.tick(dt);
  const result = { signal, near, choice: a.intentHeading, confidence: a.trailConfidence,
    adherence: a.trailAdherence, decisionSeconds: a.decisionRemaining, commitmentSeconds: a.committedRemaining,
    effectiveHoldSeconds: Math.min(a.decisionRemaining, a.committedRemaining), draws: f.draws() - beforeDraws,
    ...f.measures(), deliveredMass: c.field.getSnapshot().totalMass };
  result.ratePerTravel = result.intendedDose / result.distance;
  await c.destroy(); return result;
}

async function matureProbe(label, seed) {
  const f = await fixture(label, seed), { controller: c, ant: a } = f;
  c.field.sample = (x, y) => x < .02 || x > .98 ? 0 : .5 * Math.exp(-((y - .5) ** 2) / (2 * .0025 ** 2));
  let adherence = 0, lastSecondAdherence = 0, speed = 0, maxSpeed = 0, maxTurn = 0, excursion = 0;
  const beforeDraws = f.draws();
  for (let tick = 0; tick < 300; tick++) {
    const heading = a.heading; c.tick(dt);
    const turn = Math.atan2(Math.sin(a.heading - heading), Math.cos(a.heading - heading));
    const currentSpeed = Math.hypot(a.vx, a.vy);
    assert.equal(c.agents.length, 1, 'no recruitment or retirement in this controlled five-second trial');
    assert.ok([a.x, a.y, a.trailAdherence, currentSpeed, turn].every(Number.isFinite));
    assert.ok(Math.abs(turn) <= 4.5 * dt + 1e-9, 'approved turn cap');
    adherence += a.trailAdherence; if (tick >= 240) lastSecondAdherence += a.trailAdherence;
    speed += currentSpeed; maxSpeed = Math.max(maxSpeed, currentSpeed);
    maxTurn = Math.max(maxTurn, Math.abs(turn)); excursion = Math.max(excursion, Math.abs(a.y - .5));
  }
  const result = { seed, seconds: 5, start: { x: .35, y: .507, heading: 0, vx: .08 },
    end: { x: a.x, y: a.y, heading: a.heading }, progress: a.x - .35, maxLateralExcursion: excursion,
    finalLateralOffset: Math.abs(a.y - .5), meanAdherence: adherence / 300,
    lastSecondMeanAdherence: lastSecondAdherence / 60, finalAdherence: a.trailAdherence,
    meanSpeed: speed / 300, maxSpeed, maxTurnRadiansPerTick: maxTurn,
    draws: f.draws() - beforeDraws, ...f.measures(), population: c.agents.length,
    minimumBodyGap: null, gapReason: 'One ant: pair gap is not applicable.' };
  await c.destroy(); return result;
}

const evidence = { createdAt: new Date().toISOString(), sourcePaths: paths, sourceHashes,
  scope: 'Controlled fixed fields, one ant, no recruitment, no audio, 60 Hz. Near strength gates only new clocks and baseline dose; directional confidence/adherence remain separate. These trials do not demonstrate natural founder-effect or procession success.',
  uniform: {}, matureCorridor: {}, farOnly: {} };
for (const label of Object.keys(controllers)) {
  evidence.uniform[label] = await Promise.all([0, .018, .4].map(signal => uniformProbe(label, signal)));
  evidence.matureCorridor[label] = await Promise.all(seeds.map(seed => matureProbe(label, seed)));
  const f = await fixture(label, 75), { controller: c, ant: a } = f;
  Object.assign(a, { x: .5, y: .5, hesitationRemaining: 0, inspectionRemaining: 1000 });
  c.field.sample = (x, y) => x >= .533 && x <= .554 ? .35 * Math.exp(-((y - .5) ** 2) / (2 * .0025 ** 2)) : 0;
  const near = c.senseLocalTrail(a), farRaw = c.senseTrail(a, 0), beforeDraws = f.draws();
  c.updateIntention(a, [a], c.occupancy.sense(a, [a]), dt, near);
  evidence.farOnly[label] = { near, farRaw, confidence: a.trailConfidence, adherence: a.trailAdherence,
    decisionSeconds: a.decisionRemaining, commitmentSeconds: a.committedRemaining,
    choice: a.intentHeading, draws: f.draws() - beforeDraws };
  await c.destroy();
}
for (let i = 0; i < 3; i++) {
  const b = evidence.uniform.baseline[i], c = evidence.uniform.current[i], e = c.near.strength;
  assert.equal(b.choice, c.choice, 'paired fresh choice');
  assert.equal(b.draws, c.draws, 'paired fresh random draws');
  assert.equal(c.adherence, 0, 'absolute flat evidence does not establish a route');
  assert.ok(Math.abs(c.decisionSeconds / b.decisionSeconds - (.8 + .2 * e)) < 1e-12);
  assert.ok(Math.abs(c.commitmentSeconds / b.commitmentSeconds - (.8 + .2 * e)) < 1e-12);
  assert.ok(Math.abs(c.ratePerTravel / b.ratePerTravel - (.75 + .25 * e)) < 1e-12);
  assert.ok(Math.abs(c.deliveredMass / c.intendedDose - 1) < 1e-6, 'actual field delivery');
}
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ output, uniformCases: 6, matureCases: 10, farOnlyCases: 2, assertionsPassed: true }));
