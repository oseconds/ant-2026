import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOW_VELOCITY_LAWS, runProbe, selfTest } from '../scripts/ant-material-flow-velocity-probes.js';

test('material flow and velocity response laws are registered as distinct bounded candidates', () => {
  assert.match(FLOW_VELOCITY_LAWS.following, /classification, response time, separation and swept guard unchanged/);
  assert.match(FLOW_VELOCITY_LAWS.velocity, /actual movement dt and swept guard unchanged/);
  assert.deepEqual(selfTest(), { lawBounds: true, nativeDisabledExact: true, prospectiveMotorShadow: true,
    accelerationAndBrakingClassified: true, wrapperRestored: true });
  const probe = runProbe();
  const { rows } = probe;
  assert.equal(rows[0].followingHeadwaySeconds, 0.4);
  assert.equal(rows[0].velocityFactor, 1);
  assert(rows.every((row, index) => index === 0 || (row.followingHeadwaySeconds >= rows[index - 1].followingHeadwaySeconds
    && row.velocityFactor <= rows[index - 1].velocityFactor)));
  assert.deepEqual(probe.fixedMotor.dtSeconds, [1 / 30, 1 / 60, 1 / 120]);
  assert.equal(probe.sameFlowGate[0].eligible, true);
  assert(probe.sameFlowGate[0].candidateFollowingSpeedLimit < probe.sameFlowGate[0].nativeFollowingSpeedLimit);
  assert(probe.finalTargetGate[0].prospectiveDesiredSpeedDelta < 0);
  assert.equal(probe.finalTargetGate[0].actualMatchesNative, true);
  assert.equal(probe.finalTargetGate[1].actualMatchesProspective, true);
  assert.equal(probe.finalTargetGate[1].candidateCapBinds, true);
  assert.deepEqual(probe.flowClassifications.map(row => [row.nativeEligible, row.candidateEligible]),
    [[true, true], [false, false], [false, false], [false, false]]);
  assert(probe.flowClassifications.every(row => row.sweptGuardExact
    && row.nativeSeparationX === row.candidateSeparationX
    && row.nativeFrontCrowding === row.candidateFrontCrowding));
});
