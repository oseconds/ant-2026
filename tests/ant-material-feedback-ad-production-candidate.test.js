import test from 'node:test';
import assert from 'node:assert/strict';
import { AntAgent } from '../src/lib/agents/ant/AntAgent.js';
import {
  materialFollowingHeadwayMultiplier,
  materialLocomotionMultiplier,
  materialTurnRateMultiplier
} from '../src/lib/agents/ant/AntController.js';
import { LocalOccupancy } from '../src/lib/agents/ant/LocalOccupancy.js';

function ant(id, x, y, heading, vx, vy) {
  const result = new AntAgent({ id, x, y, heading, random: () => 0.5 });
  result.vx = vx;
  result.vy = vy;
  return result;
}

test('registered material laws preserve identity at L=0 and their authored bounds', () => {
  for (const law of [materialLocomotionMultiplier, materialTurnRateMultiplier,
    materialFollowingHeadwayMultiplier]) assert.equal(law(0), 1);
  assert.ok(materialLocomotionMultiplier(1000) >= 0.9);
  assert.ok(materialTurnRateMultiplier(1000) >= 0.5);
  assert.ok(materialFollowingHeadwayMultiplier(1000) <= 1.5);
  assert.ok(materialLocomotionMultiplier(1) < materialLocomotionMultiplier(0));
  assert.ok(materialTurnRateMultiplier(1) < materialTurnRateMultiplier(0));
  assert.ok(materialFollowingHeadwayMultiplier(1) > materialFollowingHeadwayMultiplier(0));
});

test('A caps only turn rate while D changes only eligible same-flow headway', () => {
  const turning = ant('turning', 0.5, 0.5, 0, 0, 0);
  const q = materialTurnRateMultiplier(4);
  turning.turnToward(1, 1 / 60, 4.5 * q);
  assert.ok(Math.abs(turning.angularVelocity - 4.5 * q) < 1e-12);

  const occupancy = new LocalOccupancy();
  const follower = ant('follower', 0.4, 0.5, 0, 0.08, 0);
  const leader = ant('leader', 0.45, 0.5, 0, 0.06, 0);
  const native = occupancy.sense(follower, [follower, leader]);
  const conditioned = occupancy.sense(follower, [follower, leader], materialFollowingHeadwayMultiplier(4));
  assert.ok(Number.isFinite(native.followingSpeedLimit));
  assert.ok(conditioned.followingSpeedLimit < native.followingSpeedLimit);

  const opposing = ant('opposing', 0.44, 0.5, Math.PI, -0.06, 0);
  assert.deepEqual(occupancy.sense(follower, [follower, opposing], materialFollowingHeadwayMultiplier(4)),
    occupancy.sense(follower, [follower, opposing]));

  const slowFollower = ant('slow-follower', 0.4, 0.5, 0, 0.004, 0);
  const fasterLeader = ant('faster-leader', 0.45, 0.5, 0, 0.012, 0);
  assert.deepEqual(occupancy.sense(slowFollower, [slowFollower, fasterLeader], materialFollowingHeadwayMultiplier(4)),
    occupancy.sense(slowFollower, [slowFollower, fasterLeader]),
    'D leaves the personal-space floor intact when it dominates the headway term');
});
