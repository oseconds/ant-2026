import test from 'node:test';
import assert from 'node:assert/strict';
import { assertControlArtifactHashes, selfTest, verifyBaselineInputs, verifySourceAuthority }
  from '../scripts/ant-material-organism-feedback-screen.js';

test('organism feedback harness wraps real controllers before initialization in both neutral modes', async () => {
  assert.deepEqual(await selfTest(), { status: 'PASS', checks: ['real-controller-preinit-wrap', 'neutral-slowdown-off',
    'both-disabled-candidate-shims', 'disabled-shim-state-parity', 'exact-tick-restoration',
    'late-mask-index-parity', 'no-observer-rng'] });
});

test('organism feedback harness checks all frozen Pass 3 production pins', async () => {
  assert.equal(Object.keys(await verifySourceAuthority()).length, 11);
});

test('organism feedback harness pins immutable baseline inputs', async () => {
  const inputs = await verifyBaselineInputs();
  assert.equal(inputs.originalRawSha256, inputs.pins.originalRaw);
  assert.equal(inputs.lateInputSha256, inputs.pins.lateInput);
  assert.equal(Object.keys(inputs.checkpointSha256).length, 5);
});

test('late reference mask parity compares binary samples with saved index arrays', async () => {
  const result = await selfTest();
  assert.ok(result.checks.includes('late-mask-index-parity'));
});

test('neutral control replay receipt rejects altered saved artifacts', () => {
  const files = ['seed20261005-G-30s.json.gz', 'seed20261005-G-60s.json.gz',
    'seed20261005-G-120s.json.gz', 'seed20261005-G-300s.json.gz', 'seed20261005-G-600s.json.gz'];
  const receipt = { runSummarySha256: 'summary', auxiliarySha256: 'aux', rawSha256: 'raw', inputReceiptSha256: 'inputs',
    checkpointSha256: Object.fromEntries(files.map(file => [file, file])) };
  const actual = { 'run-summary.json': 'summary', 'auxiliary.json.gz': 'aux', 'seed20261005-G-raw.json.gz': 'raw',
    'INPUT-RECEIPTS.json': 'inputs', ...receipt.checkpointSha256 };
  assertControlArtifactHashes(receipt, actual);
  assert.throws(() => assertControlArtifactHashes(receipt, { ...actual, 'seed20261005-G-raw.json.gz': 'tampered' }));
});
