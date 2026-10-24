import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCueGate, preflight } from '../scripts/ant-cic-writer-qualification.js';

test('frozen complete preflight reproduces the current writer and real sensor methods, including JSON zero', () => {
  const result = preflight().receipt;
  assert.equal(result.passed, true);
  assert.equal(result.rows, 5544);
  assert.equal(result.originalRasterParities, 24);
  assert.equal(result.baselineSignErrors, 552);
  assert.equal(result.baselineWideErrors, 2378);
});

function fixture() {
  const comparison = () => ({
    count: 100,
    baseline: { localSignErrors: 12, localSteeringMae: 0.08, wideErrors: 20 },
    candidate: { localSignErrors: 10, localSteeringMae: 0.07, wideErrors: 20 }
  });
  return {
    global: comparison(),
    families: Object.fromEntries(['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve'].map(k => [k, comparison()])),
    phases: Object.fromEntries(['p00', 'p10', 'p01', 'p11'].map(k => [k, comparison()])),
    zeroControls: Object.fromEntries(['straight', 'sCurveAnalyticZero'].map(k => [k, {
      count: 20, baseline: { falseNonzero: 12, falseSteeringMae: 0.03 },
      candidate: { falseNonzero: 10, falseSteeringMae: 0.02 }
    }]))
  };
}

test('cue gate requires joint global improvement and every declared nonregression guard', () => {
  assert.equal(evaluateCueGate(fixture()).passed, true);
});

test('better global numbers cannot hide a mirror-family regression', () => {
  const input = fixture();
  input.families.gentleMirror.candidate.localSteeringMae = 0.081;
  assert.equal(evaluateCueGate(input).passed, false);
});

test('moment conservation or raw-field improvement cannot substitute for a worse cue', () => {
  const input = fixture();
  input.momentGate = { passed: true };
  input.rawSampleMae = { baseline: 1, candidate: 0.1 };
  input.global.candidate.localSignErrors = 13;
  assert.equal(evaluateCueGate(input).passed, false);
});

test('straight and S zero-cue false turns are independently protected', () => {
  const input = fixture();
  input.zeroControls.sCurveAnalyticZero.candidate.falseNonzero = 13;
  assert.equal(evaluateCueGate(input).passed, false);
});

test('empty or missing protection cohorts and nonfinite metrics cannot pass', () => {
  const input = fixture();
  input.zeroControls.straight.count = 0;
  assert.equal(evaluateCueGate(input).passed, false);
  const missing = fixture();
  delete missing.phases.p11;
  assert.equal(evaluateCueGate(missing).passed, false);
  const nonfinite = fixture();
  nonfinite.global.candidate.localSteeringMae = NaN;
  assert.equal(evaluateCueGate(nonfinite).passed, false);
});

test('no numerical-noise allowance is used to forgive a positive MAE regression', () => {
  const input = fixture();
  input.phases.p01.candidate.localSteeringMae = input.phases.p01.baseline.localSteeringMae + Number.EPSILON;
  assert.equal(evaluateCueGate(input).passed, false);
});
