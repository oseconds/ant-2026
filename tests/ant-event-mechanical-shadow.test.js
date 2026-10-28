import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';
import { replayMechanicalWindow } from '../scripts/lib/antEventMechanicalShadow.js';

const DT_MS = 10;
const point = (x, y) => ({ legId: 'front-left', position: { x, y } });
const group = (simulationTimeMs, contacts) => ({ type: 'FOOT_CONTACT', simulationTimeMs, contacts });

function fixture() {
  const contacts = [
    group(0, [point(0.2, 0.2)]), // already represented by starting field
    group(10, [point(0.4, 0.4)]),
    group(19, [point(0.7, 0.6)]), // same production tick as next group, archive order retained
    group(11, [point(0.6, 0.7)]),
    group(30, [point(1.2, 0.5)]), // source event at end; SurfaceField ignores out-of-domain foot
    group(31, [point(0.1, 0.1)]) // after selected end
  ];
  const source = new SurfaceField({ width: 8, height: 8 });
  source.applyFootContact(contacts[0]);
  const analyses = [{ tick: 0, simulationTimeMs: 0, maps: { C_surface: source.values.slice() } }];
  for (let tick = 1; tick <= 3; tick += 1) {
    source.relax(DT_MS / 1000);
    for (const event of contacts) {
      if (Math.ceil(event.simulationTimeMs / DT_MS - 1e-9) === tick) source.applyFootContact(event);
    }
    analyses.push({ tick, simulationTimeMs: tick * DT_MS, maps: { C_surface: source.values.slice() } });
  }
  return { analyses, contacts };
}

test('replays original event groups in tick order and matches every saved Float32 anchor', () => {
  const packet = fixture();
  const untouched = structuredClone(packet);
  const random = Math.random;
  try {
    Math.random = () => { throw new Error('RNG called'); };
    const result = replayMechanicalWindow(packet, { startIndex: 0, endIndex: 3, stepMs: DT_MS });
    assert.equal(result.validity.exact, true);
    assert.deepEqual(result.validity, { exact: true, matchedAnchors: 4, expectedAnchors: 4, firstMismatch: null });
    assert.equal(result.originalContactGroups, 4);
    assert.equal(result.originalFeet, 4);
    assert.deepEqual(result.observedEndValues, packet.analyses[3].maps.C_surface);
    assert.ok([...result.retainedIncrementValues].every(Number.isFinite));
    assert.deepEqual(packet, untouched);
  } finally { Math.random = random; }
});

test('excludes start contact, includes end contact, and returns raw signed Float32 residuals', () => {
  const packet = fixture();
  const result = replayMechanicalWindow(packet, { startIndex: 0, endIndex: 3, stepMs: DT_MS });
  const noContacts = new SurfaceField({ width: 8, height: 8 });
  noContacts.values.set(packet.analyses[0].maps.C_surface);
  for (let tick = 1; tick <= 3; tick += 1) noContacts.relax(DT_MS / 1000);
  assert.deepEqual(result.decayOnlyValues, noContacts.values);
  assert.ok([...result.retainedIncrementValues].some(value => value !== 0));
});

test('accepts the JSON-serialized packet array schema with exact Float32 parity', () => {
  const packet = JSON.parse(JSON.stringify(fixture(), (_, value) =>
    value instanceof Float32Array ? Array.from(value) : value));
  const result = replayMechanicalWindow(packet, { startIndex: 0, endIndex: 3, stepMs: DT_MS });
  assert.equal(result.validity.exact, true);
  assert.deepEqual(result.observedEndValues, Float32Array.from(packet.analyses[3].maps.C_surface));
});

test('exact anchor mismatch invalidates contribution values instead of relaxing equality', () => {
  const packet = fixture();
  packet.analyses[2].maps.C_surface[0] = 0.125;
  const result = replayMechanicalWindow(packet, { startIndex: 0, endIndex: 3, stepMs: DT_MS });
  assert.equal(result.validity.exact, false);
  assert.equal(result.validity.matchedAnchors, 3);
  assert.equal(result.validity.firstMismatch.analysisIndex, 2);
  assert.equal(result.retainedIncrementValues, null);
});
