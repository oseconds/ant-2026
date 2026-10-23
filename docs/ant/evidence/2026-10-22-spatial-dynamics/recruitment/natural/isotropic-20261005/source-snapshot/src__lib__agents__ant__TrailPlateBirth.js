export const TRAIL_PLATE_GRID_SIZE = 96;
export const TRAIL_PLATE_SOURCE_ORIGIN = Object.freeze({ x: 0.5, y: 0.72 });
export const TRAIL_PLATE_SOURCE_RADII = Object.freeze([0.055, 0.115]);
export const TRAIL_PLATE_TARGET_EDGE_DISTANCE = 0.05;
export const TRAIL_PLATE_CHEMICAL_THRESHOLD = 0.30;
export const TRAIL_PLATE_CHEMICAL_HALF_SATURATION = 0.04;
export const TRAIL_PLATE_SUPPORT_THRESHOLD = 0.015;
export const TRAIL_PLATE_SUPPORT_RADIUS = 0.025;
export const TRAIL_PLATE_PERSISTENCE_SECONDS = 20;
export const TRAIL_PLATE_CHEMICAL_TAU_SECONDS = 20;
export const TRAIL_PLATE_SIMILARITY_THRESHOLD = 0.6;
export const TRAIL_PLATE_SAME_CORRIDOR_REFRACTORY_MS = 90000;
export const TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS = 30;
export const TRAIL_PLATE_GLOBAL_BIRTH_GAP_MS = 10000;
// Transport/storage safety ceiling, not a trail qualification or material rule.
// Older descriptors are never evicted; reaching this ceiling is reported.
export const TRAIL_PLATE_MAX_BIRTHS = 256;
export const TRAIL_PLATE_MIN_GEODESIC_LENGTH = 0.30;
export const TRAIL_PLATE_HALF_WIDTH_RANGE = Object.freeze([0.012, 0.030]);

const TAU = Math.PI * 2;
const CELL_COUNT = TRAIL_PLATE_GRID_SIZE ** 2;
const SUPPORT_SAMPLE_RADIUS = TRAIL_PLATE_SUPPORT_RADIUS;
const BIRTH_EPSILON = 1e-9;
const SQRT_TWO = Math.SQRT2;

/** Builds immutable, physically supported plate networks from persistent ANT routes. */
export class TrailPlateBirth {
  constructor({ maxBirths = TRAIL_PLATE_MAX_BIRTHS } = {}) {
    this.maxBirths = clampInteger(maxBirths, 1, TRAIL_PLATE_MAX_BIRTHS, TRAIL_PLATE_MAX_BIRTHS);
    this.reset();
  }

  /** Record real FOOT_CONTACT feet for repeat-corridor evidence. */
  observeFootContact(event) {
    if (!event || event.type !== 'FOOT_CONTACT' || !Array.isArray(event.contacts)) return 0;
    let accepted = 0;
    for (const contact of event.contacts) {
      const position = contact?.position;
      if (!validPoint(position) || position.x < 0 || position.x > 1
        || position.y < 0 || position.y > 1) continue;
      const index = gridIndex(position.x, position.y);
      if (this.footContactCounts[index] < 0xffffffff) this.footContactCounts[index] += 1;
      accepted += 1;
    }
    return accepted;
  }

  /** Analyze at one-second simulation intervals; return descriptors born now. */
  advance({ pheromone, surface, simulationTimeMs } = {}) {
    if (!finite(simulationTimeMs) || simulationTimeMs < 0) return [];
    if (this.lastAnalysisTimeMs !== null && simulationTimeMs < this.lastAnalysisTimeMs) return [];
    if (this.lastAnalysisTimeMs !== null
      && simulationTimeMs - this.lastAnalysisTimeMs < 1000 - BIRTH_EPSILON) return [];

    const elapsedSeconds = this.lastAnalysisTimeMs === null
      ? 1 : (simulationTimeMs - this.lastAnalysisTimeMs) / 1000;
    this.lastAnalysisTimeMs = simulationTimeMs;
    this.updateChemicalMemory(pheromone, elapsedSeconds);
    const { mask, supports, diagnostics } = this.buildSupportedMask(surface);
    this.lastInputDiagnostics = diagnostics;
    const candidate = selectCandidate(mask, supports, this.chemicalMemory);
    if (!candidate) {
      this.candidate = null;
      return [];
    }

    const nowCandidate = {
      ...candidate,
      startedAtMs: simulationTimeMs,
      stableSeconds: 0,
      similarity: 0
    };
    const similarity = this.candidate ? corridorSimilarity(this.candidate, candidate) : 0;
    if (this.candidate && similarity >= TRAIL_PLATE_SIMILARITY_THRESHOLD) {
      nowCandidate.startedAtMs = this.candidate.startedAtMs;
      nowCandidate.stableSeconds = Math.max(0, (simulationTimeMs - nowCandidate.startedAtMs) / 1000);
      nowCandidate.similarity = similarity;
    }
    nowCandidate.footContacts = this.countFootContacts(nowCandidate.mask);
    const priorBirth = this.birthRecords.length ? this.findSameCorridorBirth(nowCandidate) : null;
    if (priorBirth) {
      const newContacts = this.countFootContacts(priorBirth.corridorMask) - priorBirth.footContactsAtBirth;
      nowCandidate.repeatDiagnostics = {
        plateId: priorBirth.id,
        newFootContacts: Math.max(0, newContacts),
        refractoryRemainingSeconds: Math.max(0, TRAIL_PLATE_SAME_CORRIDOR_REFRACTORY_MS
          - (simulationTimeMs - priorBirth.bornAtSimulationTimeMs)) / 1000
      };
    } else {
      nowCandidate.repeatDiagnostics = null;
    }
    this.candidate = nowCandidate;

    if (nowCandidate.stableSeconds + BIRTH_EPSILON < TRAIL_PLATE_PERSISTENCE_SECONDS
      || simulationTimeMs - this.lastBirthTimeMs < TRAIL_PLATE_GLOBAL_BIRTH_GAP_MS - BIRTH_EPSILON) return [];

    if (priorBirth) {
      const ageMs = simulationTimeMs - priorBirth.bornAtSimulationTimeMs;
      const newContacts = nowCandidate.repeatDiagnostics.newFootContacts;
      if (ageMs < TRAIL_PLATE_SAME_CORRIDOR_REFRACTORY_MS - BIRTH_EPSILON
        || newContacts < TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS) return [];
    }
    if (this.plates.length >= this.maxBirths) return [];

    const descriptor = freezeDescriptor(this.createDescriptor(nowCandidate, simulationTimeMs));
    const record = {
      id: descriptor.id,
      corridorMask: descriptor.mask,
      principalPath: descriptor.principalPath,
      bornAtSimulationTimeMs: simulationTimeMs,
      footContactsAtBirth: this.countFootContacts(descriptor.mask)
    };
    this.birthRecords.push(record);
    this.plates.push(descriptor);
    this.lastBirthTimeMs = simulationTimeMs;
    return [descriptor];
  }

  getPlates() { return this.plates.slice(); }

  getSnapshot() {
    const nowMs = this.lastAnalysisTimeMs ?? 0;
    const repeatDiagnostics = this.candidate?.repeatDiagnostics || null;
    const globalGapRemainingSeconds = Number.isFinite(this.lastBirthTimeMs)
      ? Math.max(0, TRAIL_PLATE_GLOBAL_BIRTH_GAP_MS - (nowMs - this.lastBirthTimeMs)) / 1000
      : 0;
    const candidate = this.candidate ? {
      source: { ...this.candidate.source },
      target: { ...this.candidate.target },
      geodesicLength: this.candidate.geodesicLength,
      stableSeconds: this.candidate.stableSeconds,
      similarity: this.candidate.similarity,
      footContacts: this.candidate.footContacts,
      meanChemical: this.candidate.meanChemical,
      meanSupport: this.candidate.meanSupport,
      pathPoints: this.candidate.path.map((index) => ({ ...gridPoint(index), index })),
      globalGapRemainingSeconds,
      repeat: repeatDiagnostics ? {
        ...repeatDiagnostics,
        contactsRemaining: Math.max(0, TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS
          - repeatDiagnostics.newFootContacts)
      } : null,
      qualified: this.candidate.stableSeconds + BIRTH_EPSILON >= TRAIL_PLATE_PERSISTENCE_SECONDS,
      birthReady: this.candidate.stableSeconds + BIRTH_EPSILON >= TRAIL_PLATE_PERSISTENCE_SECONDS
        && globalGapRemainingSeconds <= BIRTH_EPSILON
        && (!repeatDiagnostics || (repeatDiagnostics.refractoryRemainingSeconds <= BIRTH_EPSILON
          && repeatDiagnostics.newFootContacts >= TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS))
        && this.plates.length < this.maxBirths
    } : null;
    return {
      plates: this.getPlates(),
      candidate,
      requirements: {
        chemicalThreshold: TRAIL_PLATE_CHEMICAL_THRESHOLD,
        supportThreshold: TRAIL_PLATE_SUPPORT_THRESHOLD,
        persistenceSeconds: TRAIL_PLATE_PERSISTENCE_SECONDS,
        minGeodesicLength: TRAIL_PLATE_MIN_GEODESIC_LENGTH,
        sameCorridorRefractorySeconds: TRAIL_PLATE_SAME_CORRIDOR_REFRACTORY_MS / 1000,
        requiredNewFootContacts: TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS,
        globalBirthGapSeconds: TRAIL_PLATE_GLOBAL_BIRTH_GAP_MS / 1000,
        sourceAnnulus: {
          origin: { ...TRAIL_PLATE_SOURCE_ORIGIN },
          radii: [...TRAIL_PLATE_SOURCE_RADII]
        }
      },
      lastBirthTimeMs: Number.isFinite(this.lastBirthTimeMs) ? this.lastBirthTimeMs : null,
      inputDiagnostics: { ...this.lastInputDiagnostics },
      limitReached: this.plates.length >= this.maxBirths
    };
  }

  reset() {
    this.chemicalMemory = new Float32Array(CELL_COUNT);
    this.footContactCounts = new Uint32Array(CELL_COUNT);
    this.lastAnalysisTimeMs = null;
    this.lastBirthTimeMs = -Infinity;
    this.lastInputDiagnostics = {
      maxChemical: 0,
      maxSupport: 0,
      chemicalQualifiedCells: 0,
      supportedCells: 0
    };
    this.candidate = null;
    this.plates = [];
    this.birthRecords = [];
    return this.getSnapshot();
  }

  updateChemicalMemory(pheromone, elapsedSeconds) {
    const tau = TRAIL_PLATE_CHEMICAL_TAU_SECONDS;
    const alpha = 1 - Math.exp(-Math.max(0, elapsedSeconds) / tau);
    const samplePheromone = createPheromoneSampler(pheromone);
    for (let row = 0; row < TRAIL_PLATE_GRID_SIZE; row += 1) {
      const y = row / (TRAIL_PLATE_GRID_SIZE - 1);
      for (let column = 0; column < TRAIL_PLATE_GRID_SIZE; column += 1) {
        const x = column / (TRAIL_PLATE_GRID_SIZE - 1);
        const index = row * TRAIL_PLATE_GRID_SIZE + column;
        const sampled = samplePheromone(x, y);
        const raw = finite(sampled) ? Math.max(0, sampled) : 0;
        const bounded = raw / (raw + TRAIL_PLATE_CHEMICAL_HALF_SATURATION);
        this.chemicalMemory[index] += (bounded - this.chemicalMemory[index]) * alpha;
      }
    }
  }

  buildSupportedMask(surface) {
    const mask = new Uint8Array(CELL_COUNT);
    const supports = new Float32Array(CELL_COUNT);
    let maxChemical = 0, maxSupport = 0, chemicalQualifiedCells = 0, supportedCells = 0;
    if (typeof surface?.sampleSupport !== 'function') {
      for (const value of this.chemicalMemory) maxChemical = Math.max(maxChemical, value);
      return { mask, supports, diagnostics: {
        maxChemical, maxSupport, chemicalQualifiedCells, supportedCells
      } };
    }
    for (let row = 0; row < TRAIL_PLATE_GRID_SIZE; row += 1) {
      const y = row / (TRAIL_PLATE_GRID_SIZE - 1);
      for (let column = 0; column < TRAIL_PLATE_GRID_SIZE; column += 1) {
        const index = row * TRAIL_PLATE_GRID_SIZE + column;
        const chemical = this.chemicalMemory[index];
        maxChemical = Math.max(maxChemical, chemical);
        if (chemical < TRAIL_PLATE_CHEMICAL_THRESHOLD) continue;
        chemicalQualifiedCells += 1;
        const x = column / (TRAIL_PLATE_GRID_SIZE - 1);
        const support = surface.sampleSupport(x, y, SUPPORT_SAMPLE_RADIUS);
        if (finite(support)) {
          supports[index] = Math.max(0, support);
          maxSupport = Math.max(maxSupport, supports[index]);
          if (support >= TRAIL_PLATE_SUPPORT_THRESHOLD) {
            mask[index] = 1;
            supportedCells += 1;
          }
        }
      }
    }
    return { mask, supports, diagnostics: {
      maxChemical, maxSupport, chemicalQualifiedCells, supportedCells
    } };
  }

  findSameCorridorBirth(candidate) {
    let newestMatch = null;
    for (const record of this.birthRecords) {
      const similarity = Math.max(maskSimilarity(record.corridorMask, candidate.mask),
        pathSimilarity(record.principalPath, candidate.path));
      if (similarity < TRAIL_PLATE_SIMILARITY_THRESHOLD) continue;
      if (!newestMatch || record.bornAtSimulationTimeMs > newestMatch.bornAtSimulationTimeMs) {
        newestMatch = record;
      }
    }
    return newestMatch;
  }

  countFootContacts(mask) {
    let count = 0;
    for (let index = 0; index < CELL_COUNT; index += 1) {
      if (mask[index]) count += this.footContactCounts[index];
    }
    return count;
  }

  createDescriptor(candidate, simulationTimeMs) {
    const corridorMask = candidate.supportedMask;
    const component = candidate.component;
    const skeletonIndices = candidate.skeletonIndices;
    const nodeIndices = [...skeletonIndices].sort((a, b) => a - b);
    const distances = distanceToCorridorEdge(corridorMask);
    const centerline = nodeIndices.map((index) => {
      const position = gridPoint(index);
      const halfWidth = clamp(distances[index] * (1 / (TRAIL_PLATE_GRID_SIZE - 1)),
        TRAIL_PLATE_HALF_WIDTH_RANGE[0], TRAIL_PLATE_HALF_WIDTH_RANGE[1]);
      return { ...position, index, halfWidth };
    });
    const edges = [];
    for (const index of nodeIndices) {
      for (const neighbor of neighbors(index)) {
        if (component[neighbor] && neighbor > index) edges.push([index, neighbor]);
      }
    }
    edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const principalPath = candidate.path.slice();
    const centerlineByCell = new Map(centerline.map(node => [node.index, node]));
    const pathPoints = principalPath.map(index => centerlineByCell.get(index));
    const first = pathPoints[0], last = pathPoints.at(-1);
    const source = candidate.source;
    const target = candidate.target;
    const pickups = [pointOnGridPath(pathPoints, 0.25), pointOnGridPath(pathPoints, 0.75)];
    const meanChemical = candidate.meanChemical;
    const supportNorm = clamp(candidate.meanSupport / 0.08, 0, 1);
    const chemicalNorm = clamp(meanChemical, 0, 1);
    const widths = centerline.map(node => node.halfWidth);
    const mask = candidate.mask;
    return {
      id: 'trail-plate-' + (this.plates.length + 1),
      bornAtSimulationTimeMs: simulationTimeMs,
      grid: { width: TRAIL_PLATE_GRID_SIZE, height: TRAIL_PLATE_GRID_SIZE },
      mask: Array.from(mask),
      centerline,
      edges,
      principalPath,
      widths,
      meanHalfWidth: mean(widths),
      maxHalfWidth: widths.length ? Math.max(...widths) : TRAIL_PLATE_HALF_WIDTH_RANGE[0],
      pickups,
      source: { ...source, x: first.x, y: first.y },
      target: { ...target, x: last.x, y: last.y },
      provenance: {
        sourceAnnulus: { origin: { ...TRAIL_PLATE_SOURCE_ORIGIN }, radii: [...TRAIL_PLATE_SOURCE_RADII] },
        observationBoundaryDistance: TRAIL_PLATE_TARGET_EDGE_DISTANCE,
        stableSeconds: candidate.stableSeconds,
        corridorSimilarity: candidate.similarity,
        geodesicLength: candidate.geodesicLength,
        footContacts: this.countFootContacts(corridorMask)
      },
      metrics: {
        geodesicLength: candidate.geodesicLength,
        meanChemical,
        meanSupport: candidate.meanSupport,
        meanHalfWidth: mean(widths),
        maxHalfWidth: widths.length ? Math.max(...widths) : TRAIL_PLATE_HALF_WIDTH_RANGE[0]
      },
      material: {
        stiffness: clamp(0.65 + chemicalNorm * 0.5, 0.65, 1.15),
        density: clamp(1 + supportNorm * 0.2, 1, 1.2),
        damping: clamp(0.25 + chemicalNorm * 0.2, 0.25, 0.45)
      }
    };
  }
}

function selectCandidate(mask, supports, chemicalMemory) {
  const skeleton = zhangSuen(mask);
  const components = skeletonComponents(skeleton);
  let best = null;
  for (const component of components) {
    const componentSet = new Uint8Array(CELL_COUNT);
    for (const index of component) componentSet[index] = 1;
    const sourceIndices = component.filter(index => {
      const point = gridPoint(index);
      return inSourceAnnulus(point.x, point.y);
    });
    const targetIndices = component.filter(index => nearObservationBoundary(gridPoint(index)));
    if (!sourceIndices.length || !targetIndices.length) continue;

    const sourceSeeds = [sourceIndices.slice().sort((a, b) => {
      const pointA = gridPoint(a), pointB = gridPoint(b);
      const middleRadius = (TRAIL_PLATE_SOURCE_RADII[0] + TRAIL_PLATE_SOURCE_RADII[1]) * 0.5;
      const deltaA = Math.abs(Math.hypot(pointA.x - TRAIL_PLATE_SOURCE_ORIGIN.x,
        pointA.y - TRAIL_PLATE_SOURCE_ORIGIN.y) - middleRadius);
      const deltaB = Math.abs(Math.hypot(pointB.x - TRAIL_PLATE_SOURCE_ORIGIN.x,
        pointB.y - TRAIL_PLATE_SOURCE_ORIGIN.y) - middleRadius);
      return deltaA - deltaB || a - b;
    })[0]];
    const distance = new Float64Array(CELL_COUNT); distance.fill(Infinity);
    const parent = new Int32Array(CELL_COUNT); parent.fill(-2);
    const heap = new MinHeap();
    for (const source of sourceSeeds) {
      distance[source] = 0; parent[source] = -1; heap.push(0, source);
    }
    // Multi-source Dijkstra finds deterministic shortest routes from the annulus.
    while (heap.length) {
      const [currentDistance, current] = heap.pop();
      if (currentDistance !== distance[current]) continue;
      for (const adjacent of neighbors(current)) {
        if (!componentSet[adjacent]) continue;
        const nextDistance = currentDistance + (diagonal(current, adjacent) ? SQRT_TWO : 1);
        if (nextDistance < distance[adjacent] - 1e-12
          || (Math.abs(nextDistance - distance[adjacent]) <= 1e-12
            && (parent[adjacent] < 0 || current < parent[adjacent]))) {
          distance[adjacent] = nextDistance;
          parent[adjacent] = current;
          heap.push(nextDistance, adjacent);
        }
      }
    }
    let target = -1;
    let farthest = -Infinity;
    for (const index of targetIndices.sort((a, b) => a - b)) {
      if (distance[index] > farthest) { target = index; farthest = distance[index]; }
    }
    const geodesicLength = farthest / (TRAIL_PLATE_GRID_SIZE - 1);
    if (target < 0 || geodesicLength < TRAIL_PLATE_MIN_GEODESIC_LENGTH) continue;
    const path = tracePath(target, parent);
    const network = new Uint8Array(CELL_COUNT);
    // Keep only skeleton branches that connect an annular source to an actual
    // distant observation-boundary target. Short exploratory dead-end twigs
    // remain evidence for the field, but do not become modeled plate area.
    for (const endpoint of targetIndices) {
      if (distance[endpoint] / (TRAIL_PLATE_GRID_SIZE - 1) < TRAIL_PLATE_MIN_GEODESIC_LENGTH) continue;
      for (const index of tracePath(endpoint, parent)) network[index] = 1;
    }
    const networkIndices = [];
    for (const index of component) if (network[index]) networkIndices.push(index);
    const networkComponent = new Uint8Array(CELL_COUNT);
    for (const index of networkIndices) networkComponent[index] = 1;
    const source = path[0], sourcePoint = gridPoint(source), targetPoint = gridPoint(target);
    const corridorMask = maskComponent(mask, source);
    const distances = distanceToCorridorEdge(corridorMask);
    const ribbonCenterline = networkIndices.map(index => ({
      ...gridPoint(index), index,
      halfWidth: clamp(distances[index] / (TRAIL_PLATE_GRID_SIZE - 1),
        TRAIL_PLATE_HALF_WIDTH_RANGE[0], TRAIL_PLATE_HALF_WIDTH_RANGE[1])
    }));
    const ribbonMask = rasterizeRibbon(ribbonCenterline);
    let supportTotal = 0, chemicalTotal = 0, supportCells = 0;
    for (let index = 0; index < CELL_COUNT; index += 1) {
      if (corridorMask[index]) {
        supportTotal += supports[index];
        chemicalTotal += chemicalMemory[index];
        supportCells += 1;
      }
    }
    const candidate = {
      mask: ribbonMask,
      supportedMask: corridorMask,
      skeletonIndices: networkIndices,
      component: networkComponent,
      path,
      source: { ...sourcePoint, index: source },
      target: { ...targetPoint, index: target },
      geodesicLength,
      meanSupport: supportCells ? supportTotal / supportCells : 0,
      meanChemical: supportCells ? chemicalTotal / supportCells : 0
    };
    if (!best || candidate.geodesicLength > best.geodesicLength
      || (candidate.geodesicLength === best.geodesicLength && source < best.source.index)) best = candidate;
  }
  return best;
}

function zhangSuen(input) {
  const pixels = input.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let phase = 0; phase < 2; phase += 1) {
      const remove = [];
      for (let row = 1; row < TRAIL_PLATE_GRID_SIZE - 1; row += 1) {
        for (let column = 1; column < TRAIL_PLATE_GRID_SIZE - 1; column += 1) {
          const index = row * TRAIL_PLATE_GRID_SIZE + column;
          if (!pixels[index]) continue;
          const around = neighborValues(pixels, index);
          const count = around.reduce((sum, value) => sum + value, 0);
          if (count < 2 || count > 6 || transitions(around) !== 1) continue;
          const [n, ne, e, se, s, sw, w, nw] = around;
          const keep = phase === 0
            ? n * e * s === 0 && e * s * w === 0
            : n * e * w === 0 && n * s * w === 0;
          if (keep) remove.push(index);
        }
      }
      if (remove.length) {
        changed = true;
        for (const index of remove) pixels[index] = 0;
      }
    }
  }
  return pixels;
}

function skeletonComponents(skeleton) {
  const seen = new Uint8Array(CELL_COUNT), components = [];
  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (!skeleton[index] || seen[index]) continue;
    const component = [], queue = [index]; seen[index] = 1;
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head]; component.push(current);
      for (const adjacent of neighbors(current)) {
        if (skeleton[adjacent] && !seen[adjacent]) { seen[adjacent] = 1; queue.push(adjacent); }
      }
    }
    components.push(component);
  }
  return components;
}

function maskComponent(mask, start) {
  const connected = new Uint8Array(CELL_COUNT);
  if (!mask[start]) return connected;
  connected[start] = 1;
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    for (const adjacent of neighbors(queue[head])) {
      if (mask[adjacent] && !connected[adjacent]) { connected[adjacent] = 1; queue.push(adjacent); }
    }
  }
  return connected;
}
function tracePath(endpoint, parent) {
  const path = [];
  for (let index = endpoint; index >= 0; index = parent[index]) path.push(index);
  path.reverse();
  return path;
}

function distanceToCorridorEdge(mask) {
  const distance = new Float64Array(CELL_COUNT); distance.fill(Infinity);
  const heap = new MinHeap();
  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (!mask[index]) continue;
    const surrounding = neighbors(index);
    if (surrounding.some(adjacent => !mask[adjacent])) {
      distance[index] = 0.5;
      heap.push(0.5, index);
    }
  }
  while (heap.length) {
    const [nextDistance, index] = heap.pop();
    if (nextDistance !== distance[index]) continue;
    for (const adjacent of neighbors(index)) {
      if (!mask[adjacent]) continue;
      const candidate = nextDistance + (diagonal(index, adjacent) ? SQRT_TWO : 1);
      if (candidate < distance[adjacent] - 1e-12) {
        distance[adjacent] = candidate;
        heap.push(candidate, adjacent);
      }
    }
  }
  return distance;
}

function corridorSimilarity(previous, next) {
  const mask = maskSimilarity(previous.mask, next.mask);
  const path = pathSimilarity(previous.path, next.path);
  return Math.max(mask, path);
}
function maskSimilarity(a, b) {
  let intersection = 0, union = 0;
  for (let index = 0; index < CELL_COUNT; index += 1) {
    const left = a[index] ? 1 : 0, right = b[index] ? 1 : 0;
    intersection += left & right;
    union += left | right;
  }
  return union ? intersection / union : 1;
}
function pathSimilarity(a, b) {
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  let overlap = 0;
  for (const index of a) {
    if (bSet.has(index) || neighbors(index).some(adjacent => bSet.has(adjacent))) overlap += 1;
  }
  return overlap / Math.max(a.length, b.length);
}
function pointOnGridPath(path, fraction) {
  if (!path.length) return { x: 0, y: 0 };
  const total = pathLength(path);
  let remaining = total * fraction;
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1], to = path[index];
    const segment = Math.hypot(to.x - from.x, to.y - from.y);
    if (remaining <= segment) return { x: from.x, y: from.y };
    remaining -= segment;
  }
  const last = path.at(-1);
  return { x: last.x, y: last.y };
}
function rasterizeRibbon(centerline) {
  const mask = new Uint8Array(CELL_COUNT);
  for (const node of centerline) {
    const radiusCells = node.halfWidth * (TRAIL_PLATE_GRID_SIZE - 1);
    const centerColumn = node.index % TRAIL_PLATE_GRID_SIZE;
    const centerRow = Math.floor(node.index / TRAIL_PLATE_GRID_SIZE);
    const reach = Math.ceil(radiusCells);
    for (let row = Math.max(0, centerRow - reach); row <= Math.min(TRAIL_PLATE_GRID_SIZE - 1, centerRow + reach); row += 1) {
      for (let column = Math.max(0, centerColumn - reach); column <= Math.min(TRAIL_PLATE_GRID_SIZE - 1, centerColumn + reach); column += 1) {
        if (Math.hypot(column - centerColumn, row - centerRow) <= radiusCells + 1e-9) {
          mask[row * TRAIL_PLATE_GRID_SIZE + column] = 1;
        }
      }
    }
  }
  return mask;
}
function pathLength(path) {
  let distance = 0;
  for (let index = 1; index < path.length; index += 1) {
    distance += Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
  }
  return distance;
}
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function inSourceAnnulus(x, y) {
  const radius = Math.hypot(x - TRAIL_PLATE_SOURCE_ORIGIN.x, y - TRAIL_PLATE_SOURCE_ORIGIN.y);
  return radius >= TRAIL_PLATE_SOURCE_RADII[0] && radius <= TRAIL_PLATE_SOURCE_RADII[1];
}
function nearObservationBoundary(point) {
  return Math.min(point.x, point.y, 1 - point.x, 1 - point.y) <= TRAIL_PLATE_TARGET_EDGE_DISTANCE;
}
function gridPoint(index) {
  return { x: (index % TRAIL_PLATE_GRID_SIZE) / (TRAIL_PLATE_GRID_SIZE - 1),
    y: Math.floor(index / TRAIL_PLATE_GRID_SIZE) / (TRAIL_PLATE_GRID_SIZE - 1) };
}
function gridIndex(x, y) {
  return Math.round(y * (TRAIL_PLATE_GRID_SIZE - 1)) * TRAIL_PLATE_GRID_SIZE
    + Math.round(x * (TRAIL_PLATE_GRID_SIZE - 1));
}
function neighborValues(mask, index) {
  const row = Math.floor(index / TRAIL_PLATE_GRID_SIZE), column = index % TRAIL_PLATE_GRID_SIZE;
  return [
    mask[index - TRAIL_PLATE_GRID_SIZE], mask[index - TRAIL_PLATE_GRID_SIZE + 1],
    mask[index + 1], mask[index + TRAIL_PLATE_GRID_SIZE + 1],
    mask[index + TRAIL_PLATE_GRID_SIZE], mask[index + TRAIL_PLATE_GRID_SIZE - 1],
    mask[index - 1], mask[index - TRAIL_PLATE_GRID_SIZE - 1]
  ].map(value => value || 0);
}
function neighbors(index) {
  const row = Math.floor(index / TRAIL_PLATE_GRID_SIZE), column = index % TRAIL_PLATE_GRID_SIZE;
  const result = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const x = column + dx, y = row + dy;
      if (x >= 0 && x < TRAIL_PLATE_GRID_SIZE && y >= 0 && y < TRAIL_PLATE_GRID_SIZE) {
        result.push(y * TRAIL_PLATE_GRID_SIZE + x);
      }
    }
  }
  return result;
}
function diagonal(a, b) {
  return Math.abs(a % TRAIL_PLATE_GRID_SIZE - b % TRAIL_PLATE_GRID_SIZE) === 1
    && Math.abs(Math.floor(a / TRAIL_PLATE_GRID_SIZE) - Math.floor(b / TRAIL_PLATE_GRID_SIZE)) === 1;
}
function transitions(values) {
  let count = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (!values[index] && values[(index + 1) % values.length]) count += 1;
  }
  return count;
}
function createPheromoneSampler(field) {
  let values = field?.values;
  let width = field?.width, height = field?.height;
  if ((!ArrayBuffer.isView(values) && !Array.isArray(values)) && typeof field?.getSnapshot === 'function') {
    const snapshot = field.getSnapshot();
    values = snapshot?.values;
    width = snapshot?.width;
    height = snapshot?.height;
  }
  if ((ArrayBuffer.isView(values) || Array.isArray(values)) && Number.isInteger(width) && width >= 2
    && Number.isInteger(height) && height >= 2 && values.length >= width * height) {
    return (x, y) => sampleGrid(values, width, height, x, y);
  }
  return (x, y) => field?.sample?.(x, y);
}
function sampleGrid(values, width, height, x, y) {
  if (x < 0 || x > 1 || y < 0 || y > 1) return 0;
  const gx = x * (width - 1), gy = y * (height - 1);
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const tx = gx - x0, ty = gy - y0;
  const top = mix(values[y0 * width + x0], values[y0 * width + x1], tx);
  const bottom = mix(values[y1 * width + x0], values[y1 * width + x1], tx);
  return mix(top, bottom, ty);
}
function mix(a, b, amount) { return a + (b - a) * amount; }
function validPoint(point) { return finite(point?.x) && finite(point?.y); }
function finite(value) { return Number.isFinite(value); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function clampInteger(value, min, max, fallback) {
  return finite(value) ? clamp(Math.floor(value), min, max) : fallback;
}
class MinHeap {
  constructor() { this.items = []; }
  get length() { return this.items.length; }
  push(distance, index) {
    const item = [distance, index];
    this.items.push(item);
    let child = this.items.length - 1;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (compareHeapItem(this.items[parent], item) <= 0) break;
      this.items[child] = this.items[parent];
      child = parent;
    }
    this.items[child] = item;
  }
  pop() {
    const first = this.items[0];
    const tail = this.items.pop();
    if (this.items.length) {
      let parent = 0;
      while (true) {
        const left = parent * 2 + 1, right = left + 1;
        if (left >= this.items.length) break;
        let child = right < this.items.length
          && compareHeapItem(this.items[right], this.items[left]) < 0 ? right : left;
        if (compareHeapItem(this.items[child], tail) >= 0) break;
        this.items[parent] = this.items[child];
        parent = child;
      }
      this.items[parent] = tail;
    }
    return first;
  }
}
function compareHeapItem(a, b) { return a[0] - b[0] || a[1] - b[1]; }
function freezeDescriptor(descriptor) {
  for (const [key, value] of Object.entries(descriptor)) {
    if (Array.isArray(value)) freezeDeep(value);
    else if (value && typeof value === 'object') freezeDeep(value);
    Object.freeze(value);
    void key;
  }
  return Object.freeze(descriptor);
}
function freezeDeep(value) {
  if (Array.isArray(value)) for (const child of value) freezeDeep(child);
  else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return Object.freeze(value);
}
