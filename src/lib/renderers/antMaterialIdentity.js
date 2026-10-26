const MODES = new Set(['identity-fine-shuffled', 'identity-fine-registered', 'identity-coarse-shuffled']);
const GRID = 96;
const WORLD = 640;

function randomFor(plate) {
  let seed = 2166136261;
  for (const c of `${plate.id}:${plate.bornAtSimulationTimeMs}`) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  seed >>>= 0;
  return () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  };
}

function shuffle(values, random) {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function angleAt(x, y, segments) {
  let best = null, bestDistance = Infinity;
  for (const segment of segments) {
    const dx = x - segment.ax, dy = y - segment.ay;
    const t = Math.max(0, Math.min(1, (dx * segment.dx + dy * segment.dy) / segment.lengthSquared));
    const ex = dx - t * segment.dx, ey = dy - t * segment.dy, distance = ex * ex + ey * ey;
    if (distance < bestDistance) { bestDistance = distance; best = segment.angle; }
  }
  return (best + Math.PI) % Math.PI;
}

function histogram(primitives, exposedOnly = false) {
  const bins = new Array(12).fill(0);
  for (const p of primitives) if (!exposedOnly || p.exposedCenter) bins[Math.floor(p.angle * 12 / Math.PI) % 12] += 1;
  return bins;
}

function makeMarks(plate, plateIndex, width, height, mode) {
  const coarse = mode === 'identity-coarse-shuffled', spacing = coarse ? 12 : 4;
  const nodes = new Map((plate.centerline || []).map(node => [node.index, node]));
  if (plate.grid?.width !== GRID || plate.grid?.height !== GRID || plate.mask?.length !== GRID * GRID
    || !Array.isArray(plate.edges) || !plate.edges.length || typeof plate.id !== 'string'
    || !Number.isFinite(plate.bornAtSimulationTimeMs)) throw new TypeError(`Invalid occupied plate descriptor at index ${plateIndex}`);
  const segments = plate.edges.map(([a, b]) => {
    const first = nodes.get(a), second = nodes.get(b);
    if (!first || !second || ![first.x, first.y, second.x, second.y].every(Number.isFinite)
      || [first.x, first.y, second.x, second.y].some(value => value < 0 || value > 1)) {
      throw new TypeError(`Invalid occupied plate edge at index ${plateIndex}`);
    }
    const ax = first.x * WORLD, ay = first.y * WORLD, dx = (second.x - first.x) * WORLD, dy = (second.y - first.y) * WORLD;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) throw new TypeError(`Invalid occupied plate edge at index ${plateIndex}`);
    return { ax, ay, dx, dy, lengthSquared, angle: Math.atan2(dy, dx) };
  });
  const anchors = [];
  for (let y = spacing / 2; y < WORLD; y += spacing) for (let x = spacing / 2; x < WORLD; x += spacing) {
    const gx = Math.min(GRID - 1, Math.floor(x / WORLD * GRID));
    const gy = Math.min(GRID - 1, Math.floor(y / WORLD * GRID));
    if (!plate.mask[gy * GRID + gx]) continue;
    anchors.push({ plateIndex, x: x * width / WORLD, y: y * height / WORLD,
      angle: angleAt(x, y, segments), length: spacing, width: coarse ? 3 : 1, spacing,
      exposedCenter: false, clippedSampleCount: 0 });
  }
  const random = randomFor(plate);
  if (mode === 'identity-fine-shuffled') {
    const angles = shuffle(anchors.map(p => p.angle), random);
    anchors.forEach((p, i) => { p.angle = angles[i]; });
  } else if (coarse) {
    const fineAngles = [];
    for (let y = 2; y < WORLD; y += 4) for (let x = 2; x < WORLD; x += 4) {
      const gx = Math.min(GRID - 1, Math.floor(x / WORLD * GRID));
      const gy = Math.min(GRID - 1, Math.floor(y / WORLD * GRID));
      if (plate.mask[gy * GRID + gx]) fineAngles.push(angleAt(x, y, segments));
    }
    fineAngles.sort((a, b) => a - b);
    const balanced = anchors.map((_, i) => fineAngles[Math.min(fineAngles.length - 1,
      Math.floor((i + 0.5) * fineAngles.length / anchors.length))]);
    const shuffled = shuffle(balanced, random);
    anchors.forEach((p, i) => { p.angle = shuffled[i] ?? p.angle; });
  }
  return anchors;
}

export function buildMaterialIdentity(material, width, height, mode) {
  if (!MODES.has(mode)) throw new TypeError(`Unknown material identity mode: ${mode}`);
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) throw new TypeError('Width and height must be positive integers');
  const plates = material?.plates || [], top = material?.stratigraphy?.topLayerByCell;
  if (!top || top.length !== GRID * GRID) throw new TypeError('Invalid material topLayerByCell');
  const occupied = new Set(top), primitives = [];
  for (const index of occupied) if (index < -1 || index >= plates.length) throw new TypeError(`Invalid plate index in topLayerByCell: ${index}`);
  for (let i = 0; i < plates.length; i += 1) if (occupied.has(i)) primitives.push(...makeMarks(plates[i], i, width, height, mode));
  const pixels = new Uint8ClampedArray(width * height * 4), coverage = new Uint16Array(width * height);
  const centerTop = new Int32Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const gx = Math.min(GRID - 1, Math.floor((x + 0.5) * GRID / width));
    const gy = Math.min(GRID - 1, Math.floor((y + 0.5) * GRID / height));
    centerTop[y * width + x] = top[gy * GRID + gx];
  }
  for (const p of primitives) {
    const u = Math.cos(p.angle), v = Math.sin(p.angle), nx = -v, ny = u;
    const rx = (Math.abs(u) * p.length / 2 + Math.abs(nx) * p.width / 2) * width / WORLD;
    const ry = (Math.abs(v) * p.length / 2 + Math.abs(ny) * p.width / 2) * height / WORLD;
    const x0 = Math.max(0, Math.floor(p.x - rx - 1)), x1 = Math.min(width - 1, Math.ceil(p.x + rx + 1));
    const y0 = Math.max(0, Math.floor(p.y - ry - 1)), y1 = Math.min(height - 1, Math.ceil(p.y + ry + 1));
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
      const pixel = y * width + x;
      if (centerTop[pixel] !== p.plateIndex) continue;
      let bits = 0;
      for (let sy = 0; sy < 4; sy += 1) for (let sx = 0; sx < 4; sx += 1) {
        const dx = ((x + (sx + 0.5) / 4 - p.x) * WORLD / width);
        const dy = ((y + (sy + 0.5) / 4 - p.y) * WORLD / height);
        if (Math.abs(dx * u + dy * v) <= p.length / 2 && Math.abs(dx * nx + dy * ny) <= p.width / 2) bits |= 1 << (sy * 4 + sx);
      }
      let samples = 0;
      for (let value = bits; value; value &= value - 1) samples += 1;
      // Per-mark counts precede union, so overlapping marks each contribute.
      p.clippedSampleCount += samples;
      coverage[pixel] |= bits;
    }
  }
  let sumAlpha = 0, coveredSamples = 0, supportedPixels = 0;
  for (let i = 0; i < centerTop.length; i += 1) {
    if (centerTop[i] < 0) continue;
    const index = i * 4, bits = coverage[i]; let samples = 0;
    for (let value = bits; value; value &= value - 1) samples += 1;
    pixels[index] = pixels[index + 1] = pixels[index + 2] = 100;
    pixels[index + 3] = 64 + Math.round(128 * samples / 16);
    sumAlpha += pixels[index + 3]; coveredSamples += samples; supportedPixels += 1;
  }
  for (const p of primitives) {
    const x = Math.min(width - 1, Math.max(0, Math.floor(p.x)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(p.y)));
    p.exposedCenter = centerTop[y * width + x] === p.plateIndex;
  }
  const clippedContributionAngleWeights = new Array(12).fill(0);
  for (const p of primitives) clippedContributionAngleWeights[Math.floor(p.angle * 12 / Math.PI) % 12] += p.clippedSampleCount;
  return { pixels, primitives, stats: { nominalCenterCount: primitives.length,
    visibleCenterCount: primitives.filter(p => p.exposedCenter).length,
    nominalAngleHistogram: histogram(primitives), visibleCenterAngleHistogram: histogram(primitives, true),
    clippedContributionAngleWeights,
    inkFraction: supportedPixels ? coveredSamples / (supportedPixels * 16) : 0, sumAlpha, coverage: coveredSamples } };
}
