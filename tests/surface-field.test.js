import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';

const footEvent = (contacts, extra = {}) => ({
  type: 'FOOT_CONTACT',
  antId: 'ant-1',
  contactGroup: 'A',
  contacts,
  position: { x: 0.91, y: 0.07 },
  strength: 0.01,
  simulationTimeMs: 100,
  ...extra
});

test('SurfaceField uses the shared 96-square defaults and returns isolated snapshots', () => {
  const field = new SurfaceField();
  const snapshot = field.getSnapshot();
  assert.equal(snapshot.width, 96);
  assert.equal(snapshot.height, 96);
  assert.equal(snapshot.values.length, 96 * 96);
  assert.equal(snapshot.maxValue, 0);
  assert.equal(snapshot.totalMass, 0);
  assert.equal(snapshot.totalFootContacts, 0);
  snapshot.values.fill(1);
  assert.equal(field.sample(0.5, 0.5), 0);
});

test('a FOOT_CONTACT compacts only its individual in-domain foot positions', () => {
  const field = new SurfaceField();
  const positions = [
    { legId: 'FL', position: { x: 0.4, y: 0.5 } },
    { legId: 'MR', position: { x: 0.5, y: 0.5 } },
    { legId: 'RL', position: { x: 0.6, y: 0.5 } }
  ];
  const responses = field.applyFootContact(footEvent(positions));
  assert.deepEqual(responses.map(item => item.legId), ['FL', 'MR', 'RL']);
  assert.deepEqual(responses.map(item => item.position), positions.map(item => item.position));
  assert.ok(field.sample(0.5, 0.5) > 0);
  assert.equal(field.sample(0.91, 0.07), 0, 'the event centroid is ignored');
  assert.equal(field.totalFootContacts, 3);
});

test('contact deposition is deterministic and independent of event strength and global RNG', () => {
  const first = new SurfaceField();
  const second = new SurfaceField();
  const contacts = [
    { legId: 'FR', position: { x: 0.37, y: 0.62 } },
    { legId: 'ML', position: { x: 0.41, y: 0.60 } }
  ];
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('SurfaceField must not use random numbers.'); };
  try {
    first.applyFootContact(footEvent(contacts, { strength: 0.001, position: { x: 0.2, y: 0.2 } }));
    second.applyFootContact(footEvent(contacts, { strength: 1, position: { x: 0.8, y: 0.8 } }));
  } finally {
    Math.random = originalRandom;
  }
  assert.deepEqual(first.values, second.values);
});

test('compaction saturates smoothly and response derives bounded material properties', () => {
  const field = new SurfaceField();
  const contact = { legId: 'FL', position: { x: 0.5, y: 0.5 } };
  const low = field.applyFootContact(footEvent([contact]))[0];
  assert.equal(low.compaction, 0);
  assert.equal(low.hardness, 0);
  assert.equal(low.footprintRadius, 0.014);
  assert.equal(low.strengthTransfer, 0.95);

  const cellX = 48 / 95, cellY = 48 / 95;
  let previous = field.sample(cellX, cellY);
  for (let index = 0; index < 1000; index += 1) field.applyFootContact(footEvent([contact]));
  const high = field.sample(cellX, cellY);
  assert.ok(high > previous && high < 1);
  const response = field.applyFootContact(footEvent([contact]))[0];
  assert.ok(response.compaction > 0.99 && response.compaction < 1);
  assert.ok(response.footprintRadius >= 0.009 && response.footprintRadius <= 0.014);
  assert.ok(response.footprintRadius < low.footprintRadius);
  assert.ok(response.strengthTransfer >= 0.95 && response.strengthTransfer <= 1.05);
  assert.ok(response.strengthTransfer > low.strengthTransfer);
  assert.ok([...field.values].every(value => value >= 0 && value <= 1));
});

test('valid edge contacts remain at their real positions and outside feet are ignored', () => {
  const field = new SurfaceField();
  assert.deepEqual(field.applyFootContact(footEvent([
    { legId: 'OUT', position: { x: -0.0001, y: 0.5 } }
  ])), []);
  assert.equal(field.totalFootContacts, 0);
  const response = field.applyFootContact(footEvent([
    { legId: 'EDGE', position: { x: 0, y: 0.5 } }
  ]))[0];
  assert.deepEqual(response.position, { x: 0, y: 0.5 });
  assert.equal(field.totalFootContacts, 1);
  assert.ok(field.sample(0, 0.5) > 0);
});

test('event validation skips malformed feet without discarding valid feet', () => {
  const field = new SurfaceField();
  const responses = field.applyFootContact(footEvent([
    null,
    { legId: '', position: { x: 0.2, y: 0.3 } },
    { legId: 'NAN', position: { x: NaN, y: 0.4 } },
    { legId: 'OK', position: { x: 0.5, y: 0.5 } }
  ]));
  assert.deepEqual(responses.map(item => item.legId), ['OK']);
  assert.equal(field.totalFootContacts, 1);
  assert.deepEqual(field.applyFootContact({ type: 'STEP', contacts: [
    { legId: 'FL', position: { x: 0.5, y: 0.5 } }
  ] }), []);
  assert.deepEqual(field.applyFootContact({ type: 'FOOT_CONTACT', contacts: null }), []);
});

test('bilinear samples are bounded and return empty material outside the domain', () => {
  const field = new SurfaceField({ width: 4, height: 4 });
  field.values.set([
    0, 1, 0, 1,
    1, 0, 1, 0,
    0, 1, 0, 1,
    1, 0, 1, 0
  ]);
  assert.equal(field.sample(-0.01, 0.5), 0);
  assert.equal(field.sample(0.5, 1.01), 0);
  assert.ok(Math.abs(field.sample(1 / 6, 1 / 6) - 0.5) < 1e-12);
  assert.ok(field.sampleSupport(0.5, 0.5) >= 0 && field.sampleSupport(0.5, 0.5) <= 1);
  assert.throws(() => field.sample(NaN, 0.5), /finite/);
});

test('sampleSupport returns a numeric center-weighted local support value', () => {
  const field = new SurfaceField();
  field.applyFootContact(footEvent([
    { legId: 'FL', position: { x: 0.5, y: 0.5 } }
  ]));
  const local = field.sampleSupport(0.5, 0.5);
  assert.equal(typeof local, 'number');
  assert.ok(local > 0 && local <= field.sample(0.5, 0.5));
  assert.equal(field.sampleSupport(-0.001, 0.5), 0);
});

test('relax uses the configured slow half-life and clear resets field metrics', () => {
  const field = new SurfaceField();
  field.applyFootContact(footEvent([
    { legId: 'FL', position: { x: 0.5, y: 0.5 } }
  ]));
  const initial = field.sample(48 / 95, 48 / 95);
  field.relax(1800);
  assert.ok(Math.abs(field.sample(48 / 95, 48 / 95) - initial * 0.5) < 1e-7);
  const massBeforeInvalid = field.getSnapshot().totalMass;
  assert.ok(massBeforeInvalid > 0);
  assert.throws(() => field.relax(-1), /non-negative/);
  assert.throws(() => field.relax(Infinity), /non-negative/);
  field.clear();
  assert.equal(field.getSnapshot().totalMass, 0);
  assert.equal(field.getSnapshot().totalFootContacts, 0);
});

test('constructor rejects invalid dimensions, dose, radius, and half-life', () => {
  assert.throws(() => new SurfaceField({ width: 1 }), /width/);
  assert.throws(() => new SurfaceField({ height: 600 }), /height/);
  assert.throws(() => new SurfaceField({ halfLifeSeconds: 0 }), /halfLifeSeconds/);
  assert.throws(() => new SurfaceField({ contactDose: 1.1 }), /contactDose/);
  assert.throws(() => new SurfaceField({ radius: NaN }), /radius/);
});
