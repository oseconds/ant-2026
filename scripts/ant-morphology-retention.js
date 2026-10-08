import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const replayDir = resolve(root, 'test-results/ant-morphology-replay');
const movementFile = resolve(root, 'test-results/morphology-movement/summary.json');
const socialDir = resolve(root, 'docs/ant/evidence/2026-10-07-social-graph/data');
const outputDir = resolve(root, 'test-results/morphology-retention');
const SIZE = 96;
const CELL_COUNT = SIZE * SIZE;
const ROUTE_TUBE_RADIUS = 0.03;
const CELL_SIZE = 1 / (SIZE - 1);
const args = new Map(process.argv.slice(2).map(value => {
  const at = value.indexOf('=');
  return at < 0 ? [value, true] : [value.slice(0, at), value.slice(at + 1)];
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

async function main() {
  const replay = resolve(String(args.get('--replay') || replayDir));
  const movement = resolve(String(args.get('--movement') || movementFile));
  const social = resolve(String(args.get('--social') || socialDir));
  const output = resolve(String(args.get('--output') || outputDir));
  const selectedSeeds = args.has('--seeds') ? new Set(String(args.get('--seeds')).split(',').map(Number)) : null;
  const movementSummary = JSON.parse(await readFile(movement, 'utf8'));
  await mkdir(output, { recursive: true });
  const seeds = [];
  for (const movementSeed of movementSummary.seeds.filter(item => !selectedSeeds || selectedSeeds.has(item.seed))) {
    const seed = movementSeed.seed;
    const replaySummary = JSON.parse(await readFile(resolve(replay, `seed${seed}-summary.json`), 'utf8'));
    const snapshotsGzip = await readFile(resolve(replay, `seed${seed}-snapshots.bin.gz`));
    const snapshots = decodeSnapshots(gunzipSync(snapshotsGzip), replaySummary.snapshotEncoding);
    const rawContacts = JSON.parse(gunzipSync(await readFile(resolve(social, `seed${seed}-on-raw-events.json.gz`)))).contacts;
    assert.ok(rawContacts.length > 0, `No archived FOOT_CONTACT groups for seed ${seed}`);
    const windows = movementSeed.windows.flatMap(window => [
      ['medianTortuosity', window.representativeWindows.medianTortuosity],
      ['maximumTortuosity', window.representativeWindows.maximumTortuosity],
      ...Object.entries(window.representativeWindows.byCategory).map(([category, representative]) => [`category:${category}`, representative])
    ].filter(([, representative]) => representative).map(([selectionRole, representative]) =>
      analyzeRepresentative({ seed, windowSeconds: window.windowSeconds, selectionRole,
        representative, snapshots, rawContacts })));
    const contactSpace = { scales: Object.fromEntries([0.03, 0.10, 0.25].map(cellSize => [cellSize,
      { wholeRun: summarizeContactSpace(rawContacts, cellSize), checkpoints: [30, 60, 120, 300, 600]
        .map(seconds => {
          const sampled = nearestSnapshot(snapshots, seconds), through = sampled?.seconds ?? seconds;
          return { requestedSeconds: seconds, sampledSeconds: sampled?.seconds ?? null,
            offsetSeconds: sampled ? through - seconds : null,
            cumulative: summarizeContactSpace(rawContacts, cellSize, through),
            recent20Seconds: summarizeContactSpace(rawContacts, cellSize, through, Math.max(0, through - 20)) };
        }) }])) };
    const environmentCheckpoints = [30, 60, 120, 300, 600].map(seconds => {
      const sampled = nearestSnapshot(snapshots, seconds), through = sampled?.seconds ?? seconds;
      return { requestedSeconds: seconds, sampledSeconds: sampled?.seconds ?? null,
        offsetSeconds: sampled ? through - seconds : null,
        scales: Object.fromEntries([0.03, 0.10, 0.25].map(cellSize => [cellSize,
          { cumulative: summarizeMatchedCoverage(rawContacts, sampled?.data, through, cellSize, 0),
            recent20Seconds: summarizeMatchedCoverage(rawContacts, sampled?.data,
              through, cellSize, Math.max(0, through - 20)) }])) };
    });
    const selectedTimes = new Set(windows.flatMap(window => window.fields
      .filter(field => field.available).map(field => field.sampledSeconds)));
    for (const seconds of [30, 60, 120, 300, 600]) {
      const sampled = nearestSnapshot(snapshots, seconds);
      if (sampled) selectedTimes.add(sampled.seconds);
    }
    const fullSnapshotPath = resolve(replay, `seed${seed}-snapshots.bin.gz`);
    const fullSnapshotGzip = await readFile(fullSnapshotPath);
    const fullSnapshotBytes = gunzipSync(fullSnapshotGzip);
    const fullRowCount = replaySummary.snapshotEncoding.descriptors.length;
    const subset = serializeSnapshotSubset(snapshots, replaySummary.snapshotEncoding, selectedTimes);
    const subsetDecoded = decodeSnapshots(gunzipSync(subset.gzip), subset.encoding);
    for (const seconds of selectedTimes) for (const key of subset.encoding.arrayOrder) {
      assert.ok(subsetDecoded.get(seconds)[key].equals(snapshots.get(seconds)[key]),
        `Selected ${key} snapshot at ${seconds}s changed during compaction`);
    }
    replaySummary.snapshotEncoding = { ...replaySummary.snapshotEncoding,
      descriptors: subset.encoding.descriptors };
    const summaryGzip = gzipSync(Buffer.from(`${JSON.stringify(replaySummary)}\n`), { level: 6 });
    const summaryName = `seed${seed}-summary.json.gz`, snapshotName = `seed${seed}-snapshots.bin.gz`;
    await writeFile(resolve(output, summaryName), summaryGzip);
    await writeFile(resolve(output, snapshotName), subset.gzip);
    const compactEvidence = { fullSnapshot: { file: `seed${seed}-snapshots.bin.gz`,
      compressedBytes: fullSnapshotGzip.length, uncompressedBytes: fullSnapshotBytes.length,
      compressedSha256: sha256(fullSnapshotGzip), uncompressedSha256: sha256(fullSnapshotBytes),
      fullRowCount },
      selectedSnapshot: { summaryFile: summaryName, file: snapshotName, rowCount: subset.encoding.descriptors.length,
        compressedBytes: subset.gzip.length, uncompressedBytes: subset.bytes.length,
        compressedSha256: sha256(subset.gzip), uncompressedSha256: sha256(subset.bytes),
        exactDecodedArraysVerified: true } };
    seeds.push({ seed, archiveContactGroups: rawContacts.length,
      archiveFootPoints: rawContacts.reduce((n, event) => n + event.contacts.length, 0),
      replaySnapshotCount: snapshots.size, compactEvidence, funnel: summarizeFunnel(replaySummary),
      contactSpace, environmentCheckpoints, windows });
  }
  const result = { schemaVersion: 1, provenance: {
    movementArtifact: movement, replayDirectory: replay, contactArchive: social,
    routeTubeRadius: ROUTE_TUBE_RADIUS, routeTubeRadiusNote: 'Analyst-selected 0.03 normalized units; spatial association only.',
    fieldGrid: `${SIZE}x${SIZE}, row-major, x=column/95, y=row/95`,
    timing: 'Compare sampled route tube at window start, end, and end+20s using the nearest recorded analysis sample within 1s; actual sample time and signed offset are recorded. Start time 0 has no snapshot and is marked unavailable. Contacts are all archived actual foot positions; tube matches are spatial, not causal.',
    limits: ['Representative traces are selected movement examples, not a population sample.',
      'Chemical, surface, and support summaries are spatial associations around sampled center paths.',
      'Contact recurrence describes accumulated colony traffic, not the cause of any individual route or birth.',
      'Raw surface compaction at .015 is a descriptive proxy, not equivalent to TrailPlateBirth mechanical support. Exact support is zero where chemical did not qualify, so it cannot establish mechanical absence there.',
      'Cumulative contact coverage and 20s contact coverage are both reported; compare the latter with leaky chemicalMemory as the closer temporal horizon. Coarse-grid binary coverage marks a cell positive when any mapped 96x96 sample crosses threshold; overlap metrics are descriptive associations.']
  }, seeds };
  await writeFile(resolve(output, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ output: resolve(output, 'summary.json'), seeds: seeds.map(seed => ({ seed: seed.seed,
    contactGroups: seed.archiveContactGroups, footPoints: seed.archiveFootPoints, routeWindows: seed.windows.length })) }));
}

function decodeSnapshots(bytes, encoding) {
  assert.equal(encoding?.arrayOrder?.join(','), 'chemical,chemicalMemory,surface,support,contactCounts');
  const decoded = new Map();
  const previous = new Map();
  for (const descriptor of encoding.descriptors) {
    const arrays = {};
    for (const key of encoding.arrayOrder) {
      const { offset, bytes: length } = descriptor.arrays[key];
      assert.equal(length, CELL_COUNT * 4, `${key} snapshot byte length`);
      const delta = bytes.subarray(offset, offset + length);
      assert.equal(delta.length, length, `${key} snapshot range`);
      const value = Buffer.from(delta);
      const prior = previous.get(key);
      if (prior) for (let i = 0; i < value.length; i += 1) value[i] ^= prior[i];
      previous.set(key, value);
      arrays[key] = value;
    }
    decoded.set(descriptor.timeSeconds, arrays);
  }
  return decoded;
}

function serializeSnapshotSubset(snapshots, fullEncoding, selectedTimes) {
  const arrayOrder = fullEncoding.arrayOrder;
  const chunks = [], previous = new Map(), descriptors = [];
  let offset = 0;
  for (const source of fullEncoding.descriptors.filter(item => selectedTimes.has(item.timeSeconds))) {
    const arrays = {};
    for (const key of arrayOrder) {
      const bytes = snapshots.get(source.timeSeconds)[key];
      const encoded = Buffer.from(bytes), prior = previous.get(key);
      if (prior) for (let index = 0; index < encoded.length; index += 1) encoded[index] ^= prior[index];
      arrays[key] = { offset, bytes: encoded.length };
      chunks.push(encoded); offset += encoded.length; previous.set(key, bytes);
    }
    descriptors.push({ tick: source.tick, timeSeconds: source.timeSeconds, arrays });
  }
  assert.equal(descriptors.length, selectedTimes.size, 'Every selected snapshot time exists in the replay encoding');
  const bytes = Buffer.concat(chunks);
  return { bytes, gzip: gzipSync(bytes, { level: 6 }), encoding: { ...fullEncoding, descriptors } };
}

function analyzeRepresentative({ seed, windowSeconds, selectionRole = null, representative, snapshots, rawContacts }) {
  const points = representative.points || representative.coordinates || representative.pathPoints;
  assert.ok(Array.isArray(points) && points.length >= 2, 'Representative trace must contain sampled [x,y] points');
  const xy = points.map(point => Array.isArray(point) ? point : [point.x, point.y]);
  const tube = makeTube(xy, ROUTE_TUBE_RADIUS);
  const start = representative.startSeconds;
  const end = start + windowSeconds;
  const times = [start, end, end + 20];
  const fieldAt = times.map(seconds => {
    const sampled = nearestSnapshot(snapshots, seconds);
    const data = sampled?.data;
    return { requestedSeconds: seconds, sampledSeconds: sampled?.seconds ?? null,
      offsetSeconds: sampled ? sampled.seconds - seconds : null, available: Boolean(data),
      ...(data ? summarizeFields(tube, data) : {}) };
  });
  const matchedContacts = rawContacts.filter(event => event.simulationTimeMs / 1000 >= start
    && event.simulationTimeMs / 1000 <= end && event.contacts.some(contact => tubeContains(tube, contact.position.x, contact.position.y)));
  const eventTimes = [...new Set(matchedContacts.map(event => Math.floor(event.simulationTimeMs / 1000)))];
  const footPoints = matchedContacts.reduce((sum, event) => sum + event.contacts.filter(contact =>
    tubeContains(tube, contact.position.x, contact.position.y)).length, 0);
  return { seed, windowSeconds, selectionRole, category: representative.category || null,
    antId: representative.antId, startSeconds: start, endSeconds: end,
    movementMetrics: representative.metrics, sampledTracePoints: xy.length, uniqueTubeCells: tube.size,
    fields: fieldAt, archivedTraffic: { contactGroupsWithAnyFootInTube: matchedContacts.length,
      footPointsInTube: footPoints, distinctContactSeconds: eventTimes.length,
      distinctAnts: new Set(matchedContacts.map(event => event.antId)).size,
      distinctLegIds: new Set(matchedContacts.flatMap(event => event.contacts.filter(contact =>
        tubeContains(tube, contact.position.x, contact.position.y)).map(contact => contact.legId))).size } };
}

function nearestSnapshot(snapshots, seconds) {
  if (seconds <= 0) return null;
  const sampledSeconds = [...snapshots.keys()].sort((a, b) => Math.abs(a - seconds) - Math.abs(b - seconds)
    || b - a)[0];
  if (sampledSeconds === undefined || Math.abs(sampledSeconds - seconds) > 1 + 1e-9) return null;
  const data = snapshots.get(sampledSeconds);
  return data ? { seconds: sampledSeconds, data } : null;
}

function makeTube(points, radius) {
  const cells = new Set();
  const step = CELL_SIZE / 2;
  for (let segment = 1; segment < points.length; segment += 1) {
    const [x0, y0] = points[segment - 1], [x1, y1] = points[segment];
    const distance = Math.hypot(x1 - x0, y1 - y0);
    const count = Math.max(1, Math.ceil(distance / step));
    for (let n = 0; n <= count; n += 1) {
      const t = n / count;
      addDiskCells(cells, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius);
    }
  }
  return cells;
}

function addDiskCells(cells, x, y, radius) {
  const minX = Math.max(0, Math.floor((x - radius) / CELL_SIZE));
  const maxX = Math.min(SIZE - 1, Math.ceil((x + radius) / CELL_SIZE));
  const minY = Math.max(0, Math.floor((y - radius) / CELL_SIZE));
  const maxY = Math.min(SIZE - 1, Math.ceil((y + radius) / CELL_SIZE));
  for (let row = minY; row <= maxY; row += 1) for (let column = minX; column <= maxX; column += 1) {
    const cx = column * CELL_SIZE, cy = row * CELL_SIZE;
    if (pointSegmentDistance(cx, cy, x, y, x, y) <= radius + CELL_SIZE * Math.SQRT2 / 2) cells.add(row * SIZE + column);
  }
}

function tubeContains(tube, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return false;
  const column = Math.max(0, Math.min(SIZE - 1, Math.round(x / CELL_SIZE)));
  const row = Math.max(0, Math.min(SIZE - 1, Math.round(y / CELL_SIZE)));
  return tube.has(row * SIZE + column);
}

function summarizeFields(tube, arrays) {
  const chemical = [], surface = [], support = [], contactCounts = [];
  for (const index of tube) {
    chemical.push(arrays.chemical.readFloatLE(index * 4));
    surface.push(arrays.surface.readFloatLE(index * 4));
    support.push(arrays.support.readFloatLE(index * 4));
    contactCounts.push(arrays.contactCounts.readUInt32LE(index * 4));
  }
  const chemicalMemory = [...tube].map(index => arrays.chemicalMemory.readFloatLE(index * 4));
  return { chemical: distribution(chemical), chemicalMemory: distribution(chemicalMemory), surface: distribution(surface),
    support: distribution(support), chemicalAndSupportQualifiedFraction: support.filter(value => value >= 0.015).length / support.length,
    cumulativeFootContactCounts: distribution(contactCounts) };
}

function summarizeContactSpace(events, cellSize = CELL_SIZE, throughSeconds = Infinity, fromSeconds = 0) {
  const columns = Math.ceil(1 / cellSize);
  const cells = new Map();
  let outOfDomainFootPoints = 0;
  for (const event of events) {
    const eventSeconds = event.simulationTimeMs / 1000;
    if (eventSeconds > throughSeconds || eventSeconds < fromSeconds) continue;
    for (const contact of event.contacts) {
      const { x, y } = contact.position;
      if (x < 0 || x > 1 || y < 0 || y > 1) { outOfDomainFootPoints += 1; continue; }
      const column = Math.min(columns - 1, Math.floor(x / cellSize));
      const row = Math.min(columns - 1, Math.floor(y / cellSize));
      const index = row * columns + column;
      let record = cells.get(index);
      if (!record) cells.set(index, record = { groups: 0, seconds: new Set(), ants: new Set() });
      record.groups += 1;
      record.seconds.add(Math.floor(event.simulationTimeMs / 1000));
      record.ants.add(event.antId);
    }
  }
  const repeated = new Set([...cells].filter(([, record]) => record.seconds.size >= 2).map(([index]) => index));
  const componentSizes = componentSizes8(repeated, columns);
  return { cellSize, throughSeconds: Number.isFinite(throughSeconds) ? throughSeconds : null,
    occupiedCells: cells.size, repeatCellsAtLeastTwoSeconds: repeated.size,
    repeatComponentsEightNeighbor: componentSizes.length, repeatComponentCellCounts: componentSizes,
    medianDistinctContactSecondsPerCell: quantile([...cells.values()].map(record => record.seconds.size), 0.5),
    p90DistinctContactSecondsPerCell: quantile([...cells.values()].map(record => record.seconds.size), 0.9),
    maxDistinctAntsPerCell: Math.max(0, ...[...cells.values()].map(record => record.ants.size)),
    outOfDomainFootPoints,
    repeatDefinition: 'At least one actual foot contact in each of two distinct integer simulation-second bins; out-of-domain feet are excluded.' };
}

function componentCount(cells) {
  return componentSizes8(cells, SIZE).length;
}

function componentSizes8(cells, columns) {
  const unseen = new Set(cells), sizes = [];
  while (unseen.size) {
    const queue = [unseen.values().next().value]; unseen.delete(queue[0]);
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head], row = Math.floor(index / columns), column = index % columns;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const x = column + dx, y = row + dy;
        if (x < 0 || x >= columns || y < 0 || y >= columns) continue;
        const adjacent = y * columns + x;
        if (unseen.delete(adjacent)) queue.push(adjacent);
      }
    }
    sizes.push(queue.length);
  }
  return sizes.sort((a, b) => b - a);
}

function summarizeMatchedCoverage(events, arrays, seconds, cellSize, fromSeconds) {
  if (!arrays) return { available: false };
  const columns = Math.ceil(1 / cellSize), count = columns * columns;
  const contact = new Uint8Array(count), chemical = new Uint8Array(count), surface = new Uint8Array(count);
  const jointSupport = new Uint8Array(count);
  for (const event of events) {
    const eventSeconds = event.simulationTimeMs / 1000;
    if (eventSeconds > seconds || eventSeconds < fromSeconds) continue;
    for (const foot of event.contacts) {
      const { x, y } = foot.position;
      if (x < 0 || x > 1 || y < 0 || y > 1) continue;
      const index = Math.min(columns - 1, Math.floor(y / cellSize)) * columns
        + Math.min(columns - 1, Math.floor(x / cellSize));
      contact[index] = 1;
    }
  }
  for (let row = 0; row < SIZE; row += 1) for (let column = 0; column < SIZE; column += 1) {
    const x = column / (SIZE - 1), y = row / (SIZE - 1);
    const target = Math.min(columns - 1, Math.floor(y / cellSize)) * columns
      + Math.min(columns - 1, Math.floor(x / cellSize));
    const offset = (row * SIZE + column) * 4;
    if (arrays.chemicalMemory.readFloatLE(offset) >= 0.30) chemical[target] = 1;
    if (arrays.surface.readFloatLE(offset) >= 0.015) surface[target] = 1;
    if (arrays.support.readFloatLE(offset) >= 0.015) jointSupport[target] = 1;
  }
  return { cellSize, contactFromSeconds: fromSeconds, contactThroughSeconds: seconds,
    contactCells: sum(contact), chemicalMemoryCellsAtOrAbove030: sum(chemical),
    surfaceCompactionCellsAtOrAbove015: sum(surface), jointChemicalSupportCells: sum(jointSupport),
    contactChemicalJaccard: binaryJaccard(contact, chemical),
    contactSurfaceCompactionJaccard: binaryJaccard(contact, surface),
    contactJointSupportJaccard: binaryJaccard(contact, jointSupport), coverageDenominatorCells: count,
    note: 'Coarse cells are positive if any mapped 96x96 sample crosses threshold; Jaccard is spatial association, not causal attribution. Raw surface threshold .015 is not the TrailPlateBirth support rule.' };
}

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? { n: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    median: quantile(sorted, 0.5), p90: quantile(sorted, 0.9), max: sorted.at(-1) }
    : { n: 0, mean: null, median: null, p90: null, max: null };
}
function quantile(sorted, q) { return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))] ?? 0; }
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function binaryJaccard(a, b) {
  let intersection = 0, union = 0;
  for (let i = 0; i < a.length; i += 1) { intersection += a[i] & b[i]; union += a[i] | b[i]; }
  return union ? intersection / union : null;
}
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function summarizeFunnel(replaySummary) {
  const rows = replaySummary.morphology || [];
  const componentTotals = { observations: 0, missingSource: 0, missingBoundary: 0, belowMinGeodesic: 0,
    eligible: 0, sourceTargetOverlap: 0 };
  const eligiblePruned = [], chosenPruned = [];
  const gateCounts = { noCandidate: 0, persistence: 0, globalGap: 0, refractory: 0,
    newContact: 0, capacity: 0, ready: 0, born: 0 };
  const chemicalQualified = [], supported = [];
  let eligibleWinners = 0, eligibleLosers = 0;
  for (const row of rows) {
    chemicalQualified.push(row.inputDiagnostics?.chemicalQualifiedCells ?? 0);
    supported.push(row.inputDiagnostics?.supportedCells ?? 0);
    if (row.bornThisTick) gateCounts.born += 1;
    else if (!row.funnel?.candidateComponentCount) gateCounts.noCandidate += 1;
    else if (!row.checks?.persistenceQualified) gateCounts.persistence += 1;
    else if (!row.checks?.globalGapOpen) gateCounts.globalGap += 1;
    else if (!row.checks?.sameCorridorRefractoryOpen) gateCounts.refractory += 1;
    else if (!row.checks?.enoughNewFootContacts) gateCounts.newContact += 1;
    else if (!row.checks?.belowBirthCap) gateCounts.capacity += 1;
    else gateCounts.ready += 1;

    const funnel = row.funnel || {};
    const candidates = funnel.candidates || [];
    for (const component of funnel.components || []) {
      componentTotals.observations += 1;
      if (component.sourceCount > 0 && component.boundaryCount > 0) componentTotals.sourceTargetOverlap += 1;
      if (component.rejection === 'missing-source') componentTotals.missingSource += 1;
      else if (component.rejection === 'missing-boundary-target') componentTotals.missingBoundary += 1;
      else if (component.rejection === 'below-min-geodesic') componentTotals.belowMinGeodesic += 1;
      else if (!component.rejection) componentTotals.eligible += 1;
    }
    eligibleWinners += funnel.winner >= 0 ? 1 : 0;
    eligibleLosers += Math.max(0, candidates.length - (funnel.winner >= 0 ? 1 : 0));
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const unretained = Math.max(0, candidate.prePruneSkeletonIndices.length - candidate.networkIndices.length);
      eligiblePruned.push(unretained);
      if (index === funnel.winner) chosenPruned.push(unretained);
    }
  }
  return { analysisCount: rows.length,
    componentObservations: { ...componentTotals,
      note: 'Repeated per-second component observations, not unique spatial regions. Categories are disjoint except sourceTargetOverlap, which is a separate descriptive count.' },
    eligibleCandidateComponentObservations: { winners: eligibleWinners, eligibleLosers },
    firstFailedGateCounts: { ...gateCounts,
      note: 'Born-now takes priority. Otherwise this records the first current failing gate in production order; counts are not independent counterfactual causal effects.' },
    unretainedSkeletonPixels: { allEligibleNetworks: distribution(eligiblePruned), chosenNetworksOnly: distribution(chosenPruned),
      definition: 'Pre-prune component skeleton pixels minus retained network pixels; not a count of dead-end branches.' },
    inputCellCountDistributions: { chemicalQualified: distribution(chemicalQualified), supported: distribution(supported) }
  };
}
function pointSegmentDistance(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / length)) : 0;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
export { analyzeRepresentative, componentCount, decodeSnapshots, makeTube, serializeSnapshotSubset, summarizeContactSpace, summarizeFunnel, summarizeMatchedCoverage };
