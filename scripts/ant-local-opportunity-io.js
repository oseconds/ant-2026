import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, basename, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export async function readJson(path) {
  const bytes = await readFile(path);
  return JSON.parse(path.endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8'));
}
export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const bytes = Buffer.from(JSON.stringify(value) + '\n');
  await writeFile(path, path.endsWith('.gz') ? gzipSync(bytes, { level: 9, mtime: 0 }) : bytes);
}

// Each chunk stays below V8's single-string limit; all observations remain in the receipt.
export async function writeRun(path, run, chunkSize = 75) {
  assert.ok(Number.isInteger(chunkSize) && chunkSize > 0);
  const metadata = { ...run }, chunkHashes = {};
  for (const key of ['anchors', 'tracks']) {
    if (!Array.isArray(run[key])) continue;
    metadata[key] = [];
    metadata[key + 'Count'] = run[key].length;
    metadata[key + 'Files'] = [];
    const size = key === 'tracks' ? 1500 : chunkSize;
    for (let start = 0; start < run[key].length; start += size) {
      const name = basename(path).replace(/\.json\.gz$/, '') + '-' + key + '-'
        + String(start / size).padStart(3, '0') + '.json.gz';
      const target = resolve(dirname(path), name);
      await writeJson(target, { [key]: run[key].slice(start, start + size) });
      metadata[key + 'Files'].push(name);
      chunkHashes[name] = sha256(await readFile(target));
    }
  }
  metadata.chunkHashes = chunkHashes;
  await writeJson(path, metadata);
}
export async function readRun(path) {
  const run = await readJson(path);
  for (const key of ['anchors', 'tracks']) {
    if (!run[key + 'Files']) continue;
    const rows = [];
    for (const name of run[key + 'Files']) {
      assert.equal(basename(name), name, 'chunk path must remain beside index');
      const target = resolve(dirname(path), name), bytes = await readFile(target);
      assert.equal(sha256(bytes), run.chunkHashes[name], 'chunk hash ' + name);
      const chunk = JSON.parse(gunzipSync(bytes).toString('utf8'));
      assert.ok(Array.isArray(chunk[key]));
      for (const row of chunk[key]) rows.push(row);
    }
    assert.equal(rows.length, run[key + 'Count'], key + ' count');
    run[key] = rows;
  }
  return run;
}
export function unpack(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return value;
  const types = { Uint8Array, Uint16Array, Uint32Array, Int16Array, Int32Array, Float32Array, Float64Array };
  const Type = types[value.type];
  assert.ok(Type && Number.isInteger(value.length), 'known packed numeric array');
  const bytes = Buffer.from(value.data, 'base64');
  assert.equal(bytes.byteLength, value.length * Type.BYTES_PER_ELEMENT, 'packed array length');
  return new Type(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
