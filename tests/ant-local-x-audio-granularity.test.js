import test from 'node:test';
import { assertGranularityHelpers } from '../scripts/ant-local-x-audio-granularity.js';

test('granularity diagnostic helpers verify deterministic isolated one-node recurrence and graph reachability', () => {
  assertGranularityHelpers();
});
