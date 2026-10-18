import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';

const evidence = 'docs/ant/evidence/2026-10-18-synthetic-plate-shape-capability';
const frozenInputsPath = 'docs/ant/evidence/2026-10-13-plate-sonic-individuality/frozen-inputs.json.gz';
const frozenInputsSha256 = 'f600eb768df2721c98cc607ea8b4b4d4fc64ae74cda6b5bf3f9297e8b0865a2d';
const sourceGrid = 96, solverGrid = 32, cellsPerSolverCell = 3;
const commonAnchors = {
  contact: { x: 48, y: 86 },
  leftPickup: { x: 39, y: 86 },
  rightPickup: { x: 57, y: 86 }
};
const controlledEvent = {
  frame: 480, strength: 0.035, footprintRadius: 0.01, hardness: 0.5,
  sampleRate: 48000, frames: 72000, outputGain: 1
};
const shapeDefinitions = [
  {
    id: 'compact', morphology: 'compact',
    recipe: 'Closed ellipse on the 32-grid.',
    parameters: { center: [16, 18.5], radius: [9.5, 10.5] },
    contains: (x, y) => ((x - 16) ** 2 / 9.5 ** 2) + ((y - 18.5) ** 2 / 10.5 ** 2) <= 1
  },
  {
    id: 'elongated', morphology: 'elongated',
    recipe: 'Horizontal ellipse on the 32-grid.',
    parameters: { center: [16, 22], radius: [15, 7] },
    contains: (x, y) => ((x - 16) ** 2 / 15 ** 2) + ((y - 22) ** 2 / 7 ** 2) <= 1
  },
  {
    id: 'curved', morphology: 'curved',
    recipe: 'Fixed-width ribbon around a shallow quadratic arch on the 32-grid.',
    parameters: { xRange: [2, 30], centerX: 16, centerY: 27, curveCoefficient: 0.075, halfWidth: 5.5 },
    contains: (x, y) => x >= 2 && x <= 30
      && Math.abs(y - (27 - 0.075 * (x - 16) ** 2)) <= 5.5
  },
  {
    id: 'y-branch', morphology: 'Y-branch',
    recipe: 'Union of three Euclidean capsules sharing one junction on the 32-grid.',
    parameters: { junction: [16, 19], endpoints: [[4, 5], [28, 5], [16, 29]], radius: 3 },
    contains: (x, y) => [[4, 5], [28, 5], [16, 29]].some(([endX, endY]) =>
      distanceToSegment(x, y, 16, 19, endX, endY) <= 3)
  },
  {
    id: 'loop-like', morphology: 'loop-like',
    recipe: 'Closed circular annulus on the 32-grid.',
    parameters: { center: [16, 18.5], innerRadius: 6, outerRadius: 11.5 },
    contains: (x, y) => {
      const radius = Math.hypot(x - 16, y - 18.5);
      return radius >= 6 && radius <= 11.5;
    }
  },
  {
    id: 'concave-irregular-broad', morphology: 'concave / irregular broad',
    recipe: 'Broad elliptical horseshoe with an open top notch and offset inner cavity on the 32-grid.',
    parameters: {
      outerCenter: [16, 19], outerRadius: [15.25, 12],
      innerCenter: [16, 17], innerRadius: [9.5, 7.8],
      openNotch: { x: [10, 22], yMax: 17 }
    },
    contains: (x, y) => {
      const outer = ((x - 16) ** 2 / 15.25 ** 2) + ((y - 19) ** 2 / 12 ** 2) <= 1;
      const inner = ((x - 16) ** 2 / 9.5 ** 2) + ((y - 17) ** 2 / 7.8 ** 2) < 1;
      const openNotch = y <= 17 && x >= 10 && x <= 22;
      return outer && !inner && !openNotch;
    }
  }
];
assert.equal(shapeDefinitions.length, 6, 'the synthetic geometry set must contain exactly six fixtures');

function distanceToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function expandSolverMask(solverMask) {
  const mask = new Uint8Array(sourceGrid * sourceGrid);
  for (let solverY = 0; solverY < solverGrid; solverY += 1) {
    for (let solverX = 0; solverX < solverGrid; solverX += 1) {
      if (!solverMask[solverY * solverGrid + solverX]) continue;
      for (let offsetY = 0; offsetY < cellsPerSolverCell; offsetY += 1) {
        for (let offsetX = 0; offsetX < cellsPerSolverCell; offsetX += 1) {
          const x = solverX * cellsPerSolverCell + offsetX;
          const y = solverY * cellsPerSolverCell + offsetY;
          mask[y * sourceGrid + x] = 1;
        }
      }
    }
  }
  return mask;
}

function assertConnected(mask, width, height, label) {
  const start = mask.findIndex(value => value === 1);
  assert.notEqual(start, -1, label + ': empty mask');
  const seen = new Uint8Array(mask.length), queue = [start];
  seen[start] = 1;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const cell = queue[cursor], x = cell % width, y = Math.floor(cell / width);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const next = ny * width + nx;
      if (mask[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
    }
  }
  assert.equal(queue.length, mask.reduce((sum, value) => sum + value, 0), label + ': mask is not 4-neighbor connected');
}

function maskRows(mask) {
  return Array.from({ length: sourceGrid }, (_, y) =>
    Array.from(mask.subarray(y * sourceGrid, (y + 1) * sourceGrid), value => value ? '1' : '0').join(''));
}

function boundingBox(mask, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width, y = Math.floor(index / width);
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export async function buildShapeRoster() {
  const frozenBytes = await readFile(frozenInputsPath);
  assert.equal(sha256(frozenBytes), frozenInputsSha256, 'frozen observed-material source changed');
  const frozen = JSON.parse(gunzipSync(frozenBytes));
  const material = frozen.materials?.median;
  assert.deepEqual(Object.keys(material || {}).sort(), ['damping', 'density', 'stiffness']);

  const shapes = shapeDefinitions.map(definition => {
    const solverMask = new Uint8Array(solverGrid * solverGrid);
    for (let y = 0; y < solverGrid; y += 1)
      for (let x = 0; x < solverGrid; x += 1)
        solverMask[y * solverGrid + x] = definition.contains(x, y) ? 1 : 0;
    assertConnected(solverMask, solverGrid, solverGrid, definition.id + ' solver mask');
    const mask = expandSolverMask(solverMask);
    assertConnected(mask, sourceGrid, sourceGrid, definition.id + ' source mask');
    for (const anchor of Object.values(commonAnchors)) {
      assert.equal(mask[anchor.y * sourceGrid + anchor.x], 1, definition.id + ' misses common anchor');
    }

    const pickups = [commonAnchors.leftPickup, commonAnchors.rightPickup].map(({ x, y }) => ({ x: x / 95, y: y / 95 }));
    const plate = { id: definition.id, grid: { width: sourceGrid, height: sourceGrid },
      mask, edges: [], pickups, material };
    const topology = compileSurfaceTopology({ plates: [plate], nodules: [], generation: 0 });
    assert.equal(topology.layerIds.length, 1);
    assert.equal(topology.adjacentLinkNodes.length, 0);
    assert.equal(topology.noduleIds.length, 0);
    const pickupNodeIndices = Array.from(topology.pickupNodeIndices);
    const pickupSolverCells = pickupNodeIndices.map(node => topology.nodeGridIndices[node]);
    assert.equal(pickupNodeIndices.length, 2);
    assert.ok(pickupNodeIndices.every(node => node < topology.nodeGridIndices.length));
    assert.deepEqual(pickupSolverCells, [909, 915], definition.id + ' compiled pickup coordinates differ from the common anchors');
    const contactCell = commonAnchors.contact.y * sourceGrid + commonAnchors.contact.x;
    const routeLayer = topology.routingTopLayerByCell96[contactCell];
    assert.equal(routeLayer, 0, definition.id + ' common contact anchor is not routed to the Plate');
    const topologyBytes = Buffer.from(JSON.stringify(topology, (_key, value) =>
      ArrayBuffer.isView(value) ? Array.from(value) : value));
    const occupiedCells = mask.reduce((sum, value) => sum + value, 0);
    const compiledNodes = topology.nodeGridIndices.length;
    assert.equal(occupiedCells, compiledNodes * cellsPerSolverCell ** 2,
      definition.id + ' 3x3 source-tile expansion differs from compiled occupancy');
    return {
      id: definition.id,
      morphology: definition.morphology,
      geometryRecipe: { description: definition.recipe, parameters: definition.parameters },
      sourceGrid: { width: sourceGrid, height: sourceGrid, occupiedCells, boundingBox: boundingBox(mask, sourceGrid, sourceGrid) },
      solverGrid: { width: solverGrid, height: solverGrid, occupiedNodes: compiledNodes,
        boundingBox: boundingBox(solverMask, solverGrid, solverGrid) },
      pickupNodeIndices,
      pickupSolverCells,
      contactRoute: { sourceGridCell: [commonAnchors.contact.x, commonAnchors.contact.y],
        sourceCellIndex: contactCell, routedLayerIndex: routeLayer, routedPlateId: topology.layerIds[routeLayer] },
      material: { ...material },
      maskSha256: sha256(Buffer.from(mask)),
      topologySha256: sha256(topologyBytes),
      maskRows: maskRows(mask)
    };
  });

  const sortedAreas = shapes.map(shape => shape.sourceGrid.occupiedCells).sort((a, b) => a - b);
  const sortedNodes = shapes.map(shape => shape.solverGrid.occupiedNodes).sort((a, b) => a - b);
  const median = values => values.length % 2
    ? values[(values.length - 1) / 2]
    : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
  for (const shape of shapes) {
    shape.sourceGrid.areaResidualFromMedianCells = shape.sourceGrid.occupiedCells - median(sortedAreas);
    shape.solverGrid.nodeResidualFromMedian = shape.solverGrid.occupiedNodes - median(sortedNodes);
  }
  return {
    schemaVersion: 1,
    evidenceId: '2026-10-18-synthetic-plate-shape-capability',
    preparation: { command: 'node scripts/ant-synthetic-plate-shape-roster.js',
      frozenBeforeAudioRendering: true, maskEncoding: '96 row-major strings of 96 binary cells per shape',
      connectivity: '4-neighbor; source-grid and compiled solver-grid masks',
      expansionRule: 'Each selected 32-grid solver cell expands to a full 3x3 tile in the 96-grid; no custom graph edges.' },
    sourceMaterial: { path: frozenInputsPath, bytes: frozenBytes.length, sha256: frozenInputsSha256,
      selection: 'materials.median from the existing 2026-10-13 sonic-individuality controls',
      value: material },
    commonAnchors: { coordinateConvention: 'exact integer [x,y] cells in the row-major 96x96 source grid',
      contact: commonAnchors.contact, leftPickup: commonAnchors.leftPickup, rightPickup: commonAnchors.rightPickup },
    controlledEvent,
    comparison: { sourceGridOccupiedCellsMedian: median(sortedAreas), sourceGridOccupiedCellsRange:
        [Math.min(...sortedAreas), Math.max(...sortedAreas)],
      solverNodeCountMedian: median(sortedNodes), solverNodeCountRange: [Math.min(...sortedNodes), Math.max(...sortedNodes)],
      residualsRecordedWithoutAcceptanceThreshold: true },
    exclusions: { base: false, z: false, nodules: false, stratigraphy: false, naturalSimulation: false, customGraphEdges: false },
    shapes
  };
}

const roster = await buildShapeRoster();
const output = evidence + '/shape-roster.json';
const serialized = JSON.stringify(roster, null, 2) + '\n';
await mkdir(evidence, { recursive: true });
if (process.argv.includes('--check')) {
  const existing = JSON.parse(await readFile(output, 'utf8'));
  assert.deepEqual(existing, roster, 'shape-roster.json differs from deterministic geometry regeneration');
  console.log(JSON.stringify({ checked: true, shapeCount: roster.shapes.length,
    maskHashes: roster.shapes.map(shape => shape.maskSha256) }, null, 2));
} else {
  await writeFile(output, serialized, 'utf8');
  console.log(JSON.stringify({ path: output, bytes: Buffer.byteLength(serialized),
    shapeCount: roster.shapes.length, maskHashes: roster.shapes.map(shape => shape.maskSha256) }, null, 2));
}
