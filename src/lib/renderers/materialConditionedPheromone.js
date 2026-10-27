import { squaredDistanceTo } from './antMaterialSubstrate.js';

export const MATERIAL_READOUT_TRANSITION_PX = 4;
export const PHEROMONE_SCREEN_MAX_ALPHA = 112;
export const PHEROMONE_BAYER_4X4 = Object.freeze([
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
]);

export function buildMaterialReadoutMask(material, width, height) {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new TypeError('Width and height must be positive integers');
  }
  const top = material?.stratigraphy?.topLayerByCell ?? material?.topLayerByCell;
  const gridWidth = material?.width, gridHeight = material?.height;
  if (!top || !Number.isInteger(gridWidth) || gridWidth < 1 || !Number.isInteger(gridHeight)
    || gridHeight < 1 || top.length !== gridWidth * gridHeight) {
    throw new TypeError('Invalid material topLayerByCell');
  }

  const size = width * height, support = new Uint8Array(size), boundary = new Uint8Array(size);
  let supportPixels = 0, boundaryPixels = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const gx = Math.min(gridWidth - 1, Math.floor((x + 0.5) * gridWidth / width));
    const gy = Math.min(gridHeight - 1, Math.floor((y + 0.5) * gridHeight / height));
    const index = y * width + x;
    if (top[gy * gridWidth + gx] < 0) continue;
    support[index] = 1;
    supportPixels += 1;
  }
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x;
    if (!support[index]) continue;
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height || !support[yy * width + xx]) {
        edge = true;
        break;
      }
    }
    if (edge) { boundary[index] = 1; boundaryPixels += 1; }
  }

  const weights = new Float32Array(size), insideDistance = new Float32Array(size);
  if (supportPixels && boundaryPixels) {
    const distanceSquared = squaredDistanceTo(boundary, width, height, 1);
    for (let index = 0; index < size; index += 1) {
      if (!support[index]) continue;
      const distance = Math.sqrt(distanceSquared[index]);
      insideDistance[index] = distance;
      weights[index] = smoothstep(0, MATERIAL_READOUT_TRANSITION_PX, distance);
    }
  }
  let weightedPixels = 0, weightSum = 0, maxInsideDistance = 0;
  for (let index = 0; index < size; index += 1) {
    if (weights[index] > 0) weightedPixels += 1;
    weightSum += weights[index];
    maxInsideDistance = Math.max(maxInsideDistance, insideDistance[index]);
  }
  return { support, boundary, insideDistance, weights,
    stats: { supportPixels, boundaryPixels, positiveWeightPixels: weightedPixels,
      meanWeightAcrossCanvas: weightSum / size, maxInsideDistancePx: maxInsideDistance,
      transitionWidthPx: MATERIAL_READOUT_TRANSITION_PX } };
}

export function buildScreenedPheromoneAlpha(baselineAlpha, width, height, output = new Uint8ClampedArray(width * height)) {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1
    || baselineAlpha?.length !== width * height || output.length !== width * height) {
    throw new TypeError('Invalid pheromone alpha dimensions');
  }
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x, alpha = baselineAlpha[index];
    const threshold = (PHEROMONE_BAYER_4X4[((y >> 1) & 3) * 4 + ((x >> 1) & 3)] + 0.5) / 16;
    output[index] = alpha > 0 && alpha / PHEROMONE_SCREEN_MAX_ALPHA > threshold
      ? PHEROMONE_SCREEN_MAX_ALPHA : 0;
  }
  return output;
}

export function mixPheromoneAlpha(baselineAlpha, alternateAlpha, weights,
  output = new Uint8ClampedArray(baselineAlpha.length), effectiveWeights = new Float32Array(baselineAlpha.length)) {
  if (!baselineAlpha?.length || alternateAlpha?.length !== baselineAlpha.length
    || weights?.length !== baselineAlpha.length || output.length !== baselineAlpha.length
    || effectiveWeights.length !== baselineAlpha.length) {
    throw new TypeError('Pheromone alpha and material mask lengths must match');
  }
  for (let index = 0; index < baselineAlpha.length; index += 1) {
    const baseline = baselineAlpha[index], weight = baseline > 0 ? weights[index] : 0;
    effectiveWeights[index] = weight;
    output[index] = baseline + (alternateAlpha[index] - baseline) * weight;
  }
  return { alpha: output, effectiveWeights };
}

function smoothstep(low, high, value) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}
