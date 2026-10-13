import assert from 'node:assert/strict';
import test from 'node:test';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';

const attribution = await import('../scripts/ant-morphology-attribution-analysis.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

test('trajectory decoder preserves frame time, IDs, and normalized positions', () => {
  const bytes = trajectoryFixture([{ timeSeconds: 1, agents: [{ idIndex: 7, x: 0.25, y: 0.75,
    vx: 0.1, vy: -0.2, heading: 0.5, radius: 0.006 }] }]);
  const decoded = attribution.decodeTrajectory?.(bytes);
  assert.deepEqual(decoded?.frames.map(({ timeSeconds, agentCount }) => ({ timeSeconds, agentCount })),
    [{ timeSeconds: 1, agentCount: 1 }]);
  assert.equal(decoded?.frames[0].offset, 32);
});

test('pre-birth occupancy excludes earlier frames and uses one fixed world grid', () => {
  const bytes = trajectoryFixture([
    { timeSeconds: 0.25, agents: [{ idIndex: 1, x: 0.25, y: 0.25, vx: 0, vy: 0, heading: 0, radius: 0.006 }] },
    { timeSeconds: 0.75, agents: [{ idIndex: 1, x: 0.25, y: 0.25, vx: 0, vy: 0, heading: 0, radius: 0.006 }] },
    { timeSeconds: 1, agents: [{ idIndex: 1, x: 0.75, y: 0.75, vx: 0, vy: 0, heading: 0, radius: 0.006 }] }
  ]);
  const result = attribution.occupancyWindow?.(attribution.decodeTrajectory?.(bytes), 1, 0.5, 2);
  assert.deepEqual(Array.from(result?.values || []), [1, 0, 0, 1]);
  assert.equal(result?.includedFrames, 2);
  assert.equal(result?.agentFrames, 2);
});

test('weighted grid metrics retain physical mass and use one scale-independent spatial definition', () => {
  const values = new Float32Array(9);
  values[3] = 1; // (0.5, 0): radius 0.5 from (0.5, 0.5)
  values[5] = 1; // (1, 0.5): radius 0.5 from (0.5, 0.5)
  const result = attribution.measureWeightedGrid?.(values, 3, { x: 0.5, y: 0.5 });
  assert.equal(result?.mass, 2);
  assert.equal(result?.positiveCells, 2);
  assert.equal(result?.effectiveCells, 2);
  assert.equal(result?.meanRadius, 0.5);
  assert.ok(Math.abs(result?.angularDispersion - 1) < 1e-12);
  assert.ok(Number.isFinite(result?.angularSpanRad));
});

test('radial path metrics report geodesic length, tortuosity, and radial alignment', () => {
  const result = attribution.measurePath?.([[0, 0.5], [0.5, 0.5], [1, 0.5]], { x: 0.5, y: 0.5 });
  assert.equal(result?.pathLength, 1);
  assert.equal(result?.endpointDistance, 1);
  assert.equal(result?.tortuosity, 1);
  assert.equal(result?.radialAlignment, 1);
  assert.equal(result?.angularSpanRad, Math.PI);
});

test('full support sampling reads SurfaceField without changing its state', () => {
  const surface = new SurfaceField();
  surface.values.fill(0.5);
  const before = surface.values.slice();
  const samples = attribution.sampleFullSupportGrid?.(surface, 96, 0.025);
  assert.equal(samples?.length, 96 * 96);
  assert.equal(samples?.[48 * 96 + 48], 0.5);
  assert.deepEqual(surface.values, before);
});

test('production eligibility is the conjunction of chemical and mechanical thresholds', () => {
  const result = attribution.validateProductionSupport?.({
    chemicalMemory: new Float32Array([0.3, 0.299, 0.4]),
    productionSupports: new Float32Array([0.016, 0, 0.014]),
    fullSupport: new Float32Array([0.016, 0.9, 0.014]),
    chemicalThreshold: 0.3,
    supportThreshold: 0.015
  });
  assert.deepEqual(result?.mismatches, []);
  assert.deepEqual(Array.from(result?.chemicalQualifiedMask || []), [1, 0, 1]);
  assert.deepEqual(Array.from(result?.supportedMask || []), [1, 0, 0]);
});

function trajectoryFixture(frames) {
  const header = Buffer.alloc(20);
  Buffer.from('ANTTRJ01').copy(header);
  header.writeUInt32LE(1, 8);
  header.writeUInt32LE(60, 12);
  header.writeUInt32LE(52, 16);
  const rows = frames.map(frame => {
    const row = Buffer.alloc(12 + frame.agents.length * 52);
    row.writeDoubleLE(frame.timeSeconds, 0);
    row.writeUInt32LE(frame.agents.length, 8);
    let offset = 12;
    for (const agent of frame.agents) {
      row.writeUInt32LE(agent.idIndex, offset); offset += 4;
      for (const key of ['x', 'y', 'vx', 'vy', 'heading', 'radius']) {
        row.writeDoubleLE(agent[key], offset); offset += 8;
      }
    }
    return row;
  });
  return Buffer.concat([header, ...rows]);
}
