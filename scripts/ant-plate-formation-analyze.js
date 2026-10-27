import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePacket } from './lib/antOmittedHistory.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(root, 'docs/ant/evidence/2026-10-28-plate-formation-gate/data');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = JSON.parse(await readFile(resolve(out, 'capture.json'), 'utf8'));
const input = await readFile(resolve(out, 'history-packet.json.gz'));
assert.equal(sha(input), receipt.packetSha256);
const bytes = gunzipSync(input); assert.equal(sha(bytes), receipt.rawSha256);
const packet = JSON.parse(bytes);
const random = Math.random;
let first, second;
try {
  Math.random = () => { throw new Error('Analysis must use no RNG'); };
  first = JSON.stringify(analyzePacket(packet));
  second = JSON.stringify(analyzePacket(packet));
} finally { Math.random = random; }
assert.equal(first, second, 'frozen analysis must rerun deterministically');
const result = JSON.parse(first);
assert.equal(result.summary.firstBirthO, 506);
assert.equal(result.summary.firstBirthTick, 5041);
const target = resolve(out, 'omitted-history.json');
if (process.argv.includes('--check')) assert.equal(await readFile(target, 'utf8'), first + '\n');
else {
  await assert.rejects(readFile(target), { code: 'ENOENT' }, 'never overwrite a measured result');
  await writeFile(target, first + '\n');
  await writeFile(resolve(out, 'analysis-validation.json'), JSON.stringify({ packetSha256: sha(input),
    resultSha256: sha(first + '\n'), deterministicRerun: true, rngTripwire: true,
    analysisSourceSha256: sha(await readFile(resolve(root, 'scripts/lib/antOmittedHistory.js'))),
    runnerSourceSha256: sha(await readFile(fileURLToPath(import.meta.url))) }, null, 2) + '\n');
}
console.log(JSON.stringify({ ...result.summary, firstBirthComponents: result.componentTimeline.find(row => row.tick === 5041),
  cohorts: { laterI: result.firstBirthOCells.filter(c => c.birth.laterIFirstAt !== null).length,
    laterNewFrozen: result.firstBirthOCells.filter(c => c.birth.laterNewFrozenCoverageFirstAt !== null).length } }, null, 2));
