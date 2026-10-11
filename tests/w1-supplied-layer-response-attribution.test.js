import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runAudit } from '../docs/ant/evidence/2026-10-11-w1-supplied-layer-response-attribution/run.mjs';

const result = runAudit({ captureTraces: true });

test('supplied-layer manipulation matches old nodes, strike rings and declared rest boundary', () => {
  const check = result.preInsertionBoundary.manipulation;
  assert.equal(result.priorFeasibilityIntegrity.pass, true);
  assert.equal(check.oldNodeCount, 39);
  assert.equal(check.overlapAddedNodeCount, 30);
  assert.equal(check.overlapCrossLayerZLinkCount, 21);
  assert.equal(check.disjointCrossLayerZLinkCount, 0);
  assert.equal(check.oldNodeKeysMatchByPlateIdAndSolverCell, true);
  assert.equal(check.oldCoefficientsAndWithinLayerTopologyMatch, true);
  assert.equal(check.allRestAtInsertionBoundary, true);
  assert.equal(check.preStrikeOldStateMatch, true);
  assert.equal(check.oldPulseRingMismatchCountBeforeStepping, 0);
  assert.equal(check.newLayerNonzeroPulseIncrementCount, 0);
  assert.equal(check.strikeReachableToOverlappingLinks.reachable, true);
  assert.equal(result.pulseChecks.oldContactPulseIncrementMismatchCount, 0);
});

test('all fixed-horizon controls pass and treatment replay matches byte-for-byte', () => {
  assert.equal(result.judgment, 'SUPPORTED');
  assert.equal(result.validation.manipulationPass, true);
  assert.equal(result.validation.controlsPass, true);
  assert.equal(result.validation.zeroDiagnosticFaults, true);
  assert.equal(result.controls.reinstall.mismatchPhysicsSteps, 0);
  assert.equal(result.controls.noProbe.nonzeroPhysicsSteps, 0);
  assert.equal(result.controls.disjoint.crossLayerZLinks, 0);
  assert.equal(result.controls.deterministicTreatmentReplay.mismatchPhysicsSteps, 0);
  assert.deepEqual(result.arms.treatment.layerActivity.s0.firstAwakeStep, 6);
  assert.equal(result.comparison.firstDivergence.step, 2);
  assert.equal(result.comparison.firstCurrentNodes.length, 3);
  for (const [name, frame] of Object.entries(result.traces)) {
    assert.equal(frame.length, result.traceInfo[name].bytes);
    assert.equal(createHash('sha256').update(frame).digest('hex'), result.traceInfo[name].sha256);
    assert.equal(result.traceInfo[name].frameCount, 3000);
  }
});

test('first inherited-node differences are reproduced by the existing local Z update and Float32 rounding', () => {
  const arithmetic = result.attribution;
  assert.equal(arithmetic.firstDivergenceTargetCount, 3);
  assert.equal(arithmetic.allTargetsPass, true);
  for (const target of arithmetic.targets) {
    const source = target.sourceReconstruction;
    assert.equal(source.sourceStepInputsMatch, true);
    assert.equal(source.sourceDoubleResultsMatchReconstruction, true);
    assert.equal(source.sourceFloat32ResultsMatchObserved, true);
    assert.equal(source.zTermIntervalExcludesZero, true);
    assert.equal(source.treatmentIntervalCrossesOutOfBaselineFloat32Cell, true);
    assert.equal(source.independentlyReconstructedLinkForceMatchesSource, true);
  }
});
