export const SURFACE_TOPOLOGY_VERSION = 1;
export const SURFACE_SOURCE_GRID = 96;
export const SURFACE_SOLVER_GRID = 32;
export const SURFACE_MAX_LAYERS = 256;
export const SURFACE_MAX_NODULES = 32;
export const SURFACE_SOLVER_RATE_HZ = 6000;
export const SURFACE_BENDING_BASELINE = 0.012;
export const SURFACE_TENSION_BASELINE = 0.0002;
export const SURFACE_DAMPING_BASELINE = 0.000009;
export const SURFACE_DAMPING_GAIN = 0.000018;
export const SURFACE_ADJACENT_COUPLING = 0.000025;
export const NO_NODE = 0xffffffff;

const SOURCE_CELLS = SURFACE_SOURCE_GRID ** 2;
const SOLVER_CELLS = SURFACE_SOLVER_GRID ** 2;
const NEIGHBOR_OFFSETS = Object.freeze([[-1, 0], [1, 0], [0, -1], [0, 1]]);

/**
 * Compile frozen trail plates and compact stratigraphy into a transfer-ready,
 * allocation-free solver topology. Dynamic vibration state remains the
 * worklet's responsibility. Plate order is bottom-to-top.
 */
export function compileSurfaceTopology({ plates = [], nodules = [], stratigraphy = null,
  generation = 0, maxLayers = SURFACE_MAX_LAYERS, zCouplingEnabled = true } = {}) {
  if (!Array.isArray(plates)) throw new TypeError('Surface topology plates must be an array.');
  if (!Array.isArray(nodules)) throw new TypeError('Surface topology nodules must be an array.');
  if (!Number.isSafeInteger(generation) || generation < 0) throw new RangeError('Topology generation must be a non-negative safe integer.');
  if (!Number.isSafeInteger(maxLayers) || maxLayers < 1 || maxLayers > SURFACE_MAX_LAYERS) {
    throw new RangeError(`Topology maxLayers must be between 1 and ${SURFACE_MAX_LAYERS}.`);
  }
  if (typeof zCouplingEnabled !== 'boolean') throw new TypeError('zCouplingEnabled must be a boolean.');

  const orderedPlates = orderPlates(plates, stratigraphy);
  if (orderedPlates.length > maxLayers) throw new RangeError(`Surface topology exceeds its ${maxLayers}-layer ceiling.`);
  if (nodules.length > SURFACE_MAX_NODULES) throw new RangeError(`Surface topology exceeds its ${SURFACE_MAX_NODULES}-nodule ceiling.`);
  const ids = orderedPlates.map((plate) => plate.id);
  const layerById = new Map(ids.map((id, index) => [id, index]));
  const layers = orderedPlates.map((plate) => compileLayer(plate));
  const nodeOffsets = new Int32Array(layers.length + 1);
  for (let layer = 0; layer < layers.length; layer += 1) {
    const next = nodeOffsets[layer] + layers[layer].gridIndices.length;
    if (next > 0x7fffffff) throw new RangeError('Packed node index exceeds signed 32-bit capacity.');
    nodeOffsets[layer + 1] = next;
  }

  const totalNodes = nodeOffsets[layers.length];
  const nodeGridIndices = new Uint16Array(totalNodes);
  const neighborIndices = new Int32Array(totalNodes * 4).fill(-1);
  const pickupNodeIndices = new Uint32Array(layers.length * 2).fill(NO_NODE);
  const materialCoefficients = new Float32Array(layers.length * 4);
  const layerCellNodes = new Array(SOLVER_CELLS);
  for (let cell = 0; cell < SOLVER_CELLS; cell += 1) layerCellNodes[cell] = [];

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const layer = layers[layerIndex];
    const base = nodeOffsets[layerIndex];
    for (let localNode = 0; localNode < layer.gridIndices.length; localNode += 1) {
      const cell = layer.gridIndices[localNode];
      const globalNode = base + localNode;
      nodeGridIndices[globalNode] = cell;
      layerCellNodes[cell].push({ layerIndex, localNode, globalNode });
      const row = Math.floor(cell / SURFACE_SOLVER_GRID);
      const column = cell % SURFACE_SOLVER_GRID;
      for (let direction = 0; direction < 4; direction += 1) {
        const [dx, dy] = NEIGHBOR_OFFSETS[direction];
        const x = column + dx, y = row + dy;
        if (x < 0 || x >= SURFACE_SOLVER_GRID || y < 0 || y >= SURFACE_SOLVER_GRID) continue;
        const neighborLocal = layer.indexByGrid[y * SURFACE_SOLVER_GRID + x];
        if (neighborLocal >= 0) neighborIndices[globalNode * 4 + direction] = base + neighborLocal;
      }
    }
    pickupNodeIndices[layerIndex * 2] = base + layer.pickups[0];
    pickupNodeIndices[layerIndex * 2 + 1] = base + layer.pickups[1];
    materialCoefficients.set(layer.coefficients, layerIndex * 4);
  }

  const { columnOffsets, columnLayerIndices, columnNodeIndices } = packColumns(layerCellNodes);
  const sourceColumns = compileSourceColumns(orderedPlates, stratigraphy);
  const { adjacentLinkOffsets, adjacentLinkNodes, adjacentLinkCoefficients } = zCouplingEnabled
    ? packAdjacentLinks(sourceColumns, layers, nodeOffsets)
    : { adjacentLinkOffsets: new Int32Array(SOLVER_CELLS + 1), adjacentLinkNodes: new Uint32Array(0), adjacentLinkCoefficients: new Float32Array(0) };
  const noduleData = compileNodules(nodules, layers, layerById, nodeOffsets, sourceColumns);

  return Object.freeze({
    version: SURFACE_TOPOLOGY_VERSION,
    generation,
    revision: stratigraphy?.revision ?? 0,
    sourceGrid: SURFACE_SOURCE_GRID,
    solverGrid: SURFACE_SOLVER_GRID,
    solverRateHz: SURFACE_SOLVER_RATE_HZ,
    maxLayers,
    maxNodules: SURFACE_MAX_NODULES,
    layerIds: Object.freeze(ids),
    nodeOffsets,
    nodeGridIndices,
    neighborIndices,
    pickupNodeIndices,
    materialCoefficients,
    routingTopLayerByCell96: sourceColumns.topLayerByCell96,
    sourceColumnOffsets: sourceColumns.offsets,
    sourceColumnLayerIndices: sourceColumns.layerIndices,
    sourceLayerCountByCell96: sourceColumns.layerCountByCell96,
    columnOffsets,
    columnLayerIndices,
    columnNodeIndices,
    adjacentLinkOffsets,
    adjacentLinkNodes,
    adjacentLinkCoefficients,
    ...noduleData
  });
}

function orderPlates(plates, stratigraphy) {
  const byId = new Map();
  for (const plate of plates) {
    if (!plate || typeof plate.id !== 'string' || !plate.id.length || byId.has(plate.id)) {
      throw new TypeError('Every Plate must have a unique non-empty id.');
    }
    validatePlate(plate);
    byId.set(plate.id, plate);
  }
  const order = stratigraphy?.layerOrder;
  if (order === undefined) return plates.slice();
  if (!Array.isArray(order) || order.length !== plates.length) {
    throw new TypeError('Stratigraphy layerOrder must list every Plate exactly once.');
  }
  const ordered = order.map((id) => {
    const plate = byId.get(id);
    if (!plate) throw new TypeError(`Stratigraphy references unknown Plate ${String(id)}.`);
    byId.delete(id);
    return plate;
  });
  if (byId.size) throw new TypeError('Stratigraphy layerOrder contains duplicate Plate IDs.');
  return ordered;
}

function validatePlate(plate) {
  if (plate.grid?.width !== SURFACE_SOURCE_GRID || plate.grid?.height !== SURFACE_SOURCE_GRID
    || !(Array.isArray(plate.mask) || ArrayBuffer.isView(plate.mask))
    || plate.mask.length !== SOURCE_CELLS || plate.pickups?.length !== 2
    || !plate.material || !finite(plate.material.stiffness) || !finite(plate.material.density)
    || !finite(plate.material.damping)) throw new TypeError(`Plate ${plate.id} has an invalid frozen descriptor.`);
  let occupied = false;
  for (const value of plate.mask) {
    if (value !== 0 && value !== 1) throw new TypeError(`Plate ${plate.id} mask must contain only 0 or 1.`);
    occupied ||= value === 1;
  }
  if (!occupied) throw new TypeError(`Plate ${plate.id} mask is empty.`);
  for (const pickup of plate.pickups) {
    if (!validPoint(pickup) || !plate.mask[sourceIndex(pickup.x, pickup.y)]) {
      throw new TypeError(`Plate ${plate.id} has a pickup outside its frozen mask.`);
    }
  }
  const { stiffness, density, damping } = plate.material;
  if (stiffness < 0.65 || stiffness > 1.15 || density < 1 || density > 1.2 || damping < 0.25 || damping > 0.45) {
    throw new RangeError(`Plate ${plate.id} material is outside the compiled physical range.`);
  }
}

function compileLayer(plate) {
  const mask = new Uint8Array(SOLVER_CELLS);
  for (let source = 0; source < SOURCE_CELLS; source += 1) {
    if (!plate.mask[source]) continue;
    const x = source % SURFACE_SOURCE_GRID, y = Math.floor(source / SURFACE_SOURCE_GRID);
    const coarseX = Math.floor(x * SURFACE_SOLVER_GRID / SURFACE_SOURCE_GRID);
    const coarseY = Math.floor(y * SURFACE_SOLVER_GRID / SURFACE_SOURCE_GRID);
    mask[coarseY * SURFACE_SOLVER_GRID + coarseX] = 1;
  }
  for (const edge of plate.edges ?? []) {
    if (!Array.isArray(edge) || edge.length !== 2 || !edge.every((index) => Number.isInteger(index)
      && index >= 0 && index < SOURCE_CELLS)) throw new TypeError(`Plate ${plate.id} contains an invalid graph edge.`);
    const [from, to] = edge;
    const x0 = Math.floor((from % SURFACE_SOURCE_GRID) * SURFACE_SOLVER_GRID / SURFACE_SOURCE_GRID);
    const y0 = Math.floor(Math.floor(from / SURFACE_SOURCE_GRID) * SURFACE_SOLVER_GRID / SURFACE_SOURCE_GRID);
    const x1 = Math.floor((to % SURFACE_SOURCE_GRID) * SURFACE_SOLVER_GRID / SURFACE_SOURCE_GRID);
    const y1 = Math.floor(Math.floor(to / SURFACE_SOURCE_GRID) * SURFACE_SOLVER_GRID / SURFACE_SOURCE_GRID);
    if (Math.abs(x1 - x0) === 1 && Math.abs(y1 - y0) === 1) mask[y0 * SURFACE_SOLVER_GRID + x1] = 1;
  }
  const indexByGrid = new Int32Array(SOLVER_CELLS).fill(-1);
  const gridIndices = [];
  for (let cell = 0; cell < SOLVER_CELLS; cell += 1) {
    if (mask[cell]) { indexByGrid[cell] = gridIndices.length; gridIndices.push(cell); }
  }
  if (!gridIndices.length) throw new TypeError(`Plate ${plate.id} disappears on the solver grid.`);
  const material = plate.material;
  const stiffness = clamp(material.stiffness, 0.65, 1.15);
  const density = clamp(material.density, 1, 1.2);
  const damping = clamp(material.damping, 0.25, 0.45);
  const coefficients = [SURFACE_BENDING_BASELINE * stiffness / density,
    SURFACE_TENSION_BASELINE, density,
    SURFACE_DAMPING_BASELINE + SURFACE_DAMPING_GAIN * damping];
  const pickups = plate.pickups.map((point) => nearestNode(indexByGrid, point));
  return { id: plate.id, indexByGrid, gridIndices, pickups, coefficients };
}

function nearestNode(indexByGrid, point) {
  const x = Math.round(point.x * (SURFACE_SOLVER_GRID - 1));
  const y = Math.round(point.y * (SURFACE_SOLVER_GRID - 1));
  const cell = y * SURFACE_SOLVER_GRID + x;
  if (indexByGrid[cell] >= 0) return indexByGrid[cell];
  for (let radius = 1; radius < SURFACE_SOLVER_GRID; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= SURFACE_SOLVER_GRID || ny < 0 || ny >= SURFACE_SOLVER_GRID) continue;
        const node = indexByGrid[ny * SURFACE_SOLVER_GRID + nx];
        if (node >= 0) return node;
      }
    }
  }
  return -1;
}

function packColumns(cellNodes) {
  const columnOffsets = new Int32Array(SOLVER_CELLS + 1);
  let count = 0;
  for (let cell = 0; cell < SOLVER_CELLS; cell += 1) {
    count += cellNodes[cell].length;
    columnOffsets[cell + 1] = count;
  }
  const columnLayerIndices = new Uint16Array(count);
  const columnNodeIndices = new Uint32Array(count);
  let cursor = 0;
  for (const column of cellNodes) {
    for (const entry of column) {
      columnLayerIndices[cursor] = entry.layerIndex;
      columnNodeIndices[cursor] = entry.globalNode;
      cursor += 1;
    }
  }
  return { columnOffsets, columnLayerIndices, columnNodeIndices };
}

function compileSourceColumns(plates, stratigraphy) {
  const offsets = new Int32Array(SOURCE_CELLS + 1);
  const topLayerByCell96 = new Int16Array(SOURCE_CELLS).fill(-1);
  const layerCountByCell96 = new Uint16Array(SOURCE_CELLS);
  let totalEntries = 0;
  for (let cell = 0; cell < SOURCE_CELLS; cell += 1) {
    for (let layer = 0; layer < plates.length; layer += 1) {
      if (plates[layer].mask[cell]) {
        topLayerByCell96[cell] = layer;
        layerCountByCell96[cell] += 1;
      }
    }
    totalEntries += layerCountByCell96[cell];
    offsets[cell + 1] = totalEntries;
  }
  const layerIndices = new Uint16Array(totalEntries);
  let cursor = 0;
  for (let cell = 0; cell < SOURCE_CELLS; cell += 1) {
    for (let layer = 0; layer < plates.length; layer += 1) {
      if (plates[layer].mask[cell]) layerIndices[cursor++] = layer;
    }
  }
  const declaredTop = stratigraphy?.topLayerByCell ?? stratigraphy?.exposure?.topPlateIndices;
  if (declaredTop !== undefined) {
    if (!(Array.isArray(declaredTop) || ArrayBuffer.isView(declaredTop)) || declaredTop.length !== SOURCE_CELLS) {
      throw new TypeError('Stratigraphy topLayerByCell must be a 96x96 row-major lookup.');
    }
    for (let cell = 0; cell < SOURCE_CELLS; cell += 1) {
      const value = declaredTop[cell];
      if (!Number.isInteger(value) || value < -1 || value >= plates.length || value !== topLayerByCell96[cell]) {
        throw new TypeError(`Stratigraphy exposure lookup disagrees with frozen masks at cell ${cell}.`);
      }
    }
  }
  const declaredCount = stratigraphy?.layerCountByCell ?? stratigraphy?.exposure?.layerCountByCell;
  if (declaredCount !== undefined) {
    if (!(Array.isArray(declaredCount) || ArrayBuffer.isView(declaredCount)) || declaredCount.length !== SOURCE_CELLS) {
      throw new TypeError('Stratigraphy layerCountByCell must be a 96x96 row-major lookup.');
    }
    for (let cell = 0; cell < SOURCE_CELLS; cell += 1) {
      if (declaredCount[cell] !== layerCountByCell96[cell]) {
        throw new TypeError(`Stratigraphy layer count disagrees with frozen masks at cell ${cell}.`);
      }
    }
  }
  return { offsets, layerIndices, topLayerByCell96, layerCountByCell96 };
}

function packAdjacentLinks(sourceColumns, layers, nodeOffsets) {
  const linksByCell = Array.from({ length: SOLVER_CELLS }, () => new Map());
  for (let sourceCell = 0; sourceCell < SOURCE_CELLS; sourceCell += 1) {
    const sourceX = sourceCell % SURFACE_SOURCE_GRID;
    const sourceY = Math.floor(sourceCell / SURFACE_SOURCE_GRID);
    const solverCell = Math.floor(sourceY * SURFACE_SOLVER_GRID / SURFACE_SOURCE_GRID) * SURFACE_SOLVER_GRID
      + Math.floor(sourceX * SURFACE_SOLVER_GRID / SURFACE_SOURCE_GRID);
    const start = sourceColumns.offsets[sourceCell];
    const end = sourceColumns.offsets[sourceCell + 1];
    for (let entry = start + 1; entry < end; entry += 1) {
      const lowerLayer = sourceColumns.layerIndices[entry - 1];
      const upperLayer = sourceColumns.layerIndices[entry];
      const lowerLocalNode = layers[lowerLayer].indexByGrid[solverCell];
      const upperLocalNode = layers[upperLayer].indexByGrid[solverCell];
      if (lowerLocalNode < 0 || upperLocalNode < 0) continue;
      const lowerNode = nodeOffsets[lowerLayer] + lowerLocalNode;
      const upperNode = nodeOffsets[upperLayer] + upperLocalNode;
      const key = `${lowerNode}:${upperNode}`;
      linksByCell[solverCell].set(key, (linksByCell[solverCell].get(key) || 0) + 1);
    }
  }
  const adjacentLinkOffsets = new Int32Array(SOLVER_CELLS + 1);
  let linkCount = 0;
  for (let cell = 0; cell < SOLVER_CELLS; cell += 1) {
    linkCount += linksByCell[cell].size;
    adjacentLinkOffsets[cell + 1] = linkCount;
  }
  const adjacentLinkNodes = new Uint32Array(linkCount * 2);
  const adjacentLinkCoefficients = new Float32Array(linkCount);
  let cursor = 0;
  for (const links of linksByCell) {
    const sorted = [...links].sort(([left], [right]) => compareNumericLinkKeys(left, right));
    for (const [key, representedSourceCells] of sorted) {
      const [lowerNode, upperNode] = key.split(':').map(Number);
      adjacentLinkNodes[cursor * 2] = lowerNode;
      adjacentLinkNodes[cursor * 2 + 1] = upperNode;
      adjacentLinkCoefficients[cursor] = SURFACE_ADJACENT_COUPLING * representedSourceCells / 9;
      cursor += 1;
    }
  }
  return { adjacentLinkOffsets, adjacentLinkNodes, adjacentLinkCoefficients };
}

function compareNumericLinkKeys(left, right) {
  const [a0, a1] = left.split(':').map(Number), [b0, b1] = right.split(':').map(Number);
  return a0 - b0 || a1 - b1;
}

function compileNodules(nodules, layers, layerById, nodeOffsets, sourceColumns) {
  const ids = new Set();
  const noduleIds = [];
  const noduleFoundationLayerIndices = new Int16Array(nodules.length).fill(-1);
  const noduleCouplingNodeIndices = new Uint32Array(nodules.length).fill(NO_NODE);
  const nodulePositionsXY = new Float32Array(nodules.length * 2);
  const nodulePhysicalRadiiMeters = new Float32Array(nodules.length);
  const noduleMaterials = new Float32Array(nodules.length * 3);
  const noduleCouplingWeights = new Float32Array(nodules.length);
  const frozenNodules = [];

  for (let index = 0; index < nodules.length; index += 1) {
    const nodule = nodules[index];
    if (!nodule || typeof nodule.id !== 'string' || !nodule.id || ids.has(nodule.id)) {
      throw new TypeError('Every nodule must have a unique non-empty id.');
    }
    ids.add(nodule.id);
    const position = nodule.position;
    if (!validPoint(position)) throw new TypeError(`Nodule ${nodule.id} has an invalid position.`);
    const radius = nodule.physicalRadiusMeters ?? nodule.radius;
    const { density, youngModulus, poisson } = nodule.material ?? {};
    if (!finite(radius) || radius <= 0 || !finite(density) || density <= 0
      || !finite(youngModulus) || youngModulus <= 0 || !finite(poisson) || poisson <= -1 || poisson >= 0.5) {
      throw new TypeError(`Nodule ${nodule.id} has invalid physical material or radius data.`);
    }
    const weight = nodule.coupling?.weight ?? 0;
    if (!finite(weight) || weight < 0 || weight > 1) throw new RangeError(`Nodule ${nodule.id} coupling weight must be within [0, 1].`);
    noduleIds.push(nodule.id);
    nodulePositionsXY[index * 2] = position.x;
    nodulePositionsXY[index * 2 + 1] = position.y;
    nodulePhysicalRadiiMeters[index] = radius;
    noduleMaterials[index * 3] = density;
    noduleMaterials[index * 3 + 1] = youngModulus;
    noduleMaterials[index * 3 + 2] = poisson;
    noduleCouplingWeights[index] = weight;
    const linkedLayer = findNoduleFoundation(nodule, layers, layerById, nodeOffsets, sourceColumns);
    if (linkedLayer) {
      noduleFoundationLayerIndices[index] = linkedLayer.layerIndex;
      noduleCouplingNodeIndices[index] = nodeOffsets[linkedLayer.layerIndex] + linkedLayer.localNode;
    }
    frozenNodules.push(deepFreeze(clonePlain(nodule)));
  }
  return {
    noduleIds: Object.freeze(noduleIds),
    nodules: Object.freeze(frozenNodules),
    noduleFoundationLayerIndices,
    noduleCouplingNodeIndices,
    nodulePositionsXY,
    nodulePhysicalRadiiMeters,
    noduleMaterials,
    noduleCouplingWeights
  };
}

function findNoduleFoundation(nodule, layers, layerById, nodeOffsets, sourceColumns) {
  const targetId = nodule.coupling?.plateId ?? nodule.burying?.foundationPlateId ?? nodule.sourcePlateIDs?.[0];
  const layerIndex = layerById.get(targetId);
  if (!Number.isInteger(layerIndex) || !layers[layerIndex]) return null;
  const position = nodule.coupling?.position ?? nodule.position;
  if (!validPoint(position)) return null;
  const sourceCell = sourceIndex(position.x, position.y);
  const sourceStart = sourceColumns.offsets[sourceCell], sourceEnd = sourceColumns.offsets[sourceCell + 1];
  if (sourceStart >= sourceEnd || sourceColumns.layerIndices[sourceStart] !== layerIndex) return null;
  const solverX = Math.floor((sourceCell % SURFACE_SOURCE_GRID) * SURFACE_SOLVER_GRID / SURFACE_SOURCE_GRID);
  const solverY = Math.floor(Math.floor(sourceCell / SURFACE_SOURCE_GRID) * SURFACE_SOLVER_GRID / SURFACE_SOURCE_GRID);
  const localNode = layers[layerIndex].indexByGrid[solverY * SURFACE_SOLVER_GRID + solverX];
  if (localNode < 0) return null;
  return { layerIndex, localNode, globalNode: nodeOffsets[layerIndex] + localNode };
}

function sourceIndex(x, y) {
  const column = Math.max(0, Math.min(SURFACE_SOURCE_GRID - 1, Math.round(x * (SURFACE_SOURCE_GRID - 1))));
  const row = Math.max(0, Math.min(SURFACE_SOURCE_GRID - 1, Math.round(y * (SURFACE_SOURCE_GRID - 1))));
  return row * SURFACE_SOURCE_GRID + column;
}

function validPoint(point) {
  return point && finite(point.x) && finite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (value && typeof value === 'object') {
    if (ArrayBuffer.isView(value)) return Array.from(value, clonePlain);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clonePlain(item)]));
  }
  return value;
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export default compileSurfaceTopology;
