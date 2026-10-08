import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRepresentative, componentCount, decodeSnapshots, makeTube, serializeSnapshotSubset, summarizeContactSpace, summarizeFunnel, summarizeMatchedCoverage } from '../scripts/ant-morphology-retention.js';
import { gunzipSync } from 'node:zlib';

const N = 96 * 96;

test('snapshot XOR decoder restores exact typed field bytes and EMA chemical memory', () => {
  const raw = {
    chemical: floatBuffer(0.04), chemicalMemory: floatBuffer(0.25), surface: floatBuffer(0.2),
    support: floatBuffer(0.02), contactCounts: uintBuffer(3)
  };
  const next = { ...raw, chemical: floatBuffer(0.08) };
  const chunks = [];
  const descriptors = [];
  let offset = 0;
  let prior = null;
  for (const [time, arrays] of [[1, raw], [2, next]]) {
    const entries = {};
    for (const key of ['chemical', 'chemicalMemory', 'surface', 'support', 'contactCounts']) {
      const current = arrays[key];
      const encoded = Buffer.from(current);
      if (prior) for (let i = 0; i < encoded.length; i += 1) encoded[i] ^= prior[key][i];
      entries[key] = { offset, bytes: encoded.length };
      chunks.push(encoded); offset += encoded.length;
    }
    descriptors.push({ tick: time * 60, timeSeconds: time, arrays: entries });
    prior = Object.fromEntries(Object.entries(arrays).map(([key, value]) => [key, Buffer.from(value)]));
  }
  const decoded = decodeSnapshots(Buffer.concat(chunks), { arrayOrder: ['chemical', 'chemicalMemory', 'surface', 'support', 'contactCounts'], descriptors });
  assert.ok(Math.abs(decoded.get(1).chemical.readFloatLE(0) - 0.04) < 1e-7);
  assert.ok(Math.abs(decoded.get(2).chemical.readFloatLE(0) - 0.08) < 1e-7);
  assert.ok(Math.abs(decoded.get(2).chemicalMemory.readFloatLE(0) - 0.25) < 1e-7);
  assert.equal(decoded.get(2).contactCounts.readUInt32LE(0), 3);
  assert.ok(Math.abs(decoded.get(1).chemicalMemory.readFloatLE(0) - 0.25) < 1e-7);
});

test('compact snapshot subset retains selected exact rows and drops unselected rows', () => {
  const first = { chemical: floatBuffer(0.1), chemicalMemory: floatBuffer(0.2), surface: floatBuffer(0.3),
    support: floatBuffer(0.04), contactCounts: uintBuffer(8) };
  const second = { ...first, surface: floatBuffer(0.5) };
  const snapshots = new Map([[1, first], [2, second]]);
  const encoding = { arrayOrder: ['chemical', 'chemicalMemory', 'surface', 'support', 'contactCounts'], descriptors: [
    { tick: 60, timeSeconds: 1, arrays: {} }, { tick: 120, timeSeconds: 2, arrays: {} }
  ] };
  const subset = serializeSnapshotSubset(snapshots, encoding, new Set([2]));
  const decoded = decodeSnapshots(gunzipSync(subset.gzip), subset.encoding);
  assert.deepEqual([...decoded.keys()], [2]);
  for (const key of encoding.arrayOrder) assert.ok(decoded.get(2)[key].equals(second[key]));
});

test('representative trace summarizes sampled environment and all-ant foot traffic spatially', () => {
  const cell = Math.round(0.5 * 95) + 48 * 96;
  const arrays = { chemical: floatBuffer(0.1), chemicalMemory: floatBuffer(0.4), surface: floatBuffer(0.2),
    support: floatBuffer(0.02), contactCounts: uintBuffer(5) };
  const snapshots = new Map([[1.0166667, arrays], [2.0166667, arrays], [22.0166667, arrays]]);
  const representative = { antId: 'ant-1', startSeconds: 1, coordinates: [[0.49, 0.5], [0.51, 0.5]],
    metrics: { tortuosity: 1.2 } };
  const contacts = [{ antId: 'ant-2', simulationTimeMs: 1500, contacts: [
    { legId: 'FL', position: { x: 0.5, y: 0.5 } },
    { legId: 'FR', position: { x: 0.52, y: 0.5 } },
    { legId: 'RL', position: { x: -0.01, y: 0.5 } }
  ] }];
  const result = analyzeRepresentative({ seed: 7, windowSeconds: 1, selectionRole: 'maximumTortuosity',
    representative, snapshots, rawContacts: contacts });
  assert.ok(Math.abs(result.fields[0].chemicalMemory.median - 0.4) < 1e-7);
  assert.equal(result.selectionRole, 'maximumTortuosity');
  assert.equal(result.archivedTraffic.contactGroupsWithAnyFootInTube, 1);
  assert.equal(result.archivedTraffic.footPointsInTube, 2);
  assert.equal(result.fields.length, 3);
  assert.ok(result.uniqueTubeCells > 0);
  assert.ok(cell >= 0);
});

test('contact recurrence components use 8-neighbor connectivity and actual distinct seconds', () => {
  assert.equal(componentCount(new Set([0, 1, 97, 400])), 2);
  const events = [
    { antId: 'ant-1', simulationTimeMs: 100, contacts: [{ position: { x: 0.2, y: 0.2 } }] },
    { antId: 'ant-2', simulationTimeMs: 2100, contacts: [{ position: { x: 0.2, y: 0.2 } }] },
    { antId: 'ant-3', simulationTimeMs: 2300, contacts: [{ position: { x: 0.8, y: 0.8 } }] }
  ];
  const stats = summarizeContactSpace(events);
  assert.equal(stats.occupiedCells, 2);
  assert.equal(stats.repeatCellsAtLeastTwoSeconds, 1);
  assert.equal(stats.repeatComponentsEightNeighbor, 1);
  assert.equal(stats.maxDistinctAntsPerCell, 2);
  const coverage = summarizeMatchedCoverage(events, { chemicalMemory: floatBuffer(0.4),
    surface: floatBuffer(0.2), support: floatBuffer(0.02) }, 3, 0.25);
  assert.equal(coverage.contactCells, 2);
  assert.equal(coverage.chemicalMemoryCellsAtOrAbove030, 16);
  assert.ok(coverage.contactChemicalJaccard > 0);
});

test('tube includes route-adjacent cells at the declared scale', () => {
  const tube = makeTube([[0.2, 0.2], [0.4, 0.2]], 0.03);
  assert.ok(tube.size > 0);
  assert.ok(tube.size < N);
});

test('funnel reduction counts repeated component observations and prioritizes births', () => {
  const candidate = { prePruneSkeletonIndices: Array(10).fill(1), networkIndices: Array(7).fill(1) };
  const summary = summarizeFunnel({ morphology: [
    { inputDiagnostics: { chemicalQualifiedCells: 4, supportedCells: 2 }, funnel: { candidateComponentCount: 0,
      components: [{ sourceCount: 0, boundaryCount: 1, rejection: 'missing-source' },
        { sourceCount: 1, boundaryCount: 1, rejection: 'below-min-geodesic' }] } },
    { inputDiagnostics: { chemicalQualifiedCells: 8, supportedCells: 3 }, bornThisTick: true,
      checks: { persistenceQualified: true, globalGapOpen: false }, funnel: { candidateComponentCount: 2,
        winner: 0, components: [{ sourceCount: 1, boundaryCount: 1, rejection: null }],
        candidates: [candidate, { prePruneSkeletonIndices: Array(8).fill(1), networkIndices: Array(6).fill(1) }] } },
    { inputDiagnostics: { chemicalQualifiedCells: 2, supportedCells: 0 }, bornThisTick: false,
      checks: { persistenceQualified: true, globalGapOpen: false }, funnel: { candidateComponentCount: 1,
        winner: 0, components: [{ sourceCount: 1, boundaryCount: 1, rejection: null }],
        candidates: [{ prePruneSkeletonIndices: [1, 2], networkIndices: [1, 2] }] } }
  ] });
  assert.equal(summary.analysisCount, 3);
  assert.equal(summary.componentObservations.observations, 4);
  assert.equal(summary.componentObservations.eligible, 2);
  assert.equal(summary.componentObservations.missingSource, 1);
  assert.equal(summary.componentObservations.belowMinGeodesic, 1);
  assert.equal(summary.firstFailedGateCounts.noCandidate, 1);
  assert.equal(summary.firstFailedGateCounts.born, 1);
  assert.equal(summary.firstFailedGateCounts.globalGap, 1);
  assert.equal(summary.eligibleCandidateComponentObservations.eligibleLosers, 1);
  assert.equal(summary.unretainedSkeletonPixels.chosenNetworksOnly.mean, 1.5);
  assert.deepEqual(summary.firstFailedGateCounts.born + summary.firstFailedGateCounts.globalGap
    + summary.firstFailedGateCounts.noCandidate, 3);
});

function floatBuffer(value) {
  const array = new Float32Array(N); array.fill(value);
  return Buffer.from(array.buffer);
}
function uintBuffer(value) {
  const array = new Uint32Array(N); array.fill(value);
  return Buffer.from(array.buffer);
}
