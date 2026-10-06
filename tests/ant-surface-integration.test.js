import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';

function countedRandom(seed) {
  let value = seed >>> 0;
  const random = () => {
    random.calls += 1;
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
  random.calls = 0;
  return random;
}

class EmptySurfaceField {
  constructor() { this.totalFootContacts = 0; }
  clear() { this.totalFootContacts = 0; }
  relax() {}
  applyFootContact() { return []; }
  getSnapshot() {
    return { width: 96, height: 96, values: new Float32Array(96 * 96),
      maxValue: 0, totalMass: 0, totalFootContacts: 0 };
  }
}

function antPhysicsSnapshot(snapshot) {
  const { surface, surfacePlates, stratigraphy, ...rest } = snapshot;
  void surface;
  void surfacePlates;
  void stratigraphy;
  return rest;
}

test('surface contact memory does not feed back into ANT motion, pheromone, gait, colony, or randomness', async () => {
  const options = { state: { population: { count: 8, activationFeedback: false } } };
  const baseRandom = countedRandom(20261005);
  const surfaceRandom = countedRandom(20261005);
  const baseline = new AntController({ ...options, random: baseRandom, surfaceField: new EmptySurfaceField() });
  const withSurface = new AntController({ ...options, random: surfaceRandom, surfaceField: new SurfaceField() });
  const baselineContacts = [];
  const surfaceContacts = [];
  baseline.subscribe(event => { if (event.type === 'foot-contact') baselineContacts.push(event.payload); });
  withSurface.subscribe(event => { if (event.type === 'foot-contact') surfaceContacts.push(event.payload); });
  await Promise.all([baseline.init(), withSurface.init()]);

  for (let tick = 0; tick < 900; tick += 1) {
    baseline.tick(1 / 60);
    withSurface.tick(1 / 60);
  }

  const baselineSnapshot = baseline.getSnapshot();
  const surfaceSnapshot = withSurface.getSnapshot();
  assert.deepEqual(antPhysicsSnapshot(surfaceSnapshot), antPhysicsSnapshot(baselineSnapshot),
    'agents, shared pheromone, population analysis, and gait snapshots remain identical');
  assert.deepEqual(surfaceContacts, baselineContacts,
    'surface processing preserves the exact FOOT_CONTACT events and timing');
  assert.ok(surfaceContacts.length > 0, 'the default surface received natural gait contacts');
  assert.ok(surfaceSnapshot.surface.totalFootContacts > 0, 'surface memory records individual contacts while audio is off');
  assert.equal(baseRandom.calls, surfaceRandom.calls, 'surface bookkeeping consumes no ANT random values');
  assert.equal(surfaceSnapshot.audio.enabled, false, 'the test keeps the audio bridge disabled');

  await Promise.all([baseline.destroy(), withSurface.destroy()]);
});
