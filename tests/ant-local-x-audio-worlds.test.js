import test from 'node:test';
import assert from 'node:assert/strict';
import { audioFrameForTick, buildReplaySchedule, topologyMetrics } from '../scripts/ant-local-x-audio-worlds.js';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';

function emptyState() {
  return { version: 1, width: 96, height: 96, revision: 0, noduleRevision: 0, plates: [], nodules: [],
    stratigraphy: { version: 1, revision: 0, layerOrder: [], topLayerByCell: new Int32Array(96 * 96).fill(-1),
      layerCountByCell: new Uint16Array(96 * 96), totalDepthByCellMeters: new Float32Array(96 * 96) } };
}

function plateAt(id, minX, minY = 45) {
  const mask = new Uint8Array(96 * 96);
  for (let y = minY; y < minY + 6; y++) for (let x = minX; x < minX + 6; x++) mask[y * 96 + x] = 1;
  return { id, bornAtSimulationTimeMs: 1000 / 60, grid: { width: 96, height: 96 }, mask,
    edges: [], pickups: [{ x: (minX + 2.5) / 95, y: (minY + 2.5) / 95 }, { x: (minX + 2.5) / 95, y: (minY + 2.5) / 95 }],
    material: { stiffness: 0.9, density: 1.1, damping: 0.35 } };
}

function stateWithPlates(plates) {
  const top = new Int32Array(96 * 96).fill(-1);
  const count = new Uint16Array(96 * 96);
  for (let index = 0; index < plates.length; index++) {
    for (let cell = 0; cell < plates[index].mask.length; cell++) if (plates[index].mask[cell]) {
      top[cell] = index; count[cell] += 1;
    }
  }
  return { version: 1, width: 96, height: 96, revision: plates.length, noduleRevision: 0, plates, nodules: [],
    stratigraphy: { version: 1, revision: plates.length, layerOrder: plates.map(plate => plate.id), topLayerByCell: top,
      layerCountByCell: count, totalDepthByCellMeters: new Float32Array(96 * 96) } };
}

const bornState = () => stateWithPlates([plateAt('p1', 45)]);

test('completed ANT ticks map to exact 48 kHz frame boundaries including the non-rendered endpoint', () => {
  assert.equal(audioFrameForTick(0), 0);
  assert.equal(audioFrameForTick(1), 800);
  assert.equal(audioFrameForTick(18000), 14_400_000);
  assert.throws(() => audioFrameForTick(1.5), RangeError);
  assert.throws(() => audioFrameForTick(18001), RangeError);
});

test('routed contact strikes old exposed Plate before same-tick new-Plate topology install', () => {
  const initial = emptyState(), oldPlate = plateAt('old', 45), newPlate = plateAt('new', 60);
  const onePlate = stateWithPlates([oldPlate]);
  const bothPlates = stateWithPlates([oldPlate, newPlate]);
  const capture = { contacts: [{ tick: 2, sequence: 0, controllerTimeAtEmissionMs: 1000 / 60,
    payloadSimulationTimeMs: 2 * 1000 / 60,
    payload: { type: 'FOOT_CONTACT', strength: 0.04, contacts: [{ legId: 'FL' }] },
    responses: [{ legId: 'FL', position: { x: 47.5 / 95, y: 47.5 / 95 }, hardness: 0.5,
      footprintRadius: 0.01, strengthTransfer: 1 }] }], topologyStates: [
      { tick: 0, phase: 'initial', state: initial }, { tick: 1, phase: 'afterTick', state: onePlate },
      { tick: 2, phase: 'afterTick', state: bothPlates }] };
  const schedule = buildReplaySchedule(capture, { seconds: 300 });
  const atTickTwo = schedule.events.filter(row => row.frame === 1600);
  assert.deepEqual(atTickTwo.map(row => row.message.type), ['strike', 'topology']);
  assert.equal(atTickTwo[0].message.payload.plateId, 'old');
  assert.deepEqual(schedule.timeline.filter(row => row.tick === 2).map(row => row.kind), ['contact', 'topology']);
  assert.equal(schedule.routeRows[0].mappedFrame, 1600);
  assert.equal(schedule.routeRows[0].controllerTimeAtEmissionMs, 1000 / 60);
  assert.equal(schedule.routeRows[0].payloadSimulationTimeMs, 2 * 1000 / 60);
  assert.equal(schedule.routeRows[0].routed, true);
  assert.equal(schedule.routeRows[0].strikeCount, 1);
  assert.equal(schedule.metrics.totalFrames, 14_400_000);
  const last = schedule.topologyRows.at(-1);
  assert.equal(last.plateCount, 2);
  assert.equal(last.plates[0].exposedSourceCells, 36);
  assert.equal(last.plates[1].exposedSourceCells, 36);
  assert.equal(last.plates[0].maskComponents4Connected, 1);
  assert.equal(last.plates[0].geometrySha256.length, 64);
  assert.equal(last.plates[0].solverNodeCount + last.plates[1].solverNodeCount, last.totalSolverNodes);
  assert.equal(last.plates[0].solverComponents4Connected, 1);
  assert.equal(last.plates[0].pickupsCoincident, true);
  assert.equal(last.plates[0].pickupSolverCells[0], last.plates[0].pickupSolverCells[1]);
  assert.equal(last.oneNodeLayers, 0);
});

test('topology metrics report exact compiled solver nodes and links', () => {
  const state = bornState();
  const topology = compileSurfaceTopology({ plates: state.plates, nodules: state.nodules,
    stratigraphy: state.stratigraphy });
  const metrics = topologyMetrics(state, topology, 1);
  assert.equal(metrics.totalSolverNodes, topology.nodeGridIndices.length);
  assert.equal(metrics.inPlateEdges, topology.neighborIndices.filter(index => index >= 0).length / 2);
  assert.equal(metrics.adjacentCouplingLinks, topology.adjacentLinkCoefficients.length);
});

test('geometry metrics do not reuse same-ID material geometry from another world', () => {
  const left = stateWithPlates([plateAt('same-id', 30)]), right = stateWithPlates([plateAt('same-id', 60)]);
  const leftTopology = compileSurfaceTopology({ plates: left.plates, nodules: [], stratigraphy: left.stratigraphy });
  const rightTopology = compileSurfaceTopology({ plates: right.plates, nodules: [], stratigraphy: right.stratigraphy });
  const leftMetrics = topologyMetrics(left, leftTopology, 1).plates[0];
  const rightMetrics = topologyMetrics(right, rightTopology, 1).plates[0];
  assert.notEqual(leftMetrics.geometrySha256, rightMetrics.geometrySha256);
  assert.notEqual(leftMetrics.solverGeometrySha256, rightMetrics.solverGeometrySha256);
  assert.equal(leftMetrics.relativeSolverGeometrySha256, rightMetrics.relativeSolverGeometrySha256);
  assert.equal(leftMetrics.maskCells, rightMetrics.maskCells);
});
