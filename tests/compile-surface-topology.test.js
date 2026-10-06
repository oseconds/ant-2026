import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileSurfaceTopology, NO_NODE, SURFACE_ADJACENT_COUPLING, SURFACE_MAX_LAYERS,
  SURFACE_SOLVER_GRID, SURFACE_SOURCE_GRID
} from '../src/lib/audio/compileSurfaceTopology.js';

function plate(id, cells, { stiffness = 0.9, density = 1.1, damping = 0.35, edges = [] } = {}) {
  const mask = new Array(SURFACE_SOURCE_GRID ** 2).fill(0);
  for (const [x, y] of cells) mask[y * SURFACE_SOURCE_GRID + x] = 1;
  const [x, y] = cells[0];
  const pickups = [{ x: x / 95, y: y / 95 }, { x: cells.at(-1)[0] / 95, y: cells.at(-1)[1] / 95 }];
  return { id, bornAtSimulationTimeMs: 0,
    grid: { width: 96, height: 96 }, mask, edges, pickups,
    material: { stiffness, density, damping } };
}

function rectPlate(id, x0, x1, y0, y1, material) {
  const cells = [];
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) cells.push([x, y]);
  return plate(id, cells, material);
}

function layersAt(topology, x, y) {
  const cell = y * SURFACE_SOLVER_GRID + x;
  return Array.from({ length: topology.columnOffsets[cell + 1] - topology.columnOffsets[cell] },
    (_, offset) => topology.columnLayerIndices[topology.columnOffsets[cell] + offset]);
}

test('compiles sparse 32-grid nodes and global four-neighbor indices without changing frozen 96-grid masks', () => {
  const source = rectPlate('line', 24, 72, 48, 48);
  const originalMask = source.mask.slice();
  const topology = compileSurfaceTopology({ plates: [source], generation: 3 });
  assert.equal(topology.version, 1);
  assert.equal(topology.generation, 3);
  assert.deepEqual(topology.layerIds, ['line']);
  assert.equal(topology.nodeOffsets.length, 2);
  assert.equal(topology.nodeGridIndices.length, 17);
  assert.equal(topology.neighborIndices.length, topology.nodeGridIndices.length * 4);
  assert.deepEqual(source.mask, originalMask);
  assert.equal(topology.routingTopLayerByCell96[48 * 96 + 48], 0);
  assert.equal(topology.routingTopLayerByCell96[0], -1);
  for (let node = 0; node < topology.nodeGridIndices.length; node += 1) {
    const cell = topology.nodeGridIndices[node];
    assert.ok(cell >= 0 && cell < 32 * 32);
    const neighbors = Array.from(topology.neighborIndices.slice(node * 4, node * 4 + 4)).filter(index => index >= 0);
    assert.ok(neighbors.every(index => index < topology.nodeGridIndices.length));
  }
  assert.ok([...topology.pickupNodeIndices].every(index => index < topology.nodeGridIndices.length));
  assert.deepEqual([...topology.materialCoefficients], [
    Math.fround(0.012 * 0.9 / 1.1), Math.fround(0.0002), Math.fround(1.1), Math.fround(0.000009 + 0.000018 * 0.35)
  ]);
});

test('diagonal graph bridges survive conservative downsampling', () => {
  const source = plate('diagonal', [[2, 2], [5, 5]], { edges: [[2 + 2 * 96, 5 + 5 * 96]] });
  const topology = compileSurfaceTopology({ plates: [source] });
  const cells = new Set(topology.nodeGridIndices);
  assert.ok(cells.has(0));
  assert.ok(cells.has(33));
  assert.ok(cells.has(1), 'diagonal bridge cell should be materialized');
});

test('stratigraphy order controls local bottom-to-top columns, top exposure routing, and only adjacent vertical links', () => {
  const lower = rectPlate('lower', 30, 60, 36, 60);
  const middle = rectPlate('middle', 42, 72, 36, 60);
  const upper = rectPlate('upper', 54, 78, 42, 54);
  const plates = [upper, lower, middle];
  const order = ['lower', 'middle', 'upper'];
  const topLayerByCell = new Int32Array(96 * 96).fill(-1);
  const layerCountByCell = new Uint16Array(96 * 96);
  const ordered = [lower, middle, upper];
  for (let cell = 0; cell < 96 * 96; cell += 1) {
    for (let layer = 0; layer < ordered.length; layer += 1) {
      if (ordered[layer].mask[cell]) { topLayerByCell[cell] = layer; layerCountByCell[cell] += 1; }
    }
  }
  const topology = compileSurfaceTopology({ plates, generation: 10,
    stratigraphy: { version: 1, revision: 4, layerOrder: order, topLayerByCell, layerCountByCell } });
  assert.deepEqual(topology.layerIds, order);
  assert.equal(topology.revision, 4);
  assert.deepEqual(layersAt(topology, 16, 16), [0, 1]);
  assert.deepEqual(layersAt(topology, 19, 16), [0, 1, 2]);
  const column = 16 * 32 + 19;
  assert.equal(topology.adjacentLinkOffsets[column + 1] - topology.adjacentLinkOffsets[column], 2);
  const links = [];
  for (let link = topology.adjacentLinkOffsets[column]; link < topology.adjacentLinkOffsets[column + 1]; link += 1) {
    const lowerNode = topology.adjacentLinkNodes[link * 2];
    const upperNode = topology.adjacentLinkNodes[link * 2 + 1];
    const lowerLayer = findLayer(topology, lowerNode);
    const upperLayer = findLayer(topology, upperNode);
    links.push([lowerLayer, upperLayer]);
    assert.ok(Math.abs(topology.adjacentLinkCoefficients[link] - SURFACE_ADJACENT_COUPLING) < 1e-9);
  }
  assert.deepEqual(links, [[0, 1], [1, 2]]);
  assert.equal(topology.routingTopLayerByCell96[48 * 96 + 57], 2);
});

test('never couples masks that only share a coarse32 bin but have no 96-cell overlap', () => {
  const leftHalf = plate('left-half', [[0, 0]]);
  const rightHalf = plate('right-half', [[1, 0]]);
  const topology = compileSurfaceTopology({ plates: [leftHalf, rightHalf],
    stratigraphy: { layerOrder: ['left-half', 'right-half'] } });
  assert.deepEqual(layersAt(topology, 0, 0), [0, 1], 'solver coarse bin does contain both cells');
  assert.equal(topology.adjacentLinkNodes.length, 0, 'no real 96-cell stack overlaps');
  assert.deepEqual([...topology.routingTopLayerByCell96.slice(0, 3)], [0, 1, -1]);
});

test('uses A-to-C adjacency where the middle stratum is locally absent at 96-cell scale', () => {
  const a = plate('A', [[0, 0], [1, 0], [2, 0]]);
  const b = plate('B', [[1, 0]]);
  const c = plate('C', [[0, 0], [1, 0], [2, 0]]);
  const topology = compileSurfaceTopology({ plates: [a, b, c],
    stratigraphy: { layerOrder: ['A', 'B', 'C'] } });
  const sourceCellStart = topology.sourceColumnOffsets[0];
  const sourceCellEnd = topology.sourceColumnOffsets[1];
  assert.deepEqual([...topology.sourceColumnLayerIndices.slice(sourceCellStart, sourceCellEnd)], [0, 2]);
  const cell = 0;
  const pairs = [];
  for (let link = topology.adjacentLinkOffsets[cell]; link < topology.adjacentLinkOffsets[cell + 1]; link += 1) {
    pairs.push([findLayer(topology, topology.adjacentLinkNodes[link * 2]),
      findLayer(topology, topology.adjacentLinkNodes[link * 2 + 1])]);
  }
  assert.deepEqual(pairs, [[0, 1], [0, 2], [1, 2]],
    'A↔C exists where B is absent; A↔B and B↔C exist only at their separate covered source cell');
});

test('rejects a supplied exposure table that disagrees with frozen birth masks', () => {
  const source = rectPlate('route', 24, 72, 48, 48);
  const topLayerByCell = new Int32Array(96 * 96).fill(-1);
  topLayerByCell[48 * 96 + 48] = -1;
  assert.throws(() => compileSurfaceTopology({ plates: [source],
    stratigraphy: { layerOrder: ['route'], topLayerByCell } }), /disagrees with frozen masks/);
});

test('packs nodules and couples only to the deepest valid local foundation plate', () => {
  const bottom = rectPlate('bottom', 24, 72, 24, 72);
  const top = rectPlate('top', 24, 72, 24, 72);
  const nodules = [
    { id: 'nodule-a', position: { x: 0.5, y: 0.5 }, physicalRadiusMeters: 0.03,
      material: { density: 2000, youngModulus: 800000, poisson: 0.3 },
      sourcePlateIDs: ['bottom', 'top'], burying: { foundationPlateId: 'bottom' },
      coupling: { plateId: 'bottom', weight: 0.2, position: { x: 0.5, y: 0.5 }, depthMeters: 0.01 } },
    { id: 'nodule-unlinked', position: { x: 0.9, y: 0.9 }, physicalRadiusMeters: 0.02,
      material: { density: 1900, youngModulus: 500000, poisson: 0.28 },
      coupling: { plateId: 'bottom', weight: 0.12, position: { x: 0.9, y: 0.9 }, depthMeters: 0.02 } }
  ];
  const topology = compileSurfaceTopology({ plates: [bottom, top], nodules,
    stratigraphy: { layerOrder: ['bottom', 'top'] } });
  assert.deepEqual(topology.noduleIds, ['nodule-a', 'nodule-unlinked']);
  assert.deepEqual([...topology.noduleFoundationLayerIndices], [0, -1]);
  assert.notEqual(topology.noduleCouplingNodeIndices[0], NO_NODE);
  assert.equal(topology.noduleCouplingNodeIndices[1], NO_NODE);
  assert.ok([...topology.nodulePositionsXY].every((value, index) =>
    Math.abs(value - [0.5, 0.5, 0.9, 0.9][index]) < 1e-6));
  assert.deepEqual([...topology.noduleMaterials], [2000, 800000, Math.fround(0.3), 1900, 500000, Math.fround(0.28)]);
  assert.ok([...topology.noduleCouplingWeights].every((value, index) =>
    Math.abs(value - [0.2, 0.12][index]) < 1e-6));
  assert.equal(Object.isFrozen(topology.nodules), true);
  assert.equal(Object.isFrozen(topology.nodules[0]), true);
});

test('supports no born plates and enforces the explicit technical layer ceiling', () => {
  const empty = compileSurfaceTopology();
  assert.deepEqual(empty.layerIds, []);
  assert.deepEqual([...empty.nodeOffsets], [0]);
  assert.ok([...empty.routingTopLayerByCell96].every(index => index === -1));
  const tooMany = Array.from({ length: SURFACE_MAX_LAYERS + 1 }, (_, index) =>
    rectPlate(`layer-${index}`, 48, 48, 48, 48));
  assert.throws(() => compileSurfaceTopology({ plates: tooMany }), /256-layer ceiling/);
});

function findLayer(topology, globalNodeIndex) {
  for (let index = 0; index < topology.layerIds.length; index += 1) {
    if (globalNodeIndex >= topology.nodeOffsets[index] && globalNodeIndex < topology.nodeOffsets[index + 1]) return index;
  }
  return -1;
}
