const MODES = new Set(['presence-20-sharp', 'presence-20-edge', 'presence-20-directional-edge']);
const BAND_RADIUS = 2;
const FILL_RGB = 100, FILL_ALPHA = 20;
const EDGE_RGB = 80, EDGE_ALPHA = 64, EDGE_SHADE = 24;
const LIGHT_X = -Math.SQRT1_2, LIGHT_Y = -Math.SQRT1_2;

export function buildMaterialSurface(material, width, height, mode) {
  if (!MODES.has(mode)) throw new TypeError(`Unknown material surface mode: ${mode}`);
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new TypeError('Width and height must be positive integers');
  }
  const top = material?.stratigraphy?.topLayerByCell;
  const gridWidth = material?.width, gridHeight = material?.height;
  if (!top || !Number.isInteger(gridWidth) || !Number.isInteger(gridHeight)
    || gridWidth < 1 || gridHeight < 1 || top.length !== gridWidth * gridHeight) {
    throw new TypeError('Invalid material topLayerByCell');
  }

  const size = width * height, support = new Uint8Array(size), band = new Uint8Array(size);
  const fillPixels = new Uint8ClampedArray(size * 4), edgePixels = new Uint8ClampedArray(size * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const gx = Math.min(gridWidth - 1, Math.floor((x + 0.5) * gridWidth / width));
    const gy = Math.min(gridHeight - 1, Math.floor((y + 0.5) * gridHeight / height));
    const pixel = y * width + x;
    if (top[gy * gridWidth + gx] < 0) continue;
    support[pixel] = 1;
    const p = pixel * 4;
    fillPixels[p] = fillPixels[p + 1] = fillPixels[p + 2] = FILL_RGB;
    fillPixels[p + 3] = FILL_ALPHA;
  }

  if (mode !== 'presence-20-sharp') {
    let bandPixels = 0, dotTotal = 0;
    const dots = new Float32Array(size);
    const isInside = (x, y) => x >= 0 && y >= 0 && x < width && y < height && support[y * width + x] === 1;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!support[pixel]) continue;
      let boundary = false;
      for (let dy = -BAND_RADIUS; dy <= BAND_RADIUS && !boundary; dy += 1) {
        for (let dx = -BAND_RADIUS; dx <= BAND_RADIUS; dx += 1) {
          if (dx * dx + dy * dy > BAND_RADIUS * BAND_RADIUS) continue;
          if (!isInside(x + dx, y + dy)) { boundary = true; break; }
        }
      }
      if (!boundary) continue;
      band[pixel] = 1; bandPixels += 1;
      const left = (Number(isInside(x - 1, y - 1)) + 2 * Number(isInside(x - 1, y)) + Number(isInside(x - 1, y + 1)));
      const right = (Number(isInside(x + 1, y - 1)) + 2 * Number(isInside(x + 1, y)) + Number(isInside(x + 1, y + 1)));
      const above = (Number(isInside(x - 1, y - 1)) + 2 * Number(isInside(x, y - 1)) + Number(isInside(x + 1, y - 1)));
      const below = (Number(isInside(x - 1, y + 1)) + 2 * Number(isInside(x, y + 1)) + Number(isInside(x + 1, y + 1)));
      const gx = left - right, gy = above - below, length = Math.hypot(gx, gy) || 1;
      const nx = gx / length, ny = gy / length, dot = nx * LIGHT_X + ny * LIGHT_Y;
      dots[pixel] = dot; dotTotal += dot;
    }
    const meanDot = dotTotal / (bandPixels || 1);
    let minRgb = 255, maxRgb = 0, sumRgb = 0, sumWhiteDarkness = 0;
    const underFill = 255 - (255 - FILL_RGB) * FILL_ALPHA / 255;
    for (let pixel = 0; pixel < size; pixel += 1) {
      if (!band[pixel]) continue;
      const p = pixel * 4;
      const rgb = mode === 'presence-20-directional-edge'
        ? Math.round(EDGE_RGB + EDGE_SHADE * (dots[pixel] - meanDot)) : EDGE_RGB;
      edgePixels[p] = edgePixels[p + 1] = edgePixels[p + 2] = rgb;
      edgePixels[p + 3] = EDGE_ALPHA;
      minRgb = Math.min(minRgb, rgb); maxRgb = Math.max(maxRgb, rgb); sumRgb += rgb;
      const composite = underFill * (255 - EDGE_ALPHA) / 255 + rgb * EDGE_ALPHA / 255;
      sumWhiteDarkness += 255 - composite;
    }
    const stats = { supportPixels: support.reduce((sum, value) => sum + value, 0), bandPixels,
      bandWidthPixels: BAND_RADIUS, edgeAlpha: EDGE_ALPHA, meanDirectionDot: meanDot,
      meanEdgeRgb: sumRgb / (bandPixels || 1), minEdgeRgb: bandPixels ? minRgb : null,
      maxEdgeRgb: bandPixels ? maxRgb : null,
      whiteCompositeMeanBoundaryDarkness: sumWhiteDarkness / (bandPixels || 1) };
    return { fillPixels, edgePixels, support, band, stats };
  }

  return { fillPixels, edgePixels, support, band, stats: {
    supportPixels: support.reduce((sum, value) => sum + value, 0), bandPixels: 0, bandWidthPixels: 0,
    edgeAlpha: 0, meanDirectionDot: 0, meanEdgeRgb: null, minEdgeRgb: null, maxEdgeRgb: null,
    whiteCompositeMeanBoundaryDarkness: null
  } };
}
