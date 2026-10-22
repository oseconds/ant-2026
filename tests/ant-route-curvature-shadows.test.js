import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { makeCurvatureController, curvatureVariants } from '../scripts/ant-route-curvature-shadows.js';

test('curvature shadows substitute exactly one production expression and preserve baseline class', async () => {
  assert.equal((await makeCurvatureController()).Controller, AntController);
  const hashes = new Set();
  for (const variant of Object.keys(curvatureVariants).filter(name => name !== 'baseline')) {
    const result = await makeCurvatureController(variant);
    assert.equal(typeof result.Controller.prototype.tick, 'function');
    hashes.add(result.shadowSha256);
    assert.ok(result.substitution.before.length > 0);
  }
  assert.equal(hashes.size, 4);
  await assert.rejects(makeCurvatureController('allOff'));
});
