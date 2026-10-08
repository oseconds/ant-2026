import assert from 'node:assert/strict';
import test from 'node:test';
import { createW1Crystallizer } from '../scripts/ant-w1-crystallization.js';

const flags = (...cells) => Uint8Array.from(cells);

test('requires all frozen evidence bits and one q frame cannot activate a cell', () => {
  const machine = createW1Crystallizer({ width: 4, height: 1 });
  for (let frame = 0; frame < 12; frame += 1) {
    const result = machine.advance({ timeSeconds: frame, flags: flags(1, 2, 4, frame === 0 ? 7 : 0) });
    assert.equal(result.activeComponentCount, 0);
  }
  const one = createW1Crystallizer({ width: 1, height: 1 });
  one.advance({ timeSeconds: 0, flags: flags(7) });
  for (let frame = 1; frame <= 20; frame += 1) {
    assert.equal(one.advance({ timeSeconds: frame, flags: flags(0) }).activeComponentCount, 0);
  }
});

test('constant q forms one finite episode, then closes without horizon eviction', () => {
  const machine = createW1Crystallizer({ width: 1, height: 1 });
  const frozen = [];
  for (let frame = 0; frame <= 700; frame += 1) {
    frozen.push(...machine.advance({ timeSeconds: frame, flags: flags(7) }).closedEpisodes);
  }
  assert.equal(frozen.length, 1);
  assert.equal(frozen[0].status, 'frozen');
  assert.deepEqual(frozen[0].cellIndices, [0]);
  assert.equal(frozen[0].persistenceSeconds, 292);
  assert.equal(machine.getOpenEpisodes().length, 0);
  assert.ok(Object.isFrozen(frozen[0].cellIndices));
});

test('short closed candidates report discard reason; a later pulse can rematerialize', () => {
  const machine = createW1Crystallizer({ width: 1, height: 1 });
  let discarded = [];
  for (let frame = 0; frame < 50; frame += 1) {
    const q = frame < 3 || (frame >= 30 && frame < 34) ? 7 : 0;
    discarded.push(...machine.advance({ timeSeconds: frame, flags: flags(q) }).discardedEpisodes);
  }
  assert.equal(discarded.length, 1);
  assert.equal(discarded[0].discardReason, 'persistence-under-20-seconds');
  assert.equal(discarded[0].id, 0);
  assert.ok(machine.getOpenEpisodes().some(episode => episode.id === 1));
});

test('spatial split and rejoin preserve one historical episode and count events once', () => {
  const machine = createW1Crystallizer({ width: 3, height: 1 });
  for (let frame = 0; frame < 50; frame += 1) {
    const input = frame < 20 ? flags(7, 7, 7) : flags(7, 0, 7);
    machine.advance({ timeSeconds: frame, flags: input });
  }
  let episode = machine.getOpenEpisodes()[0];
  assert.equal(machine.getSnapshot().activeComponentCount, 2);
  assert.equal(episode.id, 0);
  assert.equal(episode.splitCount, 1);
  assert.equal(episode.status, 'right-censored');
  for (let frame = 50; frame < 60; frame += 1) {
    machine.advance({ timeSeconds: frame, flags: flags(7, 7, 7) });
  }
  episode = machine.getOpenEpisodes()[0];
  assert.equal(machine.getSnapshot().activeComponentCount, 1);
  assert.equal(episode.mergeCount, 1);
  assert.deepEqual(episode.cellIndices, [0, 1, 2]);
  assert.deepEqual(episode.ancestryIds, [0]);
});

test('merge retains every parent identity and the complete cell union', () => {
  const machine = createW1Crystallizer({ width: 3, height: 1 });
  for (let frame = 0; frame < 30; frame += 1) {
    const input = frame < 20 ? flags(7, 0, 7) : flags(7, 7, 7);
    machine.advance({ timeSeconds: frame, flags: input });
  }
  const episode = machine.getOpenEpisodes()[0];
  assert.equal(episode.id, 0);
  assert.deepEqual(episode.parentIds, [1]);
  assert.deepEqual(episode.ancestryIds, [0, 1]);
  assert.equal(episode.mergeCount, 1);
  assert.deepEqual(episode.cellIndices, [0, 1, 2]);
});

test('split descendants stay on canonical lineage when another branch cross-merges their parent', () => {
  const machine = createW1Crystallizer({ width: 9, height: 1 });
  for (let frame = 0; frame <= 82; frame += 1) {
    const input = new Uint8Array(9);
    const cells = frame < 20 ? [0, 1, 2, 5, 6, 7]
      : frame < 80 ? [0, 2, 5, 7]
        : [0, 1, 2, 3, 4, 5, 7, 8];
    for (const cell of cells) input[cell] = 7;
    machine.advance({ timeSeconds: frame, flags: input });
    if (frame === 81) {
      const splitMerge = machine.getOpenEpisodes();
      assert.equal(machine.getSnapshot().activeComponentCount, 3);
      assert.equal(splitMerge.length, 1);
      assert.deepEqual(splitMerge[0].ancestryIds, [0, 1]);
      assert.deepEqual(splitMerge[0].cellIndices, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    }
  }
  const episodes = machine.getOpenEpisodes();
  assert.equal(machine.getSnapshot().activeComponentCount, 2);
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].id, 0);
  assert.deepEqual(episodes[0].parentIds, [1]);
  assert.deepEqual(episodes[0].ancestryIds, [0, 1]);
  assert.equal(episodes[0].mergeCount, 2);
  assert.deepEqual(episodes[0].cellIndices, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('ring geometry remains the exact admitted union without dilation', () => {
  const machine = createW1Crystallizer({ width: 5, height: 5 });
  const ring = new Uint8Array(25);
  for (let y = 1; y <= 3; y += 1) for (let x = 1; x <= 3; x += 1) {
    if (x === 1 || x === 3 || y === 1 || y === 3) ring[y * 5 + x] = 7;
  }
  for (let frame = 0; frame < 5; frame += 1) machine.advance({ timeSeconds: frame, flags: ring });
  const episode = machine.getOpenEpisodes()[0];
  assert.deepEqual(episode.cellIndices, [6, 7, 8, 11, 13, 16, 17, 18]);
  assert.equal(episode.cellIndices.includes(12), false);
});

test('invalid inputs are rejected atomically before time or state advances', () => {
  const machine = createW1Crystallizer({ width: 2, height: 1 });
  machine.advance({ timeSeconds: 0, flags: flags(7, 0) });
  assert.throws(() => machine.advance({ timeSeconds: 1, flags: flags(7, 8) }), /integers from 0 through 7/);
  assert.throws(() => machine.advance({ timeSeconds: 1, flags: flags(7) }), /flags length/);
  assert.throws(() => machine.advance({ timeSeconds: 1.1, flags: flags(7, 0) }), /increase by at most/);
  assert.equal(machine.getSnapshot().frameIndex, 0);
  machine.advance({ timeSeconds: 0.5, flags: flags(7, 0) });
  const reference = createW1Crystallizer({ width: 2, height: 1 });
  reference.advance({ timeSeconds: 0, flags: flags(7, 0) });
  reference.advance({ timeSeconds: 0.5, flags: flags(7, 0) });
  assert.deepEqual(machine.getSnapshot(), reference.getSnapshot());
});

test('future perturbations cannot change prior snapshots', () => {
  const run = future => {
    const machine = createW1Crystallizer({ width: 3, height: 1 });
    const snapshots = [];
    for (let frame = 0; frame < 12; frame += 1) {
      const input = frame < 8 ? flags(7, 0, 7) : future && frame >= 8 ? flags(0, 7, 0) : flags(7, 0, 7);
      machine.advance({ timeSeconds: frame, flags: input });
      snapshots.push(machine.getSnapshot());
    }
    return snapshots;
  };
  assert.deepEqual(run(true).slice(0, 8), run(false).slice(0, 8));
});

test('all EMA state bounds remain finite and inside [0, 1]', () => {
  const machine = createW1Crystallizer({ width: 3, height: 1 });
  for (let frame = 0; frame < 100; frame += 1) {
    const result = machine.advance({ timeSeconds: frame, flags: flags(frame % 3 ? 7 : 0, 7, frame % 5 ? 7 : 0) });
    for (const range of Object.values(result.stateBounds)) {
      assert.ok(range.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
    }
  }
});
