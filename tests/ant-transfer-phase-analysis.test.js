import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePhaseArms, renderReport } from '../scripts/ant-transfer-phase-analysis.js';

const localContext = { kind: 'local', antId: 'ant-a' };
const sample = (value, callIndex = 0, interiorAllPhases = true) => ({
  callIndex, phaseId: 'p00', x: 0.5, y: 0.5, fieldX: 0.5, fieldY: 0.5,
  value, context: localContext, interiorAllPhases, boundaryExposed: !interiorAllPhases
});

function assertMarkdownTableArity(report) {
  const lines = report.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith('|') || !/^\|\s*:?-{3}/.test(lines[index + 1] || '')) continue;
    const columns = lines[index].split('|').length - 2;
    assert.equal(lines[index + 1].split('|').length - 2, columns,
      `Bad table separator at line ${index + 2}: ${lines[index]}`);
    for (let row = index + 2; row < lines.length && lines[row].startsWith('|'); row += 1) {
      assert.equal(lines[row].split('|').length - 2, columns, `Bad table row: ${lines[row].slice(0, 120)}`);
    }
  }
}

function movementArm(phaseId, {
  sampleValue = 1, steering = 0.2, due = false, chosenHeading = 0.1,
  rngBeforeChoice = 12, rngAfterChoice = 14, targetHeading = 0.3,
  headingAfterTurn = 0.2, travelTo = { x: 0.51, y: 0.502 }, interior = true,
  wideSampleValue = null, rngAfterCalls = 20, rngAfterState = 0x12345678,
  rngAfterSeed = 0xabcdef01, rngAlgorithm = 'lcg-1664525-1013904223-u32'
} = {}) {
  const trace = [
    { type: 'intention-input', agentId: 'ant-a', rngCalls: 10,
      localTrail: { left: sampleValue, center: 0.5, right: 0.2, strength: 1.7,
        coherence: 0.6, steering } },
    { type: 'intention-updated', agentId: 'ant-a', rngCalls: 11 }
  ];
  if (due) {
    trace.push({ type: 'wide-options', agentId: 'ant-a', rngCallsBeforeChoice: rngBeforeChoice,
      options: [{ trail: 0.2, score: 0.4 }] });
    trace.push({ type: 'intention-chosen', agentId: 'ant-a', rngCallsAfterChoice: rngAfterChoice,
      chosenHeading, chosenOffset: 0.47 });
  } else {
    trace.push({ type: 'intention-no-choice', agentId: 'ant-a', rngCalls: 11 });
  }
  trace.push(
    { type: 'local-turn', agentId: 'ant-a', rawLocalCueU: steering, feedbackContributionV: 0.01,
      clampedLocalTurn: steering + 0.01 },
    { type: 'target-turn', agentId: 'ant-a', headingBeforeTurn: 0.1,
      targetHeadingAfterCrowding: targetHeading },
    { type: 'target-turn-applied', agentId: 'ant-a', headingAfterTurn, currentOmega: 0.2 },
    { type: 'collision-scales', displacements: [{ agentId: 'ant-a', scale: 0.9 }] },
    { type: 'displacement', agentId: 'ant-a', from: { x: 0.5, y: 0.5 },
      to: travelTo, travelled: Math.hypot(travelTo.x - 0.5, travelTo.y - 0.5), scale: 0.9 }
  );
  const samples = [sample(sampleValue, 0, interior)];
  if (due && Number.isFinite(wideSampleValue)) samples.push({ ...sample(wideSampleValue, 1, interior),
    context: { kind: 'wide', antId: 'ant-a', heading: 0.1 } });
  return { movementMode: 'production', phase: { id: phaseId, dx: 0, dy: 0 }, samples, trace,
    rngAfterTick: { algorithm: rngAlgorithm, seed: rngAfterSeed, state: rngAfterState, calls: rngAfterCalls } };
}

test('paired phase analysis follows an interior sensor change through actual travel', () => {
  const p00 = movementArm('p00', { sampleValue: 1, steering: 0.2 });
  const p10 = movementArm('p10', { sampleValue: 1.2, steering: 0.25,
    targetHeading: 0.35, headingAfterTurn: 0.25, travelTo: { x: 0.512, y: 0.502 } });
  const result = comparePhaseArms(p00, p10, { interiorAntIds: new Set(['ant-a']) });
  const ant = result.antRows[0];

  assert.equal(result.sampleCalls.exactGlobalCallSequence, true);
  assert.equal(ant.interiorEligible, true);
  assert.equal(ant.firstDivergence.stage, 'sensor-read');
  assert.equal(ant.localTrail.fields.steering.changed, true);
  assert.equal(ant.localCue.changed, true);
  assert.equal(ant.targetHeading.changed, true);
  assert.equal(ant.bodyTurn.changed, true);
  assert.equal(ant.actualTravel.vectorChanged, true);
  assert.equal(ant.rngStreamAlignment.branchMismatch, false);
  assert.equal(ant.rngStreamAlignment.absoluteCounterOffsetExposure, false);
});

test('decision intent is compared only when both phase arms are due', () => {
  const p00 = movementArm('p00', { due: true, chosenHeading: 0.2 });
  const p10 = movementArm('p10', { due: false });
  const result = comparePhaseArms(p00, p10);
  const ant = result.antRows[0];

  assert.equal(ant.decision.p00Due, true);
  assert.equal(ant.decision.phaseDue, false);
  assert.equal(ant.decision.comparableDueDecision, false);
  assert.equal(ant.decision.choiceHeadingDeltaRad, null);
  assert.equal(ant.firstDivergence.stage, 'decision-due-branch');
  assert.equal(ant.rngStreamAlignment.branchMismatch, true);
  assert.equal(ant.rngStreamAlignment.drawsComparableAfter, false);
});

test('a traced choice counter difference is labeled as cumulative global RNG stream exposure', () => {
  const p00 = movementArm('p00', { due: true, rngBeforeChoice: 12, rngAfterChoice: 14 });
  const p10 = movementArm('p10', { due: true, rngBeforeChoice: 12, rngAfterChoice: 13,
    chosenHeading: 0.4 });
  const ant = comparePhaseArms(p00, p10).antRows[0];

  assert.equal(ant.decision.comparableDueDecision, true);
  assert.equal(ant.decision.choiceCompared, true);
  assert.ok(Math.abs(ant.decision.choiceHeadingDeltaRad - 0.3) < 1e-12);
  assert.equal(ant.rngStreamAlignment.firstDifference.stage, 'intention-chosen-absolute-global-counter');
  assert.equal(ant.rngStreamAlignment.branchMismatch, false);
  assert.equal(ant.rngStreamAlignment.absoluteCounterOffsetExposure, true);
  assert.equal(ant.rngStreamAlignment.drawsComparableAfter, false);
});

test('boundary-exposed local reads are excluded from the interior-only denominator', () => {
  const p00 = movementArm('p00', { interior: false });
  const p10 = movementArm('p10', { sampleValue: 2, interior: false });
  const result = comparePhaseArms(p00, p10, { interiorAntIds: new Set() });

  assert.equal(result.localReadQualification.p00Calls, 1);
  assert.equal(result.localReadQualification.p00InteriorCalls, 0);
  assert.equal(result.localReadQualification.boundaryExposedAnts, 1);
  assert.equal(result.interiorOnly.antStateCount, 0);
  assert.equal(result.allAnts.localCueChanged.denominator, 1);
});

test('due branch divergence precedes wide reads added only by that branch', () => {
  const p00 = movementArm('p00', { due: true, wideSampleValue: 0.4 });
  const p10 = movementArm('p10', { due: false });
  const ant = comparePhaseArms(p00, p10).antRows[0];

  assert.equal(ant.firstDivergence.stage, 'decision-due-branch');
  assert.equal(ant.decision.comparableDueDecision, false);
  assert.equal(ant.decision.choiceHeadingDeltaRad, null);
});

test('wide sensor value differences are recorded only when both decisions are due', () => {
  const p00 = movementArm('p00', { due: true, wideSampleValue: 0.4 });
  const p10 = movementArm('p10', { due: true, wideSampleValue: 0.5, chosenHeading: 0.2 });
  const ant = comparePhaseArms(p00, p10).antRows[0];

  assert.equal(ant.firstDivergence.stage, 'sensor-read');
  assert.equal(ant.firstDivergence.kind, 'wide');
  assert.equal(ant.decision.comparableDueDecision, true);
  assert.equal(ant.decision.choiceCompared, true);
});

test('the first local sample coordinate mismatch is not hidden by a later raw-value difference', () => {
  const p00 = movementArm('p00', { sampleValue: 1 });
  const p10 = movementArm('p10', { sampleValue: 2 });
  p10.samples[0].x += 0.01;
  const ant = comparePhaseArms(p00, p10).antRows[0];

  assert.equal(ant.firstDivergence.stage, 'sample-call-correspondence');
  assert.equal(ant.firstDivergence.kind, 'local');
  assert.equal(ant.sampleCoordinatesExact, false);
});

test('two trace-only arms with no grid reads have no query-correspondence divergence', () => {
  const p00 = movementArm('p00');
  const p10 = movementArm('p10');
  p00.samples = [];
  p10.samples = [];
  const result = comparePhaseArms(p00, p10);
  const ant = result.antRows[0];

  assert.equal(ant.firstDivergence.stage, 'none-observed');
  assert.equal(ant.interiorEligible, false);
  assert.equal(ant.sampleCoordinatesExact, null);
  assert.equal(ant.localReadCalls.totalAcrossComparedArms, 0);
  assert.equal(result.localReadQualification.observedAnts, 0);
  assert.equal(result.localReadQualification.exactLocalCallSequences, 0);
  assert.equal(result.sensorQueryCorrespondence.local.exactQueryPairs, 0);
  assert.equal(result.allAnts.coordinateExact.denominator, 0);
});

test('same local physical reads remain raw-aligned when arm-global indices differ', () => {
  const p00 = movementArm('p00');
  const p10 = movementArm('p10', { sampleValue: 2 });
  p00.samples[0].callIndex = 4;
  p10.samples[0].callIndex = 9;
  const result = comparePhaseArms(p00, p10);
  const local = result.sensorQueryCorrespondence.local;

  assert.equal(result.sampleCalls.exactGlobalCallSequence, false);
  assert.equal(result.antRows[0].sampleCoordinatesExact, true);
  assert.equal(local.exactQueryPairs, 1);
  assert.equal(local.globalCallIndexEqualPairs, 0);
  assert.equal(local.rawValuesChangedAtExactQuery, 1);
});

test('same wide physical read stays raw-aligned when candidate heading metadata changes', () => {
  const p00 = movementArm('p00', { due: true, wideSampleValue: 0.4 });
  const p10 = movementArm('p10', { due: true, wideSampleValue: 0.5 });
  p10.samples[1].context.heading = 0.2;
  const result = comparePhaseArms(p00, p10);
  const wide = result.sensorQueryCorrespondence.wide;

  assert.equal(wide.exactQueryPairs, 1);
  assert.equal(wide.rawValuesChangedAtExactQuery, 1);
  assert.equal(wide.semanticContextChangedPairs, 1);
  assert.equal(wide.headingMetadataChangedPairs, 1);
  assert.equal(wide.globalCallIndexEqualPairs, 1);
});

test('wide reads at different coordinates and missing wide calls get separate counts', () => {
  const p00 = movementArm('p00', { due: true, wideSampleValue: 0.4 });
  const shiftedX = movementArm('p10', { due: true, wideSampleValue: 0.5 });
  shiftedX.samples[1].x += 0.01;
  const shiftedResult = comparePhaseArms(p00, shiftedX).sensorQueryCorrespondence.wide;
  assert.equal(shiftedResult.exactQueryPairs, 0);
  assert.equal(shiftedResult.unmatchedPairedCalls, 1);
  assert.equal(shiftedResult.missingCalls, 0);

  const missing = movementArm('p10', { due: true });
  const missingResult = comparePhaseArms(p00, missing).sensorQueryCorrespondence.wide;
  assert.equal(missingResult.exactQueryPairs, 0);
  assert.equal(missingResult.unmatchedPairedCalls, 0);
  assert.equal(missingResult.missingCalls, 1);
});

test('world end-tick RNG mismatch stays separate from matching per-ant intention traces', () => {
  const p00 = movementArm('p00');
  const p10 = movementArm('p10', { rngAfterCalls: 21, rngAfterState: 0x76543210 });
  const result = comparePhaseArms(p00, p10);
  const ant = result.antRows[0];

  assert.equal(ant.rngStreamAlignment.branchMismatch, false);
  assert.equal(result.rngStreamAlignment.branchMismatches, 0);
  assert.equal(result.rngStreamAlignment.absoluteCounterOffsetExposures, 0);
  assert.equal(result.rngUsageAtTick.comparable, true);
  assert.equal(result.rngUsageAtTick.callCountEqual, false);
  assert.equal(result.rngUsageAtTick.callCountDelta, 1);
  assert.equal(result.rngUsageAtTick.stateEqual, false);
  assert.equal(result.rngUsageAtTick.seedEqual, true);
  assert.equal(result.rngUsageAtTick.algorithmEqual, true);
  assert.equal(result.rngUsageAtTick.checkpointEqual, false);
});

test('an incomplete end-tick RNG checkpoint is not treated as matching', () => {
  const p00 = movementArm('p00');
  const p10 = movementArm('p10');
  delete p10.rngAfterTick.state;
  const result = comparePhaseArms(p00, p10);

  assert.equal(result.rngUsageAtTick.comparable, false);
  assert.equal(result.rngUsageAtTick.stateEqual, null);
  assert.equal(result.rngUsageAtTick.checkpointEqual, null);
});

test('fresh-choice and held/no-choice denominators and transitions stay separate', () => {
  const freshP00 = movementArm('p00', { due: true });
  const heldPhase = movementArm('p10', { due: false });
  const freshHeld = comparePhaseArms(freshP00, heldPhase);
  const freshHeldStrata = freshHeld.allAnts.decisionStrata;

  assert.equal(freshHeldStrata.p00StatusCounts['fresh-choice'].numerator, 1);
  assert.equal(freshHeldStrata.p00StatusCounts['held-no-choice'].numerator, 0);
  assert.equal(freshHeldStrata.phaseStatusCounts['held-no-choice'].numerator, 1);
  assert.equal(freshHeldStrata.transitions['fresh-choice->held-no-choice'], 1);
  assert.equal(freshHeldStrata.bothFresh.antStates, 0);

  const bothFresh = comparePhaseArms(freshP00, movementArm('p10', { due: true,
    sampleValue: 1.1, steering: 0.3, chosenHeading: 0.4 }));
  assert.equal(bothFresh.allAnts.decisionStrata.bothFresh.antStates, 1);
  assert.equal(bothFresh.allAnts.decisionStrata.bothFresh.optionScoresChanged.denominator, 1);
  assert.equal(bothFresh.allAnts.decisionStrata.bothFresh.choiceHeadingChanged.denominator, 1);
});

test('a prior ant draw changes later absolute counters without attributing it to that later ant', () => {
  const makeTrace = ({ firstUpdated, firstNoChoice, secondInput, secondUpdated, secondNoChoice }) => [
    { type: 'intention-input', agentId: 'ant-a', rngCalls: 0 },
    { type: 'intention-updated', agentId: 'ant-a', rngCalls: firstUpdated },
    { type: 'intention-no-choice', agentId: 'ant-a', rngCalls: firstNoChoice },
    { type: 'intention-input', agentId: 'ant-b', rngCalls: secondInput },
    { type: 'intention-updated', agentId: 'ant-b', rngCalls: secondUpdated },
    { type: 'intention-no-choice', agentId: 'ant-b', rngCalls: secondNoChoice }
  ];
  const p00 = movementArm('p00');
  const p10 = movementArm('p10');
  p00.trace = makeTrace({ firstUpdated: 1, firstNoChoice: 1,
    secondInput: 1, secondUpdated: 2, secondNoChoice: 2 });
  p10.trace = makeTrace({ firstUpdated: 2, firstNoChoice: 2,
    secondInput: 2, secondUpdated: 3, secondNoChoice: 3 });
  const result = comparePhaseArms(p00, p10);
  const laterAnt = result.antRows.find(row => row.antId === 'ant-b');

  assert.equal(laterAnt.rngStreamAlignment.branchMismatch, false);
  assert.equal(laterAnt.rngStreamAlignment.absoluteCounterOffsetExposure, true);
  assert.equal(laterAnt.rngStreamAlignment.firstDifference.stage, 'intention-input-absolute-global-counter');
  assert.equal(result.rngStreamAlignment.absoluteCounterOffsetExposures, 2);
});

test('report renderer accepts the full seed-origin aggregate and emits separate RNG and decision strata', () => {
  const incidence = { numerator: 0, denominator: 0 };
  const status = { antStates: 0, localReadAntStates: 0, phaseStatusChanged: incidence,
    localCueChanged: incidence, targetHeadingChanged: incidence, bodyTurnChanged: incidence,
    travelAngleChanged: incidence, travelVectorChanged: incidence };
  const statuses = ['fresh-choice', 'held-no-choice', 'due-no-choice', 'ambiguous/missing'];
  const decisionStrata = {
    p00StatusCounts: Object.fromEntries(statuses.map(key => [key, incidence])),
    phaseStatusCounts: Object.fromEntries(statuses.map(key => [key, incidence])),
    byP00Status: Object.fromEntries(statuses.map(key => [key, status])),
    transitions: {},
    bothFresh: { antStates: 0, optionScoresChanged: incidence, choiceHeadingChanged: incidence,
      meanAbsoluteChoiceHeadingDeltaRad: null, choiceHeadingDeltaDenominator: 0 }
  };
  const query = { exactQueryPairs: 0, pairedCalls: 0, globalCallIndexEqualPairs: 0,
    headingMetadataChangedPairs: 0, rawValuesChangedAtExactQuery: 0,
    unmatchedPairedCalls: 0, missingCalls: 0 };
  const magnitude = { meanAbsolute: null, denominator: 0 };
  const comparison = {
    phaseId: 'p10', movementMode: 'production', states: 11,
    sampleCalls: { exactGlobalCallSequence: true },
    localReadQualification: { allLocalReadsInteriorAnts: 1, observedAnts: 2,
      boundaryExposedCalls: { p00: 0 }, p00Calls: 2,
      exactLocalCallSequences: 1 },
    sensorQueryCorrespondence: { local: query, wide: query },
    rngStreamAlignment: { branchMismatches: 0, absoluteCounterOffsetExposures: 0, antStates: 0 },
    rngUsageAtTick: { callCountDelta: 0, stateEqual: true, seedEqual: true,
      algorithmEqual: true, checkpointEqual: true },
    allAnts: { localInteriorAntStates: 0, localReadAntStates: 0,
      boundaryExposedAntStates: 0, boundaryExposedLocalCalls: 0, localReadCalls: 0,
      exactGlobalCallSequences: incidence, exactLocalCallSequences: incidence,
      sensorQueryCorrespondence: { local: query, wide: query }, localCueChanged: incidence,
      decisionDueStatusChanged: incidence, dueOptionsChanged: incidence,
      chosenHeadingChanged: incidence, targetHeadingChanged: incidence, bodyTurnChanged: incidence,
      collisionScaleChanged: incidence, travelAngleChanged: incidence, travelDistanceChanged: incidence,
      travelVectorChanged: incidence,
      cueChangedAndTravelVectorChanged: incidence, antStateDenominator: 0,
      intentionRngDiverged: incidence,
      rngStreamAlignment: { branchMismatches: 0, absoluteCounterOffsetExposures: 0, antStates: 0 },
      rngUsageAtTick: { checkpointDifferentTicks: incidence, changedCallCountTicks: incidence,
        stateDifferentTicks: incidence, seedDifferentTicks: incidence, algorithmDifferentTicks: incidence,
        meanCallCountDelta: null },
      decisionStrata,
      magnitudes: { meanAbsLocalCueDelta: magnitude, meanAbsSteeringDelta: magnitude,
        meanAbsTargetHeadingDeltaRad: magnitude, meanAbsBodyTurnDeltaRad: magnitude,
        meanAbsCollisionScaleDelta: magnitude, meanAbsTravelAngleDeltaRad: magnitude,
        meanAbsTravelDistanceDelta: magnitude } },
    interiorOnly: { localCueChanged: incidence, travelAngleChanged: incidence },
    firstDivergenceCounts: {}, dose: []
  };
  const result = renderReport({
    qualification: { phaseZeroPassedCount: 66 },
    inputReceipts: { captureCount: 66, matrixManifestSha256: 'matrix', cohortManifestSha256: 'cohort',
      phaseHelperSha256: 'phase', currentRunnerSha256: 'runner', frozenSourceHashes: {}, runnerRevisions: [] },
    captures: [{ captureId: 'capture-7', originPolicy: 'production', seed: 7, secondsCompleted: 30,
      comparisons: [comparison], dose: [{ phaseId: 'p10', armDeltaVsP00: [{
        movementMode: 'production', oneTick: { acceptedDose: 0, boundaryClippedDose: 0 },
        oneTickStorageDelta: { storedMass: 0, capStorageLoss: 0 }
      }] }] }],
    groups: [{ originPolicy: 'production', seed: 7, comparisons: [comparison] }],
    counterexamples: { largestObservedTravelAngleDelta: null,
      cueChangedButTravelVectorUnchanged: null, travelVectorChangedWithoutLocalCueChange: null,
      boundaryExposedCueChange: null }
  });

  assert.match(result, /Seed and origin summaries/);
  assert.match(result, /Fresh-choice and held\/no-choice strata/);
  assert.match(result, /absolute cumulative RNG-counter offsets/);
  assert.match(result, /End-tick whole-arm RNG checkpoint/);
  assertMarkdownTableArity(result);
  assert.doesNotMatch(result, /\b(?:undefined|NaN)\b/);
  const captureRow = result.split('\n').find(line => line.startsWith('| production | capture-7 | 7 | 30 | p10 | production |'));
  assert.match(captureRow, /\| 1\/2 \|/);
  assert.doesNotMatch(result, /undefined\/undefined/);
});
