import test from 'node:test';
import assert from 'node:assert/strict';
import { runProbe, selfTest } from '../scripts/ant-material-articulation-probe.js';

test('material articulation probe isolates gaster response and preserves authored secretion dose', () => {
  assert.deepEqual(selfTest(), { status: 'PASS', checks: ['native-control-state', 'gaster-only-change',
    'dose-and-travel-parity', 'real-dab-position-change', 'disabled-observation', 'restore-wrapper'] });
});

test('fixed trajectories move real gaster dabs at 30, 60 and 120 Hz', () => {
  const result = runProbe();
  assert.deepEqual(result.runs.map(run => run.hz), [30, 60, 120]);
  for (const run of result.runs) {
    assert.equal(run.comparison.sameThoraxTravel, true);
    assert.equal(run.comparison.sameAuthoredDose, true);
    assert.equal(run.comparison.sameDabCount, true);
    assert(run.comparison.native316FieldNodeCoefficientL1 > 0);
    assert(run.control.pendingBeforeFlush > 0);
    assert.equal(run.control.pendingBeforeFlush, run.L4.pendingBeforeFlush);
    assert.equal(run.control.sourceDose, run.L4.sourceDose);
  }
});
