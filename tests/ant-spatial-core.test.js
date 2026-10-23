import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { makeSpatialController } from '../scripts/ant-spatial-core.js';

function random(seed) {
  let state = seed >>> 0, count = 0;
  const draw = () => { count++; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  draw.status = () => ({ state, count });
  return draw;
}

test('north observer preserves every tick public snapshot and RNG including initial spawn', async () => {
  const { Controller } = await makeSpatialController();
  const a = random(20261005), b = random(20261005);
  const plain = new AntController({ random: a }), shadow = new Controller({ random: b });
  let spawns = 0, ticks = 0;
  shadow.spatialObserver = { onSpawn: () => spawns++, onTick: event => {
    ticks++; assert.equal(event.tick, ticks); assert.ok(Array.isArray(event.segments));
  } };
  await plain.init(); await shadow.init();
  assert.deepEqual(shadow.getSnapshot(), plain.getSnapshot());
  for (let i = 0; i < 600; i++) {
    plain.tick(1 / 60); shadow.tick(1 / 60);
    assert.deepEqual(shadow.getSnapshot(), plain.getSnapshot());
    assert.deepEqual(a.status(), b.status());
  }
  assert.equal(spawns, plain.totalSpawned); assert.equal(ticks, 600);
  plain.destroy(); shadow.destroy();
});

test('movement candidates change only their explicit omega expression and reject unknown modes', async () => {
  for (const movement of ['dtFeedback', 'dampingOff']) {
    const { receipt } = await makeSpatialController({ movement });
    assert.equal(receipt.changes.filter(change => change.mechanism === 'movement').length, 1);
  }
  await assert.rejects(makeSpatialController({ movement: 'gainSweep' }));
});
