import test from 'node:test';
import assert from 'node:assert/strict';
import { countPreGapLayers, resumeRecruitmentAtGapEnd } from '../scripts/ant-zero-ant-continuity-shadow.js';

test('pre-gap classification uses strict birth-time provenance', () => {
  const column = [399999.9, 400000, 459999.9, 460000].map(bornAtSimulationTimeMs => ({
    descriptor: { bornAtSimulationTimeMs }
  }));
  assert.equal(countPreGapLayers(column), 1);
  assert.equal(countPreGapLayers([]), 0);
  assert.equal(countPreGapLayers([{ descriptor: {} }]), 0);
});

test('research reentry only schedules recruitment at the controller clock', () => {
  const controller = { agents: [], simulationTimeMs: 460000.00004, nextSpawnTimeMs: Infinity };
  assert.equal(resumeRecruitmentAtGapEnd(controller), controller.simulationTimeMs);
  assert.equal(controller.nextSpawnTimeMs, 460000.00004);
});
