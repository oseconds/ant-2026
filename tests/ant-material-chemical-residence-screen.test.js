import test from 'node:test';
import { lifecycleTest, selfTest, verifySourceAuthority } from '../scripts/ant-material-chemical-residence-screen.js';

test('material-conditioned residence uses one native Float32 decay call and tick-entry material', () => {
  const result = selfTest();
  if (result.status !== 'PASS') throw new Error('residence self-test failed');
});

test('residence and source observers attach before init creates the native field', async () => {
  const result = await lifecycleTest();
  if (result.status !== 'PASS') throw new Error('residence lifecycle test failed');
});

test('production sources match the Pass 3 frozen authority hashes', async () => {
  const hashes = await verifySourceAuthority();
  if (Object.keys(hashes).length !== 11) throw new Error('incomplete production source authority check');
});
