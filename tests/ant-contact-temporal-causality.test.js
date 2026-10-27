import test from 'node:test';
import assert from 'node:assert/strict';
import { assignTemporalDerangement } from '../scripts/lib/antContactTemporalCausality.js';

test('temporal assignment keeps only deterministic closed derangement cycles', () => {
  const events = [
    { id: 'a', plateId: 'p', eventTimeMs: 1, position: { x: 0.1, y: 0.1 } },
    { id: 'b', plateId: 'p', eventTimeMs: 2, position: { x: 0.2, y: 0.1 } },
    { id: 'c', plateId: 'p', eventTimeMs: 3, position: { x: 0.3, y: 0.1 } },
    { id: 'd', plateId: 'p', eventTimeMs: 4, position: { x: 0.4, y: 0.1 } }
  ];
  const supported = (source, target) => ({ a: ['b'], b: ['a'], c: ['d'], d: ['c'] })[source.id].includes(target.id);
  const first = assignTemporalDerangement({ events, isSupported: supported });
  const again = assignTemporalDerangement({ events: [...events].reverse(), isSupported: supported });
  assert.deepEqual(first, again);
  assert.equal(first.summary.assignedCount, 4);
  assert.equal(first.summary.coverage, 1);
  assert.deepEqual(first.events.map(row => [row.id, row.targetEventId]), [['a', 'b'], ['b', 'a'], ['c', 'd'], ['d', 'c']]);
  assert.ok(first.events.every(row => row.id !== row.targetEventId && row.distancePx >= 4));
});

test('temporal assignment reports common-cycle coverage and rejects unsupported locations', () => {
  const events = Array.from({ length: 4 }, (_, index) => ({ id: String(index), plateId: 'p',
    eventTimeMs: index, position: { x: 0.1 + index * 0.05, y: 0.3 } }));
  const valid = assignTemporalDerangement({ events, isSupported: (source, target) =>
    (source.id === '0' && target.id === '1') || (source.id === '1' && target.id === '0') });
  assert.equal(valid.summary.assignedCount, 2);
  assert.equal(valid.summary.coverage, 0.5);
  assert.equal(valid.accepted, false);
  assert.ok(valid.events.every(row => row.id === '0' || row.id === '1'));
});

test('temporal assignment rejects malformed inputs and duplicate positions do not self-map', () => {
  assert.throws(() => assignTemporalDerangement({ events: [{ id: 'x', plateId: 'p', eventTimeMs: 0,
    position: { x: 0.1, y: 0.1 } }, { id: 'x', plateId: 'p', eventTimeMs: 1,
    position: { x: 0.3, y: 0.1 } }], isSupported: () => true }), /duplicate/);
  const duplicate = [{ id: 'x', plateId: 'p', eventTimeMs: 0, position: { x: 0.1, y: 0.1 } },
    { id: 'y', plateId: 'p', eventTimeMs: 1, position: { x: 0.1, y: 0.1 } }];
  const result = assignTemporalDerangement({ events: duplicate, isSupported: () => true });
  assert.equal(result.summary.assignedCount, 0);
});
