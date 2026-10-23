import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { createGzip, createGunzip } from 'node:zlib';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'packed-results.json');
const inputs = [
  'baseline/seed-20261005/result.json',
  'baseline/seed-20261006/result.json',
  'baseline/seed-20261007/result.json',
  'movement/controlled-results.json',
  ...['20261005', '20261006', '20261007'].map((seed) => `movement/natural/dtFeedback-${seed}/result.json`),
  'movement/natural/dampingOff-20261005/result.json',
  ...['20261005', '20261006', '20261007'].flatMap((seed) => [
    `recruitment/natural/isotropic-${seed}/result.json`,
    `recruitment/natural/flow-${seed}/result.json`,
  ]),
  'long-run/production-20261005/result.json',
  'long-run/dtFeedback-20261005/result.json',
];
const maxGzipBytes = 100_000_000;

function hashCounter() {
  const hash = createHash('sha256');
  let bytes = 0;
  return {
    stream: new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk);
        bytes += chunk.length;
        callback(null, chunk);
      },
    }),
    digest: () => hash.digest('hex'),
    get bytes() { return bytes; },
  };
}

async function assertAbsent(target) {
  try {
    await fs.access(target);
    throw new Error(`Refusing to overwrite existing output: ${path.relative(root, target)}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function exists(target) {
  try { await fs.access(target); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function selfCheck() {
  const sample = Buffer.from('byte-preserving package check\0\n', 'utf8');
  const packed = await new Promise((resolve, reject) => {
    const gzip = createGzip();
    const chunks = [];
    gzip.on('data', (chunk) => chunks.push(chunk));
    gzip.on('error', reject);
    gzip.on('end', () => resolve(Buffer.concat(chunks)));
    gzip.end(sample);
  });
  const restored = await new Promise((resolve, reject) => {
    const gunzip = createGunzip();
    const chunks = [];
    gunzip.on('data', (chunk) => chunks.push(chunk));
    gunzip.on('error', reject);
    gunzip.on('end', () => resolve(Buffer.concat(chunks)));
    gunzip.end(packed);
  });
  if (!restored.equals(sample)) throw new Error('In-memory gzip round-trip self-check failed');

  const probe = path.join(path.dirname(fileURLToPath(import.meta.url)), '.package-results-self-check.tmp');
  await fs.writeFile(probe, 'occupied', { flag: 'wx' });
  try {
    let refused = false;
    try { await assertAbsent(probe); } catch (error) { refused = /Refusing to overwrite/.test(error.message); }
    if (!refused) throw new Error('Overwrite-refusal self-check failed');
  } finally {
    await fs.unlink(probe);
  }
}

await selfCheck();
if (inputs.length !== 16 || new Set(inputs).size !== 16) throw new Error(`Expected 16 unique inputs, found ${inputs.length}`);
await assertAbsent(manifestPath);
for (const relative of inputs) {
  const raw = path.join(root, relative);
  const gzip = `${raw}.gz`;
  await fs.access(raw);
  // Existing canonical siblings are retained and verified below.
}

const entries = [];
for (const relative of inputs) {
  const raw = path.join(root, relative);
  const packed = `${raw}.gz`;
  const sourceHash = hashCounter();
  if (await exists(packed)) {
    await pipeline(createReadStream(raw), sourceHash.stream, new Writable({ write(_chunk, _encoding, callback) { callback(); } }));
  } else {
    try {
      await pipeline(createReadStream(raw), sourceHash.stream, createGzip(), createWriteStream(packed, { flags: 'wx' }));
    } catch (error) {
      throw error;
    }
  }
  const rawSha256 = sourceHash.digest();
  const restoredHash = hashCounter();
  await pipeline(createReadStream(packed), createGunzip(), restoredHash.stream, new Writable({ write(_chunk, _encoding, callback) { callback(); } }));
  const gzipStat = await fs.stat(packed);
  if (restoredHash.bytes !== sourceHash.bytes || restoredHash.digest() !== rawSha256) {
    throw new Error(`Restored bytes differ from original: ${relative}`);
  }
  if (gzipStat.size >= maxGzipBytes) throw new Error(`Compressed result exceeds 100 MB: ${relative}.gz (${gzipStat.size})`);
  const gzipHash = createHash('sha256');
  for await (const chunk of createReadStream(packed)) gzipHash.update(chunk);
  entries.push({
    raw: relative,
    gzip: `${relative}.gz`,
    rawBytes: sourceHash.bytes,
    gzipBytes: gzipStat.size,
    rawSha256,
    gzipSha256: gzipHash.digest('hex'),
    verified: 'gunzip byte count and SHA-256 match raw file',
  });
  console.log(`verified ${relative}: ${sourceHash.bytes} -> ${gzipStat.size} bytes`);
}

const scriptSha256 = createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex');
await fs.writeFile(manifestPath, `${JSON.stringify({ format: 1, compression: 'gzip', script: path.basename(fileURLToPath(import.meta.url)), scriptSha256, count: entries.length, results: entries }, null, 2)}\n`, { flag: 'wx' });
console.log(`wrote ${path.relative(root, manifestPath)} (${entries.length} results; script SHA-256 ${scriptSha256})`);
