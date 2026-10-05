const SURFACE_GRID = 32;
const SOURCE_GRID = 96;
const MAX_PLATES = 12;
const PICKUP_MIX = 1 / Math.sqrt(MAX_PLATES);
const MAX_ROUTE_COUPLING = 0.000025;
const PHYSICS_RATE = 6000;
const EPSILON = 1e-12;

/**
 * A fixed-grid, masked finite-difference bending plate for each frozen ANT
 * corridor. The layers remain independent except for equal-and-opposite
 * springs where their masks overlap. This is a simplified linear model, not
 * an implementation of the cited physical-model paper.
 */
class SurfacePlateProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    this.layers = new Map();
    this.layerList = [];
    this.maxPlates = Math.min(MAX_PLATES, Math.max(1, options.processorOptions?.maxPlates || MAX_PLATES));
    this.destroyed = false;
    this.telemetry = {
      births: 0, strikes: 0, dropped: 0, nonFinite: 0, clipped: 0,
      cpuMaxMs: null, maxOutputAbs: 0
    };
    this.decimation = Math.max(1, Math.round(sampleRate / PHYSICS_RATE));
    this.physicsRate = sampleRate / this.decimation;
    this.lastOutputL = 0;
    this.lastOutputR = 0;
    this.overlapCoupling = [];
    this.timingAvailable = typeof performance !== 'undefined' && typeof performance.now === 'function';
    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  handleMessage(message) {
    if (!message || typeof message.type !== 'string') return;
    const payload = message.payload || {};
    if (message.type === 'birth') {
      const plate = payload.plate;
      if (!validPlate(plate) || (!this.layers.has(plate.id) && this.layers.size >= this.maxPlates)) {
        this.telemetry.dropped += 1;
        return;
      }
      if (!this.layers.has(plate.id)) {
        this.layers.set(plate.id, makeLayer(plate, this.physicsRate));
        this.telemetry.births += 1;
        this.rebuildCouplings();
      }
    } else if (message.type === 'strike') {
      const layer = this.layers.get(payload.plateId);
      if (!layer || !validPoint(payload.position) || !finite(payload.strength) || payload.strength <= 0) {
        this.telemetry.dropped += 1;
        return;
      }
      if (!applyStrike(layer, payload)) this.telemetry.dropped += 1;
      else this.telemetry.strikes += 1;
    } else if (message.type === 'stop') {
      for (const layer of this.layers.values()) clearVibration(layer);
      this.lastOutputL = 0;
      this.lastOutputR = 0;
    } else if (message.type === 'diagnostics') {
      this.port.postMessage({ type: 'diagnostics', payload: {
        ...this.telemetry, layers: this.layers.size, physicsRate: this.physicsRate,
        timingAvailable: this.timingAvailable, overlapCoupling: this.overlapCoupling.map((item) => ({ ...item }))
      } });
    } else if (message.type === 'destroy') {
      this.destroyed = true;
      for (const layer of this.layers.values()) clearVibration(layer);
      this.layers.clear();
      this.layerList = [];
      this.couplingGroups = [];
    }
  }

  rebuildCouplings() {
    const layers = [...this.layers.values()];
    this.layerList = layers;
    const groups = [];
    const overlapCounts = new Map();
    for (let gridIndex = 0; gridIndex < SURFACE_GRID * SURFACE_GRID; gridIndex += 1) {
      const entries = [];
      for (const layer of layers) {
        const node = layer.indexByGrid[gridIndex];
        if (node >= 0) entries.push({ layer, node });
      }
      if (entries.length > 1) {
        groups.push({ entries, coefficient: layers[0].couplingCoefficient });
        for (let i = 0; i < entries.length; i += 1) {
          for (let j = i + 1; j < entries.length; j += 1) {
            const left = entries[i].layer.id, right = entries[j].layer.id;
            const key = `${left}\u0000${right}`;
            overlapCounts.set(key, (overlapCounts.get(key) || 0) + 1);
          }
        }
      }
    }
    this.couplingGroups = groups;
    this.overlapCoupling = [...overlapCounts].map(([key, overlapCells]) => {
      const [left, right] = key.split('\u0000');
      return { plateIds: [left, right], overlapCells, gridSize: SURFACE_GRID, coefficient: layers[0].couplingCoefficient };
    });
  }

  process(_inputs, outputs) {
    const started = typeof performance !== 'undefined' ? performance.now() : 0;
    const channels = outputs[0] || [];
    const left = channels[0], right = channels[1];
    if (!left || !right) return true;
    left.fill(0);
    right.fill(0);
    if (this.destroyed || !this.layers.size) return true;

    const layers = this.layerList;
    const factor = this.decimation;
    for (let frame = 0; frame < left.length; frame += factor) {
      for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) prepareLaplacian(layers[layerIndex]);
      if (this.couplingGroups?.length) applyCouplings(this.couplingGroups);
      let outL = 0, outR = 0;
      for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
        const layer = layers[layerIndex];
        advanceLayer(layer, this.telemetry);
        outL += readPickup(layer, 0);
        outR += readPickup(layer, 1);
      }
      outL *= PICKUP_MIX;
      outR *= PICKUP_MIX;
      if (!Number.isFinite(outL) || !Number.isFinite(outR)) {
        this.telemetry.nonFinite += 1;
        outL = 0;
        outR = 0;
        for (const layer of layers) clearVibration(layer);
      }
      this.telemetry.maxOutputAbs = Math.max(this.telemetry.maxOutputAbs, Math.abs(outL), Math.abs(outR));
      if (Math.abs(outL) > 1 || Math.abs(outR) > 1) this.telemetry.clipped += 1;
      outL /= 1 + Math.abs(outL);
      outR /= 1 + Math.abs(outR);
      for (let offset = 0; offset < factor && frame + offset < left.length; offset += 1) {
        const amount = (offset + 1) / factor;
        left[frame + offset] = this.lastOutputL + (outL - this.lastOutputL) * amount;
        right[frame + offset] = this.lastOutputR + (outR - this.lastOutputR) * amount;
      }
      this.lastOutputL = outL;
      this.lastOutputR = outR;
    }
    if (this.timingAvailable && started) this.telemetry.cpuMaxMs = Math.max(this.telemetry.cpuMaxMs ?? 0, performance.now() - started);
    return true;
  }
}

function makeLayer(plate, rate) {
  const width = SURFACE_GRID, height = SURFACE_GRID, count = width * height;
  const mask = new Uint8Array(count);
  for (let sy = 0; sy < SOURCE_GRID; sy += 1) {
    const row = sy * SOURCE_GRID;
    const gy = Math.floor(sy * height / SOURCE_GRID);
    for (let sx = 0; sx < SOURCE_GRID; sx += 1) {
      if (!plate.mask[row + sx]) continue;
      const gx = Math.floor(sx * width / SOURCE_GRID);
      mask[gy * width + gx] = 1;
    }
  }
  // Keep coarse rasterization connected wherever the authoritative 96-grid graph has an edge.
  for (const edge of plate.edges || []) {
    if (!Array.isArray(edge) || edge.length !== 2 || !Number.isInteger(edge[0]) || !Number.isInteger(edge[1])) continue;
    const ax = edge[0] % SOURCE_GRID, ay = Math.floor(edge[0] / SOURCE_GRID);
    const bx = edge[1] % SOURCE_GRID, by = Math.floor(edge[1] / SOURCE_GRID);
    const x0 = Math.floor(ax * width / SOURCE_GRID), y0 = Math.floor(ay * height / SOURCE_GRID);
    const x1 = Math.floor(bx * width / SOURCE_GRID), y1 = Math.floor(by * height / SOURCE_GRID);
    if (Math.abs(x1 - x0) === 1 && Math.abs(y1 - y0) === 1) {
      const bridge = y0 * width + x1;
      if (!mask[bridge]) mask[bridge] = 1;
    }
  }

  const indexByGrid = new Int32Array(count).fill(-1), gridIndices = [];
  for (let index = 0; index < count; index += 1) {
    if (!mask[index]) continue;
    indexByGrid[index] = gridIndices.length;
    gridIndices.push(index);
  }
  const n = gridIndices.length;
  const neighbors = new Int32Array(n * 4).fill(-1);
  for (let node = 0; node < n; node += 1) {
    const gridIndex = gridIndices[node], x = gridIndex % width, y = Math.floor(gridIndex / width);
    let neighborIndex = node * 4;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const neighbor = indexByGrid[ny * width + nx];
      if (neighbor >= 0) neighbors[neighborIndex] = neighbor;
      neighborIndex += 1;
    }
  }

  const stiffness = clamp(plate.material.stiffness, 0.65, 1.15);
  const density = clamp(plate.material.density, 1, 1.2);
  const damping = clamp(plate.material.damping, 0.25, 0.45);
  const rateScale = (PHYSICS_RATE / rate) ** 2;
  const bending = 0.012 * stiffness / density * rateScale;
  const tension = 0.0002 * rateScale;
  const coupling = MAX_ROUTE_COUPLING * rateScale;
  const couplingRow = coupling * (MAX_PLATES - 1) / density;
  // Dirichlet four-neighbor graph Laplacian has lambda_max <= 8; this leaves a wide CFL margin.
  if (64 * bending + 8 * tension + 2 * couplingRow >= 3.25) throw new Error('Unstable surface plate coefficients.');
  return {
    id: plate.id, width, indexByGrid, gridIndices, neighbors,
    current: new Float32Array(n), previous: new Float32Array(n), next: new Float32Array(n),
    laplacian: new Float32Array(n), biharmonic: new Float32Array(n), coupling: new Float32Array(n),
    pickups: plate.pickups.map((point) => nearestActive(indexByGrid, point)),
    bending, tension, density, couplingCoefficient: coupling,
    damping: (0.000009 + damping * 0.000018) * PHYSICS_RATE / rate
  };
}

function prepareLaplacian(layer) {
  const { current, laplacian, neighbors } = layer;
  const count = current.length;
  for (let i = 0; i < current.length; i += 1) {
    let value = -4 * current[i];
    const offset = i * 4;
    const n0 = neighbors[offset], n1 = neighbors[offset + 1], n2 = neighbors[offset + 2], n3 = neighbors[offset + 3];
    if (n0 >= 0) value += current[n0];
    if (n1 >= 0) value += current[n1];
    if (n2 >= 0) value += current[n2];
    if (n3 >= 0) value += current[n3];
    laplacian[i] = value;
  }
  const { biharmonic } = layer;
  for (let i = 0; i < current.length; i += 1) {
    let value = -4 * laplacian[i];
    const offset = i * 4;
    const n0 = neighbors[offset], n1 = neighbors[offset + 1], n2 = neighbors[offset + 2], n3 = neighbors[offset + 3];
    if (n0 >= 0) value += laplacian[n0];
    if (n1 >= 0) value += laplacian[n1];
    if (n2 >= 0) value += laplacian[n2];
    if (n3 >= 0) value += laplacian[n3];
    biharmonic[i] = value;
  }
}

function applyCouplings(groups) {
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    let sum = 0;
    const entries = group.entries;
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      const entry = entries[entryIndex];
      sum += entry.layer.current[entry.node];
    }
    const participantCount = entries.length;
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      const entry = entries[entryIndex];
      const layer = entry.layer, node = entry.node;
      layer.coupling[node] += group.coefficient
        * (sum - participantCount * layer.current[node]) / layer.density;
    }
  }
}

function advanceLayer(layer, telemetry) {
  const { current, previous, next, laplacian, biharmonic, bending, tension, damping, density, coupling } = layer;
  for (let i = 0; i < current.length; i += 1) {
    const velocity = current[i] - previous[i];
    next[i] = 2 * current[i] - previous[i]
      + tension * laplacian[i] / density
      - bending * biharmonic[i]
      - damping * velocity + coupling[i];
    if (!Number.isFinite(next[i])) {
      telemetry.nonFinite += 1;
      clearVibration(layer);
      return;
    }
  }
  const temp = layer.previous;
  layer.previous = layer.current;
  layer.current = layer.next;
  layer.next = temp;
  layer.next.fill(0);
  layer.coupling.fill(0);
}

function applyStrike(layer, strike) {
  const px = Math.max(0, Math.min(SURFACE_GRID - 1, Math.round(strike.position.x * (SURFACE_GRID - 1))));
  const py = Math.max(0, Math.min(SURFACE_GRID - 1, Math.round(strike.position.y * (SURFACE_GRID - 1))));
  const center = layer.indexByGrid[py * SURFACE_GRID + px];
  if (center < 0) {
    // The contact is inside the 96-grid mask but can fall between coarse samples; choose the nearest active node.
    const nearest = nearestActive(layer.indexByGrid, strike.position);
    if (nearest < 0) return false;
    return applyKernel(layer, nearest, strike);
  }
  return applyKernel(layer, center, strike);
}

function applyKernel(layer, center, strike) {
  const centerGrid = layer.gridIndices[center], cx = centerGrid % SURFACE_GRID, cy = Math.floor(centerGrid / SURFACE_GRID);
  const radius = Math.max(0.35, strike.footprintRadius * (SURFACE_GRID - 1));
  const radiusSq = radius * radius;
  const sigmaSq = Math.max(0.12, radiusSq * 0.35);
  const indices = [], weights = [];
  for (let i = 0; i < layer.gridIndices.length; i += 1) {
    const grid = layer.gridIndices[i], dx = grid % SURFACE_GRID - cx, dy = Math.floor(grid / SURFACE_GRID) - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > Math.max(1, radiusSq * 9)) continue;
    const weight = Math.exp(-0.5 * d2 / sigmaSq);
    indices.push(i); weights.push(weight);
  }
  const norm = Math.sqrt(weights.reduce((sum, weight) => sum + weight * weight, 0));
  if (norm <= EPSILON) return false;
  const impulse = Math.min(0.05, strike.strength);
  for (let i = 0; i < indices.length; i += 1) {
    const delta = impulse * weights[i] / norm / Math.sqrt(layer.density);
    layer.previous[indices[i]] -= delta;
  }
  return true;
}

function readPickup(layer, pickupIndex) {
  const node = layer.pickups[pickupIndex];
  return node < 0 ? 0 : layer.current[node];
}
function nearestActive(indexByGrid, point) {
  const x = Math.round(point.x * (SURFACE_GRID - 1)), y = Math.round(point.y * (SURFACE_GRID - 1));
  const maxRadius = SURFACE_GRID;
  for (let radius = 0; radius < maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      const y1 = y + dy;
      if (y1 < 0 || y1 >= SURFACE_GRID) continue;
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x1 = x + dx;
        if (x1 < 0 || x1 >= SURFACE_GRID) continue;
        const node = indexByGrid[y1 * SURFACE_GRID + x1];
        if (node >= 0) return node;
      }
    }
  }
  return -1;
}
function clearVibration(layer) {
  layer.current.fill(0); layer.previous.fill(0); layer.next.fill(0);
  layer.coupling.fill(0);
}
function validPlate(plate) {
  if (!plate || typeof plate.id !== 'string' || !plate.id
    || plate.grid?.width !== SOURCE_GRID || plate.grid?.height !== SOURCE_GRID
    || !plate.mask || plate.mask.length !== SOURCE_GRID * SOURCE_GRID || plate.pickups?.length !== 2
    || !plate.material || !finite(plate.material.stiffness) || plate.material.stiffness < 0.65 || plate.material.stiffness > 1.15
    || !finite(plate.material.density) || plate.material.density < 1 || plate.material.density > 1.2
    || !finite(plate.material.damping) || plate.material.damping < 0.25 || plate.material.damping > 0.45
    || !plate.pickups.every(validPoint) || !Array.isArray(plate.edges || [])) return false;
  let occupied = false;
  for (let index = 0; index < plate.mask.length; index += 1) {
    const value = plate.mask[index];
    if (value !== 0 && value !== 1) return false;
    if (value === 1) occupied = true;
  }
  if (!occupied || !plate.pickups.every((point) => plate.mask[
    Math.round(point.y * (SOURCE_GRID - 1)) * SOURCE_GRID + Math.round(point.x * (SOURCE_GRID - 1))
  ] === 1)) return false;
  return (plate.edges || []).every((edge) => Array.isArray(edge) && edge.length === 2
    && edge.every((index) => Number.isInteger(index) && index >= 0 && index < SOURCE_GRID ** 2));
}
function validPoint(point) { return point && finite(point.x) && finite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1; }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

registerProcessor('surface-plate-processor', SurfacePlateProcessor);
