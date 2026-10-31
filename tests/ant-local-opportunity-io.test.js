import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRun, readRun, readJson, unpack } from '../scripts/ant-local-opportunity-io.js';

test('chunk roundtrip is deterministic and rejects corrupt chunks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ant-opportunity-io-'));
  try {
    const path = join(dir, 'run.json.gz');
    const source = { schema: 'fixture', anchors: [{ index: 0 }, { index: 1 }, { index: 2 }], tracks: [{ id: 1 }] };
    await writeRun(path, source, 2);
    assert.deepEqual((await readRun(path)).anchors, source.anchors);
    assert.deepEqual((await readRun(path)).tracks, source.tracks);
    const first = await readFile(path);
    await writeRun(path, source, 2);
    assert.deepEqual(await readFile(path), first);
    const index = await readJson(path);
    await writeFile(join(dir, index.anchorsFiles[0]), Buffer.from('corrupt'));
    await assert.rejects(readRun(path), /chunk hash/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('typed arrays decode exact values and reject length mismatch', () => {
  const values = new Float64Array([1, -2, Math.PI]);
  const packed = { type: 'Float64Array', length: 3, data: Buffer.from(values.buffer).toString('base64') };
  assert.deepEqual(unpack(packed), values);
  assert.throws(() => unpack({ ...packed, length: 4 }), /packed array length/);
});
