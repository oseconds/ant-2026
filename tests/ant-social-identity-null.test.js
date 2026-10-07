import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFrame, trajectoryHeader } from '../scripts/ant-social-evidence.js';
import { indexTrajectory } from '../scripts/ant-social-null.js';
import { identityTrajectory, instantaneousReference, validateIdentity } from '../scripts/ant-social-identity-null.js';

function fixture(frames = 910) {
  const ids = ['A', 'B', 'C', 'D', 'E'], windows = [[0, 909], [0, 310], [0, 609], [301, 909], [606, 909]];
  const bytes = Buffer.concat([trajectoryHeader(), ...Array.from({ length: frames }, (_, tick) =>
    encodeFrame({ timeSeconds: tick / 60, agents: ids.flatMap((id, idIndex) => {
      const [start, end] = windows[idIndex];
      if (tick < start || tick > end) return [];
      // A/B can have identical tuples; bodies must still be distinct. Signed zero is retained.
      const physical = idIndex === 1 ? 0 : idIndex;
      return [{ id, idIndex, x: physical / 5 + tick / 100000, y: physical / 10,
        vx: tick === 0 ? -0 : tick / 10000, vy: -tick / 20000,
        heading: tick / 30000, radius: 0.006 + physical / 10000 }];
    }) }))]);
  return indexTrajectory(bytes, ids);
}

test('identity blocks preserve the entire spatial movie and reconstruct every frame from the ledger', () => {
  const source = fixture(), original = Buffer.from(source.bytes), { bytes, ledger } = identityTrajectory(source, 123, 1);
  const check = validateIdentity(source, bytes, ledger, instantaneousReference(source));
  assert.equal(check.physicalTupleMultisetByteIdentity, true);
  assert.equal(check.instantaneousEdgeCounts, true);
  assert.equal(check.instantaneousComponentSizeMultisets, true);
  assert.deepEqual(ledger.filter(e => e.type === 'BLOCK_REMAP').map(e => e.tick), [300, 600, 900]);
  assert.deepEqual(ledger.filter(e => e.type === 'LIFECYCLE_REPAIR').map(e => e.tick), [301, 311, 606, 610]);
  assert.deepEqual(ledger.find(e => e.tick === 300).mapping,
    [{ body: 'A', label: 'C' }, { body: 'B', label: 'A' }, { body: 'C', label: 'B' }]);
  assert.ok(ledger.some(e => e.changes.some(c => c.oldBody && c.newBody && c.oldBody !== c.newBody)));
  const restored = Buffer.from(bytes);
  for (const f of source.frames) for (let i = 0; i < f.count; i += 1) {
    const at = f.at + 12 + i * 52;
    restored.writeUInt32LE(source.bytes.readUInt32LE(at), at);
  }
  assert.deepEqual(restored, original, 'inverse relabeling recovers every byte');
  assert.deepEqual(source.bytes, original, 'source never mutated');
  const terminal = identityTrajectory(fixture(901), 123, 0);
  assert.deepEqual(terminal.ledger.filter(e => e.type === 'BLOCK_REMAP').map(e => e.tick), [300, 600]);
});

test('lifecycle repairs retain every still-valid binding and fill only required vacancies', () => {
  const source = fixture(), { ledger } = identityTrajectory(source, 123, 3);
  let previous = new Map();
  for (const event of ledger) {
    const next = new Map(event.mapping.map(({ body, label }) => [body, label]));
    if (event.type === 'LIFECYCLE_REPAIR') {
      const active = new Set(next.keys()), valid = [...previous].filter(([body, label]) => active.has(body) && active.has(label));
      assert.equal(event.retainedBindings, valid.length);
      for (const [body, label] of valid) assert.equal(next.get(body), label, 'unaffected binding retained');
    }
    assert.equal(new Set(next.values()).size, next.size);
    previous = next;
  }
});

test('dedicated deterministic null stream avoids behavior RNG and rejects corrupted tuples/IDs/ledger', () => {
  const source = fixture(), saved = Math.random;
  Math.random = () => { throw new Error('behavior RNG forbidden'); };
  let generated;
  try {
    generated = identityTrajectory(source, 123, 0);
    assert.deepEqual(identityTrajectory(source, 123, 0), generated);
    validateIdentity(source, generated.bytes, generated.ledger);
  } finally { Math.random = saved; }
  const at = source.frames[300].at + 12;
  for (const [offset, value] of [[4, 123], [12, NaN], [44, 0]]) {
    const bad = Buffer.from(generated.bytes); bad.writeDoubleLE(value, at + offset);
    assert.throws(() => validateIdentity(source, bad, generated.ledger));
  }
  const duplicate = Buffer.from(generated.bytes);
  duplicate.writeUInt32LE(duplicate.readUInt32LE(at), at + 52);
  assert.throws(() => validateIdentity(source, duplicate, generated.ledger));
  const badLedger = structuredClone(generated.ledger);
  badLedger.find(e => e.type === 'BLOCK_REMAP').mapping[0].label = 'missing';
  assert.throws(() => validateIdentity(source, generated.bytes, badLedger));
});
