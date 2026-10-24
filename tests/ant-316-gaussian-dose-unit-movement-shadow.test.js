import test from 'node:test';
import assert from 'node:assert/strict';
import { ARMS, DOSE_SCALE, createArmField, productionFieldParity, runObserverParity } from '../scripts/ant-316-gaussian-dose-unit-movement-shadow.js';

test('C, F and G hold field geometry fixed within the F/G dose-only pair', () => {
  assert.deepEqual(ARMS.C, { width: 96, scale: 1 });
  assert.deepEqual(ARMS.F, { width: 316, scale: 1 });
  assert.deepEqual(ARMS.G, { width: 316, scale: 3969 / 361 });
  assert.equal(DOSE_SCALE, 3969 / 361);

  const f = createArmField('F'), g = createArmField('G');
  const point = { x: 0.5013, y: 0.6971 };
  assert.equal(f.depositPoint(point, { amount: 0.01, radius: 0.0045 }), 0.01);
  assert.equal(g.depositPoint(point, { amount: 0.01, radius: 0.0045 }), 0.01 * DOSE_SCALE);
  let supportF = 0, supportG = 0, maximumScaledDifference = 0;
  for (let i = 0; i < f.values.length; i += 1) {
    assert.equal(f.values[i] > 0, g.values[i] > 0, 'F/G positive-node support is identical');
    if (f.values[i] > 0) {
      supportF += 1; supportG += 1;
      maximumScaledDifference = Math.max(maximumScaledDifference,
        Math.abs(g.values[i] - f.values[i] * DOSE_SCALE));
    }
  }
  assert.ok(supportF > 1);
  assert.equal(supportF, supportG);
  assert.ok(maximumScaledDifference < 2e-8, 'Float32 dose scaling residual stays at storage scale');
  assert.equal(f.writeStats.saturatedUpdateCount, 0);
  assert.equal(g.writeStats.saturatedUpdateCount, 0);
});

test('instrumented 96-grid field preserves production writer and decay bytes', async () => {
  const receipt = await productionFieldParity();
  assert.equal(receipt.exactBytes, true);
  assert.equal(receipt.writerParityMismatches, 0);
  assert.equal(receipt.decayCalls, 60);
});

test('passive movement observers preserve every tick and the RNG stream in each arm', async () => {
  for (const arm of ['C', 'F', 'G']) {
    const receipt = await runObserverParity(arm, 20261005, 120);
    assert.equal(receipt.equalEveryTick, true);
    assert.equal(receipt.observerCalls.local, receipt.observerCalls.intention);
    assert.ok(receipt.observerCalls.far > 0);
  }
});
