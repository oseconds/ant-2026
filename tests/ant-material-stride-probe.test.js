import test from 'node:test';
import assert from 'node:assert/strict';
import { GaitController } from '../src/lib/agents/ant/GaitController.js';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';
import { attachMaterialStride, runProbe } from '../scripts/ant-material-stride-probe.js';

const body = (id, x = 0.4) => ({ id, x, y: 0.5, heading: 0, radius: 0.006 });

test('L0 and disabled preserve native stride; material shortens cadence without changing distance or phase', () => {
  const native = new GaitController({ strideVariation: 0 }), tested = new GaitController({ strideVariation: 0 });
  const attach = attachMaterialStride(tested), id = 'same-id';
  const n = native.getSnapshot(body(id)), t = tested.getSnapshot(body(id));
  const tickCounts = new Map([[id, 0]]);
  attach.setTickEntryLayerCounts(tickCounts);
  assert.equal(t.strideCycleLength, n.strideCycleLength);
  assert.equal(tested.ants.get(id).contactStrength, native.ants.get(id).contactStrength);
  const from = body(id), to = body(id, 0.41);
  const a = native.advance(to, 0.01, 1 / 60, 100, { from, to });
  tickCounts.set(id, 4);
  attach.setTickEntryLayerCounts(tickCounts);
  tickCounts.set(id, 100);
  tickCounts.clear();
  const b = tested.advance(to, 0.01, 1 / 60, 100, { from, to });
  assert.ok(tested.ants.get(id).strideCycleLength < n.strideCycleLength);
  assert.equal(tested.ants.get(id).contactStrength, native.ants.get(id).contactStrength,
    'material cadence preserves this ant’s native contact strength');
  assert.equal(tested.ants.get(id).phase, (t.phase + 0.01 / tested.ants.get(id).strideCycleLength) % 1);
  assert.ok(b.length >= a.length);
  const phase = tested.ants.get(id).phase;
  assert.deepEqual(tested.advance(to, 0, 1 / 60, 116.67, { from: to, to }), []);
  assert.equal(tested.ants.get(id).phase, phase, 'zero actual travel holds phase');
  attach.setTickEntryLayerCounts({ [id]: 0 });
  const snapshot = tested.getSnapshot(to);
  assert.equal(snapshot.phase, phase, 'material transition does not remap phase');
  assert.equal(snapshot.strideCycleLength, n.strideCycleLength);
  attach.setTickEntryLayerCounts({ [id]: 4 });
  assert.ok(tested.getSnapshot(to).strideCycleLength < n.strideCycleLength);
  attach.detach();
  attach.setTickEntryLayerCounts({ [id]: 4 });
  assert.equal(tested.getSnapshot(to).strideCycleLength, n.strideCycleLength,
    'detach restores the live native stride and removes the wrapper');
});

test('fixed identical paths retain genuine contact stream geometry, alternation and SurfaceField response', () => {
  const result = runProbe(), [bare, material, capped, disabled] = result.rows;
  assert.equal(result.L0StreamExactlyMatchesDisabled, true, 'all native event coordinates and timestamps match');
  assert.equal(bare.distance, material.distance);
  assert.equal(bare.eventCount, disabled.eventCount);
  assert.equal(bare.firstEvents[0].simulationTimeMs, disabled.firstEvents[0].simulationTimeMs);
  assert.ok(material.eventCount > bare.eventCount);
  assert.ok(Math.abs(capped.strideCycleLength - (0.036 * (1 - 0.25 * (1 - Math.exp(-100 / 4)))) ) < 1e-15);
  assert.ok(capped.strideCycleLength >= 0.75 * 0.036);
  for (const row of [bare, material, capped]) {
    assert.ok(row.minEventEdgeDistance > 0.01, `${row.label} remains interior; no endpoint clipping`);
    assert.ok(Math.abs(row.groups.A - row.groups.B) <= 1);
    assert.ok(row.surfaceContacts > 0);
    assert.ok(row.maxCompaction > 0, 'real contacts update native SurfaceField');
  }
  assert.deepEqual(material.firstEvents.map(e => e.contactGroup), ['B', 'A', 'B', 'A']);
  assert.equal(material.firstEvents[0].contacts.length, 3);
  assert.ok(material.firstEvents[0].contacts.every(c => ['FR','ML','RR'].includes(c.legId)));
});

test('per-advance contact emission is capped while phase keeps the uncapped travel result', () => {
  const gait = new GaitController({ strideVariation: 0, maxContactGroupsPerAdvance: 4 });
  const id = 'large-step', agent = body(id, 0.35), from = { ...agent }, to = body(id, 0.65);
  const initialPhase = gait.getSnapshot(agent).phase;
  const events = gait.advance(to, 0.3, 1, 1000, { from, to });
  assert.equal(events.length, 4);
  assert.equal(gait.ants.get(id).phase, ((initialPhase + 0.3 / 0.036) % 1));
  assert.equal(events[0].contactGroup, 'B');
  assert.equal(events[1].contactGroup, 'A');
});

test('retired native gait records are removed and future IDs do not inherit material stride', () => {
  const gait = new GaitController({ strideVariation: 0 }), attach = attachMaterialStride(gait);
  attach.setTickEntryLayerCounts({ old: 40 });
  gait.getSnapshot(body('old'));
  assert.ok(gait.ants.get('old').strideCycleLength < 0.036);
  gait.retain([]);
  assert.equal(gait.ants.size, 0);
  attach.setTickEntryLayerCounts({ fresh: 0 });
  assert.equal(gait.getSnapshot(body('fresh')).strideCycleLength, 0.036);
});
