import test from 'node:test';
import assert from 'node:assert/strict';
import { safePath, verifyReceipt, canonicalBytes, isAllowedArchivePath, isPackageFile } from '../scripts/ant-local-x-audio-manifest.js';
import { createHash } from 'node:crypto';

test('manifest paths reject traversal and archive references', () => {
  assert.throws(() => safePath('../outside.txt'));
  assert.throws(() => safePath('docs/ant/archive/unapproved.md'));
  const historical = 'docs/ant/archive/2026-10-11-plate-deposit-material-boundary.md';
  assert.equal(isAllowedArchivePath(historical), true);
  assert.doesNotThrow(() => safePath(historical));
  assert.equal(isAllowedArchivePath('docs/ant/archive/old.md'), false);
});

test('package links stay in package inventory instead of documentation receipts', () => {
  const base = 'docs/ant/evidence/2026-11-01-local-x-audio-reassessment';
  assert.equal(isPackageFile(`${base}/REPORT.md`), true);
  assert.equal(isPackageFile(`${base}/manifest.json`), true);
  assert.equal(isPackageFile(`${base}/SHA256SUMS`), true);
  assert.equal(isPackageFile('docs/ant/README.md'), false);
});

test('receipt verification catches a changed payload and canonicalizes text newlines', () => {
  const bytes = Buffer.from('a\r\nb\r');
  const canonical = canonicalBytes('docs/example.md', bytes);
  const receipt = { path: 'docs/example.md', bytes: canonical.length,
    sha256: createHash('sha256').update(canonical).digest('hex') };
  assert.doesNotThrow(() => verifyReceipt(receipt, bytes));
  assert.throws(() => verifyReceipt(receipt, Buffer.from('changed')));
});
