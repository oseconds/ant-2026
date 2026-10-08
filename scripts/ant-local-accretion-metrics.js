export const ANT_LOCAL_ACCRETION_METRIC_DEFINITIONS = Object.freeze({
  foregroundConnectivity: 'Occupied cells use 8-connectivity.',
  holes: 'Beta1 is the number of 4-connected empty-cell components that do not touch the raster boundary.',
  boundaryComponent: 'A foreground component touches the boundary if any cell lies on the outermost row or column.',
  annulusAdjacency: 'A foreground component touches annulusMask if it overlaps it or any cell is within Chebyshev distance 1.',
  isolatedComponent: 'With annulusMask, an isolated component touches neither annulusMask nor raster boundary; without it, isolatedComponentCount is null.',
  boundingBoxFillFraction: 'Occupied cells divided by the component bounding-box cell count; this is a fill proxy, not convex-hull solidity.',
  widthProxy: 'Occupied-cell count divided by thinned skeleton-cell count; this is a raster average-width proxy.',
  skeleton: 'Deterministic row-major sequential thinning uses Zhang-Suen deletion predicates guarded by 8/4 simple-point tests; residual 2x2 plateaus use the same guard. This preserves topology but is not a medial axis.',
  areaDistribution: 'p50 and p90 use the element at floor((n - 1) * p) in ascending order.',
  skeletonAdjacency: 'Skeleton graph uses orthogonal edges and diagonal edges only when neither intervening orthogonal cell is occupied.',
  skeletonCycleRank: 'Secondary skeleton graph cycle rank mu = E - V + C; Beta1 holes remain the primary cycle measure.',
  skeletonNodeClasses: 'Endpoint nodes have degree 1; junction nodes have degree at least 3.'
});

export function measureBinaryMask({ width, height, mask, annulusMask = null }) {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new RangeError('width and height must be positive safe integers');
  }
  const cellCount = width * height;
  if (!Number.isSafeInteger(cellCount)) throw new RangeError('width * height must be a safe integer');
  validateMask(mask, cellCount, 'mask');
  if (annulusMask !== null) validateMask(annulusMask, cellCount, 'annulusMask');

  const foreground = connectedComponents(mask, width, height, 8, annulusMask);
  const occupiedCellCount = foreground.componentLabels.reduce((sum, label) => sum + Number(label >= 0), 0);
  const holeComponents = connectedComponents(invertMask(mask), width, height, 4);
  const holes = holeComponents.components.filter(component => !component.touchesBoundary);
  const skeletonMask = thinSkeleton(mask, width, height);
  const skeleton = measureSkeleton(skeletonMask, width, height);
  const skeletonCellsByComponent = new Uint32Array(foreground.components.length);
  for (let i = 0; i < cellCount; i += 1) {
    if (skeletonMask[i]) skeletonCellsByComponent[foreground.componentLabels[i]] += 1;
  }

  const componentRecords = foreground.components.map((component, id) => {
    const boundingBoxCellCount = component.bounds.width * component.bounds.height;
    const skeletonCellCount = skeletonCellsByComponent[id];
    return {
      id,
      areaCellCount: component.area,
      bounds: component.bounds,
      boundingBoxFillFraction: component.area / boundingBoxCellCount,
      touchesBoundary: component.touchesBoundary,
      touchesAnnulus: annulusMask === null ? null : component.touchesAnnulus,
      skeletonCellCount,
      areaPerSkeletonCellWidthProxy: skeletonCellCount ? component.area / skeletonCellCount : null
    };
  });
  const componentAreas = foreground.components.map(component => component.area);
  const areaDistribution = distribution(componentAreas);
  const holeAreas = holes.map(component => component.area);
  const shapeBounds = boundsOf(foreground.components, width, height);
  const boundingBoxCellCount = shapeBounds ? shapeBounds.width * shapeBounds.height : 0;

  return {
    width,
    height,
    occupiedCellCount,
    areaFraction: occupiedCellCount / cellCount,
    foreground: {
      connectivity: 8,
      componentCount: foreground.components.length,
      componentAreasDescending: [...componentAreas].sort((a, b) => b - a),
      componentAreaDistribution: areaDistribution,
      boundaryTouchingComponentCount: foreground.components.filter(component => component.touchesBoundary).length,
      interiorComponentCount: foreground.components.filter(component => !component.touchesBoundary).length,
      annulusAdjacentComponentCount: annulusMask === null ? null
        : foreground.components.filter(component => component.touchesAnnulus).length,
      isolatedComponentCount: annulusMask === null ? null
        : foreground.components.filter(component => !component.touchesBoundary && !component.touchesAnnulus).length,
      components: componentRecords
    },
    holes: {
      beta1: holes.length,
      connectivity: 4,
      areaDistribution: distribution(holeAreas),
      areasDescending: [...holeAreas].sort((a, b) => b - a)
    },
    shape: {
      bounds: shapeBounds,
      boundingBoxFillFraction: boundingBoxCellCount ? occupiedCellCount / boundingBoxCellCount : null,
      aspectRatio: shapeBounds ? shapeBounds.width / shapeBounds.height : null
    },
    skeleton: {
      ...skeleton,
      areaPerSkeletonCellWidthProxy: skeleton.cellCount ? occupiedCellCount / skeleton.cellCount : null
    }
  };
}

function validateMask(mask, expectedLength, name) {
  if (!mask || !Number.isSafeInteger(mask.length) || mask.length !== expectedLength) {
    throw new RangeError(`${name} length must equal width * height (${expectedLength})`);
  }
  for (let i = 0; i < expectedLength; i += 1) {
    if (mask[i] !== 0 && mask[i] !== 1) throw new TypeError(`${name} must contain only 0 and 1 values`);
  }
}

function connectedComponents(mask, width, height, connectivity, annulusMask = null) {
  const labels = new Int32Array(mask.length);
  labels.fill(-1);
  const components = [];
  const offsets = connectivity === 4
    ? [[-1, 0], [1, 0], [0, -1], [0, 1]]
    : [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start] !== -1) continue;
    const id = components.length;
    const queue = [start];
    labels[start] = id;
    let area = 0, minX = width, minY = height, maxX = -1, maxY = -1;
    let touchesBoundary = false, touchesAnnulus = false;
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head];
      const x = index % width, y = Math.floor(index / width);
      area += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBoundary = true;
      if (annulusMask && annulusMask[index]) touchesAnnulus = true;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const adjacent = ny * width + nx;
        if (annulusMask && annulusMask[adjacent]) touchesAnnulus = true;
      }
      for (const [dx, dy] of offsets) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const adjacent = ny * width + nx;
        if (mask[adjacent] && labels[adjacent] === -1) {
          labels[adjacent] = id;
          queue.push(adjacent);
        }
      }
    }
    components.push({ area, touchesBoundary, touchesAnnulus,
      bounds: { xMin: minX, yMin: minY, xMax: maxX, yMax: maxY, width: maxX - minX + 1, height: maxY - minY + 1 } });
  }
  return { components, componentLabels: labels };
}

function invertMask(mask) {
  const result = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) result[i] = mask[i] ? 0 : 1;
  return result;
}

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = percentile => sorted.length ? sorted[Math.floor((sorted.length - 1) * percentile)] : null;
  return { n: sorted.length, min: sorted[0] ?? null, p50: at(0.5), p90: at(0.9), max: sorted.at(-1) ?? null };
}

function boundsOf(components, width, height) {
  if (!components.length) return null;
  let xMin = width, yMin = height, xMax = -1, yMax = -1;
  for (const component of components) {
    xMin = Math.min(xMin, component.bounds.xMin); yMin = Math.min(yMin, component.bounds.yMin);
    xMax = Math.max(xMax, component.bounds.xMax); yMax = Math.max(yMax, component.bounds.yMax);
  }
  return { xMin, yMin, xMax, yMax, width: xMax - xMin + 1, height: yMax - yMin + 1 };
}

function thinSkeleton(mask, width, height) {
  const skeleton = Uint8Array.from(mask);
  let changed = true;
  while (changed) {
    changed = false;
    for (let phase = 0; phase < 2; phase += 1) {
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (!skeleton[index]) continue;
        const p = [
          at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1),
          at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)
        ];
        const neighborCount = p.reduce((sum, value) => sum + value, 0);
        if (neighborCount < 2 || neighborCount > 6) continue;
        let transitions = 0;
        for (let i = 0; i < 8; i += 1) if (!p[i] && p[(i + 1) % 8]) transitions += 1;
        if (transitions !== 1) continue;
        const [north, , east, , south, , west] = p;
        const removeByPhase = phase === 0
          ? !(north && east && south) && !(east && south && west)
          : !(north && east && west) && !(north && south && west);
        if (removeByPhase && isSimplePoint(skeleton, index, width, height)) {
          skeleton[index] = 0;
          changed = true;
        }
      }
    }
  }
  collapseTwoByTwoPlateaus(skeleton, width, height);
  return skeleton;

  function at(x, y) {
    return x >= 0 && x < width && y >= 0 && y < height ? skeleton[y * width + x] : 0;
  }
}

function collapseTwoByTwoPlateaus(mask, width, height) {
  let removed = true;
  while (removed) {
    removed = false;
    outer: for (let y = 0; y < height - 1; y += 1) for (let x = 0; x < width - 1; x += 1) {
      const topLeft = y * width + x;
      const square = [topLeft, topLeft + 1, topLeft + width, topLeft + width + 1];
      if (!square.every(index => mask[index])) continue;
      for (const index of square) {
        if (!isSimplePoint(mask, index, width, height)) continue;
        mask[index] = 0;
        removed = true;
        break outer;
      }
    }
  }
}

function isSimplePoint(mask, index, width, height) {
  const x = index % width, y = Math.floor(index / width);
  const values = new Uint8Array(9);
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) values[(dy + 1) * 3 + dx + 1] = mask[ny * width + nx];
  }
  const foregroundLabels = localLabels(values, 1, 8, true);
  const foregroundComponents = new Set();
  for (let i = 0; i < 9; i += 1) if (i !== 4 && values[i] && foregroundLabels[i] >= 0) foregroundComponents.add(foregroundLabels[i]);
  if (foregroundComponents.size !== 1) return false;

  const backgroundLabels = localLabels(values, 0, 4, false);
  const adjacentBackground = [1, 3, 5, 7].filter(i => !values[i]).map(i => backgroundLabels[i]);
  return new Set(adjacentBackground.filter(label => label >= 0)).size === 1;
}

function localLabels(values, target, connectivity, excludeCenter) {
  const labels = new Int8Array(9);
  labels.fill(-1);
  const offsets = connectivity === 4 ? [[-1, 0], [1, 0], [0, -1], [0, 1]]
    : [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  let id = 0;
  for (let start = 0; start < 9; start += 1) {
    if ((excludeCenter && start === 4) || values[start] !== target || labels[start] !== -1) continue;
    const queue = [start];
    labels[start] = id;
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head], cx = current % 3, cy = Math.floor(current / 3);
      for (const [dx, dy] of offsets) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= 3 || ny < 0 || ny >= 3) continue;
        const adjacent = ny * 3 + nx;
        if ((excludeCenter && adjacent === 4) || values[adjacent] !== target || labels[adjacent] !== -1) continue;
        labels[adjacent] = id;
        queue.push(adjacent);
      }
    }
    id += 1;
  }
  return labels;
}

function measureSkeleton(mask, width, height) {
  const vertexByCell = new Int32Array(mask.length);
  vertexByCell.fill(-1);
  const vertexCells = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    vertexByCell[index] = vertexCells.length;
    vertexCells.push(index);
  }
  const parent = Int32Array.from(vertexCells, (_, index) => index);
  const degree = new Uint8Array(vertexCells.length);
  let edgeCount = 0;
  for (let vertex = 0; vertex < vertexCells.length; vertex += 1) {
    const index = vertexCells[vertex], x = index % width, y = Math.floor(index / width);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (dx && dy && (mask[y * width + nx] || mask[ny * width + x])) continue;
      const other = vertexByCell[ny * width + nx];
      if (other <= vertex) continue;
      edgeCount += 1;
      degree[vertex] += 1;
      degree[other] += 1;
      union(parent, vertex, other);
    }
  }
  const graphComponents = new Set();
  for (let vertex = 0; vertex < vertexCells.length; vertex += 1) graphComponents.add(find(parent, vertex));
  return {
    cellCount: vertexCells.length,
    endpointCount: degree.reduce((sum, value) => sum + Number(value === 1), 0),
    junctionNodeCount: degree.reduce((sum, value) => sum + Number(value >= 3), 0),
    isolatedNodeCount: degree.reduce((sum, value) => sum + Number(value === 0), 0),
    edgeCount,
    graphComponentCount: graphComponents.size,
    graphCycleRank: edgeCount - vertexCells.length + graphComponents.size
  };
}

function find(parent, value) {
  let root = value;
  while (parent[root] !== root) root = parent[root];
  while (parent[value] !== value) {
    const next = parent[value];
    parent[value] = root;
    value = next;
  }
  return root;
}

function union(parent, a, b) {
  const rootA = find(parent, a), rootB = find(parent, b);
  if (rootA !== rootB) parent[rootB] = rootA;
}
