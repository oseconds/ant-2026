import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalBytes, checkReceipt } from '../scripts/ant-singleton-real-stratigraphy-manifest.js';

test('manifest preserves binary bytes and gives text one declared line-ending convention', () => {
  const binary = Buffer.from([0, 13, 10, 255]);
  assert.deepEqual(canonicalBytes('receipt.json.gz', binary), binary);
  assert.equal(canonicalBytes('receipt.md', Buffer.from('a\r\nb\r')).toString(), 'a\nb\n');
});
test('manifest verifies digest and length and rejects altered evidence', () => {
  const bytes = Buffer.from('original\n');
  const row = { path: 'receipt.json', bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') };
  checkReceipt(row, Buffer.from('original\r\n'));
  assert.throws(() => checkReceipt(row, Buffer.from('modified\n')));
});
