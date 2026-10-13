const STRIDE = 52;
const HEADER_BYTES = 20;
const FRAME_HEADER_BYTES = 12;

export function decodeTrajectory(buffer) {
  if (buffer.toString('ascii', 0, 8) !== 'ANTTRJ01' || buffer.readUInt32LE(8) !== 1
    || buffer.readUInt32LE(16) !== STRIDE) throw new Error('Unsupported ANT trajectory format');
  const sampleRateHz = buffer.readUInt32LE(12);
  const frames = [];
  let offset = HEADER_BYTES;
  while (offset < buffer.length) {
    if (offset + FRAME_HEADER_BYTES > buffer.length) throw new Error('Truncated ANT trajectory frame');
    const timeSeconds = buffer.readDoubleLE(offset);
    const agentCount = buffer.readUInt32LE(offset + 8);
    const payloadOffset = offset + FRAME_HEADER_BYTES;
    const nextOffset = payloadOffset + agentCount * STRIDE;
    if (!Number.isFinite(timeSeconds) || nextOffset > buffer.length) throw new Error('Invalid ANT trajectory frame');
    frames.push({ timeSeconds, agentCount, offset: payloadOffset });
    offset = nextOffset;
  }
  return { sampleRateHz, frames, buffer };
}

export function occupancyWindow(trajectory, endSeconds, durationSeconds, gridSize = 96) {
  if (!Number.isFinite(endSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0
    || !Number.isInteger(gridSize) || gridSize < 2) throw new RangeError('Invalid occupancy window');
  const startSeconds = endSeconds - durationSeconds;
  const values = new Float64Array(gridSize * gridSize);
  const tracks = new Map();
  let includedFrames = 0, agentFrames = 0;
  for (const frame of trajectory.frames) {
    if (frame.timeSeconds <= startSeconds || frame.timeSeconds > endSeconds) continue;
    includedFrames += 1;
    let offset = frame.offset;
    for (let agent = 0; agent < frame.agentCount; agent += 1) {
      const idIndex = trajectory.buffer.readUInt32LE(offset);
      const x = trajectory.buffer.readDoubleLE(offset + 4);
      const y = trajectory.buffer.readDoubleLE(offset + 12);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Non-finite trajectory position');
      const column = Math.min(gridSize - 1, Math.max(0, Math.round(x * (gridSize - 1))));
      const row = Math.min(gridSize - 1, Math.max(0, Math.round(y * (gridSize - 1))));
      values[row * gridSize + column] += 1;
      const track = tracks.get(idIndex) || [];
      track.push([x, y]);
      tracks.set(idIndex, track);
      agentFrames += 1;
      offset += STRIDE;
    }
  }
  return { values, tracks: [...tracks].map(([idIndex, points]) => ({ idIndex, points })), gridSize,
    startSeconds, endSeconds, includedFrames, agentFrames };
}

export function measureWeightedGrid(values, gridSize, origin) {
  if (!Number.isInteger(gridSize) || gridSize < 2 || values.length !== gridSize * gridSize
    || !Number.isFinite(origin?.x) || !Number.isFinite(origin?.y)) throw new RangeError('Invalid weighted grid');
  let mass = 0, squaredMass = 0, radiusTotal = 0, angleX = 0, angleY = 0;
  let positiveCells = 0;
  const angles = [];
  for (let index = 0; index < values.length; index += 1) {
    const weight = values[index];
    if (!Number.isFinite(weight) || weight < 0) throw new Error('Grid values must be finite and non-negative');
    if (weight === 0) continue;
    const x = (index % gridSize) / (gridSize - 1), y = Math.floor(index / gridSize) / (gridSize - 1);
    const dx = x - origin.x, dy = y - origin.y, radius = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
    mass += weight; squaredMass += weight * weight; radiusTotal += radius * weight;
    angleX += Math.cos(angle) * weight; angleY += Math.sin(angle) * weight;
    angles.push((angle + Math.PI * 2) % (Math.PI * 2));
    positiveCells += 1;
  }
  const resultant = mass ? Math.hypot(angleX, angleY) / mass : 0;
  return { mass, positiveCells, effectiveCells: squaredMass ? mass * mass / squaredMass : 0,
    meanRadius: mass ? radiusTotal / mass : 0, angularDispersion: mass ? 1 - resultant : 0,
    angularSpanRad: circularSpan(angles) };
}

export function measurePath(points, origin) {
  if (!Array.isArray(points) || !Number.isFinite(origin?.x) || !Number.isFinite(origin?.y)) {
    throw new TypeError('Invalid path');
  }
  let pathLength = 0, radialTravel = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    const dx = x1 - x0, dy = y1 - y0, step = Math.hypot(dx, dy);
    if (![x0, y0, x1, y1, step].every(Number.isFinite)) throw new Error('Path values must be finite');
    pathLength += step;
    const mx = (x0 + x1) * 0.5 - origin.x, my = (y0 + y1) * 0.5 - origin.y;
    const radius = Math.hypot(mx, my);
    if (step && radius) radialTravel += Math.abs((dx * mx + dy * my) / radius);
  }
  const first = points[0] || [origin.x, origin.y], last = points.at(-1) || first;
  const endpointDistance = Math.hypot(last[0] - first[0], last[1] - first[1]);
  let radiusTotal = 0;
  const angles = points.map(([x, y]) => {
    radiusTotal += Math.hypot(x - origin.x, y - origin.y);
    return Math.atan2(y - origin.y, x - origin.x);
  });
  return { pointCount: points.length, pathLength, endpointDistance,
    tortuosity: endpointDistance > 0 ? pathLength / endpointDistance : 0,
    radialAlignment: pathLength > 0 ? radialTravel / pathLength : 0,
    meanRadius: points.length ? radiusTotal / points.length : 0, angularSpanRad: circularSpan(angles) };
}

export function measureTracks(tracks, origin) {
  const measured = tracks.map(track => measurePath(track.points, origin)).filter(row => row.pointCount > 1);
  const traveled = measured.reduce((sum, row) => sum + row.pathLength, 0);
  return { trackCount: measured.length, pathLength: traveled,
    meanTortuosity: weightedMean(measured, 'tortuosity'),
    radialAlignment: weightedMean(measured, 'radialAlignment'),
    meanEndpointDistance: measured.length ? measured.reduce((sum, row) => sum + row.endpointDistance, 0) / measured.length : 0 };
}

export function sampleFullSupportGrid(surfaceField, gridSize = 96, radius = 0.025) {
  if (!Number.isInteger(gridSize) || gridSize < 2 || typeof surfaceField?.sampleSupport !== 'function') {
    throw new TypeError('SurfaceField support sampler required');
  }
  const values = new Float64Array(gridSize * gridSize);
  for (let row = 0; row < gridSize; row += 1) for (let column = 0; column < gridSize; column += 1) {
    const support = surfaceField.sampleSupport(column / (gridSize - 1), row / (gridSize - 1), radius);
    if (!Number.isFinite(support)) throw new Error('SurfaceField returned non-finite support');
    values[row * gridSize + column] = Math.max(0, support);
  }
  return values;
}

export function validateProductionSupport({ chemicalMemory, productionSupports, fullSupport,
  chemicalThreshold, supportThreshold }) {
  if (chemicalMemory.length !== productionSupports.length || chemicalMemory.length !== fullSupport.length
    || !Number.isFinite(chemicalThreshold) || !Number.isFinite(supportThreshold)) throw new RangeError('Invalid support arrays');
  const chemicalQualifiedMask = new Uint8Array(chemicalMemory.length);
  const mechanicallySupportedMask = new Uint8Array(chemicalMemory.length);
  const supportedMask = new Uint8Array(chemicalMemory.length);
  const mismatches = [];
  for (let index = 0; index < chemicalMemory.length; index += 1) {
    const chemical = chemicalMemory[index], observed = productionSupports[index], recomputed = fullSupport[index];
    if (![chemical, observed, recomputed].every(Number.isFinite)) throw new Error('Support inputs must be finite');
    const chemicallyQualified = chemical >= chemicalThreshold;
    chemicalQualifiedMask[index] = chemicallyQualified ? 1 : 0;
    mechanicallySupportedMask[index] = recomputed >= supportThreshold ? 1 : 0;
    if (chemicallyQualified) {
      if (observed !== Math.fround(recomputed)) mismatches.push({ index, production: observed, recomputed: Math.fround(recomputed) });
      supportedMask[index] = recomputed >= supportThreshold ? 1 : 0;
    }
  }
  return { mismatches, chemicalQualifiedMask, mechanicallySupportedMask, supportedMask };
}

export function maskMetrics(mask, gridSize, origin) {
  const weighted = measureWeightedGrid(mask, gridSize, origin);
  return { ...weighted, cellFraction: weighted.positiveCells / (gridSize * gridSize) };
}

function circularSpan(angles) {
  if (angles.length < 2) return 0;
  angles.sort((a, b) => a - b);
  let largestGap = 0;
  for (let i = 1; i < angles.length; i += 1) largestGap = Math.max(largestGap, angles[i] - angles[i - 1]);
  largestGap = Math.max(largestGap, angles[0] + Math.PI * 2 - angles.at(-1));
  return Math.PI * 2 - largestGap;
}

function weightedMean(rows, key) {
  const mass = rows.reduce((sum, row) => sum + row.pathLength, 0);
  return mass ? rows.reduce((sum, row) => sum + row[key] * row.pathLength, 0) / mass : 0;
}
