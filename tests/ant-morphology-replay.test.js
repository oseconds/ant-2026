import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { compareFrozenBehaviorHashes, compareRows, hasPlateBirth, makeDiagnosticSelector,
  serializeSnapshots, u32Bytes, xorBytes } from '../scripts/ant-morphology-replay.js';

test('paired per-tick parity reports the first field mismatch', () => {
  const baseline = Buffer.alloc(320), diagnostic = Buffer.from(baseline);
  diagnostic[64] = 1;
  const result = compareRows([baseline], [diagnostic]);
  assert.deepEqual(result.firstMismatch, { chemical: [0] });
  assert.equal(result.comparedTicks, 1);
  assert.equal(result.fieldChains.chemical.match, false);
});

test('production candidate replay rejects any frozen-main behavior hash change', () => {
  const fields = Object.fromEntries(['agents', 'rng', 'chemical', 'surface', 'chemicalMemory',
    'contactCounts', 'contacts', 'lifecycle'].map(name => [name,
    { baseline: name, instrumented: name, match: true }]));
  assert.equal(Object.keys(compareFrozenBehaviorHashes(fields, fields)).length, 8);
  const changed = { ...fields, rng: { baseline: 'candidate-rng', instrumented: 'candidate-rng', match: true } };
  assert.throws(() => compareFrozenBehaviorHashes(changed, fields), /rng plain candidate run differs/);
});

test('only a Plate birth marks a successful material-analysis birth', () => {
  assert.equal(hasPlateBirth([]), false);
  assert.equal(hasPlateBirth([{ type: 'sphere-birth' }]), false);
  assert.equal(hasPlateBirth([{ type: 'sphere-birth' }, { type: 'plate-birth' }]), true);
});

test('snapshot byte copies stay fixed after live typed arrays change', () => {
  const chemical = new Float32Array([1, 2]);
  const saved = u32Bytes(chemical);
  chemical[0] = 9;
  assert.deepEqual([...new Float32Array(saved.buffer, saved.byteOffset, 2)], [1, 2]);
});

test('XOR snapshot stream keeps exact arrays and offsets', () => {
  const first = Buffer.from([1, 2, 3, 4]), second = Buffer.from([1, 7, 3, 9]);
  const archive = serializeSnapshots([
    { tick: 60, chemical: first, chemicalMemory: first, surface: first, support: first, contactCounts: first },
    { tick: 120, chemical: second, chemicalMemory: first, surface: second, support: first, contactCounts: second }
  ]);
  const row = archive.encoding.descriptors[1];
  assert.equal(row.arrays.chemical.offset, 20);
  const encoded = archive.bytes.subarray(row.arrays.chemical.offset,
    row.arrays.chemical.offset + row.arrays.chemical.bytes);
  assert.deepEqual(xorBytes(encoded, first), second);
  assert.deepEqual(archive.encoding.arrayOrder, ['chemical', 'chemicalMemory', 'surface', 'support', 'contactCounts']);
});

test('diagnostic selector reports eligibility, pruning, and longest candidate from the copied production algorithm', async () => {
  const source = await readFile(new URL('../src/lib/agents/ant/TrailPlateBirth.js', import.meta.url), 'utf8');
  const { selectCandidateDiagnostic } = await makeDiagnosticSelector(source);
  const mask = new Uint8Array(96 * 96), supports = new Float32Array(mask.length), chemical = new Float32Array(mask.length);
  const line = (x1, y1, x2, y2) => {
    const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
    let x = x1, y = y1;
    while (x !== x2 || y !== y2) { mask[y * 96 + x] = 1; x += dx; y += dy; }
    mask[y2 * 96 + x2] = 1;
  };
  line(48, 0, 48, 66);       // long source-to-top-boundary corridor
  line(48, 40, 54, 40);      // short exploratory branch, not a qualifying boundary route
  line(53, 69, 95, 69);      // second candidate, shorter than the vertical corridor
  line(40, 76, 40, 95);      // boundary target, but below minimum geodesic length
  line(54, 65, 54, 45);      // source without an observation-boundary target
  line(4, 5, 4, 15);         // boundary component without source
  const funnel = {};
  const candidate = selectCandidateDiagnostic(mask, supports, chemical, funnel);
  assert.equal(funnel.candidateComponentCount, 2);
  assert.equal(funnel.losers, 1);
  assert.ok(funnel.components.some(row => row.rejection === 'below-min-geodesic'));
  assert.ok(funnel.components.some(row => row.rejection === 'missing-boundary-target'));
  assert.ok(funnel.components.some(row => row.rejection === 'missing-source'));
  assert.ok(funnel.components.some(row => row.rejection === 'missing-source' && row.boundaryCount > 0));
  assert.ok(funnel.components.some(row => row.unretainedSkeletonPixels > 0));
  assert.ok(candidate.source.x === 48 / 95 && candidate.target.y === 0);
  assert.equal(funnel.winner, 0);
  assert.equal(funnel.candidates.length, 2);
});
