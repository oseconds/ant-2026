export const MATERIAL_STRATIGRAPHY_GRID_SIZE = 96;
export const MATERIAL_STRATIGRAPHY_MAX_PLATES = 256;
export const MATERIAL_STRATIGRAPHY_MAX_NODULES = 32;
export const MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION = Object.freeze({
  minimumOverlappingPlates: 4,
  minimumBuriedLayers: 3,
  minimumCompaction: 0.55,
  minimumLocalFootLoad: 200,
  persistenceMs: 30000,
  radiusRange: Object.freeze([0.018, 0.028]),
  minimumSampleIntervalMs: 1000,
  maximumGapForPersistenceMs: 2000
});

const DEFAULT_COORDINATE_SCALE_METERS = 1;
const NODULE_LOCAL_RADIUS = MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION.radiusRange[1];
const MATERIAL_RANGES = Object.freeze({ density: [1800, 2200], youngModulus: [0.3e6, 1.2e6],
  poisson: [0.25, 0.35], damping: [0.2, 0.6] });

/**
 * Immutable plate history with a derived bottom-to-top per-cell material stack.
 * Ant movement and pheromone systems are intentionally outside this model.
 */
export class MaterialStratigraphy {
  constructor({ width = MATERIAL_STRATIGRAPHY_GRID_SIZE,
    height = MATERIAL_STRATIGRAPHY_GRID_SIZE,
    maxPlates = MATERIAL_STRATIGRAPHY_MAX_PLATES,
    maxNodules = MATERIAL_STRATIGRAPHY_MAX_NODULES,
    coordinateScaleMeters = DEFAULT_COORDINATE_SCALE_METERS } = {}) {
    this.width = integerInRange(width, 2, 512, 'width');
    this.height = integerInRange(height, 2, 512, 'height');
    this.maxPlates = integerInRange(maxPlates, 1, MATERIAL_STRATIGRAPHY_MAX_PLATES, 'maxPlates');
    this.maxNodules = integerInRange(maxNodules, 0, MATERIAL_STRATIGRAPHY_MAX_NODULES, 'maxNodules');
    this.coordinateScaleMeters = positiveFinite(coordinateScaleMeters, 'coordinateScaleMeters');
    this.cellCount = this.width * this.height;
    this.reset();
  }

  /** Add one frozen plate descriptor in historical order; false means a safety limit was reached. */
  addPlate(descriptor) {
    const frozen = freezePlateDescriptor(descriptor, this.width, this.height);
    if (this.plateById.has(frozen.id)) throw new TypeError(`A plate with id "${frozen.id}" already exists.`);
    if (this.plates.length >= this.maxPlates) return false;

    const plateIndex = this.plates.length;
    this.plates.push(frozen);
    this.plateById.set(frozen.id, frozen);
    this.plateIndexById.set(frozen.id, plateIndex);
    this.plateThicknessMeters.push(plateThicknessMeters(frozen));
    for (let cell = 0; cell < this.cellCount; cell += 1) {
      if (frozen.mask[cell] !== 1) continue;
      const column = this.columns[cell] || (this.columns[cell] = []);
      column.push(plateIndex);
      this.candidateSinceMs[cell] = -1;
    }
    this.revision += 1;
    this._rebuildTopology();
    this._refreshPlateHistory();
    this._refreshPublicLists();
    return frozen;
  }

  /** Count only actual, in-domain individual FOOT_CONTACT positions. */
  applyFootContact(event, surface) {
    void surface; // Compaction is read on qualification; contact events contribute load only.
    if (event?.type !== 'FOOT_CONTACT' || !Array.isArray(event.contacts)) {
      this.rejectedFootContacts += 1;
      return 0;
    }
    let accepted = 0;
    for (const contact of event.contacts) {
      const point = contact?.position;
      if (typeof contact?.legId !== 'string' || !contact.legId || !isFinitePoint(point)
        || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
        this.rejectedFootContacts += 1;
        continue;
      }
      const index = this._cellIndex(point.x, point.y);
      if (this.footLoadByCell[index] < 0xffffffff) this.footLoadByCell[index] += 1;
      this.totalAcceptedFootContacts += 1;
      accepted += 1;
    }
    return accepted;
  }

  /**
   * Advance nodule qualification on simulation time. Returns only newly born
   * nodule descriptors. A real plate foundation, compaction and individual foot
   * load are all required before persistence can begin.
   */
  advance({ surface, simulationTimeMs } = {}) {
    if (!Number.isFinite(simulationTimeMs) || simulationTimeMs < 0
      || (this.lastAdvanceTimeMs !== null && simulationTimeMs < this.lastAdvanceTimeMs)) return [];
    if (this.lastAdvanceTimeMs !== null
      && simulationTimeMs - this.lastNoduleEvaluationTimeMs
        < MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION.minimumSampleIntervalMs) {
      this.lastAdvanceTimeMs = simulationTimeMs;
      return [];
    }
    if (this.lastAdvanceTimeMs !== null
      && simulationTimeMs - this.lastAdvanceTimeMs
        > MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION.maximumGapForPersistenceMs) {
      this.candidateSinceMs.fill(-1);
    }
    this.lastAdvanceTimeMs = simulationTimeMs;
    this.lastNoduleEvaluationTimeMs = simulationTimeMs;
    this.simulationTimeMs = simulationTimeMs;
    this._refreshPlateHistory();

    if (typeof surface?.sample !== 'function' || !this.plates.length
      || this.maxNodules === 0 || this.nodules.length >= this.maxNodules) {
      this.candidateSinceMs.fill(-1);
      this.qualifiedNoduleCandidateCount = 0;
      return [];
    }

    const born = [];
    this.qualifiedNoduleCandidateCount = 0;
    for (let cell = 0; cell < this.cellCount; cell += 1) {
      const column = this.columns[cell];
      const hasFoundation = column?.length >= MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION.minimumOverlappingPlates
        && column.length - 1 >= MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION.minimumBuriedLayers;
      const x = (cell % this.width) / (this.width - 1);
      const y = Math.floor(cell / this.width) / (this.height - 1);
      const compaction = hasFoundation ? finiteSurfaceSample(surface, x, y) : 0;
      const localFootLoad = hasFoundation ? this._localFootLoad(x, y, NODULE_LOCAL_RADIUS) : 0;
      const qualified = hasFoundation
        && compaction >= MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION.minimumCompaction
        && localFootLoad >= MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION.minimumLocalFootLoad;

      if (!qualified) {
        this.candidateSinceMs[cell] = -1;
        continue;
      }
      this.qualifiedNoduleCandidateCount += 1;
      if (this.candidateSinceMs[cell] < 0) this.candidateSinceMs[cell] = simulationTimeMs;
      if (simulationTimeMs - this.candidateSinceMs[cell]
        < MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION.persistenceMs) continue;
      if (this._nearExistingNodule(x, y, MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION.radiusRange[1])) {
        this.candidateSinceMs[cell] = -1;
        continue;
      }
      const nodule = this._createNodule(cell, column, simulationTimeMs, compaction, localFootLoad);
      this.nodules.push(nodule);
      this.noduleByCell.set(cell, nodule);
      this.noduleRevision += 1;
      this.revision += 1;
      this.candidateSinceMs[cell] = -1;
      born.push(nodule);
      this._layerStats = Object.freeze({ ...this._layerStats, noduleCount: this.nodules.length });
      if (this.nodules.length >= this.maxNodules) break;
    }
    if (born.length) this._refreshPublicLists();
    return born;
  }

  getPlates() { return this._frozenPlateList; }
  getNodules() { return this._frozenNoduleList; }

  /** Resolve the nearest in-domain cell's current exposed material. */
  getTopPlateAt(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
    const index = this.topLayerByCell[this._cellIndex(x, y)];
    if (index < 0) return null;
    const descriptor = this.plates[index];
    return { id: descriptor.id, descriptor };
  }

  getFootLoadAt(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return 0;
    return this.footLoadByCell[this._cellIndex(x, y)];
  }

  getDepthAt(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return 0;
    return this.totalDepthByCellMeters[this._cellIndex(x, y)];
  }

  /** Detailed bottom-to-top column is intended for infrequent diagnostics. */
  getColumnAt(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return [];
    const column = this.columns[this._cellIndex(x, y)] || [];
    return column.map((plateIndex, index) => {
      const descriptor = this.plates[plateIndex];
      const above = column.slice(index + 1);
      const buriedDepthMeters = above.reduce((sum, aboveIndex) => sum + this.plateThicknessMeters[aboveIndex], 0);
      return Object.freeze({
        id: descriptor.id,
        descriptor,
        ageMs: Math.max(0, this.simulationTimeMs - descriptor.bornAtSimulationTimeMs),
        thicknessMeters: this.plateThicknessMeters[plateIndex],
        buriedLayerCount: above.length,
        buriedDepthMeters
      });
    });
  }

  /** Cheap frame snapshot: cached typed arrays and frozen records are reused until revisions change. */
  getSnapshot() {
    return {
      width: this.width,
      height: this.height,
      version: 1,
      revision: this.revision,
      noduleRevision: this.noduleRevision,
      coordinateScaleMetersPerUnit: this.coordinateScaleMeters,
      plates: this._frozenPlateList,
      nodules: this._frozenNoduleList,
      layers: this._layerStats,
      stratigraphy: {
        version: 1,
        revision: this.revision,
        layerOrder: this._layerOrder,
        topLayerByCell: this.topLayerByCell,
        layerCountByCell: this.layerCountByCell,
        totalDepthByCellMeters: this.totalDepthByCellMeters,
        plateHistory: this._plateHistory
      },
      diagnostics: {
        totalAcceptedFootContacts: this.totalAcceptedFootContacts,
        rejectedFootContacts: this.rejectedFootContacts,
        qualifiedNoduleCandidateCount: this.qualifiedNoduleCandidateCount,
        maxPlatesReached: this.plates.length >= this.maxPlates,
        maxNodulesReached: this.nodules.length >= this.maxNodules
      }
    };
  }

  /** Infrequent material sync view; arrays still use the stable insertion-order plate indices. */
  getAudioState() {
    return this.getSnapshot();
  }

  reset() {
    this.plates = [];
    this.plateById = new Map();
    this.plateIndexById = new Map();
    this.plateThicknessMeters = [];
    this.columns = new Array(this.cellCount).fill(null);
    this.topLayerByCell = new Int32Array(this.cellCount);
    this.topLayerByCell.fill(-1);
    this.layerCountByCell = new Uint16Array(this.cellCount);
    this.totalDepthByCellMeters = new Float32Array(this.cellCount);
    this.footLoadByCell = new Uint32Array(this.cellCount);
    this.candidateSinceMs = new Float64Array(this.cellCount);
    this.candidateSinceMs.fill(-1);
    this.nodules = [];
    this.noduleByCell = new Map();
    this.revision = 0;
    this.noduleRevision = 0;
    this.simulationTimeMs = 0;
    this.lastAdvanceTimeMs = null;
    this.lastNoduleEvaluationTimeMs = null;
    this.totalAcceptedFootContacts = 0;
    this.rejectedFootContacts = 0;
    this.qualifiedNoduleCandidateCount = 0;
    this._refreshPublicLists();
    this._rebuildTopology();
    this._refreshPlateHistory();
    return this.getSnapshot();
  }

  _createNodule(cell, column, simulationTimeMs, compaction, localFootLoad) {
    const x = (cell % this.width) / (this.width - 1);
    const y = Math.floor(cell / this.width) / (this.height - 1);
    const sourcePlateIDs = column.map(index => this.plates[index].id);
    const foundationIndex = column[0];
    const foundation = this.plates[foundationIndex];
    const foundationThicknessAbove = column.slice(1)
      .reduce((sum, index) => sum + this.plateThicknessMeters[index], 0);
    const ageMs = Math.max(0, simulationTimeMs - foundation.bornAtSimulationTimeMs);
    const layerCount = column.length;
    const consolidation = clamp01(compaction * 0.65
      + Math.min(layerCount / 8, 1) * 0.2
      + Math.min(localFootLoad / 600, 1) * 0.15);
    const material = Object.freeze({
      density: lerp(MATERIAL_RANGES.density[0], MATERIAL_RANGES.density[1], consolidation),
      youngModulus: lerp(MATERIAL_RANGES.youngModulus[0], MATERIAL_RANGES.youngModulus[1], consolidation),
      poisson: lerp(MATERIAL_RANGES.poisson[0], MATERIAL_RANGES.poisson[1], consolidation),
      damping: lerp(MATERIAL_RANGES.damping[1], MATERIAL_RANGES.damping[0], consolidation)
    });
    const radiusMix = clamp01(0.5 * consolidation + 0.25 * Math.min(layerCount / 8, 1)
      + 0.25 * Math.min(localFootLoad / 600, 1));
    const radius = lerp(MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION.radiusRange[0],
      MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION.radiusRange[1], radiusMix);
    const foundationStiffness = finiteOr(foundation.material?.stiffness, 0.9);
    const couplingWeight = clamp(0.12 + 0.18 * (foundationStiffness - 0.65) / 0.5, 0.12, 0.30);
    const position = Object.freeze({ x, y });
    const burial = Object.freeze({
      layerCount,
      buriedLayerCount: layerCount - 1,
      buriedDepthMeters: foundationThicknessAbove,
      ageMs,
      foundationPlateId: foundation.id
    });
    const coupling = Object.freeze({
      type: 'buried-foundation',
      plateId: foundation.id,
      weight: couplingWeight,
      position,
      depthMeters: foundationThicknessAbove
    });
    return deepFreeze({
      id: `buried-sphere-${this.nodules.length + 1}`,
      version: 1,
      modalCount: 12,
      coupledPlateId: foundation.id,
      bornAtSimulationTimeMs: simulationTimeMs,
      position,
      radius,
      physicalRadiusMeters: radius * this.coordinateScaleMeters,
      material,
      sourcePlateIDs,
      burial,
      support: { compaction, localFootLoad },
      coupling
    });
  }

  _localFootLoad(x, y, radius) {
    const xRadius = Math.ceil(radius * (this.width - 1));
    const yRadius = Math.ceil(radius * (this.height - 1));
    const centerX = Math.round(x * (this.width - 1));
    const centerY = Math.round(y * (this.height - 1));
    let load = 0;
    for (let row = Math.max(0, centerY - yRadius); row <= Math.min(this.height - 1, centerY + yRadius); row += 1) {
      for (let column = Math.max(0, centerX - xRadius); column <= Math.min(this.width - 1, centerX + xRadius); column += 1) {
        const dx = column / (this.width - 1) - x;
        const dy = row / (this.height - 1) - y;
        if (Math.hypot(dx, dy) <= radius) load += this.footLoadByCell[row * this.width + column];
      }
    }
    return load;
  }

  _nearExistingNodule(x, y, radius) {
    return this.nodules.some(nodule => Math.hypot(nodule.position.x - x, nodule.position.y - y)
      < (nodule.radius + radius));
  }

  _cellIndex(x, y) {
    const column = Math.max(0, Math.min(this.width - 1, Math.round(x * (this.width - 1))));
    const row = Math.max(0, Math.min(this.height - 1, Math.round(y * (this.height - 1))));
    return row * this.width + column;
  }

  _rebuildTopology() {
    const topLayerByCell = new Int32Array(this.cellCount);
    topLayerByCell.fill(-1);
    const layerCountByCell = new Uint16Array(this.cellCount);
    const totalDepthByCellMeters = new Float32Array(this.cellCount);
    const perPlate = this.plates.map(() => ({ exposedCellCount: 0, buriedCellCount: 0,
      maxBurialLayerCount: 0, maxBurialDepthMeters: 0 }));
    let exposedCellCount = 0, buriedLayerCellCount = 0, maxColumnLayerCount = 0;
    for (let cell = 0; cell < this.cellCount; cell += 1) {
      const column = this.columns[cell];
      if (!column?.length) continue;
      const count = column.length;
      const top = column[count - 1];
      topLayerByCell[cell] = top;
      layerCountByCell[cell] = Math.min(0xffff, count);
      exposedCellCount += 1;
      maxColumnLayerCount = Math.max(maxColumnLayerCount, count);
      let depthAboveMeters = 0;
      for (let index = count - 1; index >= 0; index -= 1) {
        const plateIndex = column[index];
        const buried = count - index - 1;
        const stats = perPlate[plateIndex];
        if (buried === 0) stats.exposedCellCount += 1;
        else { stats.buriedCellCount += 1; stats.maxBurialLayerCount = Math.max(stats.maxBurialLayerCount, buried); }
        stats.maxBurialDepthMeters = Math.max(stats.maxBurialDepthMeters, depthAboveMeters);
        if (index > 0) totalDepthByCellMeters[cell] += this.plateThicknessMeters[plateIndex];
        depthAboveMeters += this.plateThicknessMeters[plateIndex];
      }
      if (count > 1) buriedLayerCellCount += count - 1;
    }
    this.topLayerByCell = topLayerByCell;
    this.layerCountByCell = layerCountByCell;
    this.totalDepthByCellMeters = totalDepthByCellMeters;
    this._layerOrder = Object.freeze(this.plates.map(plate => plate.id));
    this._layerStats = Object.freeze({
      plateCount: this.plates.length,
      exposedCellCount,
      buriedLayerCellCount,
      maxColumnLayerCount,
      noduleCount: this.nodules.length
    });
    this._plateTopologyStats = perPlate;
  }

  _refreshPlateHistory() {
    this._plateHistory = Object.freeze(this.plates.map((plate, index) => Object.freeze({
      id: plate.id,
      bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs,
      ageMs: Math.max(0, this.simulationTimeMs - plate.bornAtSimulationTimeMs),
      thicknessMeters: this.plateThicknessMeters[index],
      exposedCellCount: this._plateTopologyStats[index]?.exposedCellCount || 0,
      buriedCellCount: this._plateTopologyStats[index]?.buriedCellCount || 0,
      maxBurialLayerCount: this._plateTopologyStats[index]?.maxBurialLayerCount || 0,
      maxBurialDepthMeters: this._plateTopologyStats[index]?.maxBurialDepthMeters || 0
    })));
  }

  _refreshPublicLists() {
    this._frozenPlateList = Object.freeze(this.plates.slice());
    this._frozenNoduleList = Object.freeze(this.nodules.slice());
  }
}

export default MaterialStratigraphy;

function freezePlateDescriptor(descriptor, width, height) {
  if (!descriptor || typeof descriptor.id !== 'string' || !descriptor.id.trim()) {
    throw new TypeError('A plate descriptor requires a non-empty id.');
  }
  if (!Number.isFinite(descriptor.bornAtSimulationTimeMs) || descriptor.bornAtSimulationTimeMs < 0) {
    throw new TypeError('A plate descriptor requires a non-negative finite birth time.');
  }
  if (descriptor.grid?.width !== width || descriptor.grid?.height !== height
    || !Array.isArray(descriptor.mask) || descriptor.mask.length !== width * height
    || descriptor.mask.some(value => value !== 0 && value !== 1)) {
    throw new TypeError(`A plate mask must be a ${width}×${height} binary grid.`);
  }
  return deepFreeze(clonePlain(descriptor));
}

function plateThicknessMeters(descriptor) {
  const explicit = descriptor.thicknessMeters;
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const halfWidth = finiteOr(descriptor.meanHalfWidth, 0.02);
  return clamp(0.001 + 0.05 * halfWidth, 0.001, 0.01);
}

function finiteSurfaceSample(surface, x, y) {
  try {
    const sample = surface.sample(x, y);
    return Number.isFinite(sample) ? clamp01(sample) : 0;
  } catch { return 0; }
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (value && typeof value === 'object') {
    const copy = {};
    for (const [key, item] of Object.entries(value)) copy[key] = clonePlain(item);
    return copy;
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isFinitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}
function integerInRange(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name} must be an integer from ${min} to ${max}.`);
  return value;
}
function positiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive.`);
  return value;
}
function finiteOr(value, fallback) { return Number.isFinite(value) ? value : fallback; }
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function clamp01(value) { return clamp(value, 0, 1); }
function lerp(a, b, t) { return a + (b - a) * clamp01(t); }
