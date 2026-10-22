import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionAssay } from '../scripts/ant-route-curvature-decisions.js';

test('matched-state decision assay isolates score and exploration without a gradient', async () => {
  const rows = await decisionAssay({ trials: 300 });
  const find = (variant, adherence) => rows.find(row => row.variant === variant && row.adherence === adherence);
  assert.equal(find('baseline', 0).meanAbsoluteIntentRadians, find('scoreOff', 0).meanAbsoluteIntentRadians);
  assert.equal(find('baseline', 0).meanAbsoluteIntentRadians, find('explorationUncoupled', 0).meanAbsoluteIntentRadians);
  assert.ok(find('scoreOff', 1).lateralIntentFraction > find('baseline', 1).lateralIntentFraction);
  assert.ok(find('explorationUncoupled', 1).lateralIntentFraction > find('baseline', 1).lateralIntentFraction);
});
