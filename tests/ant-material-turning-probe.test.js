import test from 'node:test';
import assert from 'node:assert/strict';
import { selfTest } from '../scripts/ant-material-turning-probe.js';

test('material turning probe preserves the native motor contract', () => {
  assert.deepEqual(selfTest(), { lawBounds: true, entrySnapshotIsolated: true, nativeL0AndDisabled: true,
    trueAngularVelocity: true, targetIntentUntouched: true, recruitedAgentSupported: true,
    removedAgentRestored: true, matchedNativeCallback: true, rngCallsAdded: 0 });
});
