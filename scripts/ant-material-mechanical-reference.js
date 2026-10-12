import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { AntAgent } from '../src/lib/agents/ant/AntAgent.js';
import { materialLocomotionMultiplier } from '../src/lib/agents/ant/AntController.js';

// Constant-input reference isolates velocity relaxation; natural sensing/world dynamics are absent.
const dt = 1 / 60, desired = 0.06, rows = [];
for (const layerCount of [1, 4, 10, 35]) {
  const control = new AntAgent({ id: 'reference', x: 0, y: 0, heading: 0, random: () => 0.5 });
  const neutral = new AntAgent({ id: 'reference', x: 0, y: 0, heading: 0, random: () => 0.5 });
  control.vx = neutral.vx = desired;
  control.accelerateToward(desired * materialLocomotionMultiplier(layerCount), dt);
  neutral.accelerateToward(desired, dt);
  control.x += control.vx * dt;
  neutral.x += neutral.vx * dt;
  const impulseVelocityDifference = neutral.vx - control.vx;
  let firstBelowSpeed1e5Seconds = null, firstBelowSpeed1e12Seconds = null;
  for (let tick = 1; tick <= 60; tick += 1) {
    control.accelerateToward(desired, dt);
    neutral.accelerateToward(desired, dt);
    control.x += control.vx * dt;
    neutral.x += neutral.vx * dt;
    const difference = Math.abs(neutral.vx - control.vx);
    assert.ok(Math.abs(difference - impulseVelocityDifference * Math.exp(-32 * tick * dt)) < 2e-16);
    if (difference <= 1e-5 && firstBelowSpeed1e5Seconds === null) firstBelowSpeed1e5Seconds = tick * dt;
    if (difference <= 1e-12 && firstBelowSpeed1e12Seconds === null) firstBelowSpeed1e12Seconds = tick * dt;
  }
  assert.ok(Math.abs(neutral.vx - control.vx) < 1e-12);
  assert.ok(neutral.x - control.x > 1e-5);
  rows.push({ layerCount, multiplier: materialLocomotionMultiplier(layerCount), impulseVelocityDifference,
    firstBelowSpeed1e5Seconds, firstBelowSpeed1e12Seconds, velocityDifferenceAt1Second: neutral.vx - control.vx,
    positionDifferenceAt1Second: neutral.x - control.x });
}
const result = { baselineCommit: '37131e0c408a9692ecc364ef7298a71c5e7182ad', dtSeconds: dt,
  semantics: 'Single-tick normal resistance versus neutralization; then constant common desired speed 0.06 and heading 0 for 1s. No sensing, collision, deposition, gait, random draws during continuation, or material. Elapsed times start after impulse.',
  interpretation: 'Velocity relaxes quickly under fixed common input. Integrated position offset remains. This is an isolated mechanical reference, not natural-run tail evidence.', rows };
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
