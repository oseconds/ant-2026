import test from 'node:test';
import assert from 'node:assert/strict';
import { selfTest, runProbe } from '../scripts/ant-material-response-timing-probes.js';

test('material response timing probes preserve native responsibilities and expose fixed prospective values', () => {
  assert.deepEqual(selfTest(), {
    adherenceFadeOnly: true, adherenceRiseNative: true, decisionAssignmentOnly: true,
    commitmentAndBlockGatesPreserved: true, disabledNativeAndProspective: true,
    wrapperRestored: true, positiveCountdownNativeExact: true, sameStateDecisionAndDraws: true,
    l0SequenceNativeExact: true, rngCallsAdded: 0
  });
  const probe = runProbe();
  assert.equal(probe.naturalWorldRun, false);
  assert.equal(probe.rngCallsAdded, 0);
  assert.equal(probe.adherence.sample.layers, 4);
  assert.equal(probe.decision.sample.layers, 4);
  assert(probe.adherence.sample.prospectiveValue > probe.adherence.sample.nativeValue);
  assert(probe.decision.sample.prospectiveValue > probe.decision.sample.nativeValue);
});
