import test from 'node:test';
import assert from 'node:assert/strict';
import { GaitController } from '../src/lib/agents/ant/GaitController.js';

const movingAnt = (id = 'ant-1', x = 0.5, y = 0.5, heading = 0) => ({
  id, x, y, heading, radius: 0.006
});

test('zero travel freezes gait phase and emits no contact', () => {
  const gait = new GaitController();
  const ant = movingAnt();
  const initial = gait.getSnapshot(ant).phase;
  assert.deepEqual(gait.advance(ant, 0, 1 / 60, 1000), []);
  assert.equal(gait.getSnapshot(ant).phase, initial);
});

test('positive distance advances deterministic hashed phase without behavior random input', () => {
  const gait = new GaitController({ strideVariation: 0 });
  const ant = movingAnt();
  const initialTraits = { ...gait.getOrCreate(ant.id) };
  const initial = initialTraits.phase;
  const next = { ...ant, x: 0.5036 };
  const events = gait.advance(next, 0.0036, 0.1, 100, { from: ant, to: next });
  assert.deepEqual(events, []);
  assert.ok(Math.abs(gait.getSnapshot(ant).phase - (initial + 0.1) % 1) < 1e-12);

  const first = gait.getOrCreate('ant-1');
  const secondController = new GaitController({ strideVariation: 0 });
  assert.deepEqual(initialTraits, secondController.getOrCreate('ant-1'));
  assert.ok(first.phase >= 0 && first.phase < 1);
  assert.ok(first.strideCycleLength >= 0.036 * 0.92 && first.strideCycleLength <= 0.036 * 1.08);
  assert.ok(first.contactStrength >= 0.035 * 0.96 && first.contactStrength <= 0.035 * 1.04);
  assert.notDeepEqual(first, gait.getOrCreate('ant-2'), 'new IDs derive new persistent gait traits');
});

test('tripod touchdowns alternate B then A and share their foot geometry with snapshots', () => {
  const gait = new GaitController({ strideVariation: 0 });
  const start = movingAnt('ant-1', 0.5, 0.5, 0);
  const state = gait.getOrCreate(start.id);
  state.phase = 0.1;
  const end = { ...start, x: 0.5 + 0.9 * 0.036 };
  const events = gait.advance(end, 0.9 * 0.036, 1, 1000, { from: start, to: end });
  assert.deepEqual(events.map(event => event.contactGroup), ['B', 'A']);
  assert.deepEqual(events[0].contacts.map(contact => contact.legId), ['FR', 'ML', 'RR']);
  assert.deepEqual(events[1].contacts.map(contact => contact.legId), ['FL', 'MR', 'RL']);
  for (const event of events) {
    assert.equal(event.type, 'FOOT_CONTACT');
    assert.equal(event.contacts.length, 3);
    assert.ok(event.contacts.every(contact => Number.isFinite(contact.position.x)
      && Number.isFinite(contact.position.y)
      && contact.position.x >= 0 && contact.position.x <= 1
      && contact.position.y >= 0 && contact.position.y <= 1));
    assert.ok(Math.abs(event.position.x - event.contacts.reduce((sum, contact) => sum + contact.position.x, 0) / 3) < 1e-12);
    assert.ok(Math.abs(event.position.y - event.contacts.reduce((sum, contact) => sum + contact.position.y, 0) / 3) < 1e-12);
    assert.ok(Math.hypot(event.position.x - end.x, event.position.y - end.y) > 1e-6,
      'the physical centroid differs from the body center');
  }
  assert.equal(events[0].simulationTimeMs, 1000 * (0.4 / 0.9));
  assert.ok(gait.getSnapshot(end).legs.every(leg => Number.isFinite(leg.root.x)
    && Number.isFinite(leg.root.y) && Number.isFinite(leg.knee.x) && Number.isFinite(leg.knee.y)
    && Number.isFinite(leg.foot.x) && Number.isFinite(leg.foot.y)));
});

test('leg geometry rotates with body heading and keeps left/right and front/rear ordering', () => {
  const gait = new GaitController({ strideVariation: 0 });
  const right = movingAnt('ant-1', 0.5, 0.5, 0);
  const up = movingAnt('ant-1', 0.5, 0.5, -Math.PI / 2);
  const horizontal = new Map(gait.getSnapshot(right).legs.map(leg => [leg.id, leg]));
  const vertical = new Map(gait.getSnapshot(up).legs.map(leg => [leg.id, leg]));
  assert.ok(horizontal.get('FL').foot.y < horizontal.get('FR').foot.y);
  assert.ok(horizontal.get('FL').foot.x > horizontal.get('RL').foot.x);
  assert.ok(Math.abs((vertical.get('FL').foot.x - 0.5) - (horizontal.get('FL').foot.y - 0.5)) < 1e-12);
  assert.ok(Math.abs((vertical.get('FL').foot.y - 0.5) + (horizontal.get('FL').foot.x - 0.5)) < 1e-12);
});

test('out-of-domain feet are excluded and an empty tripod produces no contact', () => {
  const gait = new GaitController({ strideVariation: 0 });
  const partial = movingAnt('ant-partial', 0.5, 0.005, 0);
  gait.getOrCreate(partial.id).phase = 0.9;
  const partialEnd = { ...partial, x: partial.x + 0.1 * 0.036 };
  const partialEvents = gait.advance(partialEnd, 0.1 * 0.036, 1, 1000,
    { from: partial, to: partialEnd });
  assert.equal(partialEvents.length, 1);
  assert.deepEqual(partialEvents[0].contacts.map(contact => contact.legId), ['MR']);
  assert.ok(partialEvents[0].contacts.every(contact => contact.position.y >= 0));

  const outside = movingAnt('ant-outside', 2, 2, 0);
  gait.getOrCreate(outside.id).phase = 0.4;
  const outsideEnd = { ...outside, x: outside.x + 0.1 * 0.036 };
  assert.deepEqual(gait.advance(outsideEnd, 0.1 * 0.036, 1, 1000,
    { from: outside, to: outsideEnd }), []);
});

test('burst cap emits four groups but retains the correct gait phase and next tripod', () => {
  const gait = new GaitController({ strideVariation: 0 });
  const start = movingAnt();
  gait.getOrCreate(start.id).phase = 0.1;
  const end = { ...start, x: 0.5 + 10 * 0.036 };
  const burst = gait.advance(end, 10 * 0.036, 1, 1000, { from: start, to: end });
  assert.deepEqual(burst.map(event => event.contactGroup), ['B', 'A', 'B', 'A']);
  assert.equal(burst.length, 4);
  assert.ok(Math.abs(gait.getSnapshot(end).phase - 0.1) < 1e-12);

  const nextEnd = { ...end, x: end.x + 0.4 * 0.036 };
  const next = gait.advance(nextEnd, 0.4 * 0.036, 1 / 60, 1016.6666667,
    { from: end, to: nextEnd });
  assert.deepEqual(next.map(event => event.contactGroup), ['B']);
});

test('retain removes retired gait state and reset clears all agent traits', () => {
  const gait = new GaitController();
  gait.getSnapshot(movingAnt('ant-1'));
  gait.getSnapshot(movingAnt('ant-2'));
  gait.retain(new Set(['ant-2']));
  assert.deepEqual([...gait.ants.keys()], ['ant-2']);
  gait.reset();
  assert.equal(gait.ants.size, 0);
});
