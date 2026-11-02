import test from 'node:test';
import assert from 'node:assert/strict';
import { countedLcg, filterKnownSegments, ndjsonText } from '../scripts/ant-multiphysics-orientation.js';

test('newborn segments are excluded until the previous-tick ID set contains them', () => {
  const segments = [
    { id: 'ant-1', dx: 0.01 },
    { id: 'ant-2', dx: 0.02 },
    { id: 'ant-3', dx: 0 }
  ];
  assert.deepEqual(filterKnownSegments(segments, new Set(['ant-1', 'ant-3'])), [segments[0], segments[2]]);
});

test('counted seed stream is deterministic and reports every draw', () => {
  const a = countedLcg(20261005);
  const b = countedLcg(20261005);
  const aValues = [a.random(), a.random()];
  const bValues = [b.random(), b.random()];
  assert.deepEqual(aValues, [0.43773177452385426, 0.7180572913493961]);
  assert.deepEqual(aValues, bValues);
  assert.equal(a.calls, 2);
  assert.equal(a.state(), b.state());
});

test('every serialized capture row remains one LF-separated JSON record', () => {
  const rows = [{ tick: 0, observed: 'a', plain: 'a' },
    { tick: 1, observed: 'b', plain: 'b' },
    { tick: 2, observed: 'c', plain: 'c' },
    { tick: 3, observed: 'd', plain: 'd' }];
  const text = ndjsonText(rows);
  assert.equal(text.split('\n').filter(Boolean).length, rows.length);
  assert.deepEqual(text.trimEnd().split('\n').map(line => JSON.parse(line)), rows);
});
