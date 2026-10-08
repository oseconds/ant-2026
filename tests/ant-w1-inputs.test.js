import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFrame, trajectoryHeader } from '../scripts/ant-social-evidence.js';
import { indexTrajectory } from '../scripts/ant-social-null.js';
import { _w1InputTest, loadSeedInputs } from '../scripts/ant-w1-inputs.js';

function trajectory(rows) {
  return indexTrajectory(Buffer.concat([trajectoryHeader(), ...rows.map((agents, tick) => encodeFrame({
    timeSeconds: tick / 60,
    agents: agents.map(({ id = 'A', idIndex = 0, ...values }) =>
      ({ id, idIndex, vx: 0, vy: 0, heading: 0, radius: 0.006, ...values }))
  }))]), ['A']);
}

const contact = (timeSeconds, position = { x: 0.5, y: 0.5 }) => ({
  type: 'FOOT_CONTACT', antId: 'A', simulationTimeMs: timeSeconds * 1000,
  contacts: [{ legId: 'FL', position }]
});

test('direction uses latest completed consecutive displacement and ignores future frames', () => {
  const base = trajectory([
    [{ x: 0, y: 0 }], [{ x: 1, y: 0 }], [{ x: 1, y: 1 }], [{ x: 4, y: 4 }]
  ]);
  const changedFuture = trajectory([
    [{ x: 0, y: 0 }], [{ x: 1, y: 0 }], [{ x: 1, y: 1 }], [{ x: -20, y: 70 }]
  ]);
  const a = _w1InputTest.directionAt(base, base.lives[0], 2 / 60);
  const b = _w1InputTest.directionAt(changedFuture, changedFuture.lives[0], 2 / 60);
  assert.deepEqual(a, b);
  assert.equal(a.segmentStartSeconds, 1 / 60);
  assert.equal(a.segmentEndSeconds, 2 / 60);
  assert.equal(a.travelDistance, 1);
  assert.ok(a.segmentEndSeconds <= 2 / 60 + 1e-9);
  assert.ok(Math.abs(a.nematicX + 1) < 1e-12);
  assert.ok(Math.abs(a.nematicY) < 1e-12);
});

test('missing direction stays missing at zero displacement and recording edge', () => {
  const source = trajectory([
    [{ x: 2, y: 2 }], [{ x: 2, y: 2 }], [{ x: 2, y: 2 }]
  ]);
  assert.equal(_w1InputTest.directionAt(source, source.lives[0], 0), null);
  assert.equal(_w1InputTest.directionAt(source, source.lives[0], 2 / 60), null);
  const newAtEdge = trajectory([[], [{ idIndex: 0, id: 'A', x: 2, y: 2 }], [{ x: 3, y: 2 }]]);
  assert.equal(_w1InputTest.directionAt(newAtEdge, newAtEdge.lives[0], 1 / 60), null);
});

test('stable-ID lifecycle gap rejects trajectory instead of bridging direction', () => {
  const reentry = Buffer.concat([trajectoryHeader(), ...[0, 1, 2].map(tick => encodeFrame({
    timeSeconds: tick / 60,
    agents: tick === 1 ? [] : [{ id: 'A', idIndex: 0, x: tick, y: 0, vx: 0, vy: 0, heading: 0, radius: 0.006 }]
  }))]);
  assert.throws(() => indexTrajectory(reentry, ['A']), /cannot re-enter/);
});

test('nematic representation is invariant to reversed direction', () => {
  const forward = trajectory([[{ x: 0, y: 0 }], [{ x: 1, y: 1 }]]);
  const reverse = trajectory([[{ x: 1, y: 1 }], [{ x: 0, y: 0 }]]);
  const a = _w1InputTest.directionAt(forward, forward.lives[0], 1 / 60);
  const b = _w1InputTest.directionAt(reverse, reverse.lives[0], 1 / 60);
  assert.ok(Math.abs(a.nematicX - b.nematicX) < 1e-12);
  assert.ok(Math.abs(a.nematicY - b.nematicY) < 1e-12);
});

test('unordered foot groups sort on a copy and bucket by causal field interval', () => {
  const source = trajectory(Array.from({ length: 62 }, (_, tick) => [{ x: tick, y: 0 }]));
  const events = [contact(1.01), contact(0.01)];
  const originalOrder = [...events];
  const metadata = { frames: [{ timeSeconds: 1 / 60 }, { timeSeconds: 61 / 60 }] };
  const result = _w1InputTest.makeFootInputs(events, source, metadata);
  assert.deepEqual(events, originalOrder);
  assert.equal(result.intervals[0].contactGroups, 1);
  assert.equal(result.intervals[1].contactGroups, 1);
  assert.equal(result.feet[0].cellIndex, Math.round(0.5 * 95) * 96 + Math.round(0.5 * 95));
  assert.equal(result.feet[0].contactIndex, 0);
  assert.equal(result.feet[0].directionAvailable, false);
  assert.equal(result.feet[0].segmentStartSeconds, null);
  assert.equal(result.feet[0].segmentEndSeconds, null);
  assert.equal(result.feet[0].travelDistance, null);
  assert.equal(result.feet[1].directionAvailable, true);
  assert.equal(result.feet[1].segmentStartSeconds, 59 / 60);
  assert.equal(result.feet[1].segmentEndSeconds, 1);
  assert.equal(result.feet[1].travelDistance, 1);
});

test('malformed trajectory byte packet fails before indexing', () => {
  const bad = Buffer.from(trajectoryHeader());
  bad.write('BADTRJ01', 0);
  assert.throws(() => indexTrajectory(bad, ['A']));
  const truncatedFrame = Buffer.concat([trajectoryHeader(), Buffer.alloc(11)]);
  assert.throws(() => indexTrajectory(truncatedFrame, ['A']));
});

test('archived seed loader verifies packet and committed source hashes', async () => {
  const packet = 'docs/ant/evidence/2026-10-08-w1-episodic-material-shadow';
  const loaded = await loadSeedInputs(20261005, packet);
  assert.equal(loaded.metadata.fieldIntervals, 599);
  assert.equal(loaded.fieldMetadata.frames.length, 599);
  assert.equal(loaded.flags.length, 599 * 96 * 96);
  assert.equal(loaded.rawContacts.length, 35751);
  assert.equal(loaded.intervals.length, 599);
  const packetHashKeys = Object.keys(loaded.metadata.packetFileHashes);
  assert.deepEqual(packetHashKeys, [...packetHashKeys].sort());
  assert.ok(loaded.coverage.directionAvailableFeet > 0);
  assert.ok(loaded.coverage.directionMissingFeet > 0);
  const directedFoot = loaded.feet.find(foot => foot.directionAvailable);
  const missingFoot = loaded.feet.find(foot => !foot.directionAvailable);
  assert.ok(Number.isFinite(directedFoot.segmentStartSeconds));
  assert.ok(Number.isFinite(directedFoot.travelDistance) && directedFoot.travelDistance > 0);
  assert.ok(directedFoot.segmentEndSeconds <= directedFoot.timeSeconds + 1e-9);
  assert.equal(missingFoot.segmentStartSeconds, null);
  assert.equal(missingFoot.segmentEndSeconds, null);
  assert.equal(missingFoot.travelDistance, null);
  assert.equal(loaded.metadata.sourceHashes.rawContacts,
    '4c0b8728a9dd62067c20734f3a4f7628e480fc7565d41dc27270d994be92e503');
});
