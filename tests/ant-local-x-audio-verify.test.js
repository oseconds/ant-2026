import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAudioReceipts } from '../scripts/ant-local-x-audio-verify.js';

test('audio receipts bind all six WAV, schedule, capture, worklet and compiler artifacts', async () => {
  const result = await verifyAudioReceipts();
  assert.equal(result.status, 'PASS');
  assert.equal(result.worlds, 6);
  assert.equal(new Set(result.receipts.map(row => row.wavSha256)).size, 6);
});
