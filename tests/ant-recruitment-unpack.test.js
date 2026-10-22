import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { unpack } from '../scripts/ant-recruitment-unpack.js';

test('unpack verifies and restores canonical raw data without overwriting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ant-unpack-'));
  try {
    const raw = Buffer.from('{"ticks":1}\n');
    const packed = gzipSync(raw);
    const dir = join(root, 'controls', 'baseline-1');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json.gz'), packed);
    await writeReceipt(root, raw, packed);
    assert.deepEqual(await unpack(root), { files: 1 });
    assert.deepEqual(await readFile(join(dir, 'manifest.json')), raw);
    assert.deepEqual(await unpack(root), { files: 1 }, 'same verified raw file is safe to reuse');

    await writeFile(join(dir, 'manifest.json'), 'different');
    await assert.rejects(unpack(root), /refusing to overwrite different raw file/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unpack rejects paths outside the evidence package and mismatched packed bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ant-unpack-'));
  try {
    const raw = Buffer.from('x'), packed = gzipSync(raw);
    await writeReceipt(root, raw, packed, '../outside/manifest.json');
    await assert.rejects(unpack(root), /invalid packing entry/);
    await writeReceipt(root, raw, packed);
    await mkdir(join(root, 'controls', 'baseline-1'), { recursive: true });
    await writeFile(join(root, 'controls', 'baseline-1', 'manifest.json.gz'), Buffer.from('bad'));
    await assert.rejects(unpack(root), /packed receipt mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

async function writeReceipt(root, raw, packed, rawPath = 'controls/baseline-1/manifest.json') {
  const digest = data => createHash('sha256').update(data).digest('hex');
  await writeFile(join(root, 'RAW-PACKING.json'), JSON.stringify({ schemaVersion: 1, files: [{
    rawPath, packedPath: `${rawPath}.gz`, rawSha256: digest(raw), rawBytes: raw.length,
    packedSha256: digest(packed), packedBytes: packed.length
  }] }));
}
