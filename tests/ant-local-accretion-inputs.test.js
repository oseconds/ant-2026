import test from 'node:test';
import assert from 'node:assert/strict';
import { compareFunnelInput, contactCellIndex, decodeXorSnapshots, encodeDecisionFlags, encodeMilestoneFields,
  extractTopLevelProperties, sha256, verifyArtifact } from '../scripts/ant-local-accretion-inputs.js';

const CELLS = 96 * 96;
const ORDER = ['chemical', 'chemicalMemory', 'surface', 'support', 'contactCounts'];

test('per-array XOR decoder restores fields and validates row-major stream ranges', () => {
  const first = fields({ chemicalMemory: 0.25, support: 0.02 });
  const second = fields({ chemicalMemory: 0.4, support: 0.01 });
  const { bytes, encoding } = encodeSnapshots([first, second]);
  const decoded = decodeXorSnapshots(bytes, encoding);
  assert.equal(decoded[0].arrays.chemicalMemory.readFloatLE(0), 0.25);
  assert.ok(Math.abs(decoded[0].arrays.support.readFloatLE(0) - 0.02) < 1e-7);
  assert.ok(Math.abs(decoded[1].arrays.chemicalMemory.readFloatLE(4) - 0.4) < 1e-7);
  assert.ok(Math.abs(decoded[1].arrays.support.readFloatLE(4) - 0.01) < 1e-7);
  assert.throws(() => decodeXorSnapshots(bytes.subarray(0, bytes.length - 1), encoding), /stream range|truncation/);
  const badOffset = structuredClone(encoding);
  badOffset.descriptors[0].arrays.chemical.offset = 1;
  assert.throws(() => decodeXorSnapshots(bytes, badOffset), /stream offset/);
  const invalid = encodeSnapshots([fields({ chemical: 9 })]);
  assert.throws(() => decodeXorSnapshots(invalid.bytes, invalid.encoding), /chemical value outside \[0,8\]/);
});

test('FOOT_CONTACT helper maps in-domain coordinates and rejects invalid direct index requests', () => {
  assert.equal(contactCellIndex(0, 0), 0);
  assert.equal(contactCellIndex(1, 1), CELLS - 1);
  assert.throws(() => contactCellIndex(1.01, 0), /\[0,1\]/);
});

test('decision flags use only contacts through each frame; future events do not leak backward', () => {
  const cell = contactCellIndex(0.5, 0.5), events = [
    { simulationTimeMs: 3000, contacts: [foot(0.5, 0.5)] },
    { simulationTimeMs: 1000, contacts: [foot(0.5, 0.5), foot(0.5, 0.5), foot(-0.01, 0.5)] },
    { simulationTimeMs: 1000, contacts: [foot(0.5, 0.5)] }
  ];
  const snapshots = [snapshot(2, 3), snapshot(4, 4)];
  const result = encodeDecisionFlags(events, snapshots);
  assert.equal(result.bytes[cell], 0, 'At t=2 s, two feet at one timestamp count once');
  assert.equal(result.bytes[CELLS + cell], 4, 'At t=4 s, the second timestamp qualifies');
  assert.equal(result.skippedOutOfDomainFootPoints, 1);
  assert.deepEqual(events.map(event => event.simulationTimeMs), [3000, 1000, 1000], 'Sort leaves raw archive order intact');
  snapshots[1].arrays.contactCounts.writeUInt32LE(5, cell * 4);
  assert.throws(() => encodeDecisionFlags(events, snapshots), /count mismatch at frame 1/);
});

test('decision packet keeps only the three exact threshold flags', () => {
  const snapshot = { timeSeconds: 1, arrays: fields({ chemicalMemory: 0.3, support: 0.016 }) };
  const counts = new Uint32Array(CELLS), center = contactCellIndex(0.5, 0.5); counts[center] = 2;
  const result = encodeDecisionFlags([], [snapshot]);
  assert.equal(result.bytes[center], 3);
  assert.equal(result.bytes[0], 3);
});

test('milestone fields retain exact arrays at nearest actual snapshot times', () => {
  const first = snapshot(119, 0), second = snapshot(121, 0), third = snapshot(302, 0);
  first.tick = 7140; second.tick = 7260; third.tick = 18120;
  first.arrays.chemicalMemory.writeFloatLE(0.25, 0);
  second.arrays.chemicalMemory.writeFloatLE(0.75, 0);
  const milestone = encodeMilestoneFields([first, second, third], [120]);
  assert.equal(milestone.descriptors[0].tick, second.tick, 'tie selects later actual sample');
  assert.equal(milestone.descriptors[0].timeSeconds, 121);
  const memory = milestone.bytes.readFloatLE(milestone.descriptors[0].arrays.chemicalMemory.offset);
  assert.equal(memory, second.arrays.chemicalMemory.readFloatLE(0));
});

test('original funnel union comparison reports source-missing cells and extras by actual frame', () => {
  const current = snapshot(1, 0); current.tick = 60;
  for (let cell = 0; cell < 8; cell += 1) {
    current.arrays.chemicalMemory.writeFloatLE(0.4, cell * 4);
    current.arrays.support.writeFloatLE(0.02, cell * 4);
  }
  const original = [{ tick: 60, timeSeconds: 1, funnel: { components: [
    { supportedComponentIndices: [0, 1] }, { supportedComponentIndices: [2, 3] }
  ] } }];
  const gap = compareFunnelInput(20261005, original, [current]);
  assert.equal(gap.rowsWithFourMissingCells, 1);
  assert.equal(gap.rowsWithExtraCells, 0);
  assert.deepEqual(gap.rows[0], { tick: 60, timeSeconds: 1, originalFunnelUnionCount: 4,
    sourceBinaryCount: 8, extraCellIndices: [], missingCellIndices: [4, 5, 6, 7] });
  original[0].funnel.components[0].supportedComponentIndices.push(12);
  assert.deepEqual(compareFunnelInput(20261005, original, [current]).rows[0].extraCellIndices, [12]);
});

test('artifact verification asserts both committed byte size and SHA-256', () => {
  const bytes = Buffer.from('fixture bytes'), expected = { bytes: bytes.length, sha256: sha256(bytes) };
  assert.doesNotThrow(() => verifyArtifact(bytes, expected, 'fixture'));
  assert.throws(() => verifyArtifact(Buffer.from('changed'), expected, 'fixture'), /byte size|SHA-256/);
  assert.throws(() => verifyArtifact(bytes, { ...expected, sha256: '0'.repeat(64) }, 'fixture'), /SHA-256/);
});

test('large summary reader extracts only requested top-level JSON values', () => {
  const source = Buffer.from(JSON.stringify({ first: { nested: 'snapshotEncoding is only text here' },
    snapshotEncoding: { descriptors: [{ tick: 1 }] }, rawArchive: { contacts: 12 }, tail: [1, 2, 3] }));
  assert.deepEqual(extractTopLevelProperties(source, ['snapshotEncoding', 'rawArchive']), {
    snapshotEncoding: { descriptors: [{ tick: 1 }] }, rawArchive: { contacts: 12 }
  });
});

function foot(x, y) { return { position: { x, y } }; }
function fields(overrides = {}) {
  const arrays = Object.fromEntries(ORDER.map(key => [key, Buffer.alloc(CELLS * 4)]));
  for (const [key, value] of Object.entries(overrides)) for (let cell = 0; cell < CELLS; cell += 1) {
    arrays[key].writeFloatLE(value, cell * 4);
  }
  return arrays;
}
function snapshot(timeSeconds, centerCount) {
  const arrays = fields(); arrays.contactCounts.writeUInt32LE(centerCount, contactCellIndex(0.5, 0.5) * 4);
  return { timeSeconds, arrays };
}
function encodeSnapshots(rows) {
  const chunks = [], descriptors = [];
  let offset = 0, prior = new Map();
  for (let row = 0; row < rows.length; row += 1) {
    const arrays = {};
    for (const key of ORDER) {
      const encoded = Buffer.from(rows[row][key]), previous = prior.get(key);
      if (previous) for (let i = 0; i < encoded.length; i += 1) encoded[i] ^= previous[i];
      arrays[key] = { offset, bytes: encoded.length }; chunks.push(encoded); offset += encoded.length;
      prior.set(key, rows[row][key]);
    }
    descriptors.push({ tick: (row + 1) * 60, timeSeconds: row + 1, arrays });
  }
  return { bytes: Buffer.concat(chunks), encoding: { arrayOrder: ORDER, descriptors } };
}
