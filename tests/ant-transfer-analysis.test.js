import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTransferMatrix, renderAnalysisReport } from '../scripts/ant-transfer-analysis.js';

const dt = 1 / 60;

function makeCapture({ originPolicy = 'production', secondsCompleted = 30, entryAdherence = 0.8,
  coherence = 0.5, choice = 'held' } = {}) {
  const capture = {
    captureId: `${originPolicy}-seed-20261005-${secondsCompleted}s`,
    seed: 20261005,
    originPolicy,
    secondsCompleted,
    tick: secondsCompleted * 60,
    simulationTimeMsBeforeTick: secondsCompleted * 1000,
    sampleTimeBeforeTickMs: secondsCompleted * 1000,
    dtSeconds: dt,
    frozenInputSha256: 'a'.repeat(64),
    rngBeforeTick: { algorithm: 'test', seed: 1, state: 2, calls: 100 },
    validation: { naturalPlainInstrumentedStateExact: true, naturalPlainInstrumentedRngExact: true,
      naturalPlainInstrumentedPublicSnapshotEqual: true, reconstructedFieldExact: true,
      reconstructedFieldSha256: 'b'.repeat(64), sampleTickMatchesRequestedTime: true },
    previousSecondTravel: { startTick: secondsCompleted * 60 - 59,
      endTick: secondsCompleted * 60, trace: previousTravel(secondsCompleted * 60 - 59) },
    replay: { modes: {} }
  };
  const settings = {
    production: { feedback: -1.144, localTurn: -0.45, bodyTurn: -0.075, travelAngle: -0.08 },
    dtFeedback: { feedback: -0.019066666666666667, localTurn: 0.08093333333333333, bodyTurn: 0.075, travelAngle: 0.08 },
    dampingOff: { feedback: 0, localTurn: 0.1, bodyTurn: 0.075, travelAngle: 0.09 }
  };
  for (const [mode, values] of Object.entries(settings)) {
    const events = [
      { type: 'intention-input', sequence: 0, agentId: 'ant-1', entryAdherence,
        agent: { x: 0.5, y: 0.25, heading: 0, vx: 0.02, vy: 0, intentHeading: 0.4,
          trailConfidence: 0.2, trailAdherence: entryAdherence, decisionRemaining: 0.2,
          committedRemaining: 0.3, inspectionRemaining: 0.5, hesitationRemaining: 0, wasBlocked: false },
        localTrail: { left: 0.7, center: 0.5, right: 0.3, strength: 0.8, coherence, steering: 0.1 / 0.87 }, rngCalls: 100 },
      { type: 'intention-updated', sequence: 1, agentId: 'ant-1', updatedAdherence: entryAdherence,
        trailConfidence: 0.2, decisionRemaining: 0.2, committedRemaining: 0.3,
        inspectionRemaining: 0.5, hesitationRemaining: 0, wasBlocked: false, rngCalls: 100 },
      ...(choice === 'fresh' ? [
        { type: 'wide-options', sequence: 2, agentId: 'ant-1', confidence: 0.2, exploration: 0.1,
          trailConfidence: 0.2, trailAdherence: entryAdherence, decisionRemaining: 0.2,
          committedRemaining: 0.3, rngCallsBeforeChoice: 104, options: [
          { heading: 0.2, offset: -0.4, trail: 0.1, crowding: 0, score: 0.12 },
          { heading: 0.4, offset: 0, trail: 0.2, crowding: 0, score: 0.24 }
        ] },
        { type: 'intention-chosen', sequence: 3, agentId: 'ant-1', chosenHeading: 0.4,
          chosenOffset: 0, chosenTrail: 0.2, chosenCrowding: 0, chosenScore: 0.24,
          decisionRemaining: 0.2, committedRemaining: 0.3, intentHeading: 0.4, rngCallsAfterChoice: 105 }
      ] : [{ type: 'intention-no-choice', sequence: 2, agentId: 'ant-1', blocked: false,
        newlyBlocked: false, decisionRemaining: 0.2, committedRemaining: 0.3,
        inspectionRemaining: 0.5, hesitationRemaining: 0, wasBlocked: false, rngCalls: 100 }]),
      { type: 'target-heading-base', sequence: 3, agentId: 'ant-1', rawLocalCueU: 0.1,
        feedbackContributionV: values.feedback, unclampedLocalTurn: 0.1 + values.feedback,
        clampedLocalTurn: values.localTurn, previousOmega: 2.3, clampedPreviousOmega: 2.2,
        updatedAdherence: 0.8, localTrail: { left: 0.7, center: 0.5, right: 0.3, strength: 0.8, coherence, steering: 0.1 / 0.87 },
        targetHeadingBeforeCrowding: 0.4 + values.localTurn },
      { type: 'target-turn', sequence: 4, agentId: 'ant-1', headingBeforeTurn: 0,
        intentHeading: 0.4, localTurn: values.localTurn, targetHeadingAfterCrowding: 0.4 + values.localTurn, dt,
        occupancy: { separationX: 0, separationY: 0, frontCrowding: 0, leftCrowding: 0,
          rightCrowding: 0, followingSpeedLimit: null }, separationCrowdBranch: false, frontCrowdBranch: false },
      { type: 'target-turn-applied', sequence: 5, agentId: 'ant-1', headingAfterTurn: values.bodyTurn,
        currentOmega: values.bodyTurn / dt, dt },
      { type: 'accelerate-before', sequence: 6, agentId: 'ant-1', vx: 0.02, vy: 0, dt },
      { type: 'accelerate-after', sequence: 7, agentId: 'ant-1', vx: Math.cos(values.travelAngle) * 0.02,
        vy: Math.sin(values.travelAngle) * 0.02, dt },
      { type: 'collision-scales', sequence: 8, displacements: [{ agentId: 'ant-1', scale: 1 }] },
      { type: 'displacement', sequence: 9, agentId: 'ant-1', from: { x: 0.5, y: 0.25 },
        to: { x: 0.5 + Math.cos(values.travelAngle) * 0.001, y: 0.25 + Math.sin(values.travelAngle) * 0.001 },
        observedTo: { x: 0.5 + Math.cos(values.travelAngle) * 0.001, y: 0.25 + Math.sin(values.travelAngle) * 0.001 },
        travelled: 0.001, scale: 1, dt, vx: Math.cos(values.travelAngle) * 0.02,
        vy: Math.sin(values.travelAngle) * 0.02, exiting: false }
    ];
    capture.replay.modes[mode] = {
      validation: {
        frozenInputSha256: capture.frozenInputSha256,
        preStateExact: true, preRngExact: true, preTickPublicSnapshotEqual: true,
        instrumentedVsPlainPostStateExact: true, instrumentedVsPlainPostRngExact: true,
        instrumentedVsPlainPostSnapshotEqual: true, sameFrozenInput: true,
        originArmPlainReplayEqual: mode === originPolicy ? true : null,
        originArmInstrumentedReplayEqual: mode === originPolicy ? true : null
      },
      rngBeforeTick: capture.rngBeforeTick,
      trace: events
    };
  }
  return capture;
}

function previousTravel(startTick) {
  return Array.from({ length: 60 }, (_, index) => ({
    type: 'displacement', sequence: index, tick: startTick + index, agentId: 'ant-1',
    from: { x: 0.4 + index * 0.001, y: 0.25 }, to: { x: 0.401 + index * 0.001, y: 0.25 },
    dt
  }));
}

test('pairs fixed-state arms and separates cue cancellation, body turn, and actual travel', () => {
  const result = analyzeTransferMatrix({ captures: [makeCapture()] });
  const capture = result.captureResults[0];
  const ant = capture.ants[0];
  assert.equal(ant.captureCausalEligible, true, JSON.stringify(capture.validation.checks));
  assert.equal(ant.modes.production.local.cueClass, 1);
  assert.equal(ant.modes.production.local.clampedLocalTurn, -0.45);
  assert.equal(ant.modes.production.body.turnRad, -0.075);
  assert.ok(Math.abs(ant.modes.production.target.commandErrorRad - 0.025) < 1e-12);
  assert.ok(ant.modes.production.travel.deltaFromPriorSegment < 0);
  assert.equal(capture.pairs.find(row => row.leftMode === 'production' && row.rightMode === 'dtFeedback').firstDivergence,
    'localTurn');
  assert.equal(ant.modes.production.travel.chordDisplacementRate,
    ant.modes.production.travel.distance / dt);
  assert.equal(ant.modes.production.strata.adherence, 'high');
  assert.equal(ant.modes.production.strata.rasterPhase, 'xhigh-yhigh');
  assert.deepEqual(ant.modes.production.entry.rasterPhase, { x: 0.5, y: 0.75, bin: 'xhigh-yhigh' });
  const emptySector = result.summaries.find(row => row.leftMode === 'production' && row.rightMode === 'dtFeedback'
    && row.stratumDimension === 'headingSector' && row.stratumValue === 7);
  assert.equal(emptySector.antWorldObservations, 0);
  assert.equal(emptySector.transferCounts.leftLocal.reversed, 0);
});

test('held intent is not treated as a fresh choice and has no stale scores', () => {
  const held = analyzeTransferMatrix({ captures: [makeCapture({ choice: 'held' })] }).captureResults[0].ants[0];
  assert.equal(held.modes.production.choice.status, 'held-no-fresh-choice');
  assert.equal(held.modes.production.choice.options, null);
  const fresh = analyzeTransferMatrix({ captures: [makeCapture({ choice: 'fresh' })] }).captureResults[0].ants[0];
  assert.equal(fresh.modes.production.choice.status, 'fresh');
  assert.equal(fresh.modes.production.choice.options.length, 2);
});

test('same entry state but different local sensor reads invalidates the paired causal comparison', () => {
  const capture = makeCapture();
  capture.replay.modes.dampingOff.trace[0].localTrail.coherence = 0.9;
  const result = analyzeTransferMatrix({ captures: [capture] });
  assert.equal(result.captureResults[0].validation.checks.senseParity, false);
  assert.equal(result.captureResults[0].validation.causalEligible, false);
  assert.equal(result.captureResults[0].pairs[0].causalEligible, false);
});

test('source-formula and previous-travel window mismatches fail the causal gate', () => {
  const formulaMismatch = makeCapture();
  const productionLocal = formulaMismatch.replay.modes.production.trace.find(event => event.type === 'target-heading-base');
  productionLocal.clampedPreviousOmega = 2.3;
  const formulaResult = analyzeTransferMatrix({ captures: [formulaMismatch] }).captureResults[0];
  assert.equal(formulaResult.validation.checks.sourceFormulaParity, false);
  assert.equal(formulaResult.validation.causalEligible, false);

  const gap = makeCapture();
  const { startTick } = gap.previousSecondTravel;
  gap.previousSecondTravel.trace = gap.previousSecondTravel.trace.filter(event => event.tick !== startTick);
  const gapResult = analyzeTransferMatrix({ captures: [gap] }).captureResults[0];
  assert.equal(gapResult.validation.checks.previousTravelWindow, false);
  assert.equal(gapResult.validation.causalEligible, false);
});

test('actuator rate is checked independently from local steering and travel', () => {
  const capture = makeCapture();
  const applied = capture.replay.modes.dampingOff.trace.find(event => event.type === 'target-turn-applied');
  applied.currentOmega = 0;
  const result = analyzeTransferMatrix({ captures: [capture] }).captureResults[0];
  assert.equal(result.validation.checks.turnRateCapConformance, false);
  assert.equal(result.validation.causalEligible, false);
});

test('actual postcollision travel and observed displacement remain separate at a clipped boundary', () => {
  const capture = makeCapture();
  const productionDisplacement = capture.replay.modes.production.trace.find(event => event.type === 'displacement');
  productionDisplacement.to = { x: 0.501, y: 0.25 };
  productionDisplacement.observedTo = { x: 0.5, y: 0.251 };
  productionDisplacement.travelled = 0.001;

  const result = analyzeTransferMatrix({ captures: [capture] });
  const captureResult = result.captureResults[0];
  const production = captureResult.ants[0].modes.production.travel;
  assert.equal(captureResult.validation.checks.observedTravelParity, true);
  assert.equal(captureResult.validation.causalEligible, true);
  assert.ok(Math.abs(production.angle) < 1e-12);
  assert.ok(Math.abs(production.observedAngle - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(production.distance - 0.001) < 1e-12);
  assert.ok(Math.abs(production.observedDistance - 0.001) < 1e-12);
  assert.ok(Math.abs(production.deltaFromPriorSegment) < 1e-12);
  assert.ok(Math.abs(production.observedDeltaFromPriorSegment - Math.PI / 2) < 1e-12);

  productionDisplacement.travelled = 0.002;
  const mismatch = analyzeTransferMatrix({ captures: [capture] }).captureResults[0];
  assert.equal(mismatch.validation.checks.observedTravelParity, false);
  assert.equal(mismatch.validation.causalEligible, false);
});

test('origin histories remain separate and angular comparisons wrap across pi', () => {
  const first = makeCapture({ originPolicy: 'production' });
  const second = makeCapture({ originPolicy: 'dtFeedback' });
  for (const mode of ['production', 'dtFeedback', 'dampingOff']) {
    const applied = second.replay.modes[mode].trace.find(event => event.type === 'target-turn-applied');
    applied.headingAfterTurn = Math.PI - 0.01;
    const target = second.replay.modes[mode].trace.find(event => event.type === 'target-turn');
    target.headingBeforeTurn = -Math.PI + 0.01;
  }
  const result = analyzeTransferMatrix({ captures: [first, second] });
  assert.deepEqual(new Set(result.summaries.map(summary => summary.originPolicy)), new Set(['production', 'dtFeedback']));
  const wrapped = result.captureResults[1].ants[0].modes.production.body.turnRad;
  assert.ok(Math.abs(wrapped - -0.02) < 1e-12);
});

test('report exposes adherence-banded clamp counts and pooled dtFeedback body/travel deltas', () => {
  const analysis = analyzeTransferMatrix({ captures: [
    makeCapture({ entryAdherence: 0.2 }),
    makeCapture({ secondsCompleted: 60, entryAdherence: 0.8 })
  ] });
  analysis.integrity = { manifestSha256: 'a'.repeat(64), sourceFilesVerified: 1,
    generatedFilesVerified: 1, stateFilesVerified: 2, historyStreamsVerified: 1,
    fieldCheckpointsVerified: 2 };
  const report = renderAnalysisReport(analysis);
  assert.match(report, /results\.json\.gz/);
  assert.match(report, /\| production \| 1\/1 \| 0\/0 \| 1\/1 \| 2\/2 \|/);
  assert.match(report, /\| production \| all \| 2 \| 0\/2 .* \|/);
  assert.match(report, /A2 remains unidentified here/);
  assert.doesNotMatch(report, /Across all cue-eligible states/);
});
