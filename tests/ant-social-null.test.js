import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFrame, trajectoryHeader } from '../scripts/ant-social-evidence.js';
import { indexTrajectory, phaseOffsets, rotateTrajectory, validateRotation } from '../scripts/ant-social-null.js';

function fixture() {
  const ids = ['A', 'B'];
  const bytes = Buffer.concat([trajectoryHeader(), ...Array.from({ length: 6 }, (_, tick) =>
    encodeFrame({ timeSeconds: tick / 60, agents: ids.flatMap((id, idIndex) => {
      if (id === 'B' && (tick < 1 || tick > 4)) return [];
      return [{ id, idIndex, x: tick + idIndex / 10, y: -tick,
        vx: tick === 0 ? -0 : tick / 10, vy: tick / 20,
        heading: tick / 30, radius: 0.006 + tick / 1000 }];
    }) }))]);
  return indexTrajectory(bytes, ids);
}

test('independent whole-tuple phase rotations preserve windows and invert byte-exactly', () => {
  const source = fixture(), original = Buffer.from(source.bytes);
  const offsets = [2, 1];
  const rotated = rotateTrajectory(source, offsets);
  const check = validateRotation(source, rotated, offsets);
  assert.equal(check.tupleRotations, true);
  assert.equal(check.inverseByteIdentity, true);
  const shifted = indexTrajectory(rotated, source.ids);
  for (let ant = 0; ant < source.lives.length; ant += 1) {
    const life = source.lives[ant], other = shifted.lives[ant];
    assert.deepEqual([other.startFrame, other.endFrame, other.sampleOffsets.length],
      [life.startFrame, life.endFrame, life.sampleOffsets.length]);
    for (let i = 0; i < life.sampleOffsets.length; i += 1) {
      const expected = life.sampleOffsets[(i + offsets[ant]) % life.sampleOffsets.length] + 4;
      const actual = other.sampleOffsets[i] + 4;
      assert.deepEqual(rotated.subarray(actual, actual + 48), source.bytes.subarray(expected, expected + 48));
    }
  }
  assert.deepEqual(source.bytes, original);
  const bad = Buffer.from(rotated);
  bad.writeDoubleLE(123, source.lives[0].sampleOffsets[0] + 4);
  assert.throws(() => validateRotation(source, bad, offsets));
  assert.throws(() => rotateTrajectory(source, [0, 1]));
});

test('dedicated replay seed yields repeatable nonzero offsets without Math.random', () => {
  const source = fixture(), saved = Math.random;
  Math.random = () => { throw new Error('behavior randomness must not be used'); };
  try {
    const a = phaseOffsets(source, 'fixture-null-v1', 20261005, 0);
    assert.deepEqual(a, phaseOffsets(source, 'fixture-null-v1', 20261005, 0));
    a.forEach((offset, i) => assert.ok(offset > 0 && offset < source.lives[i].sampleOffsets.length));
    assert.deepEqual(rotateTrajectory(source, a), rotateTrajectory(source, a));
  } finally { Math.random = saved; }
});

test('archive validation rejects non-finite values, invalid IDs/radii and re-entry', () => {
  const source = fixture();
  for (const [field, value] of [[4, NaN], [44, 0]]) {
    const bad = Buffer.from(source.bytes);
    bad.writeDoubleLE(value, source.lives[0].sampleOffsets[0] + field);
    assert.throws(() => indexTrajectory(bad, source.ids));
  }
  const badId = Buffer.from(source.bytes);
  badId.writeUInt32LE(99, source.lives[0].sampleOffsets[0]);
  assert.throws(() => indexTrajectory(badId, source.ids));
  const reentry = Buffer.concat([trajectoryHeader(), ...[0, 1, 2].map(tick =>
    encodeFrame({ timeSeconds: tick / 60, agents: tick === 1 ? [] : [
      { idIndex: 0, x: 0, y: 0, vx: 0, vy: 0, heading: 0, radius: 0.006 }
    ] }))]);
  assert.throws(() => indexTrajectory(reentry, ['A']));
});
