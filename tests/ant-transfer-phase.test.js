import test from 'node:test';
import assert from 'node:assert/strict';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { replayFieldWrites } from '../scripts/ant-transfer-capture.js';
import { comparePhaseZero } from '../scripts/ant-transfer-phase-runs.js';
import {
  createTranslatedFieldView, instrumentControllerSensorSamples, phaseOffsets, phaseRasterMatches,
  qualifyPhaseSamples, replayPhaseHistory
} from '../scripts/ant-transfer-phase.js';

test('default phase offsets are the preregistered four half-cell translations', () => {
  assert.deepEqual(phaseOffsets(), [
    { id: 'p00', dx: 0, dy: 0 },
    { id: 'p10', dx: 0.5 / 95, dy: 0 },
    { id: 'p01', dx: 0, dy: 0.5 / 95 },
    { id: 'p11', dx: 0.5 / 95, dy: 0.5 / 95 }
  ]);
});

test('phase zero exactly replays the same ordered raster history', () => {
  const options = { width: 16, height: 12, decayHalfLifeSeconds: 15, maxValue: 8 };
  const events = [
    { type: 'field-deposit-write', deposit: { type: 'segment', from: { x: 0.2, y: 0.45 },
      to: { x: 0.8, y: 0.45 }, amountPerUnitDistance: 0.4 }, radius: 0.08 },
    { type: 'field-decay', dt: 0.75 },
    { type: 'field-deposit-write', deposit: { type: 'point', position: { x: 0.61, y: 0.57 }, amount: 0.2 }, radius: 0.04 }
  ];
  const reference = new PheromoneField(options);
  events[0].returnedDose = reference.depositSegment(events[0].deposit.from, events[0].deposit.to,
    { amountPerUnitDistance: events[0].deposit.amountPerUnitDistance, radius: events[0].radius });
  reference.decay(events[1].dt);
  events[2].returnedDose = reference.depositPoint(events[2].deposit.position,
    { amount: events[2].deposit.amount, radius: events[2].radius });
  const replay = replayPhaseHistory({ field: new PheromoneField(options), events,
    phase: phaseOffsets(options.width, options.height)[0], replayFieldWrites });

  assert.equal(phaseRasterMatches(replay.field, reference.values), true);
  assert.deepEqual(replay.field.values, reference.values);
  assert.equal(replay.samples.length, 0);
  assert.equal(replay.writes.length, 2);
  const wrongDoseReceipt = structuredClone(events);
  wrongDoseReceipt[0].returnedDose += 1;
  assert.throws(() => replayPhaseHistory({ field: new PheromoneField(options), events: wrongDoseReceipt,
    phase: phaseOffsets(options.width, options.height)[0], replayFieldWrites }), /changed returned dose/);
});

test('complete phase history refuses a preloaded nonzero raster', () => {
  const field = new PheromoneField();
  field.depositPoint({ x: 0.5, y: 0.5 }, { amount: 0.1 });
  assert.throws(() => replayPhaseHistory({ field, events: [], phase: phaseOffsets()[0], replayFieldWrites }),
    /begin from the zero field/);
});

test('phase qualification rejects non-finite rasters, events, and samples', () => {
  const nonFiniteField = new PheromoneField();
  nonFiniteField.values[0] = Number.NaN;
  assert.throws(() => createTranslatedFieldView(nonFiniteField, phaseOffsets()[0]), /non-finite/);
  assert.throws(() => replayPhaseHistory({ field: new PheromoneField(),
    events: [{ type: 'field-decay', dt: Number.NaN }], phase: phaseOffsets()[0], replayFieldWrites }), /finite non-negative dt/);
  assert.throws(() => qualifyPhaseSamples([{ x: Number.NaN, y: 0.5 }], phaseOffsets()), /finite physical/);
});

test('phase view translates straight writes and reads together while retaining physical coordinates', () => {
  const from = { x: 0.2, y: 0.5 }, to = { x: 0.8, y: 0.5 }, query = { x: 0.35, y: 0.51 };
  const originalFrom = { ...from }, originalTo = { ...to }, originalQuery = { ...query };
  const phase = phaseOffsets()[1];
  const view = createTranslatedFieldView(new PheromoneField(), phase);
  view.field.depositSegment(from, to, { amountPerUnitDistance: 0.2, radius: 0.03 });
  const value = view.withSampleContext({ kind: 'local', antId: 'straight-fixture' },
    () => view.field.sample(query.x, query.y));

  assert.ok(value > 0);
  assert.deepEqual(from, originalFrom);
  assert.deepEqual(to, originalTo);
  assert.deepEqual(query, originalQuery);
  assert.deepEqual(view.writes[0].from, from);
  assert.deepEqual(view.writes[0].fieldFrom, { x: from.x + phase.dx, y: from.y });
  assert.equal(view.samples[0].x, query.x);
  assert.equal(view.samples[0].fieldX, query.x + phase.dx);
  assert.deepEqual(view.samples[0].context, { kind: 'local', antId: 'straight-fixture' });
  assert.ok(Math.abs((view.samples[0].fieldX - view.writes[0].fieldFrom.x) - (query.x - from.x)) < 1e-12);
  assert.ok(Math.abs((view.samples[0].fieldY - view.writes[0].fieldFrom.y) - (query.y - from.y)) < 1e-12);
});

test('controller sensor calls record local and wide context and restore original methods', () => {
  const view = createTranslatedFieldView(new PheromoneField(), phaseOffsets()[0]);
  const controllerPrototype = {
    senseLocalTrail(agent) { return this.field.sample(agent.x, agent.y); },
    senseTrail(agent, heading) {
      return this.field.sample(agent.x + Math.cos(heading) * 0.1, agent.y + Math.sin(heading) * 0.1);
    }
  };
  const controller = Object.assign(Object.create(controllerPrototype), { field: view.field });
  const originalLocal = controller.senseLocalTrail, originalWide = controller.senseTrail;
  const agent = { id: 'ant-a', x: 0.5, y: 0.5 };
  const restore = instrumentControllerSensorSamples(controller, view);
  controller.senseLocalTrail(agent);
  controller.senseTrail(agent, 0.25);
  restore();

  assert.equal(controller.senseLocalTrail, originalLocal);
  assert.equal(controller.senseTrail, originalWide);
  assert.equal(Object.hasOwn(controller, 'senseLocalTrail'), false);
  assert.equal(Object.hasOwn(controller, 'senseTrail'), false);
  assert.deepEqual(view.samples.map(sample => sample.context.kind), ['local', 'wide']);
  assert.deepEqual(view.samples.map(sample => sample.context.antId), ['ant-a', 'ant-a']);
  assert.equal(view.samples[1].context.heading, 0.25);
});

test('continued phase views preserve the fixed-history dose ledger and uncapped raster', () => {
  const field = new PheromoneField({ width: 4, height: 4, maxValue: 0.5 });
  field.values.fill(0.25);
  const uncappedValues = new Float32Array(field.values.length).fill(0.75);
  const view = createTranslatedFieldView(field, phaseOffsets(4, 4)[0], {
    uncappedValues,
    initialLedger: { requestedDose: 3, acceptedDose: 2, boundaryClippedDose: 1, elapsedDecaySeconds: 4 }
  });
  view.field.decay(1);
  const result = view.summarize();
  assert.equal(result.requestedDose, 3);
  assert.equal(result.acceptedDose, 2);
  assert.equal(result.boundaryClippedDose, 1);
  assert.equal(result.elapsedDecaySeconds, 5);
  assert.ok(result.uncappedShadowMass > result.storedMass);
  assert.throws(() => createTranslatedFieldView(field, phaseOffsets(4, 4)[0], {
    initialLedger: { requestedDose: Number.NaN }
  }), /finite non-negative/);
});

test('dose ledger separates requested, accepted, boundary-clipped, decay, storage, and cap loss', () => {
  const field = new PheromoneField({ width: 2, height: 2, decayHalfLifeSeconds: 15, maxValue: 0.5 });
  const view = createTranslatedFieldView(field, { id: 'p00', dx: 0, dy: 0 });
  view.field.depositPoint({ x: 0.5, y: 0.5 }, { amount: 0.75, radius: 0.001 });
  view.field.depositPoint({ x: 0.5, y: 0.5 }, { amount: 0.75, radius: 0.001 });
  view.field.decay(15);
  const summary = view.summarize();
  assert.equal(summary.requestedDose, 1.5);
  assert.equal(summary.acceptedDose, 1.5);
  assert.equal(summary.boundaryClippedDose, 0);
  assert.equal(summary.elapsedDecaySeconds, 15);
  assert.equal(summary.storedMass, 0.25);
  assert.equal(summary.uncappedShadowMass, 0.75);
  assert.equal(summary.capStorageLoss, 0.5);
  assert.equal(summary.cappedCellCount, 0);
});

test('translated segment dose and sensor rows expose finite-boundary cases', () => {
  const phase = phaseOffsets()[1];
  const view = createTranslatedFieldView(new PheromoneField(), phase);
  view.field.depositSegment({ x: -0.2, y: 0.5 }, { x: 0.5, y: 0.5 },
    { amountPerUnitDistance: 1, radius: 0.0045 });
  const dose = view.summarize();
  assert.ok(Math.abs(dose.requestedDose - 0.7) < 1e-12);
  assert.ok(Math.abs(dose.acceptedDose - (0.5 + phase.dx)) < 1e-12);
  assert.ok(Math.abs(dose.boundaryClippedDose - (0.2 - phase.dx)) < 1e-12);

  const [edge, interior] = qualifyPhaseSamples([
    { sampleIndex: 0, x: 0.01, y: 0.5 },
    { sampleIndex: 1, x: 0.5, y: 0.5 }
  ], phaseOffsets());
  assert.equal(edge.boundaryExposed, true);
  assert.equal(edge.interiorAllPhases, false);
  assert.equal(interior.boundaryExposed, false);
  assert.equal(interior.interiorAllPhases, true);
  assert.equal(interior.margin, 0.0045 + 1 / 95);
});

test('phase-zero gate requires exact A trace, state, snapshot, and RNG receipts', () => {
  const baseline = {
    validation: { preStateExact: true, preRngExact: true, preTickPublicSnapshotEqual: true,
      instrumentedVsPlainPostStateExact: true, instrumentedVsPlainPostRngExact: true,
      instrumentedVsPlainPostSnapshotEqual: true },
    trace: [{ sequence: 82, type: 'displacement', agentId: 'ant-a', travelled: 0.003 }],
    instrumentedPostSha256: 'state-a', plainPostSha256: 'state-a',
    publicSnapshotAfterSha256: 'snapshot-a', rngAfterTick: { state: 1, calls: 5 }
  };
  const state = { replay: { modes: { production: baseline } } };
  const run = { trace: [{ sequence: 0, type: 'displacement', agentId: 'ant-a', travelled: 0.003 }],
    postStateSha256: 'state-a', postSnapshotSha256: 'snapshot-a',
    rngAfterTick: { state: 1, calls: 5 } };
  assert.equal(comparePhaseZero(run, state, 'production').passed, true);
  assert.equal(comparePhaseZero({ ...run, trace: [{ ...run.trace[0], travelled: 0.004 }] },
    state, 'production').passed, false);
  assert.equal(comparePhaseZero({ ...run, rngAfterTick: { state: 2, calls: 5 } },
    state, 'production').passed, false);
});
