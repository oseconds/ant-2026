const MODES = new Set(['substrate-flat', 'substrate-relief-subtle', 'substrate-relief-strong']);
const DISTANCE_CAP = 24, SIGMA = 3, KERNEL_RADIUS = 9, COVERAGE_RADIUS = 4;
const BASE_ALPHA = 32, RGB = 100, SOFT_AMPLITUDE = 10, STRONG_AMPLITUDE = 24;
const LIGHT_X = Math.SQRT1_2, LIGHT_Y = Math.SQRT1_2;
const INF = 1e15;

export const MATERIAL_SUBSTRATE_PARAMETERS = Object.freeze({
  distanceCapPx: DISTANCE_CAP,
  gaussianSigmaPx: SIGMA,
  gaussianRadiusPx: KERNEL_RADIUS,
  coverageFromPx: -COVERAGE_RADIUS,
  coverageToPx: COVERAGE_RADIUS,
  baseAlpha: BASE_ALPHA,
  softAmplitude: SOFT_AMPLITUDE,
  strongAmplitude: STRONG_AMPLITUDE,
  light: Object.freeze([LIGHT_X, LIGHT_Y])
});

export function buildMaterialSubstrate(material, width, height, mode) {
  if (!MODES.has(mode)) throw new TypeError(`Unknown material substrate mode: ${mode}`);
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new TypeError('Width and height must be positive integers');
  }
  const top = material?.stratigraphy?.topLayerByCell ?? material?.topLayerByCell;
  const gridWidth = material?.width, gridHeight = material?.height;
  if (!top || !Number.isInteger(gridWidth) || !Number.isInteger(gridHeight)
    || gridWidth < 1 || gridHeight < 1 || top.length !== gridWidth * gridHeight) {
    throw new TypeError('Invalid material topLayerByCell');
  }

  const size = width * height, support = new Uint8Array(size);
  let nativeSupportPixels = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const gx = Math.min(gridWidth - 1, Math.floor((x + 0.5) * gridWidth / width));
    const gy = Math.min(gridHeight - 1, Math.floor((y + 0.5) * gridHeight / height));
    const occupied = top[gy * gridWidth + gx] >= 0;
    support[y * width + x] = Number(occupied);
    nativeSupportPixels += Number(occupied);
  }

  const pad = DISTANCE_CAP + KERNEL_RADIUS + 2, paddedWidth = width + 2 * pad, paddedHeight = height + 2 * pad;
  const paddedSize = paddedWidth * paddedHeight, paddedSupport = new Uint8Array(paddedSize);
  if (nativeSupportPixels) for (let y = 0; y < height; y += 1) {
    paddedSupport.set(support.subarray(y * width, (y + 1) * width), (y + pad) * paddedWidth + pad);
  }
  const distanceToSupport = squaredDistanceTo(paddedSupport, paddedWidth, paddedHeight, 1);
  const distanceToEmpty = squaredDistanceTo(paddedSupport, paddedWidth, paddedHeight, 0);
  const rawPadded = new Float32Array(paddedSize);
  for (let i = 0; i < paddedSize; i += 1) {
    const distance = paddedSupport[i]
      ? Math.sqrt(distanceToEmpty[i]) - 0.5
      : -(Math.sqrt(distanceToSupport[i]) - 0.5);
    rawPadded[i] = Math.max(-DISTANCE_CAP, Math.min(DISTANCE_CAP, distance));
  }
  const smoothedPadded = gaussianBlur(rawPadded, paddedWidth, paddedHeight);
  const signedDistance = new Float32Array(size), coverage = new Float32Array(size), directionalResponse = new Float32Array(size);
  const flatPixels = new Uint8ClampedArray(size * 4), pixels = new Uint8ClampedArray(size * 4);
  const amplitude = mode === 'substrate-relief-subtle' ? SOFT_AMPLITUDE
    : mode === 'substrate-relief-strong' ? STRONG_AMPLITUDE : 0;
  let influencePixels = 0, nonzeroAlphaPixels = 0, halfCoveragePixels = 0, spillPixels = 0;
  let halfCoverageOutsidePixels = 0, supportBelowHalfPixels = 0, transitionPixels = 0;
  let transitionDistanceMin = Infinity, transitionDistanceMax = -Infinity;
  let transition10DistanceMin = Infinity, transition10DistanceMax = -Infinity;
  let directionMin = Infinity, directionMax = -Infinity, directionSum = 0, directionWeight = 0;
  let flatAlphaSum = 0, alphaSum = 0, alphaSquaredSum = 0, activeAlphaSum = 0, activeAlphaSquaredSum = 0;
  let activeAlphaMin = 255, activeAlphaMax = 0;
  let affectedPixels = 0, flatDarknessSum = 0, materialDarknessSum = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x, pixel = index * 4, paddedIndex = (y + pad) * paddedWidth + x + pad;
    const distance = smoothedPadded[paddedIndex];
    const cover = smoothstep(-COVERAGE_RADIUS, COVERAGE_RADIUS, distance);
    const gx = (smoothedPadded[paddedIndex + 1] - smoothedPadded[paddedIndex - 1]) * 0.5;
    const gy = (smoothedPadded[paddedIndex + paddedWidth] - smoothedPadded[paddedIndex - paddedWidth]) * 0.5;
    const response = Math.max(-1, Math.min(1, gx * LIGHT_X + gy * LIGHT_Y));
    const baseAlpha = Math.round(BASE_ALPHA * cover);
    const alpha = Math.round((BASE_ALPHA + amplitude * response) * cover);
    signedDistance[index] = distance;
    coverage[index] = cover;
    directionalResponse[index] = response;
    flatPixels[pixel] = flatPixels[pixel + 1] = flatPixels[pixel + 2] = RGB;
    flatPixels[pixel + 3] = baseAlpha;
    pixels[pixel] = pixels[pixel + 1] = pixels[pixel + 2] = RGB;
    pixels[pixel + 3] = alpha;
    if (cover > 0) {
      influencePixels += 1;
      activeAlphaSum += alpha;
      activeAlphaSquaredSum += alpha * alpha;
      activeAlphaMin = Math.min(activeAlphaMin, alpha);
      activeAlphaMax = Math.max(activeAlphaMax, alpha);
      directionMin = Math.min(directionMin, response);
      directionMax = Math.max(directionMax, response);
      directionSum += response * cover;
      directionWeight += cover;
      if (cover < 1) {
        transitionPixels += 1;
        transitionDistanceMin = Math.min(transitionDistanceMin, distance);
        transitionDistanceMax = Math.max(transitionDistanceMax, distance);
      }
      if (cover >= 0.1 && cover <= 0.9) {
        transition10DistanceMin = Math.min(transition10DistanceMin, distance);
        transition10DistanceMax = Math.max(transition10DistanceMax, distance);
      }
    }
    if (cover >= 0.5) halfCoveragePixels += 1;
    if (pixels[pixel + 3]) nonzeroAlphaPixels += 1;
    if (!support[index] && cover > 0) spillPixels += 1;
    if (!support[index] && cover >= 0.5) halfCoverageOutsidePixels += 1;
    if (support[index] && cover < 0.5) supportBelowHalfPixels += 1;
    flatAlphaSum += baseAlpha; alphaSum += alpha; alphaSquaredSum += alpha * alpha;
    flatDarknessSum += (255 - RGB) * baseAlpha / 255;
    materialDarknessSum += (255 - RGB) * alpha / 255;
    if (alpha !== baseAlpha) affectedPixels += 1;
  }
  const kernel = gaussianKernel(), cellPeriodX = width / gridWidth, cellPeriodY = height / gridHeight;
  const stats = {
    nativeSupportPixels,
    influencePixels,
    nonzeroAlphaPixels,
    halfCoveragePixels,
    halfCoverageOutsidePixels,
    supportBelowHalfPixels,
    supportExpansionPixels: halfCoverageOutsidePixels,
    supportShrinkagePixels: supportBelowHalfPixels,
    nonzeroInfluenceOutsideSupportPixels: spillPixels,
    transitionPixels,
    registeredCoverageWidthPx: COVERAGE_RADIUS * 2,
    observed10to90TransitionWidthPx: Number.isFinite(transition10DistanceMin)
      ? transition10DistanceMax - transition10DistanceMin : 0,
    observedTransitionDistanceMinPx: Number.isFinite(transitionDistanceMin) ? transitionDistanceMin : null,
    observedTransitionDistanceMaxPx: Number.isFinite(transitionDistanceMax) ? transitionDistanceMax : null,
    directionResponseMin: Number.isFinite(directionMin) ? directionMin : null,
    directionResponseMax: Number.isFinite(directionMax) ? directionMax : null,
    coverageWeightedMeanDirectionResponse: directionWeight ? directionSum / directionWeight : 0,
    meanAlphaCanvas: alphaSum / size,
    meanAlphaInfluence: influencePixels ? alphaSum / influencePixels : 0,
    alphaStandardDeviationCanvas: Math.sqrt(Math.max(0, alphaSquaredSum / size - (alphaSum / size) ** 2)),
    alphaStandardDeviationInfluence: influencePixels
      ? Math.sqrt(Math.max(0, activeAlphaSquaredSum / influencePixels - (activeAlphaSum / influencePixels) ** 2)) : 0,
    alphaMinInfluence: influencePixels ? activeAlphaMin : null,
    alphaMaxInfluence: influencePixels ? activeAlphaMax : null,
    affectedPixelsVsFlat: affectedPixels,
    meanWhiteBackgroundDarknessCanvas: materialDarknessSum / size,
    meanWhiteBackgroundDarknessInfluence: influencePixels ? materialDarknessSum / influencePixels : 0,
    flatMeanAlphaCanvas: flatAlphaSum / size,
    flatMeanWhiteBackgroundDarknessCanvas: flatDarknessSum / size,
    signedDistanceCapPx: DISTANCE_CAP,
    gaussianSigmaPx: SIGMA,
    gaussianRadiusPx: KERNEL_RADIUS,
    gaussianDiscreteGainAt96GridCellPeriod: {
      x: kernel.reduce((sum, value, index) => sum + value * Math.cos(2 * Math.PI * (index - KERNEL_RADIUS) / cellPeriodX), 0),
      y: kernel.reduce((sum, value, index) => sum + value * Math.cos(2 * Math.PI * (index - KERNEL_RADIUS) / cellPeriodY), 0)
    },
    boundarySecondDifferenceRms: distanceRoughness(rawPadded, smoothedPadded, paddedWidth, paddedHeight, width, height, pad)
  };
  return { mode, support, rawSignedDistance: crop(rawPadded, paddedWidth, width, height, pad),
    signedDistance, coverage, directionalResponse, flatPixels, pixels, stats };
}

function smoothstep(low, high, value) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

function gaussianKernel() {
  const weights = new Float64Array(KERNEL_RADIUS * 2 + 1);
  let total = 0;
  for (let offset = -KERNEL_RADIUS; offset <= KERNEL_RADIUS; offset += 1) {
    const weight = Math.exp(-(offset * offset) / (2 * SIGMA * SIGMA));
    weights[offset + KERNEL_RADIUS] = weight; total += weight;
  }
  for (let index = 0; index < weights.length; index += 1) weights[index] /= total;
  return weights;
}

function gaussianBlur(input, width, height) {
  const weights = gaussianKernel(), radius = KERNEL_RADIUS, temporary = new Float32Array(input.length), output = new Float32Array(input.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let value = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const xx = x + offset;
      value += (xx < 0 || xx >= width ? -DISTANCE_CAP : input[y * width + xx]) * weights[offset + radius];
    }
    temporary[y * width + x] = value;
  }
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let value = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const yy = y + offset;
      value += (yy < 0 || yy >= height ? -DISTANCE_CAP : temporary[yy * width + x]) * weights[offset + radius];
    }
    output[y * width + x] = value;
  }
  return output;
}

export function squaredDistanceTo(mask, width, height, target) {
  const rows = new Float64Array(mask.length), input = new Float64Array(Math.max(width, height));
  const output = new Float64Array(input.length);
  for (let y = 0; y < height; y += 1) {
    const offset = y * width;
    for (let x = 0; x < width; x += 1) input[x] = mask[offset + x] === target ? 0 : INF;
    distanceTransform1d(input, width, output);
    for (let x = 0; x < width; x += 1) rows[offset + x] = output[x];
  }
  const result = new Float32Array(mask.length);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) input[y] = rows[y * width + x];
    distanceTransform1d(input, height, output);
    for (let y = 0; y < height; y += 1) result[y * width + x] = output[y];
  }
  return result;
}

function distanceTransform1d(input, length, output) {
  const sites = new Int32Array(length), limits = new Float64Array(length + 1);
  let last = -1;
  for (let q = 0; q < length; q += 1) {
    if (input[q] >= INF / 2) continue;
    let intersection = -Infinity;
    while (last >= 0) {
      const previous = sites[last];
      intersection = ((input[q] + q * q) - (input[previous] + previous * previous)) / (2 * (q - previous));
      if (intersection > limits[last]) break;
      last -= 1;
    }
    last += 1; sites[last] = q; limits[last] = last === 0 ? -Infinity : intersection; limits[last + 1] = Infinity;
  }
  if (last < 0) { output.fill(INF, 0, length); return; }
  let k = 0;
  for (let q = 0; q < length; q += 1) {
    while (limits[k + 1] < q) k += 1;
    const delta = q - sites[k]; output[q] = delta * delta + input[sites[k]];
  }
}

function crop(padded, paddedWidth, width, height, pad) {
  const result = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) result.set(padded.subarray((y + pad) * paddedWidth + pad, (y + pad) * paddedWidth + pad + width), y * width);
  return result;
}

function distanceRoughness(raw, filtered, paddedWidth, paddedHeight, width, height, pad) {
  let rawSquared = 0, filteredSquared = 0, count = 0;
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const center = (y + pad) * paddedWidth + x + pad;
    if (Math.abs(raw[center]) > 12) continue;
    const rawLap = raw[center - 1] + raw[center + 1] + raw[center - paddedWidth] + raw[center + paddedWidth] - 4 * raw[center];
    const filteredLap = filtered[center - 1] + filtered[center + 1] + filtered[center - paddedWidth]
      + filtered[center + paddedWidth] - 4 * filtered[center];
    rawSquared += rawLap * rawLap; filteredSquared += filteredLap * filteredLap;
    count += 1;
  }
  return { boundaryPixels: count, rawLaplacianRms: count ? Math.sqrt(rawSquared / count) : 0,
    filteredLaplacianRms: count ? Math.sqrt(filteredSquared / count) : 0 };
}
