const WIDTH = 96;
const HEIGHT = 96;
const H = 1 / 95;
const SIGMA = 0.00225;
const RADIUS = 0.0045;
const SUPPORT_IN_CELLS = RADIUS / H;
const Z = 2 * Math.PI * SIGMA * SIGMA * (1 - Math.exp(-(RADIUS * RADIUS) / (2 * SIGMA * SIGMA)));
const SQRT_TWO_SIGMA = Math.SQRT2 * SIGMA;
const ERF_TERMS = 24;
const READER_ORDER = 24;
const QUADRATURES = new Map([12, 24, 48].map(order => [order, makeGaussLegendre(order)]));

export const QAKR_CONSTANTS = Object.freeze({ width: WIDTH, height: HEIGHT, h: H, sigma: SIGMA, radius: RADIUS, z: Z, erfTerms: ERF_TERMS, readerOrder: READER_ORDER });

export function makeGaussLegendre(order) {
  if (!Number.isInteger(order) || order < 2 || order % 2 !== 0) throw new RangeError('Quadrature order must be an even integer greater than one.');
  const nodes = new Float64Array(order);
  const weights = new Float64Array(order);
  const half = order / 2;
  for (let index = 0; index < half; index += 1) {
    let x = Math.cos(Math.PI * (index + 0.75) / (order + 0.5));
    let derivative = 0;
    for (let iteration = 0; iteration < 16; iteration += 1) {
      let p0 = 1;
      let p1 = x;
      for (let degree = 2; degree <= order; degree += 1) {
        const p2 = ((2 * degree - 1) * x * p1 - (degree - 1) * p0) / degree;
        p0 = p1;
        p1 = p2;
      }
      derivative = order * (x * p1 - p0) / (x * x - 1);
      x -= p1 / derivative;
    }
    let p0 = 1;
    let p1 = x;
    for (let degree = 2; degree <= order; degree += 1) {
      const p2 = ((2 * degree - 1) * x * p1 - (degree - 1) * p0) / degree;
      p0 = p1;
      p1 = p2;
    }
    derivative = order * (x * p1 - p0) / (x * x - 1);
    const weight = 2 / ((1 - x * x) * derivative * derivative);
    nodes[index] = -x;
    nodes[order - 1 - index] = x;
    weights[index] = weight;
    weights[order - 1 - index] = weight;
  }
  return Object.freeze({ nodes, weights });
}

function erfInSupport(value) {
  const x = value / SQRT_TWO_SIGMA;
  if (Math.abs(x) > RADIUS / SQRT_TWO_SIGMA + 1e-12) throw new RangeError('erf input is outside the compact-kernel support.');
  let term = x;
  let sum = 0;
  for (let n = 0; n < ERF_TERMS; n += 1) {
    sum += term / (2 * n + 1);
    term *= -(x * x) / (n + 1);
  }
  return (2 / Math.sqrt(Math.PI)) * sum;
}

function supportIntervalDistance(min, max) {
  if (min > 0) return min;
  if (max < 0) return -max;
  return 0;
}

export function basisIntegral(rx, ry, order = READER_ORDER, counters = null) {
  if (!Number.isFinite(rx) || !Number.isFinite(ry)) throw new TypeError('Basis offsets must be finite.');
  const x0 = rx - H / 2;
  const x1 = rx + H / 2;
  const y0 = ry - H / 2;
  const y1 = ry + H / 2;
  if (x0 <= -RADIUS && x1 >= RADIUS && y0 <= -RADIUS && y1 >= RADIUS) {
    if (counters) counters.fullDisk += 1;
    return 1 / (H * H);
  }
  const dx = supportIntervalDistance(x0, x1);
  const dy = supportIntervalDistance(y0, y1);
  if (dx * dx + dy * dy >= RADIUS * RADIUS) {
    if (counters) counters.disjoint += 1;
    return 0;
  }

  const left = Math.max(x0, -RADIUS);
  const right = Math.min(x1, RADIUS);
  if (right <= left) return 0;
  const thetaLeft = Math.asin(left / RADIUS);
  const thetaRight = Math.asin(right / RADIUS);
  const breaks = [thetaLeft, thetaRight];
  for (const y of [y0, y1]) {
    const ratio = Math.abs(y) / RADIUS;
    if (ratio >= 0 && ratio < 1) {
      const angle = Math.acos(ratio);
      if (angle > thetaLeft && angle < thetaRight) breaks.push(angle);
      if (-angle > thetaLeft && -angle < thetaRight) breaks.push(-angle);
    }
  }
  breaks.sort((a, b) => a - b);

  const quadrature = QUADRATURES.get(order) || makeGaussLegendre(order);
  let integral = 0;
  for (let segment = 0; segment < breaks.length - 1; segment += 1) {
    const a = breaks[segment];
    const b = breaks[segment + 1];
    const midpoint = (a + b) * 0.5;
    const scale = (b - a) * 0.5;
    for (let index = 0; index < order; index += 1) {
      const theta = midpoint + scale * quadrature.nodes[index];
      const x = RADIUS * Math.sin(theta);
      const yRadius = RADIUS * Math.cos(theta);
      const low = Math.max(y0, -yRadius);
      const high = Math.min(y1, yRadius);
      if (high <= low) continue;
      const inner = SIGMA * Math.sqrt(Math.PI / 2)
        * (erfInSupport(high) - erfInSupport(low));
      const value = Math.exp(-(x * x) / (2 * SIGMA * SIGMA)) * inner * yRadius;
      integral += scale * quadrature.weights[index] * value;
      if (counters) counters.quadratureNodes += 1;
    }
  }
  if (counters) counters.partial += 1;
  return Math.max(0, integral / (H * H * Z));
}

export function basisWeight(rx, ry, order = READER_ORDER, counters = null) {
  return H * H * basisIntegral(rx, ry, order, counters);
}

export function qakrRead(values, x, y, { order = READER_ORDER, counters = null } = {}) {
  if (!(values instanceof Float32Array) || values.length !== WIDTH * HEIGHT) throw new TypeError('QAKR requires a 96x96 Float32Array raster.');
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('QAKR coordinates must be finite.');
  if (x < 0 || x > 1 || y < 0 || y > 1) return 0;
  const hx = H;
  const hy = H;
  const limitX = 0.5 + RADIUS / hx;
  const limitY = 0.5 + RADIUS / hy;
  const gx = x / hx;
  const gy = y / hy;
  const minX = Math.max(0, Math.ceil(gx - limitX));
  const maxX = Math.min(WIDTH - 1, Math.floor(gx + limitX));
  const minY = Math.max(0, Math.ceil(gy - limitY));
  const maxY = Math.min(HEIGHT - 1, Math.floor(gy + limitY));
  let result = 0;
  if (counters) counters.queryCount += 1;
  for (let row = minY; row <= maxY; row += 1) {
    const ry = y - row * hy;
    for (let column = minX; column <= maxX; column += 1) {
      const rx = x - column * hx;
      const coefficient = basisWeight(rx, ry, order, counters);
      if (coefficient === 0) continue;
      if (counters) counters.nodeContributions += 1;
      result += values[row * WIDTH + column] * coefficient;
    }
  }
  if (!Number.isFinite(result) || result < 0) throw new RangeError('QAKR produced a non-finite or negative field value.');
  return result;
}

export function basisSanity() {
  const offsets = [
    [0, 0], [0.5, 0], [0.5, 0.5], [0.9275, 0],
    [0.7071067811865476, 0.7071067811865476], [0.1, 0.3]
  ];
  const convergence = offsets.map(([x, y]) => ({
    offsetCells: [x, y],
    order12: basisWeight(x * H, y * H, 12),
    order24: basisWeight(x * H, y * H, 24),
    order48: basisWeight(x * H, y * H, 48)
  })).map(row => ({ ...row, diff12To24: row.order24 - row.order12, diff24To48: row.order48 - row.order24 }));

  const size = WIDTH * HEIGHT;
  const zero = new Float32Array(size);
  const constant = new Float32Array(size).fill(3.25);
  const pattern = new Float32Array(size);
  const reflected = new Float32Array(size);
  const reflectedY = new Float32Array(size);
  const rotated = new Float32Array(size);
  for (let row = 0; row < HEIGHT; row += 1) {
    for (let column = 0; column < WIDTH; column += 1) {
      const value = (column * 17 + row * 31 + column * row * 3) % 97;
      pattern[row * WIDTH + column] = value;
      reflected[row * WIDTH + (WIDTH - 1 - column)] = value;
      reflectedY[(HEIGHT - 1 - row) * WIDTH + column] = value;
      rotated[column * WIDTH + (WIDTH - 1 - row)] = value;
    }
  }
  const zeros = [qakrRead(zero, 0.5, 0.5), qakrRead(zero, 0, 0), qakrRead(zero, 1, 1)];
  const points = [[0.5, 0.5], [0.5 + 0.37 * H, 0.5 - 0.21 * H], [0.001, 0.001], [0, 0.5], [1, 1]];
  const constants = points.map(([x, y]) => ({ x, y, value: qakrRead(constant, x, y) }));
  const partitionResiduals = constants.map(row => row.value - 3.25);
  const finiteNonnegative = [...convergence.flatMap(row => [row.order12, row.order24, row.order48]), ...zeros, ...constants.map(row => row.value),
    qakrRead(pattern, 0.2173, 0.6231), qakrRead(reflected, 0.7827, 0.6231), qakrRead(reflectedY, 0.2173, 0.3769), qakrRead(rotated, 0.3769, 0.2173)]
    .every(value => Number.isFinite(value) && value >= 0);
  const mirror = qakrRead(pattern, 0.2173, 0.6231) - qakrRead(reflected, 0.7827, 0.6231);
  const mirrorY = qakrRead(pattern, 0.2173, 0.6231) - qakrRead(reflectedY, 0.2173, 0.3769);
  const rotate = qakrRead(pattern, 0.2173, 0.6231) - qakrRead(rotated, 0.3769, 0.2173);
  const basisSymmetry = {
    xReflectionResidual: basisWeight(0.37 * H, 0.21 * H) - basisWeight(-0.37 * H, 0.21 * H),
    yReflectionResidual: basisWeight(0.37 * H, 0.21 * H) - basisWeight(0.37 * H, -0.21 * H),
    rotation90Residual: basisWeight(0.37 * H, 0.21 * H) - basisWeight(-0.21 * H, 0.37 * H)
  };
  const repeat = qakrRead(pattern, 0.2173, 0.6231) === qakrRead(pattern, 0.2173, 0.6231);
  const nodeRaster = new Float32Array(size);
  const nodeColumn = 48, nodeRow = 31;
  nodeRaster[nodeRow * WIDTH + nodeColumn] = 7;
  const gridNodeValue = qakrRead(nodeRaster, nodeColumn * H, nodeRow * H);
  const interiorPartitionMaxAbsError = Math.max(...partitionResiduals.slice(0, 2).map(Math.abs));
  const boundaryPartitionMaxAbsError = Math.max(...partitionResiduals.slice(2).map(Math.abs));
  const constantPartitionPassed = interiorPartitionMaxAbsError < 1e-12 && boundaryPartitionMaxAbsError < 1e-12;
  const receipt = {
    constants: QAKR_CONSTANTS,
    quadrature: { candidateOrder: READER_ORDER, convergenceProbes: convergence },
    finiteNonnegative,
    zeroRaster: { values: zeros, exactZero: zeros.every(value => value === 0) },
    constantRaster: { input: 3.25, samples: constants, interiorMaxAbsError: interiorPartitionMaxAbsError, boundaryMaxAbsError: boundaryPartitionMaxAbsError },
    symmetry: { rasterXReflectionResidual: mirror, rasterYReflectionResidual: mirrorY, rasterRotation90Residual: rotate, basis: basisSymmetry },
    gridNode: { expected: 7, observed: gridNodeValue, exact: gridNodeValue === 7 },
    deterministicRepeat: repeat,
    rngCalls: 0
  };
  receipt.passed = finiteNonnegative && receipt.zeroRaster.exactZero && repeat
    && constantPartitionPassed
    && Math.abs(mirror) < 1e-11 && Math.abs(mirrorY) < 1e-11 && Math.abs(rotate) < 1e-11
    && Object.values(basisSymmetry).every(value => Math.abs(value) < 1e-11)
    && gridNodeValue === 7
    && convergence.every(row => Math.abs(row.diff24To48) < 1e-10);
  return receipt;
}
