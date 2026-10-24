import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { GasterDeposition } from '../src/lib/agents/ant/GasterDeposition.js';

export const GRID_SIZE = 96;
export const GRID_INTERVALS = GRID_SIZE - 1;
export const GRID_PITCH = 1 / GRID_INTERVALS;
export const PRODUCTION_RADIUS = 0.0045;
export const PRODUCTION_RATE = 4.5;
export const PRODUCTION_DAB_SPACING = 0.006;
export const DEFAULT_CAP = 8;
export const CENTER_NODE = 48;
export const FIXTURE_COMMIT = '9afcc130f23c85f34cdf64073a2c95c945c0b320';
export const FIXTURE_PATH = 'docs/ant/evidence/2026-10-24-ant-raster-backed-fixture';
export const FIXTURE_MANIFEST_SHA256 = 'e93b9be47e5bbe80e408798dd63d588e8d93f3ec12da8b3288106a3f430e9cbb';
export const FIXTURE_WRITE_STREAMS_SHA256 = 'c2a15990f33d7b43e7e4761cd80b10a47eab0baec98b1dcced76f47b85cdc0ee';
export const SAMPLE_RESOLUTION = 64;
export const PHASES = [
  { id: 'p00', dx: 0, dy: 0 },
  { id: 'p10', dx: GRID_PITCH / 2, dy: 0 },
  { id: 'p01', dx: 0, dy: GRID_PITCH / 2 },
  { id: 'p11', dx: GRID_PITCH / 2, dy: GRID_PITCH / 2 }
];
export const ORIENTATIONS = [
  { id: 'horizontal', angleRadians: 0 },
  { id: 'vertical', angleRadians: Math.PI / 2 },
  { id: 'positive45', angleRadians: Math.PI / 4 },
  { id: 'negative45', angleRadians: -Math.PI / 4 }
];
export const SEGMENT_DAB_COUNTS = [3, 5];
export const SEGMENT_LENGTHS = SEGMENT_DAB_COUNTS.map((count) => count * PRODUCTION_DAB_SPACING);
export const PRODUCTION_SOURCE_HASHES = {
  'src/lib/agents/ant/PheromoneField.js': '412798ea9276888bf5bbb28130ae319d970c36f411d6f066e48cff1b478c4afd',
  'src/lib/agents/ant/GasterDeposition.js': '0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41',
  'src/lib/agents/ant/AntController.js': 'e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04'
};

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_DIR = path.join(SCRIPT_ROOT, 'docs/ant/evidence/2026-10-24-ant-writer-information-loss');

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function verifyProductionSourceHashes(root = SCRIPT_ROOT) {
  const actual = {};
  for (const [relativePath, expected] of Object.entries(PRODUCTION_SOURCE_HASHES)) {
    const sourcePath = path.join(root, relativePath);
    if (!existsSync(sourcePath)) throw new Error(`Missing pinned production source: ${relativePath}`);
    actual[relativePath] = sha256(readFileSync(sourcePath));
    if (actual[relativePath] !== expected) {
      throw new Error(`Production source hash mismatch for ${relativePath}: ${actual[relativePath]}`);
    }
  }
  return { passed: true, hashes: actual };
}

export function encodeRasterFloat32LE(values) {
  const bytes = Buffer.allocUnsafe(values.length * 4);
  for (let index = 0; index < values.length; index += 1) bytes.writeFloatLE(values[index], index * 4);
  return bytes;
}

export function rasterSha256(values) {
  return sha256(encodeRasterFloat32LE(values));
}

/** Exact signature of occupied row-major node indices and Float32 bit patterns. */
export function rasterFootprintSignature(values) {
  let occupied = 0;
  for (const value of values) if (value !== 0) occupied += 1;
  const bytes = Buffer.allocUnsafe(occupied * 8);
  let offset = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === 0) continue;
    bytes.writeUInt32LE(index, offset);
    bytes.writeFloatLE(values[index], offset + 4);
    offset += 8;
  }
  return sha256(bytes);
}

export function rasterMetrics(values, width = GRID_SIZE, height = GRID_SIZE) {
  let totalStoredMass = 0;
  let maximumCell = 0;
  let nonzeroNodeCount = 0;
  let firstX = 0;
  let firstY = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid raster value at index ${index}`);
    if (value === 0) continue;
    const x = (index % width) / (width - 1);
    const y = Math.floor(index / width) / (height - 1);
    totalStoredMass += value;
    maximumCell = Math.max(maximumCell, value);
    nonzeroNodeCount += 1;
    firstX += value * x;
    firstY += value * y;
  }
  if (totalStoredMass === 0) {
    return {
      totalStoredMass: 0,
      maximumCell: 0,
      nonzeroNodeCount: 0,
      centroid: null,
      secondMoment: null,
      principalOrientationRadians: null,
      anisotropy: null
    };
  }
  const centroid = { x: firstX / totalStoredMass, y: firstY / totalStoredMass };
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === 0) continue;
    const dx = (index % width) / (width - 1) - centroid.x;
    const dy = Math.floor(index / width) / (height - 1) - centroid.y;
    xx += value * dx * dx;
    yy += value * dy * dy;
    xy += value * dx * dy;
  }
  xx /= totalStoredMass;
  yy /= totalStoredMass;
  xy /= totalStoredMass;
  const trace = xx + yy;
  const gap = Math.hypot(xx - yy, 2 * xy);
  const principalOrientationRadians = trace === 0 || gap <= 64 * Number.EPSILON * trace
    ? null
    : 0.5 * Math.atan2(2 * xy, xx - yy);
  return {
    totalStoredMass,
    maximumCell,
    nonzeroNodeCount,
    centroid,
    secondMoment: { xx, yy, xy, trace, eigenvalueGap: gap },
    principalOrientationRadians,
    anisotropy: trace === 0 ? 0 : gap / trace
  };
}

function weightedPointMoment(points, centroid) {
  const total = points.reduce((sum, point) => sum + point.requestedDose, 0);
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const point of points) {
    const weight = point.requestedDose / total;
    const dx = point.gridPosition.x - centroid.x;
    const dy = point.gridPosition.y - centroid.y;
    xx += weight * dx * dx;
    yy += weight * dy * dy;
    xy += weight * dx * dy;
  }
  return { xx, yy, xy, trace: xx + yy };
}

export function supportedNodeIds(position, radius = PRODUCTION_RADIUS, width = GRID_SIZE, height = GRID_SIZE) {
  const gx = Math.max(0, Math.min(1, position.x)) * (width - 1);
  const gy = Math.max(0, Math.min(1, position.y)) * (height - 1);
  const radiusX = Math.ceil(radius * (width - 1));
  const radiusY = Math.ceil(radius * (height - 1));
  const minX = Math.max(0, Math.floor(gx - radiusX));
  const maxX = Math.min(width - 1, Math.ceil(gx + radiusX));
  const minY = Math.max(0, Math.floor(gy - radiusY));
  const maxY = Math.min(height - 1, Math.ceil(gy + radiusY));
  const result = [];
  for (let row = minY; row <= maxY; row += 1) {
    for (let column = minX; column <= maxX; column += 1) {
      const distance = Math.hypot(column / (width - 1) - position.x, row / (height - 1) - position.y);
      if (distance <= radius) result.push(row * width + column);
    }
  }
  return result;
}

export function depositPointObserved(field, position, requestedDose, radius = PRODUCTION_RADIUS) {
  const before = field.values.slice();
  const supportNodeIds = supportedNodeIds(position, radius, field.width, field.height);
  const gridX = position.x * (field.width - 1);
  const gridY = position.y * (field.height - 1);
  const nearestColumn = Math.round(gridX);
  const nearestRow = Math.round(gridY);
  const nearestNodeId = nearestRow * field.width + nearestColumn;
  const acceptedDose = field.depositPoint(position, { amount: requestedDose, radius });
  const affectedNodeIds = [];
  for (let index = 0; index < field.values.length; index += 1) {
    if (field.values[index] !== before[index]) affectedNodeIds.push(index);
  }
  const metrics = rasterMetrics(field.values, field.width, field.height);
  const displacement = metrics.centroid
    ? Math.hypot(metrics.centroid.x - position.x, metrics.centroid.y - position.y)
    : null;
  return {
    requestedDose,
    acceptedDose,
    supportNodeIds,
    fallback: supportNodeIds.length === 0,
    nearestNodeId,
    affectedNodeIds,
    rasterFootprintSignature: rasterFootprintSignature(field.values),
    storedMass: metrics.totalStoredMass,
    centroid: metrics.centroid,
    centroidDisplacement: displacement
  };
}

export function runSegmentArm({
  length,
  angleRadians,
  phase = { dx: 0, dy: 0 },
  rate = PRODUCTION_RATE,
  radius = PRODUCTION_RADIUS,
  width = GRID_SIZE,
  height = GRID_SIZE
}) {
  const center = {
    x: CENTER_NODE / (width - 1) + phase.dx,
    y: CENTER_NODE / (height - 1) + phase.dy
  };
  const tangent = { x: Math.cos(angleRadians), y: Math.sin(angleRadians) };
  const from = { x: center.x - tangent.x * length / 2, y: center.y - tangent.y * length / 2 };
  const to = { x: center.x + tangent.x * length / 2, y: center.y + tangent.y * length / 2 };
  const spacing = PRODUCTION_DAB_SPACING;
  const deposition = new GasterDeposition({ mode: 'dab', spacing });
  const id = 'orientation-assay';
  const priorStart = { x: from.x - tangent.x * spacing / 2, y: from.y - tangent.y * spacing / 2 };
  const primingEvents = deposition.advance(id, spacing / 2, priorStart, from, rate);
  if (primingEvents.length !== 0) throw new Error('Half-spacing dab prelude unexpectedly emitted a deposit.');
  const pendingAtStart = deposition.ants.get(id).amount;
  const events = deposition.advance(id, length, from, to, rate);
  const expectedDabCount = Math.round(length / spacing);
  if (events.length !== expectedDabCount) throw new Error(`Expected ${expectedDabCount} centered point dabs, got ${events.length}.`);
  const direct = new PheromoneField({ width, height });
  const brushRecords = events.map((event, sampleIndex) => ({
    sampleIndex,
    position: event.position,
    ...depositPointObserved(direct, event.position, event.amount, radius)
  }));
  const requestedDose = length * rate;
  const acceptedDose = brushRecords.reduce((sum, record) => sum + record.acceptedDose, 0);
  const emittedDose = brushRecords.reduce((sum, record) => sum + record.requestedDose, 0);
  const pendingAtEnd = deposition.ants.get(id).amount;
  const metrics = rasterMetrics(direct.values, width, height);
  const capCount = direct.values.reduce((count, value) => count + (value >= DEFAULT_CAP ? 1 : 0), 0);
  const physicalCenter = weightedPositionCentroid(brushRecords.map((record) => ({ gridPosition: record.position, requestedDose: record.requestedDose })));
  const physicalSecondMoment = weightedPointMoment(brushRecords.map((record) => ({ gridPosition: record.position, requestedDose: record.requestedDose })), physicalCenter);
  const directBytes = encodeRasterFloat32LE(direct.values);
  const actualDistance = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    width,
    height,
    length,
    angleRadians,
    phase,
    center,
    from,
    to,
    actualDistance,
    tangent,
    sampleCount: events.length,
    dabCount: events.length,
    requestedDose,
    acceptedDose,
    emittedDose,
    brushAcceptedDose: acceptedDose,
    pendingDoseAtStart: pendingAtStart,
    pendingDoseAtEnd: pendingAtEnd,
    doseBalanceResidual: emittedDose - (requestedDose + pendingAtStart - pendingAtEnd),
    physicalCenter,
    cappedCellCount: capCount,
    metrics,
    centroidDisplacement: Math.hypot(metrics.centroid.x - physicalCenter.x, metrics.centroid.y - physicalCenter.y),
    principalOrientationErrorRadians: metrics.principalOrientationRadians === null
      ? null
      : undirectedAngleDifference(metrics.principalOrientationRadians, angleRadians),
    physicalSecondMoment,
    rasterSha256: sha256(directBytes),
    rasterFootprintSignature: rasterFootprintSignature(direct.values),
    values: direct.values,
    brushRecords
  };
}

export function rotateRaster90(values, width = GRID_SIZE, centerColumn = CENTER_NODE, centerRow = CENTER_NODE) {
  const output = new Float32Array(values.length);
  for (let row = 0; row < width; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const value = values[row * width + column];
      if (value === 0) continue;
      const rotatedColumn = centerColumn + centerRow - row;
      const rotatedRow = centerRow - centerColumn + column;
      if (!Number.isInteger(rotatedColumn) || !Number.isInteger(rotatedRow)
        || rotatedColumn < 0 || rotatedColumn >= width || rotatedRow < 0 || rotatedRow >= width) {
        throw new RangeError('90-degree transform is not an in-domain grid symmetry for this center.');
      }
      output[rotatedRow * width + rotatedColumn] = value;
    }
  }
  return output;
}

export function mirrorRasterX(values, width = GRID_SIZE, centerColumn = CENTER_NODE) {
  const output = new Float32Array(values.length);
  for (let row = 0; row < width; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const value = values[row * width + column];
      if (value === 0) continue;
      const mirroredColumn = 2 * centerColumn - column;
      if (!Number.isInteger(mirroredColumn) || mirroredColumn < 0 || mirroredColumn >= width) {
        throw new RangeError('Mirror transform is not an in-domain grid symmetry for this center.');
      }
      output[row * width + mirroredColumn] = value;
    }
  }
  return output;
}

export function analyzeSingleDabAssay() {
  const center = { x: CENTER_NODE * GRID_PITCH, y: CENTER_NODE * GRID_PITCH };
  const sampleStep = GRID_PITCH / SAMPLE_RESOLUTION;
  const rows = [];
  const byPhase = new Map();
  for (const phase of PHASES) {
    const phaseRows = [];
    for (let iy = 0; iy < SAMPLE_RESOLUTION; iy += 1) {
      for (let ix = 0; ix < SAMPLE_RESOLUTION; ix += 1) {
        const xOffset = ((ix + 0.5) / SAMPLE_RESOLUTION - 0.5) * GRID_PITCH;
        const yOffset = ((iy + 0.5) / SAMPLE_RESOLUTION - 0.5) * GRID_PITCH;
        const position = { x: center.x + xOffset + phase.dx, y: center.y + yOffset + phase.dy };
        const field = new PheromoneField({ width: GRID_SIZE, height: GRID_SIZE });
        const record = depositPointObserved(field, position, 1, PRODUCTION_RADIUS);
        if (record.affectedNodeIds.length !== 1) throw new Error('Interior single-dab assay did not affect exactly one node.');
        const result = {
          phase: phase.id,
          ix,
          iy,
          position,
          fractionalGridCoordinate: { x: position.x / GRID_PITCH, y: position.y / GRID_PITCH },
          nearestNodeId: record.nearestNodeId,
          supportedNodeIds: record.supportNodeIds,
          fallback: record.fallback,
          affectedNodeIds: record.affectedNodeIds,
          footprintSignature: record.rasterFootprintSignature,
          requestedDose: record.requestedDose,
          acceptedDose: record.acceptedDose,
          storedMass: record.storedMass,
          centroid: record.centroid,
          centroidDisplacement: record.centroidDisplacement
        };
        phaseRows.push(result);
        rows.push(result);
      }
    }
    byPhase.set(phase.id, phaseRows);
  }
  const phaseSummaries = {};
  for (const [phaseId, phaseRows] of byPhase) phaseSummaries[phaseId] = summarizeFootprintClasses(phaseRows, sampleStep);
  const baseRows = byPhase.get('p00');
  const phasePaired = {};
  for (const phase of PHASES.slice(1)) {
    const shiftedRows = byPhase.get(phase.id);
    let exactSameFootprint = 0;
    let sameNearestNode = 0;
    let meanCentroidShift = 0;
    let maxCentroidShift = 0;
    for (let index = 0; index < baseRows.length; index += 1) {
      const a = baseRows[index];
      const b = shiftedRows[index];
      if (a.footprintSignature === b.footprintSignature) exactSameFootprint += 1;
      if (a.nearestNodeId === b.nearestNodeId) sameNearestNode += 1;
      const shift = Math.hypot(a.centroid.x - b.centroid.x, a.centroid.y - b.centroid.y);
      meanCentroidShift += shift;
      maxCentroidShift = Math.max(maxCentroidShift, shift);
    }
    phasePaired[phase.id] = {
      pairedPositions: baseRows.length,
      physicalTranslation: { x: phase.dx, y: phase.dy, distance: Math.hypot(phase.dx, phase.dy) },
      exactSameFootprintCount: exactSameFootprint,
      sameNearestNodeCount: sameNearestNode,
      meanRasterCentroidShift: meanCentroidShift / baseRows.length,
      maximumRasterCentroidShift: maxCentroidShift
    };
  }
  const uniqueCoordinateKeys = new Set();
  for (const phase of PHASES) {
    const xPhaseSteps = phase.dx / sampleStep;
    const yPhaseSteps = phase.dy / sampleStep;
    for (let iy = 0; iy < SAMPLE_RESOLUTION; iy += 1) {
      for (let ix = 0; ix < SAMPLE_RESOLUTION; ix += 1) {
        const xTwiceIndex = 2 * ix - SAMPLE_RESOLUTION + 1 + 2 * xPhaseSteps;
        const yTwiceIndex = 2 * iy - SAMPLE_RESOLUTION + 1 + 2 * yPhaseSteps;
        uniqueCoordinateKeys.add(`${xTwiceIndex},${yTwiceIndex}`);
      }
    }
  }
  const centroidDisplacements = rows.map((row) => row.centroidDisplacement).sort((a, b) => a - b);
  const xDisplacements = rows.map((row) => row.position.x - row.centroid.x);
  const yDisplacements = rows.map((row) => row.position.y - row.centroid.y);
  return {
    protocol: { positionsPerPhase: SAMPLE_RESOLUTION ** 2, phaseCount: PHASES.length, totalRows: rows.length, distinctAbsolutePhysicalPositions: uniqueCoordinateKeys.size, dose: 1, radius: PRODUCTION_RADIUS, gridPitch: GRID_PITCH },
    phaseSummaries,
    pairedPhaseTranslations: phasePaired,
    firstMoment: {
      meanXError: mean(xDisplacements),
      meanYError: mean(yDisplacements),
      meanAbsoluteXError: mean(xDisplacements.map(Math.abs)),
      meanAbsoluteYError: mean(yDisplacements.map(Math.abs)),
      meanEuclideanError: mean(centroidDisplacements),
      medianEuclideanError: medianSorted(centroidDisplacements),
      maximumEuclideanError: centroidDisplacements.at(-1),
      theoreticalNearestNodeBound: GRID_PITCH / Math.sqrt(2),
      theoreticalBoundBasis: 'maximum distance from a point in a square-grid Voronoi cell to its nearest node; R<h/2 ensures no more than one supported node and fallback uses that same nearest node'
    },
    rows
  };
}

export function analyzeDisplacementSweeps() {
  const center = { x: CENTER_NODE * GRID_PITCH, y: CENTER_NODE * GRID_PITCH };
  const directions = [
    { id: 'x', dx: 1, dy: 0 },
    { id: 'y', dx: 0, dy: 1 },
    { id: 'diagonal45', dx: Math.SQRT1_2, dy: Math.SQRT1_2 }
  ];
  return directions.map((direction) => {
    const samples = [];
    for (let index = 0; index <= 384; index += 1) {
      const offset = ((index - 192) / 256) * GRID_PITCH;
      const position = { x: center.x + direction.dx * offset, y: center.y + direction.dy * offset };
      const field = new PheromoneField({ width: GRID_SIZE, height: GRID_SIZE });
      const record = depositPointObserved(field, position, 1, PRODUCTION_RADIUS);
      samples.push({ index, offset, pathDistance: Math.hypot(direction.dx * offset, direction.dy * offset), footprintSignature: record.rasterFootprintSignature, nearestNodeId: record.nearestNodeId, supportedNodeIds: record.supportNodeIds, fallback: record.fallback });
    }
    const runs = [];
    let start = 0;
    for (let index = 1; index <= samples.length; index += 1) {
      if (index < samples.length && samples[index].footprintSignature === samples[start].footprintSignature) continue;
      const first = samples[start];
      const last = samples[index - 1];
      runs.push({
        footprintSignature: first.footprintSignature,
        nearestNodeId: first.nearestNodeId,
        firstOffset: first.offset,
        lastOffset: last.offset,
        sampledUnchangedDistance: Math.hypot(direction.dx * (last.offset - first.offset), direction.dy * (last.offset - first.offset)),
        sampleCount: index - start,
        fallbackSampleCount: samples.slice(start, index).filter((sample) => sample.fallback).length
      });
      start = index;
    }
    const transitions = [];
    for (let index = 1; index < samples.length; index += 1) {
      if (samples[index - 1].footprintSignature !== samples[index].footprintSignature) {
        transitions.push({
          fromOffset: samples[index - 1].offset,
          toOffset: samples[index].offset,
          bracketWidth: Math.abs(samples[index].offset - samples[index - 1].offset),
          fromNode: samples[index - 1].nearestNodeId,
          toNode: samples[index].nearestNodeId
        });
      }
    }
    return {
      direction: direction.id,
      sampleCount: samples.length,
      step: GRID_PITCH / 256,
      physicalSweepFrom: -0.75 * GRID_PITCH,
      physicalSweepTo: 0.75 * GRID_PITCH,
      uniqueFootprintCount: new Set(samples.map((sample) => sample.footprintSignature)).size,
      maximumSampledUnchangedDistance: Math.max(...runs.map((run) => run.sampledUnchangedDistance)),
      runs,
      transitions,
      samples
    };
  });
}

export function analyzeSegmentFixtures() {
  const records = [];
  const rasterCache = new Map();
  for (const length of SEGMENT_LENGTHS) {
    for (const phase of PHASES) {
      for (const orientation of ORIENTATIONS) {
        const arm = runSegmentArm({ length, angleRadians: orientation.angleRadians, phase });
        const record = {
          id: `${length.toPrecision(8)}|${phase.id}|${orientation.id}`,
          length,
          lengthInDabSpacings: length / PRODUCTION_DAB_SPACING,
          lengthInGridPitches: length / GRID_PITCH,
          actualDistance: arm.actualDistance,
          phase: phase.id,
          orientation: orientation.id,
          physicalTangentRadians: orientation.angleRadians,
          from: arm.from,
          to: arm.to,
          physicalDabCentroid: arm.physicalCenter,
          requestedDose: arm.requestedDose,
          acceptedDose: arm.acceptedDose,
          emittedDose: arm.emittedDose,
          brushAcceptedDose: arm.brushAcceptedDose,
          pendingDoseAtStart: arm.pendingDoseAtStart,
          pendingDoseAtEnd: arm.pendingDoseAtEnd,
          doseBalanceResidual: arm.doseBalanceResidual,
          dabCount: arm.dabCount,
          dabRecords: arm.brushRecords.map(({ sampleIndex, position, requestedDose, acceptedDose, supportNodeIds, fallback, nearestNodeId, affectedNodeIds }) => ({ sampleIndex, position, requestedDose, acceptedDose, supportNodeIds, fallback, nearestNodeId, affectedNodeIds })),
          rasterSha256: arm.rasterSha256,
          rasterFootprintSignature: arm.rasterFootprintSignature,
          metrics: arm.metrics,
          centroidDisplacement: arm.centroidDisplacement,
          principalOrientationErrorRadians: arm.principalOrientationErrorRadians,
          physicalSecondMoment: arm.physicalSecondMoment
        };
        records.push(record);
        rasterCache.set(record.id, arm.values);
      }
    }
  }
  const pairwise = [];
  for (const length of SEGMENT_LENGTHS) {
    for (const phase of PHASES) {
      const arms = ORIENTATIONS.map((orientation) => {
        const record = records.find((item) => item.length === length && item.phase === phase.id && item.orientation === orientation.id);
        return { record, values: rasterCache.get(record.id) };
      });
      for (let a = 0; a < arms.length; a += 1) {
        for (let b = a + 1; b < arms.length; b += 1) {
          pairwise.push(compareRasterArms(arms[a], arms[b]));
        }
      }
    }
  }
  const transforms = [];
  for (const length of SEGMENT_LENGTHS) {
    for (const phase of PHASES) {
      const centerGridX = CENTER_NODE + phase.dx / GRID_PITCH;
      const centerGridY = CENTER_NODE + phase.dy / GRID_PITCH;
      const common = { length, phase: phase.id };
      const horizontal = records.find((item) => item.length === length && item.phase === phase.id && item.orientation === 'horizontal');
      const vertical = records.find((item) => item.length === length && item.phase === phase.id && item.orientation === 'vertical');
      const positive = records.find((item) => item.length === length && item.phase === phase.id && item.orientation === 'positive45');
      const negative = records.find((item) => item.length === length && item.phase === phase.id && item.orientation === 'negative45');
      const mirrorable = Number.isInteger(2 * centerGridX);
      transforms.push({
        ...common,
        mirrorXExpectedOnGrid: mirrorable,
        mirrorPositiveToNegativeExact: mirrorable
          ? rasterSha256(mirrorRasterX(rasterCache.get(positive.id), GRID_SIZE, centerGridX)) === negative.rasterSha256
          : null,
        rotation90ExpectedOnGrid: Number.isInteger(centerGridX + centerGridY) && Number.isInteger(centerGridY - centerGridX),
        rotationHorizontalToVerticalExact: Number.isInteger(centerGridX + centerGridY) && Number.isInteger(centerGridY - centerGridX)
          ? rasterSha256(rotateRaster90(rasterCache.get(horizontal.id), GRID_SIZE, centerGridX, centerGridY)) === vertical.rasterSha256
          : null
      });
    }
  }
  const phaseTranslation = [];
  for (const length of SEGMENT_LENGTHS) {
    for (const orientation of ORIENTATIONS) {
      const arms = PHASES.map((phase) => records.find((item) => item.length === length && item.phase === phase.id && item.orientation === orientation.id));
      phaseTranslation.push({
        length,
        orientation: orientation.id,
        phaseRasterSha256: Object.fromEntries(arms.map((arm) => [arm.phase, arm.rasterSha256])),
        uniqueExactRasterCount: new Set(arms.map((arm) => arm.rasterSha256)).size,
        sameSupportPairCount: countPairs(arms, (a, b) => sameNumbers(supportFromSignatureCache(rasterCache.get(a.id)), supportFromSignatureCache(rasterCache.get(b.id))))
      });
    }
  }
  return { records, orientationPairComparisons: pairwise, transforms, phaseTranslation };
}

function supportFromSignatureCache(values) {
  const nodes = [];
  for (let index = 0; index < values.length; index += 1) if (values[index] !== 0) nodes.push(index);
  return nodes;
}

function compareRasterArms(a, b) {
  const valuesA = a.values;
  const valuesB = b.values;
  let relativeNormalizedL1 = 0;
  let absoluteL1 = 0;
  for (let index = 0; index < valuesA.length; index += 1) {
    absoluteL1 += Math.abs(valuesA[index] - valuesB[index]);
    const totalA = a.record.metrics.totalStoredMass;
    const totalB = b.record.metrics.totalStoredMass;
    relativeNormalizedL1 += Math.abs(valuesA[index] / totalA - valuesB[index] / totalB);
  }
  const supportA = supportFromSignatureCache(valuesA);
  const supportB = supportFromSignatureCache(valuesB);
  const intersection = supportA.filter((node) => supportB.includes(node)).length;
  const union = new Set([...supportA, ...supportB]).size;
  return {
    length: a.record.length,
    phase: a.record.phase,
    orientationA: a.record.orientation,
    orientationB: b.record.orientation,
    physicalOrientationDifferenceRadians: undirectedAngleDifference(a.record.physicalTangentRadians, b.record.physicalTangentRadians),
    exactRasterBytesEqual: a.record.rasterSha256 === b.record.rasterSha256,
    exactSupportEqual: sameNumbers(supportA, supportB),
    supportJaccard: union === 0 ? 1 : intersection / union,
    absoluteRasterL1: absoluteL1,
    normalizedRasterL1: relativeNormalizedL1,
    centroidDistance: Math.hypot(a.record.metrics.centroid.x - b.record.metrics.centroid.x, a.record.metrics.centroid.y - b.record.metrics.centroid.y),
    principalOrientationDifferenceRadians: a.record.metrics.principalOrientationRadians === null || b.record.metrics.principalOrientationRadians === null
      ? null
      : undirectedAngleDifference(a.record.metrics.principalOrientationRadians, b.record.metrics.principalOrientationRadians)
  };
}

export function analyzeQualifiedRoutes({ root = SCRIPT_ROOT } = {}) {
  const manifestBytes = readFixtureFile('manifest.json');
  const preflightBytes = readFixtureFile('validation/write-streams-preflight.json');
  const manifestSha256 = sha256(manifestBytes);
  const writeStreamsSha256 = sha256(preflightBytes);
  if (manifestSha256 !== FIXTURE_MANIFEST_SHA256) throw new Error(`Pinned fixture manifest SHA mismatch: ${manifestSha256}`);
  if (writeStreamsSha256 !== FIXTURE_WRITE_STREAMS_SHA256) throw new Error(`Pinned write-stream preflight SHA mismatch: ${writeStreamsSha256}`);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const preflight = JSON.parse(preflightBytes.toString('utf8'));
  if (manifest.provenance?.productionBaselineCommit !== '8c60e4bba3bd5b476300e90a2936bfebd1f831c2') {
    throw new Error('Qualified route fixture does not match the pinned production baseline.');
  }
  const manifestSources = manifest.provenance.productionSourceSha256;
  for (const [source, hash] of Object.entries(PRODUCTION_SOURCE_HASHES)) {
    if (manifestSources[source] !== hash) throw new Error(`Fixture source hash differs for ${source}`);
  }
  if (preflight.provenance?.productionSourceSha256?.['src/lib/agents/ant/PheromoneField.js'] !== PRODUCTION_SOURCE_HASHES['src/lib/agents/ant/PheromoneField.js']) {
    throw new Error('Write-stream source guard does not match current production PheromoneField.');
  }
  const writerSettings = manifest.fixture?.writer;
  if (manifest.rasters.length !== 24 || manifest.fixture?.grid?.width !== GRID_SIZE || manifest.fixture?.grid?.height !== GRID_SIZE
    || writerSettings?.radius !== PRODUCTION_RADIUS || writerSettings?.amountPerUnitDistance !== PRODUCTION_RATE
    || writerSettings?.dabSpacing !== PRODUCTION_DAB_SPACING || writerSettings?.depositionMode !== 'dab'
    || writerSettings?.cap !== DEFAULT_CAP || writerSettings?.decayCalls !== 0 || writerSettings?.initialState !== 'all-zero') {
    throw new Error('Qualified fixture settings differ from the preregistered writer cohort.');
  }
  const byId = new Map(manifest.rasters.map((raster) => [raster.id, raster]));
  const arms = [];
  const allWriteRows = [];
  const allWindows = [];
  for (const inputArm of preflight.arms) {
    const expectedRaster = byId.get(inputArm.id);
    if (!expectedRaster) throw new Error(`No qualified raster manifest row for ${inputArm.id}`);
    if (inputArm.writes.length !== inputArm.eventCount || inputArm.eventCount !== expectedRaster.writeEventCount) {
      throw new Error(`Write count mismatch for ${inputArm.id}`);
    }
    if (inputArm.writeStreamSha256 !== expectedRaster.writeStreamSha256) throw new Error(`Write stream SHA mismatch for ${inputArm.id}`);
    const rasterBytes = readFixtureFile(expectedRaster.file);
    if (rasterBytes.length !== expectedRaster.byteLength || sha256(rasterBytes) !== expectedRaster.rasterSha256) {
      throw new Error(`Qualified stored raster SHA mismatch for ${inputArm.id}`);
    }
    const sourceValues = decodeRasterFloat32LE(rasterBytes);
    const field = new PheromoneField({ width: expectedRaster.width, height: expectedRaster.height });
    let totalRequestedDose = 0;
    let totalAcceptedDose = 0;
    const writes = [];
    for (let order = 0; order < inputArm.writes.length; order += 1) {
      const event = inputArm.writes[order];
      if (event.order !== order) throw new Error(`Out-of-order event in ${inputArm.id} at ${order}`);
      const position = event.gridPosition;
      const before = field.values.slice();
      const supportNodeIds = supportedNodeIds(position, PRODUCTION_RADIUS, field.width, field.height);
      const acceptedDose = field.depositPoint(position, { amount: event.requestedAmount, radius: PRODUCTION_RADIUS });
      const affectedNodeIds = [];
      for (let index = 0; index < field.values.length; index += 1) {
        if (field.values[index] !== before[index]) affectedNodeIds.push(index);
      }
      const record = {
        arm: inputArm.id,
        shape: inputArm.shape,
        phase: inputArm.phase.id,
        order,
        sourceSegment: event.sourceSegment,
        routePosition: event.routePosition,
        gridPosition: position,
        requestedDose: event.requestedAmount,
        acceptedDose,
        supportedNodeIds,
        fallback: supportNodeIds.length === 0,
        affectedNodeIds,
        footprintSignature: nodeSequenceSignature(affectedNodeIds)
      };
      writes.push(record);
      allWriteRows.push(record);
      totalRequestedDose += event.requestedAmount;
      totalAcceptedDose += acceptedDose;
    }
    const replayBytes = encodeRasterFloat32LE(field.values);
    if (!replayBytes.equals(rasterBytes)) throw new Error(`Production writer replay bytes mismatch for ${inputArm.id}`);
    const metrics = rasterMetrics(sourceValues, expectedRaster.width, expectedRaster.height);
    const physicalCentroid = weightedPositionCentroid(writes);
    const runStats = nodeRunStats(writes);
    const physicalTravel = sumPolylineDistance(writes.map((write) => write.gridPosition));
    const transitions = writes.slice(1).filter((write, index) => write.footprintSignature !== writes[index].footprintSignature).length;
    const record = {
      id: inputArm.id,
      shape: inputArm.shape,
      phase: inputArm.phase.id,
      stationCount: inputArm.stationCount,
      sourceDistance: inputArm.sourceDistance,
      writeEventCount: inputArm.eventCount,
      writeStreamSha256: inputArm.writeStreamSha256,
      rasterFile: expectedRaster.file,
      rasterSha256: sha256(rasterBytes),
      nonzeroNodeCount: metrics.nonzeroNodeCount,
      uniqueOccupiedNodeCount: metrics.nonzeroNodeCount,
      requestedDose: totalRequestedDose,
      acceptedDose: totalAcceptedDose,
      storedMass: metrics.totalStoredMass,
      storedMassResidual: metrics.totalStoredMass - totalRequestedDose,
      cappedCellCount: field.values.reduce((count, value) => count + (value >= DEFAULT_CAP ? 1 : 0), 0),
      maximumCell: metrics.maximumCell,
      physicalTravelBetweenWrites: physicalTravel,
      nodeIdentityTransitions: transitions,
      averageTravelPerNodeTransition: transitions === 0 ? null : physicalTravel / transitions,
      consecutiveRepeatedSameNodeEdges: runStats.repeatedEdges,
      sameNodeRunCount: runStats.runs.length,
      sameNodeRunLengthDistribution: runLengthDistribution(runStats.runs),
      longestSameNodeRun: runStats.runs.reduce((longest, run) => Math.max(longest, run.length), 0),
      longestPhysicalDistanceWithoutNodeChange: Math.max(0, ...runStats.runs.map((run) => run.distance)),
      tangentVariationDuringSameNodeRunsRadians: tangentVariationStats(writes, runStats.runs),
      sourcePhysicalCentroid: physicalCentroid,
      storedRasterCentroid: metrics.centroid,
      firstMomentDisplacement: Math.hypot(physicalCentroid.x - metrics.centroid.x, physicalCentroid.y - metrics.centroid.y),
      storedRasterSecondMoment: metrics.secondMoment
    };
    arms.push(record);
    for (let start = 0; start <= writes.length - 3; start += 1) {
      const window = writes.slice(start, start + 3);
      const localField = new PheromoneField({ width: expectedRaster.width, height: expectedRaster.height });
      for (const write of window) localField.depositPoint(write.gridPosition, { amount: write.requestedDose, radius: PRODUCTION_RADIUS });
      const localMetrics = rasterMetrics(localField.values, expectedRaster.width, expectedRaster.height);
      const physicalLocalCenter = weightedPositionCentroid(window);
      const tangent = tangentFrom(window[0].gridPosition, window[2].gridPosition);
      const patternSignature = normalizedNodeSequenceSignature(window.map((write) => write.affectedNodeIds));
      const row = {
        arm: inputArm.id,
        shape: inputArm.shape,
        phase: inputArm.phase.id,
        firstOrder: start,
        sourceSegments: window.map((write) => write.sourceSegment),
        physicalPositions: window.map((write) => write.gridPosition),
        physicalTangentRadians: tangent,
        nodeSequence: window.map((write) => write.affectedNodeIds),
        normalizedNodePatternSignature: patternSignature,
        requestedDose: window.reduce((sum, write) => sum + write.requestedDose, 0),
        storedMass: localMetrics.totalStoredMass,
        physicalDoseCentroid: physicalLocalCenter,
        rasterCentroid: localMetrics.centroid,
        firstMomentDisplacement: Math.hypot(physicalLocalCenter.x - localMetrics.centroid.x, physicalLocalCenter.y - localMetrics.centroid.y),
        rasterSecondMoment: localMetrics.secondMoment,
        rasterPrincipalOrientationRadians: localMetrics.principalOrientationRadians,
        rasterSha256: rasterSha256(localField.values)
      };
      allWindows.push(row);
    }
  }
  const straightP00P01 = analyzeStraightPhasePair(arms, allWriteRows, manifest.rasters);
  const patternGroups = summarizeLocalPatternGroups(allWindows);
  const perShape = summarizeRouteShapes(arms);
  return {
    provenance: {
      fixtureCommit: FIXTURE_COMMIT,
      fixturePath: FIXTURE_PATH,
      fixtureManifestSha256: manifestSha256,
      fixtureWriteStreamsSha256: writeStreamsSha256,
      inputRouteSource: manifest.provenance.historicalRouteSource,
      fixtureProductionSourceSha256: manifestSources,
      rasterCount: manifest.rasters.length,
      armCount: arms.length,
      writeCount: allWriteRows.length,
      routeWindowCount: allWindows.length
    },
    validation: {
      fixtureInputHashesVerified: true,
      all24StoredRasterHashesVerified: true,
      all24ProductionWriterReplaysExact: true,
      totalWriteOrderVerified: allWriteRows.every((write, index) => write.order === index % 77),
      sourceRngCalls: 0
    },
    arms,
    perShape,
    straightP00P01,
    localThreeWritePatterns: patternGroups,
    writes: allWriteRows,
    localWindows: allWindows
  };
}

function analyzeStraightPhasePair(arms, writes, manifestRasters) {
  const p00 = arms.find((arm) => arm.id === 'straight|p00');
  const p01 = arms.find((arm) => arm.id === 'straight|p01');
  const firstWrites = writes.filter((write) => write.arm === 'straight|p00');
  const secondWrites = writes.filter((write) => write.arm === 'straight|p01');
  const rasterRows = new Map(manifestRasters.map((raster) => [raster.id, raster]));
  const a = rasterRows.get('straight|p00');
  const b = rasterRows.get('straight|p01');
  let maxTranslationResidual = 0;
  let minTranslationY = Infinity;
  let maxTranslationY = -Infinity;
  let maxDoseDifference = 0;
  for (let index = 0; index < firstWrites.length; index += 1) {
    const dx = secondWrites[index].gridPosition.x - firstWrites[index].gridPosition.x;
    const dy = secondWrites[index].gridPosition.y - firstWrites[index].gridPosition.y;
    const residual = Math.hypot(dx, dy - GRID_PITCH / 2);
    maxTranslationResidual = Math.max(maxTranslationResidual, residual);
    minTranslationY = Math.min(minTranslationY, dy);
    maxTranslationY = Math.max(maxTranslationY, dy);
    maxDoseDifference = Math.max(maxDoseDifference, Math.abs(secondWrites[index].requestedDose - firstWrites[index].requestedDose));
  }
  const supportA = new Set(firstWrites.flatMap((write) => write.affectedNodeIds));
  const supportB = new Set(secondWrites.flatMap((write) => write.affectedNodeIds));
  return {
    pair: ['straight|p00', 'straight|p01'],
    physicalTranslation: { x: 0, y: GRID_PITCH / 2, distance: GRID_PITCH / 2 },
    measuredWriteTranslationY: { minimum: minTranslationY, maximum: maxTranslationY, maximumResidual: maxTranslationResidual },
    eventCountsEqual: firstWrites.length === secondWrites.length,
    eventCount: firstWrites.length,
    requestedDoseDifferenceMaximum: maxDoseDifference,
    totalRequestedDoseDifference: Math.abs(p00.requestedDose - p01.requestedDose),
    acceptedDoseDifference: Math.abs(p00.acceptedDose - p01.acceptedDose),
    storedMassDifference: Math.abs(p00.storedMass - p01.storedMass),
    rasterBytesEqual: a.rasterSha256 === b.rasterSha256,
    rasterSha256: a.rasterSha256,
    occupiedSupportEqual: sameNumbers([...supportA].sort((x, y) => x - y), [...supportB].sort((x, y) => x - y)),
    occupiedNodeCount: supportA.size,
    sourcePhysicalCentroidDifference: {
      x: p01.sourcePhysicalCentroid.x - p00.sourcePhysicalCentroid.x,
      y: p01.sourcePhysicalCentroid.y - p00.sourcePhysicalCentroid.y
    },
    storedRasterCentroidDifference: {
      x: p01.storedRasterCentroid.x - p00.storedRasterCentroid.x,
      y: p01.storedRasterCentroid.y - p00.storedRasterCentroid.y
    },
    absentDistinction: 'The complete route is physically translated by half one grid pitch in y, while every ordered dose and x position remains matched; the stored node sequence, Float32 values, support, mass, and centroid are identical, so the y translation cannot be recovered from raster bytes.'
  };
}

function summarizeFootprintClasses(rows, sampleStep) {
  const groups = new Map();
  const centroids = [];
  let fallbackCount = 0;
  let supportCountDistribution = new Map();
  for (const row of rows) {
    if (!groups.has(row.footprintSignature)) groups.set(row.footprintSignature, []);
    groups.get(row.footprintSignature).push(row);
    if (row.fallback) fallbackCount += 1;
    const count = row.supportedNodeIds.length;
    supportCountDistribution.set(count, (supportCountDistribution.get(count) || 0) + 1);
    centroids.push(row.centroidDisplacement);
  }
  const classStats = [...groups.entries()].map(([signature, members]) => {
    const pairwise = pairwiseSamplePositionStats(members, sampleStep);
    const centerX = mean(members.map((row) => row.position.x));
    const centerY = mean(members.map((row) => row.position.y));
    const centerDistances = members.map((row) => Math.hypot(row.position.x - centerX, row.position.y - centerY)).sort((a, b) => a - b);
    return {
      footprintSignature: signature,
      size: members.length,
      nearestNodeId: members[0].nearestNodeId,
      affectedNodeIds: members[0].affectedNodeIds,
      pairwisePhysicalSeparation: pairwise,
      sourceToClassCentroidDistance: {
        mean: mean(centerDistances),
        median: medianSorted(centerDistances),
        rms: Math.sqrt(mean(centerDistances.map((distance) => distance * distance))),
        maximum: centerDistances.at(-1)
      }
    };
  }).sort((a, b) => b.size - a.size || a.footprintSignature.localeCompare(b.footprintSignature));
  const classSizes = classStats.map((group) => group.size).sort((a, b) => a - b);
  const allPairwise = classStats.map((group) => group.pairwisePhysicalSeparation).filter((stats) => stats.pairCount > 0);
  const maxWithinClass = Math.max(0, ...allPairwise.map((stats) => stats.maximum));
  return {
    physicalSampleCount: rows.length,
    uniqueRasterFootprintCount: groups.size,
    fallbackCount,
    fallbackFraction: fallbackCount / rows.length,
    supportedNodeCountDistribution: Object.fromEntries([...supportCountDistribution.entries()].sort(([a], [b]) => a - b)),
    classSizeDistribution: {
      minimum: Math.min(...classSizes),
      median: medianSorted(classSizes),
      mean: mean(classSizes),
      maximum: Math.max(...classSizes),
      descending: classSizes.slice().sort((a, b) => b - a)
    },
    withinClassPairwisePosition: {
      maximumSeparation: maxWithinClass,
      meanPerClassPairwiseMean: mean(allPairwise.map((stats) => stats.mean)),
      medianPerClassPairwiseMedian: medianSorted(allPairwise.map((stats) => stats.median).sort((a, b) => a - b))
    },
    centroidDisplacement: {
      mean: mean(centroids),
      median: medianSorted(centroids.slice().sort((a, b) => a - b)),
      maximum: Math.max(...centroids)
    },
    classes: classStats
  };
}

function pairwiseSamplePositionStats(members, sampleStep) {
  let pairCount = 0;
  let sum = 0;
  let maximumSquared = 0;
  const squaredDistanceCounts = new Map();
  for (let a = 0; a < members.length; a += 1) {
    for (let b = a + 1; b < members.length; b += 1) {
      const dx = members[a].ix - members[b].ix;
      const dy = members[a].iy - members[b].iy;
      const squared = dx * dx + dy * dy;
      squaredDistanceCounts.set(squared, (squaredDistanceCounts.get(squared) || 0) + 1);
      const distance = sampleStep * Math.sqrt(squared);
      sum += distance;
      maximumSquared = Math.max(maximumSquared, squared);
      pairCount += 1;
    }
  }
  if (pairCount === 0) return { pairCount, mean: 0, median: 0, maximum: 0 };
  const sorted = [...squaredDistanceCounts.entries()].sort(([a], [b]) => a - b);
  const lowerIndex = Math.floor((pairCount - 1) / 2);
  const upperIndex = Math.floor(pairCount / 2);
  const select = (index) => {
    let seen = 0;
    for (const [squared, count] of sorted) {
      if (seen + count > index) return sampleStep * Math.sqrt(squared);
      seen += count;
    }
    return 0;
  };
  return {
    pairCount,
    mean: sum / pairCount,
    median: (select(lowerIndex) + select(upperIndex)) / 2,
    maximum: sampleStep * Math.sqrt(maximumSquared)
  };
}

function nodeSequenceSignature(ids) {
  return ids.map((id) => `${id % GRID_SIZE},${Math.floor(id / GRID_SIZE)}`).join(';');
}

function normalizedNodeSequenceSignature(perWriteIds) {
  const nodes = perWriteIds.flat().map((id) => ({ x: id % GRID_SIZE, y: Math.floor(id / GRID_SIZE) }));
  if (nodes.length === 0) return '';
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  return perWriteIds.map((ids) => ids.map((id) => `${id % GRID_SIZE - minX},${Math.floor(id / GRID_SIZE) - minY}`).join('|')).join('/');
}

function nodeRunStats(writes) {
  let repeatedEdges = 0;
  const runs = [];
  let start = 0;
  for (let index = 1; index <= writes.length; index += 1) {
    const same = index < writes.length && writes[index].footprintSignature === writes[start].footprintSignature;
    if (same) {
      repeatedEdges += 1;
      continue;
    }
    let distance = 0;
    for (let cursor = start + 1; cursor < index; cursor += 1) distance += pointDistance(writes[cursor - 1].gridPosition, writes[cursor].gridPosition);
    runs.push({ startOrder: start, endOrder: index - 1, length: index - start, distance });
    start = index;
  }
  return { repeatedEdges, runs };
}

function tangentVariationStats(writes, runs) {
  const variations = [];
  const runSummary = [];
  for (const run of runs) {
    const angles = [];
    for (let index = run.startOrder; index <= run.endOrder; index += 1) angles.push(tangentAt(writes, index));
    const local = [];
    for (let index = 1; index < angles.length; index += 1) local.push(directedAngleDifference(angles[index - 1], angles[index]));
    variations.push(...local);
    runSummary.push({ startOrder: run.startOrder, endOrder: run.endOrder, writes: run.length, tangentRangeRadians: maximumCircularSpan(angles, 2 * Math.PI) });
  }
  return {
    adjacentTangentChanges: variations.length,
    meanAdjacentTangentChangeRadians: variations.length ? mean(variations) : 0,
    maximumAdjacentTangentChangeRadians: variations.length ? Math.max(...variations) : 0,
    maximumWithinRunTangentRangeRadians: Math.max(0, ...runSummary.map((run) => run.tangentRangeRadians)),
    runs: runSummary
  };
}

function summarizeLocalPatternGroups(windows) {
  const groups = new Map();
  for (const window of windows) {
    if (!groups.has(window.normalizedNodePatternSignature)) groups.set(window.normalizedNodePatternSignature, []);
    groups.get(window.normalizedNodePatternSignature).push(window);
  }
  const classes = [...groups.entries()].map(([signature, members]) => {
    const routeShapes = [...new Set(members.map((member) => member.shape))].sort();
    const tangentAngles = members.map((member) => normalizeAngle(member.physicalTangentRadians, Math.PI));
    return {
      signature,
      count: members.length,
      routeShapeCount: routeShapes.length,
      routeShapes,
      physicalTangentRangeRadians: maximumCircularSpan(tangentAngles, Math.PI),
      physicalTangentRangeDegrees: maximumCircularSpan(tangentAngles, Math.PI) * 180 / Math.PI,
      meanFirstMomentDisplacement: mean(members.map((member) => member.firstMomentDisplacement)),
      maxFirstMomentDisplacement: Math.max(...members.map((member) => member.firstMomentDisplacement))
    };
  }).sort((a, b) => b.count - a.count);
  const shared = classes.filter((item) => item.count > 1);
  const crossRoute = classes.filter((item) => item.routeShapeCount > 1);
  return {
    windowCount: windows.length,
    uniqueOrderedNodePatterns: classes.length,
    repeatedPatternWindowCount: shared.reduce((sum, item) => sum + item.count, 0),
    repeatedPatternClassCount: shared.length,
    patternsSharedAcrossRouteShapes: crossRoute.length,
    windowsInCrossRoutePatterns: crossRoute.reduce((sum, item) => sum + item.count, 0),
    maximumPhysicalTangentRangeWithinOnePatternRadians: Math.max(0, ...classes.map((item) => item.physicalTangentRangeRadians)),
    classes
  };
}

function summarizeRouteShapes(arms) {
  const shapes = [...new Set(arms.map((arm) => arm.shape))];
  return Object.fromEntries(shapes.map((shape) => {
    const items = arms.filter((arm) => arm.shape === shape);
    const writes = items.reduce((sum, item) => sum + item.writeEventCount, 0);
    const repeated = items.reduce((sum, item) => sum + item.consecutiveRepeatedSameNodeEdges, 0);
    const transitions = items.reduce((sum, item) => sum + item.nodeIdentityTransitions, 0);
    const travel = items.reduce((sum, item) => sum + item.physicalTravelBetweenWrites, 0);
    return [shape, {
      armCount: items.length,
      writeCount: writes,
      meanUniqueOccupiedNodes: mean(items.map((item) => item.uniqueOccupiedNodeCount)),
      repeatedSameNodeEdges: repeated,
      repeatedSameNodeEdgeFraction: repeated / Math.max(1, items.reduce((sum, item) => sum + item.writeEventCount - 1, 0)),
      nodeIdentityTransitions: transitions,
      meanTravelPerNodeTransition: transitions ? travel / transitions : null,
      longestSameNodePhysicalDistance: Math.max(...items.map((item) => item.longestPhysicalDistanceWithoutNodeChange)),
      meanStoredMassResidual: mean(items.map((item) => item.storedMassResidual)),
      meanFirstMomentDisplacement: mean(items.map((item) => item.firstMomentDisplacement)),
      cappedCellCount: items.reduce((sum, item) => sum + item.cappedCellCount, 0)
    }];
  }));
}

function runLengthDistribution(runs) {
  const counts = new Map();
  for (const run of runs) counts.set(run.length, (counts.get(run.length) || 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a - b));
}

function weightedPositionCentroid(writes) {
  const total = writes.reduce((sum, write) => sum + write.requestedDose, 0);
  if (total === 0) return { x: null, y: null };
  return {
    x: writes.reduce((sum, write) => sum + write.gridPosition.x * write.requestedDose, 0) / total,
    y: writes.reduce((sum, write) => sum + write.gridPosition.y * write.requestedDose, 0) / total
  };
}

function sumPolylineDistance(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += pointDistance(points[index - 1], points[index]);
  return total;
}

function tangentAt(writes, index) {
  const first = writes[Math.max(0, index - 1)].gridPosition;
  const last = writes[Math.min(writes.length - 1, index + 1)].gridPosition;
  return Math.atan2(last.y - first.y, last.x - first.x);
}

function tangentFrom(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function pointDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function directedAngleDifference(a, b) {
  const difference = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return Math.abs(difference);
}

function undirectedAngleDifference(a, b) {
  const difference = ((b - a + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
  return Math.abs(difference);
}

function normalizeAngle(angle, period) {
  return ((angle % period) + period) % period;
}

function maximumCircularSpan(angles, period) {
  if (angles.length < 2) return 0;
  let maximum = 0;
  for (let a = 0; a < angles.length; a += 1) {
    for (let b = a + 1; b < angles.length; b += 1) {
      const raw = Math.abs(angles[a] - angles[b]);
      maximum = Math.max(maximum, Math.min(raw, period - raw));
    }
  }
  return maximum;
}

function countPairs(values, predicate) {
  let count = 0;
  for (let a = 0; a < values.length; a += 1) for (let b = a + 1; b < values.length; b += 1) if (predicate(values[a], values[b])) count += 1;
  return count;
}

function sameNumbers(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function medianSorted(values) {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function decodeRasterFloat32LE(bytes) {
  if (bytes.length % 4 !== 0) throw new Error('Raster byte length is not divisible by Float32 width.');
  const values = new Float32Array(bytes.length / 4);
  for (let index = 0; index < values.length; index += 1) values[index] = bytes.readFloatLE(index * 4);
  return values;
}

function readFixtureFile(relativePath) {
  const fullPath = path.join(EVIDENCE_DIR, 'inputs/qualified-raster-fixture', relativePath);
  if (!existsSync(fullPath)) throw new Error(`Missing packaged qualified fixture input: ${path.relative(SCRIPT_ROOT, fullPath)}`);
  return readFileSync(fullPath);
}

function writeJson(relativePath, value) {
  const fullPath = path.join(EVIDENCE_DIR, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonGzip(relativePath, value) {
  const fullPath = path.join(EVIDENCE_DIR, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, gzipSync(Buffer.from(JSON.stringify(value)), { level: 9, mtime: 0 }));
}

export function runWriterInformationLoss({ root = SCRIPT_ROOT } = {}) {
  const sourceGuard = verifyProductionSourceHashes(root);
  const routeResult = analyzeQualifiedRoutes({ root });
  const singleDab = analyzeSingleDabAssay();
  const displacementSweeps = analyzeDisplacementSweeps();
  const segmentResult = analyzeSegmentFixtures();
  const routeSummary = {
    provenance: routeResult.provenance,
    validation: routeResult.validation,
    arms: routeResult.arms,
    perShape: routeResult.perShape,
    straightP00P01: routeResult.straightP00P01,
    localThreeWritePatterns: routeResult.localThreeWritePatterns
  };
  const result = {
    schema: 'ant-writer-information-loss/v1',
    baselineCommit: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2',
    sourceHashes: sourceGuard.hashes,
    writerConstants: {
      gridWidth: GRID_SIZE,
      gridHeight: GRID_SIZE,
      pitch: GRID_PITCH,
      radius: PRODUCTION_RADIUS,
      diameter: 2 * PRODUCTION_RADIUS,
      radiusToPitch: PRODUCTION_RADIUS / GRID_PITCH,
      diameterToPitch: 2 * PRODUCTION_RADIUS / GRID_PITCH,
      rate: PRODUCTION_RATE,
      dabSpacing: PRODUCTION_DAB_SPACING,
      cap: DEFAULT_CAP
    },
    implementationFacts: {
      depositPointSupportedNodeRule: 'normalized compact Gaussian weights over the in-radius grid nodes; if no node is in support, assign the full amount to the nearest clamped grid node',
      depositSegmentRule: 'midpoint integration with step <= min(grid pitch)/2, each slice sent through the same brush',
      noReaderOrSensorInPrimaryMetrics: true,
      noRngCalls: 0
    },
    singleDab: { ...singleDab, rows: undefined },
    displacementSweeps: displacementSweeps.map(({ samples, ...summary }) => summary),
    segments: {
      lengths: SEGMENT_LENGTHS,
      orientations: ORIENTATIONS,
      exactRasterPairComparisons: segmentResult.orientationPairComparisons,
      symmetryTransforms: segmentResult.transforms,
      phaseTranslation: segmentResult.phaseTranslation,
      arms: segmentResult.records.map(({ brushRecords, ...record }) => record)
    },
    routes: routeSummary,
    dosePreservation: {
      singleDabAllAcceptedExactly: singleDab.rows.every((row) => row.acceptedDose === row.requestedDose),
      routeArmsAllUncapped: routeResult.arms.every((arm) => arm.cappedCellCount === 0),
      routeRequestedAcceptedMaxAbsDifference: Math.max(...routeResult.arms.map((arm) => Math.abs(arm.requestedDose - arm.acceptedDose))),
      routeStoredMassResidualMin: Math.min(...routeResult.arms.map((arm) => arm.storedMassResidual)),
      routeStoredMassResidualMax: Math.max(...routeResult.arms.map((arm) => arm.storedMassResidual)),
      segmentRequestedAcceptedMaxAbsDifference: Math.max(...segmentResult.records.map((arm) => Math.abs(arm.requestedDose - arm.acceptedDose))),
      segmentNoCap: segmentResult.records.every((arm) => arm.metrics.maximumCell < DEFAULT_CAP)
    },
    informationLossClassification: {
      subcellPositionRetention: 'SUPPORTED loss: multiple source coordinates share exact one-node Float32 footprints',
      firstMomentRetention: 'SUPPORTED loss: raster centroid is the nearest node for isolated point deposits; report measured error and grid bound separately',
      localDisplacementResolution: 'SUPPORTED loss: exact raster remains constant across finite subcell displacement intervals',
      localOrientationRetention: 'see fixed short-segment orientation comparisons; do not generalize beyond tested lengths',
      phaseEquivariance: 'PARTIALLY SUPPORTED loss: exact translated route fixture p00/p01 has different source positions but identical raster bytes',
      dosePreservation: 'separate from spatial fidelity; all route arms are uncapped and requested/accepted amounts are compared to stored Float32 mass'
    }
  };
  const singleRows = singleDab.rows;
  delete result.singleDab.rows;
  writeJson('computed/summary.json', result);
  writeJson('validation/source-and-raster-parity.json', {
    passed: true,
    baselineCommit: result.baselineCommit,
    productionSourceHashes: sourceGuard.hashes,
    fixtureCommit: FIXTURE_COMMIT,
    fixtureManifestExpectedSha256: FIXTURE_MANIFEST_SHA256,
    fixtureWriteStreamsExpectedSha256: FIXTURE_WRITE_STREAMS_SHA256,
    fixtureManifestSha256: routeResult.provenance.fixtureManifestSha256,
    fixtureWriteStreamsSha256: routeResult.provenance.fixtureWriteStreamsSha256,
    routeRasterCount: routeResult.provenance.rasterCount,
    exactRasterShaMatchCount: routeResult.arms.length,
    exactProductionWriterReplayCount: routeResult.arms.length,
    totalOrderedPointWrites: routeResult.provenance.writeCount,
    rngCalls: 0
  });
  writeJsonGzip('computed/single-dab-samples.json.gz', singleRows);
  writeJsonGzip('computed/displacement-sweeps.json.gz', displacementSweeps);
  writeJsonGzip('computed/route-writes.json.gz', routeResult.writes);
  writeJsonGzip('computed/route-local-windows.json.gz', routeResult.localWindows);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = runWriterInformationLoss();
    console.log(JSON.stringify({
      output: 'docs/ant/evidence/2026-10-24-ant-writer-information-loss/computed/summary.json',
      fixtureRastersVerified: result.routes.validation.all24StoredRasterHashesVerified,
      routeReplaysExact: result.routes.validation.all24ProductionWriterReplaysExact,
      singleDabRows: result.singleDab.protocol.totalRows,
      segmentArms: result.segments.arms.length,
      routeArms: result.routes.arms.length,
      routeWrites: result.routes.provenance.writeCount
    }, null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
