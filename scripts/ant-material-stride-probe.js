import assert from 'node:assert/strict';
import { GaitController } from '../src/lib/agents/ant/GaitController.js';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';

export const MATERIAL_STRIDE_SCREEN = Object.freeze({ enabled: true, maxShortening: 0.25, scale: 4 });

/** Attach a screening-only stride law. Counts are snapshotted at tick entry by the caller. */
export function attachMaterialStride(gait, { enabled = true } = {}) {
  const tickEntryLayerCount = new Map();
  const nativeStrideByState = new WeakMap();
  const nativeAdvance = gait.advance.bind(gait);
  const nativeSnapshot = gait.getSnapshot.bind(gait);
  const stateFor = id => {
    const state = gait.getOrCreate(id);
    if (!nativeStrideByState.has(state)) nativeStrideByState.set(state, state.strideCycleLength);
    return state;
  };
  const apply = id => {
    const state = stateFor(id), base = nativeStrideByState.get(state);
    const layers = tickEntryLayerCount.get(id) || 0;
    state.strideCycleLength = enabled ? base * (1 - MATERIAL_STRIDE_SCREEN.maxShortening
      * (1 - Math.exp(-layers / MATERIAL_STRIDE_SCREEN.scale))) : base;
    return state;
  };
  gait.advance = (agent, distance, dt, time, segment) => {
    if (agent?.id !== undefined) apply(agent.id);
    return nativeAdvance(agent, distance, dt, time, segment);
  };
  gait.getSnapshot = agent => {
    if (agent?.id !== undefined) apply(agent.id);
    return nativeSnapshot(agent);
  };
  return {
    setTickEntryLayerCounts(counts) {
      tickEntryLayerCount.clear();
      if (counts instanceof Map) for (const [id, value] of counts) {
        if (Number.isFinite(value) && value > 0) tickEntryLayerCount.set(id, value);
      }
      else if (counts && typeof counts === 'object') for (const [id, value] of Object.entries(counts)) {
        if (Number.isFinite(value) && value > 0) tickEntryLayerCount.set(id, value);
      }
    },
    detach() {
      for (const state of gait.ants.values()) {
        const nativeStride = nativeStrideByState.get(state);
        if (nativeStride !== undefined) state.strideCycleLength = nativeStride;
      }
      gait.advance = nativeAdvance;
      gait.getSnapshot = nativeSnapshot;
      tickEntryLayerCount.clear();
    }
  };
}

function runFixture({ layers = 0, enabled = true, label = 'fixture', ticks = 360 } = {}) {
  const gait = new GaitController({ strideVariation: 0 }), field = new SurfaceField();
  const attached = attachMaterialStride(gait, { enabled });
  const id = 'screen-ant', agent = { id, x: 0.5, y: 0.5, heading: 0, radius: 0.006 };
  const events = [], snapshots = [];
  let distance = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    attached.setTickEntryLayerCounts({ [id]: layers });
    const d = 0.001, from = { x: agent.x, y: agent.y };
    agent.x += d;
    distance += d;
    const out = gait.advance({ ...agent }, d, 1 / 60, (tick + 1) * 1000 / 60, { from, to: { x: agent.x, y: agent.y } });
    for (const event of out) { events.push(event); field.applyFootContact(event); }
    snapshots.push(gait.getSnapshot({ ...agent }));
  }
  const groups = { A: 0, B: 0 }, legs = Object.fromEntries(['FL','FR','ML','MR','RL','RR'].map(leg => [leg, 0]));
  for (const event of events) { groups[event.contactGroup]++; for (const c of event.contacts) legs[c.legId]++; }
  const stats = { label, layers, enabled, strideCycleLength: snapshots.at(-1)?.strideCycleLength,
    distance, eventCount: events.length, maxContactGroupsPerAdvance: gait.maxContactGroupsPerAdvance,
    groups, legs, firstEvents: events.slice(0, 4), lastEventTimeMs: events.at(-1)?.simulationTimeMs,
    surfaceContacts: field.totalFootContacts,
    maxCompaction: Math.max(...field.values),
    minEventEdgeDistance: events.flatMap(e => e.contacts.map(c => Math.min(c.position.x,c.position.y,1-c.position.x,1-c.position.y))).reduce((a,b)=>Math.min(a,b), Infinity) };
  attached.detach();
  return { ...stats, contactStream: events };
}

export function runProbe() {
  const fixtures = [runFixture({ layers: 0, label: 'L0' }), runFixture({ layers: 4, label: 'L4' }),
    runFixture({ layers: 100, label: 'L100' }), runFixture({ layers: 4, enabled: false, label: 'disabled' })];
  const [bare, , , disabled] = fixtures;
  const rows = fixtures.map(({ contactStream, ...row }) => row);
  return { law: 'q(L)=1-0.25*(1-exp(-L/4)); strideCycleLength=nativeStride*q(L)', rows,
    L0StreamExactlyMatchesDisabled: JSON.stringify(bare.contactStream) === JSON.stringify(disabled.contactStream),
    interpretation: 'Authored screening law for material-conditioned contact cadence; not measured foot physics.' };
}

if (process.argv[1]?.endsWith('ant-material-stride-probe.js')
    && (process.argv.includes('--self-test') || process.argv.includes('--probe'))) {
  const result = runProbe();
  if (process.argv.includes('--self-test')) {
    assert.equal(result.rows[0].strideCycleLength, result.rows[3].strideCycleLength);
    assert.ok(result.rows[2].strideCycleLength >= 0.75 * 0.036);
    assert.ok(result.rows[2].eventCount >= result.rows[0].eventCount);
    assert.deepEqual(result.rows[0].firstEvents.map(e => e.contactGroup), ['B','A','B','A']);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
