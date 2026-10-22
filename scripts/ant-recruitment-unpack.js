import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { link, lstat, mkdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const DEFAULT_PACKAGE = resolve(fileURLToPath(new URL('../docs/ant/evidence/2026-10-22-recruitment-founder-survey/', import.meta.url)));
const HEX = /^[a-f0-9]{64}$/;

export async function unpack(packageDir = DEFAULT_PACKAGE) {
  const root = await realpath(packageDir);
  const receiptPath = await safePath(root, 'RAW-PACKING.json');
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  if (receipt.schemaVersion !== 1 || !Array.isArray(receipt.files)) throw new Error('unsupported RAW-PACKING.json schema');
  const seen = new Set();
  const entries = receipt.files.map(validateEntry);
  for (const entry of entries) {
    if (seen.has(entry.rawPath)) throw new Error(`duplicate raw path: ${entry.rawPath}`);
    seen.add(entry.rawPath);
    const packedPath = await safePath(root, entry.packedPath);
    const packed = await hashFile(packedPath);
    if (packed.bytes !== entry.packedBytes || packed.sha256 !== entry.packedSha256) throw new Error(`packed receipt mismatch: ${entry.packedPath}`);
    const rawPath = await safePath(root, entry.rawPath, true);
    if (await exists(rawPath)) {
      const raw = await hashFile(rawPath);
      if (raw.bytes !== entry.rawBytes || raw.sha256 !== entry.rawSha256) throw new Error(`refusing to overwrite different raw file: ${entry.rawPath}`);
      continue;
    }
    await mkdir(dirname(rawPath), { recursive: true });
    const tempPath = join(dirname(rawPath), `.${entry.rawPath.split('/').at(-1)}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`);
    try {
      const hash = createHash('sha256');
      let bytes = 0;
      const meter = new Transform({ transform(chunk, _encoding, callback) {
        bytes += chunk.length; hash.update(chunk); callback(null, chunk);
      } });
      await pipeline(createReadStream(packedPath), createGunzip(), meter, createWriteStream(tempPath, { flags: 'wx' }));
      const actualHash = hash.digest('hex');
      if (bytes !== entry.rawBytes || actualHash !== entry.rawSha256) throw new Error(`raw receipt mismatch: ${entry.rawPath}`);
      try { await link(tempPath, rawPath); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const existing = await hashFile(rawPath);
        if (existing.bytes !== entry.rawBytes || existing.sha256 !== entry.rawSha256) throw new Error(`refusing to overwrite different raw file: ${entry.rawPath}`);
      }
    } finally { await rm(tempPath, { force: true }); }
  }
  return { files: entries.length };
}

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') throw new Error('invalid packing entry');
  const { rawPath, packedPath, rawSha256, packedSha256, rawBytes, packedBytes } = entry;
  if (typeof rawPath !== 'string' || !/^(controls|conditioning|extension)\/[^/]+\/(manifest|births)\.json$/.test(rawPath)
    || packedPath !== `${rawPath}.gz` || !HEX.test(rawSha256) || !HEX.test(packedSha256)
    || !Number.isSafeInteger(rawBytes) || rawBytes < 0 || !Number.isSafeInteger(packedBytes) || packedBytes < 0) {
    throw new Error(`invalid packing entry: ${JSON.stringify(entry)}`);
  }
  return entry;
}

async function safePath(root, relative, allowMissing = false) {
  if (typeof relative !== 'string' || isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..'))
    throw new Error(`unsafe package path: ${relative}`);
  const target = resolve(root, ...relative.split('/'));
  assertWithin(root, target);
  let current = root;
  for (const part of relative.split('/')) {
    current = join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`symlink path rejected: ${relative}`);
    } catch (error) {
      if (error.code === 'ENOENT' && allowMissing) break;
      throw error;
    }
  }
  return target;
}

function assertWithin(root, target) {
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error(`path escapes evidence package: ${target}`);
}
async function hashFile(path) {
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(path)) { hash.update(chunk); bytes += chunk.length; }
  return { bytes, sha256: hash.digest('hex') };
}
async function exists(path) { try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await unpack(process.argv[2] ? resolve(process.argv[2]) : DEFAULT_PACKAGE);
  console.log(`verified ${result.files} canonical raw files`);
}
