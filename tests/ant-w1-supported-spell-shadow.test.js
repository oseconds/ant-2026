import test from 'node:test';
import assert from 'node:assert/strict';
import { createW1SupportedSpellObserver } from '../scripts/ant-w1-supported-spell-shadow.js';

function makeObserver(width, height) {
  return createW1SupportedSpellObserver({ width, height });
}

function advance(observer, width, height, frameIndex, timeSeconds, { supported = [], active = supported, flags = {}, owners = {},
  id0History = [], id0Alive = false } = {}) {
  const cellCount = width * height;
  const qualified = new Uint8Array(cellCount);
  const activeMask = new Uint8Array(cellCount);
  for (const cell of supported) qualified[cell] = 7;
  for (const [cell, value] of Object.entries(flags)) qualified[Number(cell)] = value;
  for (const cell of active) activeMask[cell] = 1;
  const ownerGroups = new Map();
  for (const cell of active) {
    const identityId = owners[cell] ?? 0;
    if (!ownerGroups.has(identityId)) ownerGroups.set(identityId, []);
    ownerGroups.get(identityId).push(cell);
  }
  return observer.advance({ frameIndex, timeSeconds, flags: qualified, activeMask,
    activeOwners: [...ownerGroups].map(([identityId, cellIndices]) => ({ identityId, cellIndices })),
    id0HistoricalCellIndices: id0History, id0Alive });
}

test('eligible cells closing at one observation form deterministic 8-connected endpoint geometry only', () => {
  const observer = makeObserver(3, 2), history = [];
  for (let i = 0; i <= 23; i += 1) {
    const supported = i < 20 ? [0, 1, 4, 2] : i < 23 ? [0, 1, 4] : [];
    const active = i === 20 ? [0, 1, 4, 2] : i === 23 ? [1] : supported;
    const flags = i === 20 ? { 2: 3 } : i === 21 ? { 0: 3, 4: 3 } : i === 23 ? { 1: 3 } : {};
    const result = advance(observer, 3, 2, i, i, { supported, active, flags,
      owners: { 0: 0, 1: 9, 2: 2, 4: i < 10 ? 7 : 0 }, id0History: [0, 1, 4], id0Alive: i >= 14 });
    history.push(result);
  }
  const first = history[21].events;
  assert.equal(first.length, 1);
  assert.deepEqual(first[0].cellIndices, [0, 4], 'diagonal cells join; still-supported neighbor is excluded');
  assert.equal(first[0].size, 2);
  assert.deepEqual(first[0].relatedEpisodeIds, [0, 7]);
  assert.deepEqual(first[0].id0RelatedCellIndices, [0, 4]);
  assert.deepEqual(first[0].id0HistoricalOverlapCellIndices, [0, 4]);
  assert.equal(first[0].id0AliveAtCompletion, true);
  assert.deepEqual(first[0].terminationReasonCounts, { 'q-off': 2 });
  assert.deepEqual(first[0].newCellIndices, [0, 4]);
  assert.deepEqual(first[0].overlapCellIndices, []);
  assert.equal(observer.snapshot().events[0].timeSeconds, 21);
  assert.equal(history[20].terminatedSpells.find(spell => spell.cellIndex === 2).eligible, false);
  assert.equal(history[23].events[0].cellIndices.includes(1), true);
  assert.equal(history[21].events[0].cellIndices.includes(1), false);
});

test('20-second spells retain identity provenance and classify q-off, active-off and both', () => {
  const observer = makeObserver(5, 1), byTime = new Map();
  for (let i = 0; i <= 21; i += 1) {
    const flags = i === 21 ? { 2: 3, 4: 0 } : {};
    const active = i === 21 ? [2] : [0, 1, 2, 4];
    const supported = i === 21 ? [0, 1, 2] : [0, 1, 2, 4];
    const result = advance(observer, 5, 1, i, i, { supported, active, flags });
    byTime.set(i, result);
  }
  const result = byTime.get(21);
  assert.deepEqual(result.terminatedSpells.map(spell => [spell.cellIndex, spell.eligible, spell.terminationReason]),
    [[0, true, 'active-off'], [1, true, 'active-off'], [2, true, 'q-off'], [4, true, 'both']]);
  assert.equal(result.events.length, 2, 'same-frame 8-connected endpoints group despite different termination causes');
  assert.deepEqual(result.events[0].cellIndices, [0, 1, 2]);
  assert.deepEqual(result.events[0].terminationReasonCounts, { 'q-off': 1, 'active-off': 2 });
  assert.deepEqual(result.events[1].terminationReasonCounts, { both: 1 });
  const qOff = result.terminatedSpells.find(spell => spell.cellIndex === 2);
  assert.equal(qOff.observedDurationSeconds, 20);
  assert.deepEqual(qOff.missingQualificationBits, [4]);
  assert.equal(qOff.activeCarryoverAtTermination, true);
  assert.equal(qOff.ownerAtTerminationEpisodeId, 0);
});

test('repeat local materialization records overlap without increasing unique area', () => {
  const observer = makeObserver(1, 1);
  for (let i = 0; i <= 43; i += 1) {
    const supported = i <= 20 || (i >= 22 && i <= 42) ? [0] : [];
    const active = i === 21 || i === 43 ? [0] : supported;
    const result = observer.advance({ frameIndex: i, timeSeconds: i, flags: [supported.length ? 7 : 3],
      activeMask: [Number(active.length > 0)],
      activeOwners: active.length ? [{ identityId: i < 22 ? 3 : 8, cellIndices: [0] }] : [],
      id0HistoricalCellIndices: [], id0Alive: false });
    if (i === 21) assert.deepEqual(result.events[0].newCellIndices, [0]);
    if (i === 43) {
      assert.deepEqual(result.events[0].newCellIndices, []);
      assert.deepEqual(result.events[0].overlapCellIndices, [0]);
    }
  }
  const snapshot = observer.snapshot();
  assert.equal(snapshot.materializedCellIndices.length, 1);
  assert.equal(snapshot.events.length, 2);
  assert.equal(snapshot.events.reduce((sum, event) => sum + event.newCellIndices.length, 0), 1);
});

test('right-censored spells do not materialize and prior prefix snapshots do not acquire future events', () => {
  const observer = makeObserver(1, 1);
  for (let i = 0; i <= 20; i += 1) observer.advance({ frameIndex: i, timeSeconds: i, flags: [7], activeMask: [1],
    activeOwners: [{ identityId: 0, cellIndices: [0] }], id0HistoricalCellIndices: [0], id0Alive: true });
  const prefix = observer.snapshot();
  assert.equal(prefix.events.length, 0);
  assert.equal(prefix.pendingSpells[0].eligibleAtCutoff, true);
  observer.advance({ frameIndex: 21, timeSeconds: 21, flags: [3], activeMask: [1],
    activeOwners: [{ identityId: 1, cellIndices: [0] }], id0HistoricalCellIndices: [0], id0Alive: true });
  assert.equal(observer.snapshot().events.length, 1);
  assert.equal(prefix.events.length, 0, 'captured prefix cannot see the future termination');
  assert.deepEqual(prefix.materializedCellIndices, []);
});

test('rejects invalid masks, ownership and nonsequential observations without using RNG', () => {
  const observer = makeObserver(1, 1), priorRandom = Math.random;
  Math.random = () => { throw new Error('local spell observer must not consume RNG'); };
  try {
    observer.advance({ frameIndex: 0, timeSeconds: 0, flags: [7], activeMask: [1],
      activeOwners: [{ identityId: 0, cellIndices: [0] }], id0HistoricalCellIndices: [0], id0Alive: true });
    assert.throws(() => observer.advance({ frameIndex: 1, timeSeconds: 1, flags: [7], activeMask: [0],
      activeOwners: [{ identityId: 0, cellIndices: [0] }], id0HistoricalCellIndices: [0], id0Alive: true }), /active/);
  } finally { Math.random = priorRandom; }
});
