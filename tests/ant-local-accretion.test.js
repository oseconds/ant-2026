import assert from 'node:assert/strict';
import test from 'node:test';
import { AntLocalAccretion } from '../scripts/ant-local-accretion.js';

const create = (length = 16) => ({
  chemicalMemory: new Float32Array(length).fill(0.4),
  mechanicalSupport: new Float32Array(length).fill(0.02),
  countDistinctContactTimes: new Uint8Array(length).fill(2)
});

test('one contact timestamp never freezes a cell, regardless of elapsed time', () => {
  const model = new AntLocalAccretion({ width: 4, height: 4 });
  const input = create();
  input.countDistinctContactTimes.fill(1);

  for (let timeSeconds = 0; timeSeconds <= 100; timeSeconds += 1) {
    assert.equal(model.advance({ ...input, timeSeconds }), null);
  }
  assert.equal(model.getSnapshot().state[0], -1);
});

test('chemical memory without mechanical support does not start qualification', () => {
  const model = new AntLocalAccretion({ width: 4, height: 4 });
  const input = create();
  input.mechanicalSupport.fill(0);

  for (let timeSeconds = 0; timeSeconds <= 20; timeSeconds += 1) {
    model.advance({ ...input, timeSeconds });
  }
  assert.equal(model.getSnapshot().state[0], -1);
});

test('an unsupported sample interrupts persistence', () => {
  const model = new AntLocalAccretion({ width: 4, height: 4 });
  const input = create();
  model.advance({ ...input, timeSeconds: 0 });
  input.mechanicalSupport[0] = 0;
  for (let timeSeconds = 1; timeSeconds <= 10; timeSeconds += 1) {
    model.advance({ ...input, timeSeconds });
  }
  input.mechanicalSupport[0] = 0.02;
  model.advance({ ...input, timeSeconds: 11 });
  let otherCells = null;
  for (let timeSeconds = 12; timeSeconds <= 30; timeSeconds += 1) {
    otherCells = model.advance({ ...input, timeSeconds }) ?? otherCells;
  }
  assert.ok(!otherCells.cellIndices.includes(0));
  assert.equal(model.getSnapshot().state[0], 19);
  assert.deepEqual(model.advance({ ...input, timeSeconds: 31 }).cellIndices, [0]);
});

test('stable eligible region freezes once and can requalify after loss', () => {
  const model = new AntLocalAccretion({ width: 4, height: 4 });
  const input = create();
  model.advance({ ...input, timeSeconds: 0 });
  let first = null;
  for (let timeSeconds = 1; timeSeconds <= 20; timeSeconds += 1) {
    first = model.advance({ ...input, timeSeconds }) ?? first;
  }
  assert.deepEqual(first.cellIndices, Array.from({ length: 16 }, (_, index) => index));
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.cellIndices));
  assert.equal(model.getSnapshot().state.every(value => value === 20), true);
  for (let timeSeconds = 21; timeSeconds <= 40; timeSeconds += 1) {
    assert.equal(model.advance({ ...input, timeSeconds }), null);
  }

  input.chemicalMemory[0] = 0;
  model.advance({ ...input, timeSeconds: 41 });
  input.chemicalMemory[0] = 0.4;
  model.advance({ ...input, timeSeconds: 42 });
  let repeated = null;
  for (let timeSeconds = 43; timeSeconds <= 62; timeSeconds += 1) {
    repeated = model.advance({ ...input, timeSeconds }) ?? repeated;
  }
  assert.deepEqual(repeated.cellIndices, [0]);
  assert.equal(model.getSnapshot().episodes.length, 2);
});

test('isolated ring mask freezes as supplied without path selection or reshaping', () => {
  const width = 5, height = 5, input = create(width * height), expected = [];
  input.chemicalMemory.fill(0);
  input.mechanicalSupport.fill(0);
  input.countDistinctContactTimes.fill(0);
  for (let x = 1; x <= 3; x += 1) {
    expected.push(width + x, 3 * width + x);
  }
  expected.push(2 * width + 1, 2 * width + 3);
  expected.sort((a, b) => a - b);
  for (const index of expected) {
    input.chemicalMemory[index] = 0.4;
    input.mechanicalSupport[index] = 0.02;
    input.countDistinctContactTimes[index] = 2;
  }
  const model = new AntLocalAccretion({ width, height });

  model.advance({ ...input, timeSeconds: 0 });
  let episode = null;
  for (let timeSeconds = 1; timeSeconds <= 20; timeSeconds += 1) {
    episode = model.advance({ ...input, timeSeconds }) ?? episode;
  }

  assert.deepEqual(episode.cellIndices, expected);
  assert.equal(episode.cellIndices.length, 8);
});

test('same sampled inputs produce identical episode bytes', () => {
  const run = () => {
    const model = new AntLocalAccretion({ width: 4, height: 4 });
    const input = create();
    model.advance({ ...input, timeSeconds: 0 });
    for (let timeSeconds = 1; timeSeconds <= 20; timeSeconds += 1) {
      model.advance({ ...input, timeSeconds });
    }
    return Buffer.from(JSON.stringify(model.getSnapshot()));
  };
  assert.deepEqual(run(), run());
});

test('validates finite values, bounds, lengths and time without mutating inputs or state', () => {
  const model = new AntLocalAccretion({ width: 4, height: 4 });
  const input = create();
  const original = Object.fromEntries(Object.entries(input).map(([key, values]) => [key, Array.from(values)]));
  model.advance({ ...input, timeSeconds: 1 });
  const before = model.getSnapshot();

  assert.throws(() => model.advance({ ...input, timeSeconds: 2,
    chemicalMemory: new Float32Array(15) }), /length must equal/);
  assert.throws(() => model.advance({ ...input, timeSeconds: 2,
    chemicalMemory: [NaN, ...input.chemicalMemory.slice(1)] }), /must be from 0 through 1/);
  assert.throws(() => model.advance({ ...input, timeSeconds: 2,
    mechanicalSupport: [-0.1, ...input.mechanicalSupport.slice(1)] }), /must be from 0 through 1/);
  assert.throws(() => model.advance({ ...input, timeSeconds: 2,
    countDistinctContactTimes: [3, ...input.countDistinctContactTimes.slice(1)] }), /from 0 through 2/);
  assert.throws(() => model.advance({ ...input, timeSeconds: 2,
    countDistinctContactTimes: [1.5, ...input.countDistinctContactTimes.slice(1)] }), /an integer/);
  assert.throws(() => model.advance({ ...input, timeSeconds: -1 }), /nonnegative/);
  assert.throws(() => model.advance({ ...input, timeSeconds: 0.5 }), /nondecreasing/);

  assert.deepEqual(Object.fromEntries(Object.entries(input).map(([key, values]) => [key, Array.from(values)])), original);
  assert.deepEqual(model.getSnapshot(), before);
  assert.ok(Object.isFrozen(before) && Object.isFrozen(before.state) && Object.isFrozen(before.episodes));
  assert.throws(() => new AntLocalAccretion({ width: 1, height: 2 }), /integers from 2 through 512/);
});

test('rejects oversized sample gaps before mutation and accepts the documented cadence bound', () => {
  const model = new AntLocalAccretion({ width: 4, height: 4 });
  const input = create();
  model.advance({ ...input, timeSeconds: 0 });
  const before = model.getSnapshot();

  assert.throws(() => model.advance({ ...input, timeSeconds: 1 + 1 / 60 + 2e-9 }), /sample gap must not exceed/);
  assert.deepEqual(model.getSnapshot(), before);
  model.advance({ ...input, timeSeconds: 1 + 1 / 60 + 1e-9 });
  assert.ok(model.getSnapshot().state.every(value => value === 1 + 1 / 60 + 1e-9));
});
