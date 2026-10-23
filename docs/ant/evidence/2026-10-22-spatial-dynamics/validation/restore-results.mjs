import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function inside(base, name) {
  const path = resolve(base, name), rel = relative(base, path);
  assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel), 'Manifest path escapes package');
  return path;
}
async function restore(base, entry) {
  const target = inside(base, entry.raw), packed = inside(base, entry.gzip);
  const compressed = await readFile(packed);
  assert.equal(compressed.length, entry.gzipBytes);
  assert.equal(sha(compressed), entry.gzipSha256, `Gzip hash mismatch: ${entry.gzip}`);
  const raw = gunzipSync(compressed);
  assert.equal(raw.length, entry.rawBytes);
  assert.equal(sha(raw), entry.rawSha256, `Raw hash mismatch: ${entry.raw}`);
  try {
    assert.equal(sha(await readFile(target)), entry.rawSha256, `Existing raw file conflicts: ${entry.raw}`);
    return 'verified existing';
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, raw, { flag: 'wx' });
  assert.equal(sha(await readFile(target)), entry.rawSha256);
  return 'restored';
}

if (process.argv.includes('--self-check')) {
  await mkdir(resolve('test-results'), { recursive: true });
  const folder = await mkdtemp(resolve('test-results/ant-spatial-restore-'));
  const raw = Buffer.from('exact bytes\r\n\u0000'), packed = gzipSync(raw);
  const entry = { raw: 'sample.json', gzip: 'sample.json.gz', rawBytes: raw.length,
    gzipBytes: packed.length, rawSha256: sha(raw), gzipSha256: sha(packed) };
  await writeFile(resolve(folder, entry.gzip), packed, { flag: 'wx' });
  assert.equal(await restore(folder, entry), 'restored');
  assert.deepEqual(await readFile(resolve(folder, entry.raw)), raw);
  assert.equal(await restore(folder, entry), 'verified existing');
  await writeFile(resolve(folder, entry.raw), 'conflicting bytes');
  await assert.rejects(restore(folder, entry), /Existing raw file conflicts/);
  assert.throws(() => inside(folder, '../outside'), /escapes/);
  console.log('PASS: exact restore, existing parity, conflict refusal and path boundary');
} else {
  const manifest = JSON.parse(await readFile(resolve(root, 'validation/packed-results.json'), 'utf8'));
  assert.equal(manifest.format, 1); assert.equal(manifest.count, 16);
  assert.equal(manifest.results.length, manifest.count);
  for (const entry of manifest.results) console.log(`${await restore(root, entry)}: ${entry.raw}`);
}
