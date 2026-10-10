import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { gunzipSync, gzipSync } from 'node:zlib';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';
import { TRAIL_PLATE_CHEMICAL_THRESHOLD, TRAIL_PLATE_SUPPORT_RADIUS } from '../src/lib/agents/ant/TrailPlateBirth.js';
import { createW1Crystallizer } from './ant-w1-crystallization.js';
import { createMaxOverlapCrystallizer } from './ant-w1-max-overlap-crystallization.js';
import { loadSeedInputs } from './ant-w1-inputs.js';
import { gridIndex, reconstructFlags } from './ant-w1-raw-field-contact-audit.js';

export const PACKAGE = 'docs/ant/evidence/2026-10-10-w1-post-contact-field-retention-audit';
export const STARTING_HEAD = 'eb520969fd88fb8c60deb6b46c96f7afd7dfff3f';
const REPLAY = 'test-results/ant-interior-endpoint-shadow';
const REPLAY_EVIDENCE = 'docs/ant/evidence/2026-10-08-interior-endpoint-shadow';
const FIELD_PACKAGE = 'docs/ant/evidence/2026-10-08-w1-episodic-material-shadow';
const CONTACT_PACKAGE = 'docs/ant/evidence/2026-10-07-social-graph';
const PRIOR_AUDIT = 'docs/ant/evidence/2026-10-10-w1-raw-field-contact-history-audit';
const SPLIT_PACKAGE = 'docs/ant/evidence/2026-10-09-w1-max-overlap-split-shadow';
const CELL_PACKAGE = 'docs/ant/evidence/2026-10-09-w1-per-cell-formation-history';
const SPATIAL_PACKAGE = 'docs/ant/evidence/2026-10-09-w1-spatiotemporal-local-coherence-audit';
const SEEDS = [20261005, 20261006, 20261007];
const WIDTH = 96, HEIGHT = 96, CELLS = WIDTH * HEIGHT, DT = 1 / 60;
const DT_MS = DT * 1000, SURFACE_HALF_LIFE_SECONDS = 1800, LN_TWO = Math.LN2;
const CONTACT_DOSE = 0.025, SURFACE_RADIUS = 0.012, AGE_BANDS = ['never', '0-20', '20-90', '>90'];
const TARGETS = [120, 300, 480, 599.25];
const ARRAY_ORDER = ['chemical', 'chemicalMemory', 'surface', 'support', 'contactCounts'];
const FIELD_KEYS = ['chemicalMemory', 'surface', 'support'];
const FIELD_RANGES = { chemicalMemory: [0, 0.9519418], surface: [0, 0.9761037], support: [0, 0.9651266] };
const MAGNITUDE_BINS = 8;
const sha = value => createHash('sha256').update(value).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

export function contactAgeBand(ageSeconds) {
  if (ageSeconds === null || ageSeconds === undefined) return 'never';
  assert.ok(Number.isFinite(ageSeconds) && ageSeconds >= 0);
  if (ageSeconds <= 20) return '0-20';
  if (ageSeconds <= 90) return '20-90';
  return '>90';
}

export function causalContactAge(timeSeconds, lastContactSeconds) {
  assert.ok(Number.isFinite(timeSeconds) && timeSeconds >= 0);
  if (lastContactSeconds === null || lastContactSeconds === undefined) return null;
  assert.ok(Number.isFinite(lastContactSeconds) && lastContactSeconds >= 0 && lastContactSeconds <= timeSeconds,
    'contact age uses no future contact');
  return timeSeconds - lastContactSeconds;
}

export function surfaceFootprintCellIndices(position, { width = WIDTH, height = HEIGHT, radius = SURFACE_RADIUS } = {}) {
  assert.ok(Number.isInteger(width) && width >= 2 && Number.isInteger(height) && height >= 2);
  assert.ok(Number.isFinite(radius) && radius > 0);
  assert.ok(Number.isFinite(position?.x) && Number.isFinite(position?.y));
  assert.ok(position.x >= 0 && position.x <= 1 && position.y >= 0 && position.y <= 1);
  const gx = position.x * (width - 1), gy = position.y * (height - 1);
  const minX = Math.max(0, Math.floor(gx - radius * (width - 1)));
  const maxX = Math.min(width - 1, Math.ceil(gx + radius * (width - 1)));
  const minY = Math.max(0, Math.floor(gy - radius * (height - 1)));
  const maxY = Math.min(height - 1, Math.ceil(gy + radius * (height - 1)));
  const cells = [];
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    if (Math.hypot(x / (width - 1) - position.x, y / (height - 1) - position.y) <= radius) cells.push(y * width + x);
  }
  if (!cells.length) cells.push(Math.max(0, Math.min(height - 1, Math.round(gy))) * width
    + Math.max(0, Math.min(width - 1, Math.round(gx))));
  return cells;
}

export function contactExposure(sameCellPoints, surfaceFootprintPoints) {
  assert.ok(Number.isSafeInteger(sameCellPoints) && sameCellPoints >= 0);
  assert.ok(Number.isSafeInteger(surfaceFootprintPoints) && surfaceFootprintPoints >= sameCellPoints);
  if (sameCellPoints > 0) return 'same-cell';
  return surfaceFootprintPoints > 0 ? 'neighbor-footprint-only' : 'no-surface-footprint';
}

export function fixedMagnitudeBin(value, field, bins = MAGNITUDE_BINS) {
  assert.ok(Number.isFinite(value));
  const range = FIELD_RANGES[field];
  assert.ok(range && Number.isInteger(bins) && bins > 0);
  const [min, max] = range;
  return Math.max(0, Math.min(bins - 1, Math.floor((value - min) / (max - min) * bins)));
}

function csvLine(values) {
  return values.map(value => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[,"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(',') + '\n';
}

function basicStats() {
  return { n: 0, mean: 0, m2: 0, min: Infinity, max: -Infinity, positive: 0, negative: 0, zero: 0 };
}

function addValue(stats, value) {
  assert.ok(Number.isFinite(value));
  stats.n += 1;
  const delta = value - stats.mean;
  stats.mean += delta / stats.n;
  stats.m2 += delta * (value - stats.mean);
  stats.min = Math.min(stats.min, value); stats.max = Math.max(stats.max, value);
  if (value > 0) stats.positive += 1; else if (value < 0) stats.negative += 1; else stats.zero += 1;
}

function finishedStats(stats) {
  return { count: stats.n, mean: stats.n ? stats.mean : null,
    standardDeviation: stats.n ? Math.sqrt(stats.m2 / stats.n) : null,
    min: stats.n ? stats.min : null, max: stats.n ? stats.max : null,
    positive: stats.positive, negative: stats.negative, exactlyZero: stats.zero };
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function fingerprint(root, path) {
  const fullPath = resolve(root, path), info = await stat(fullPath);
  return { path, bytes: info.size, sha256: await sha256File(fullPath) };
}

async function verifyFingerprint(root, path, expected) {
  const actual = await fingerprint(root, path);
  assert.equal(actual.bytes, expected.bytes, `${path} byte size`);
  assert.equal(actual.sha256, expected.sha256, `${path} SHA-256`);
  return actual;
}

async function extractJsonProperty(path, property) {
  const reader = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let active = false, depth = 0, quoted = false, escaped = false;
  const parts = [];
  for await (const line of reader) {
    if (!active) {
      const index = line.indexOf(`"${property}"`);
      if (index < 0) continue;
      const opening = line.indexOf('{', index);
      assert.ok(opening >= 0, `${property} starts on its property line`);
      active = true; parts.push(line.slice(opening));
    } else parts.push(line);
    for (const char of parts.at(-1)) {
      if (escaped) { escaped = false; continue; }
      if (quoted && char === '\\') { escaped = true; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (!quoted) {
        if (char === '{') depth += 1;
        else if (char === '}') depth -= 1;
      }
    }
    if (active && depth === 0) { reader.close(); return JSON.parse(parts.join('\n').replace(/,\s*$/, '')); }
  }
  throw new Error(`${property} missing in ${path}`);
}

function validateEncoding(encoding, metadata) {
  assert.equal(encoding.type, 'per-array XOR delta of exact Float32/Uint32 bytes, concatenated in snapshot order');
  assert.deepEqual(encoding.arrayOrder, ARRAY_ORDER);
  assert.equal(encoding.descriptors.length, 599);
  assert.equal(metadata.frameCount, 599);
  assert.deepEqual(metadata.fieldDimensions, [WIDTH, HEIGHT]);
  let expectedOffset = 0, previousTime = -Infinity, previousTick = 0;
  for (const descriptor of encoding.descriptors) {
    assert.ok(Number.isSafeInteger(descriptor.tick) && descriptor.tick > previousTick);
    assert.ok(Number.isFinite(descriptor.timeSeconds) && descriptor.timeSeconds > previousTime);
    assert.deepEqual(Object.keys(descriptor.arrays), ARRAY_ORDER);
    for (const key of ARRAY_ORDER) {
      assert.deepEqual(descriptor.arrays[key], { offset: expectedOffset, bytes: CELLS * 4 });
      expectedOffset += CELLS * 4;
    }
    previousTime = descriptor.timeSeconds; previousTick = descriptor.tick;
  }
  assert.equal(expectedOffset, 599 * ARRAY_ORDER.length * CELLS * 4);
  assert.equal(encoding.descriptors[0].tick, 1);
  assert.ok(Math.abs(encoding.descriptors.at(-1).timeSeconds - 599.25) < 1e-9);
  return expectedOffset;
}

function decodeFrame(raw, descriptor, previous) {
  const decoded = {};
  for (const key of FIELD_KEYS) {
    const { offset, bytes } = descriptor.arrays[key];
    const current = Buffer.from(raw.subarray(offset, offset + bytes));
    const prior = previous.get(key);
    if (prior) for (let i = 0; i < bytes; i += 1) current[i] ^= prior[i];
    previous.set(key, current);
    const values = new Float32Array(CELLS);
    for (let cell = 0; cell < CELLS; cell += 1) {
      values[cell] = current.readFloatLE(cell * 4);
      assert.ok(Number.isFinite(values[cell]), `${key} finite at ${descriptor.tick}:${cell}`);
    }
    decoded[key] = values;
  }
  const { offset, bytes } = descriptor.arrays.contactCounts;
  const current = Buffer.from(raw.subarray(offset, offset + bytes));
  const prior = previous.get('contactCounts');
  if (prior) for (let i = 0; i < bytes; i += 1) current[i] ^= prior[i];
  previous.set('contactCounts', current);
  const contactCounts = new Uint32Array(CELLS);
  for (let cell = 0; cell < CELLS; cell += 1) contactCounts[cell] = current.readUInt32LE(cell * 4);
  decoded.contactCounts = contactCounts;
  return decoded;
}

export function fillConditionalSupport(field, chemicalMemory, output) {
  output.fill(0);
  for (let row = 0; row < HEIGHT; row += 1) {
    const y = row / (HEIGHT - 1);
    for (let column = 0; column < WIDTH; column += 1) {
      const cell = row * WIDTH + column;
      if (chemicalMemory[cell] < TRAIL_PLATE_CHEMICAL_THRESHOLD) continue;
      const value = field.sampleSupport(column / (WIDTH - 1), y, TRAIL_PLATE_SUPPORT_RADIUS);
      output[cell] = Math.max(0, value);
    }
  }
  return output;
}

function maskFromCells(cells) {
  const mask = new Uint8Array(CELLS);
  for (const cell of cells) {
    assert.ok(Number.isSafeInteger(cell) && cell >= 0 && cell < CELLS);
    assert.equal(mask[cell], 0, `no duplicate historical cell ${cell}`);
    mask[cell] = 1;
  }
  return mask;
}

function timeTarget(encoding, frameIndex) {
  for (const target of TARGETS) {
    const closest = encoding.descriptors.reduce((best, descriptor, index) => {
      const gap = Math.abs(descriptor.timeSeconds - target);
      return gap < best.gap ? { index, gap, time: descriptor.timeSeconds } : best;
    }, { index: -1, gap: Infinity, time: null });
    if (closest.index === frameIndex) return { requestedSeconds: target, actualTimeSeconds: closest.time };
  }
  return null;
}

function ageInSeconds(timeSeconds, timeMs) {
  return timeMs < 0 ? null : causalContactAge(timeSeconds, timeMs / 1000);
}

function recordContact(event, state, interval, field) {
  assert.equal(event.type, 'FOOT_CONTACT');
  assert.ok(Number.isFinite(event.simulationTimeMs) && event.simulationTimeMs >= 0);
  assert.ok(Array.isArray(event.contacts));
  for (const contact of event.contacts) {
    const position = contact?.position;
    assert.ok(Number.isFinite(position?.x) && Number.isFinite(position?.y)
      && position.x >= 0 && position.x <= 1 && position.y >= 0 && position.y <= 1);
    const cell = gridIndex(position), timestamp = event.simulationTimeMs;
    state.pointCounts[cell] = Math.min(0xffffffff, state.pointCounts[cell] + 1);
    interval.sameCellPoints[cell] += 1;
    if (!state.timestampSets[cell].has(timestamp)) {
      state.timestampSets[cell].add(timestamp);
      state.distinctTimestampCounts[cell] += 1;
    }
    if (!interval.timestampSets[cell]) interval.timestampSets[cell] = new Set();
    if (!interval.timestampSets[cell].has(timestamp)) {
      interval.timestampSets[cell].add(timestamp);
      interval.sameCellDistinctTimestamps[cell] += 1;
    }
    state.lastSameCellMs[cell] = Math.max(state.lastSameCellMs[cell], timestamp);
    for (const footprintCell of surfaceFootprintCellIndices(position, { radius: field.radius })) {
      interval.surfaceFootprintPoints[footprintCell] += 1;
      state.lastSurfaceFootprintMs[footprintCell] = timestamp;
    }
  }
  field.applyFootContact(event);
}

export function groupContactsByTick(events, lastTick, finalTimeSeconds) {
  const buckets = Array.from({ length: lastTick + 1 }, () => []);
  const tickEnds = new Float64Array(lastTick + 1);
  let tickEnd = 0;
  for (let tick = 1; tick <= lastTick; tick += 1) { tickEnd += DT_MS; tickEnds[tick] = tickEnd; }
  let throughCutoff = 0, afterCutoff = 0;
  for (const event of events) {
    assert.ok(Number.isFinite(event.simulationTimeMs) && event.simulationTimeMs >= 0);
    if (event.simulationTimeMs > finalTimeSeconds * 1000) { afterCutoff += 1; continue; }
    let low = 1, high = lastTick;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (tickEnds[middle] < event.simulationTimeMs) low = middle + 1;
      else high = middle;
    }
    const tick = low, previousEnd = tick === 1 ? 0 : tickEnds[tick - 1];
    assert.ok(event.simulationTimeMs >= previousEnd - 1e-7 && event.simulationTimeMs <= tickEnds[tick] + 1e-7,
      `event ${event.simulationTimeMs} belongs to one simulation tick`);
    buckets[tick].push(event);
    throughCutoff += 1;
  }
  return { buckets, throughCutoff, afterCutoff };
}

function cohortKey(field, band, id0, q, active, supportSampled) {
  return [field, band, id0, q, active, field === 'support' ? Number(supportSampled) : 'na'].join('|');
}

function addCohort(map, key, value, delta) {
  let row = map.get(key);
  if (!row) { row = { value: basicStats(), delta: basicStats() }; map.set(key, row); }
  addValue(row.value, value);
  if (delta !== null) addValue(row.delta, delta);
}

function fieldBinBounds(field, bin) {
  const [min, max] = FIELD_RANGES[field], width = (max - min) / MAGNITUDE_BINS;
  return [min + width * bin, bin === MAGNITUDE_BINS - 1 ? max : min + width * (bin + 1)];
}

function addMatched(map, key, delta) {
  let row = map.get(key);
  if (!row) { row = basicStats(); map.set(key, row); }
  addValue(row, delta);
}

function supportByteParity(actual, predicted, seed, frameIndex) {
  assert.deepEqual(Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength),
    Buffer.from(predicted.buffer, predicted.byteOffset, predicted.byteLength),
  `seed ${seed} conditional support sample exact ${frameIndex}`);
}

async function verifySourceFiles(root, seed, input, previousSummary, replayRecord) {
  const replaySeed = replayRecord.seeds.find(row => row.seed === seed);
  assert.ok(replaySeed && replaySeed.analysisCount === 599);
  const checked = [];
  checked.push(await verifyFingerprint(root, replaySeed.artifacts.fullSummary.path, replaySeed.artifacts.fullSummary));
  checked.push(await verifyFingerprint(root, replaySeed.artifacts.fullSnapshots.path, replaySeed.artifacts.fullSnapshots));
  const source = previousSummary.results.find(row => row.seed === seed).sourceRecord;
  assert.equal(sha(await readFile(resolve(root, `${FIELD_PACKAGE}/inputs/field-decisions/seed${seed}-metadata.json`))),
    source.inputSourceHashes.fieldMetadata);
  assert.equal(source.inputSourceHashes.rawContacts, input.metadata.sourceHashes.rawContacts);
  assert.equal(source.rawDecodedSha256, input.fieldMetadata.rawUncompressedHashes.fullSnapshotsSha256);
  assert.equal(input.fieldMetadata.sourceHashes.fullSummarySha256, replaySeed.artifacts.fullSummary.sha256);
  assert.equal(input.fieldMetadata.sourceHashes.fullSnapshotsCompressedSha256, replaySeed.artifacts.fullSnapshots.sha256);
  return { checked, priorSourceRecord: source };
}

async function processSeed({ root, seed, replayRecord, input, contactState, checkpointLines, cohortRows, matchedRows, timeRows, traceRows }) {
  const replaySeed = replayRecord.seeds.find(row => row.seed === seed);
  const summaryPath = resolve(root, replaySeed.artifacts.fullSummary.path);
  const encoding = await extractJsonProperty(summaryPath, 'snapshotEncoding');
  const expectedDecodedBytes = validateEncoding(encoding, input.fieldMetadata);
  const snapshotRecord = replaySeed.artifacts.fullSnapshots;
  const compressedPath = resolve(root, snapshotRecord.path), compressed = await readFile(compressedPath);
  assert.equal(compressed.length, snapshotRecord.bytes);
  assert.equal(sha(compressed), snapshotRecord.sha256);
  const raw = gunzipSync(compressed);
  assert.equal(raw.length, expectedDecodedBytes);
  assert.equal(sha(raw), contactState.priorSourceRecord.rawDecodedSha256);
  const descriptorSha256 = sha(Buffer.from(JSON.stringify(encoding.descriptors)));
  assert.equal(descriptorSha256, contactState.priorSourceRecord.descriptorSha256);
  const contactEvents = input.rawContacts;
  assert.ok(Array.isArray(contactEvents));
  for (const event of contactEvents) assert.equal(event.type, 'FOOT_CONTACT');
  const contactTicks = groupContactsByTick(contactEvents, encoding.descriptors.at(-1).tick,
    encoding.descriptors.at(-1).timeSeconds);

  const surface = new SurfaceField(), passive = new SurfaceField();
  const history = { pointCounts: new Uint32Array(CELLS), distinctTimestampCounts: new Uint32Array(CELLS),
    timestampSets: Array.from({ length: CELLS }, () => new Set()), lastSameCellMs: new Float64Array(CELLS).fill(-1),
    lastSurfaceFootprintMs: new Float64Array(CELLS).fill(-1) };
  const interval = { sameCellPoints: new Uint32Array(CELLS), sameCellDistinctTimestamps: new Uint32Array(CELLS),
    surfaceFootprintPoints: new Uint32Array(CELLS), timestampSets: Array(CELLS) };
  const originalModel = createW1Crystallizer({ width: WIDTH, height: HEIGHT });
  const candidateModel = createMaxOverlapCrystallizer({ width: WIDTH, height: HEIGHT });
  const previousBytes = new Map(), previousFields = {}, fieldHistory = Object.fromEntries(FIELD_KEYS.map(key =>
    [key, new Float32Array(encoding.descriptors.length * CELLS)]));
  const stateHistory = new Uint8Array(encoding.descriptors.length * CELLS);
  const ageHistory = new Float32Array(encoding.descriptors.length * CELLS).fill(-1);
  const surfaceAgeHistory = new Float32Array(encoding.descriptors.length * CELLS).fill(-1);
  const supportPrediction = new Float32Array(CELLS);
  let simulationTimeMs = 0, processedEvents = 0, exactSurfaceCells = 0, supportSamples = 0;
  let maxPassiveResidual = 0, passivePositive = 0, passiveZero = 0;
  let observedSupportZero = 0, conditionallyUnobservedSupport = 0, qStableChanges = 0, maxRoundoffBelowPassive = 0;
  let previousFlags = null, previousFrameTime = null;
  const seedSummary = { seed, observations: 0, finalTimeSeconds: null, finalEventCountThroughCutoff: 0,
    postCutoffContactEvents: 0, finalId0HistoricalCells: 0, finalId0Alive: false,
    surfaceReplay: { exactCellSamples: 0, maxAbsoluteError: 0 }, conditionalSupport: { exactFrames: 0, samples: 0 },
    passiveReference: { maxAbsoluteResidual: 0, positiveResidualSamples: 0, exactlyZeroResidualSamples: 0,
      maximumObservedBelowReference: 0 }, finalContactCensoring: {}, representativeCells: [] };

  const decodeState = { raw, previous: previousBytes };
  let nextFrameIndex = 0;
  for (let tick = 1; tick <= encoding.descriptors.at(-1).tick; tick += 1) {
    const previousTickMs = simulationTimeMs;
    surface.relax(DT); passive.relax(DT); simulationTimeMs += DT_MS;
    for (const event of contactTicks.buckets[tick]) {
      assert.ok(event.simulationTimeMs >= previousTickMs - 1e-7 && event.simulationTimeMs <= simulationTimeMs + 1e-7,
        `seed ${seed} contact time is causal within tick ${tick}`);
      recordContact(event, history, interval, surface);
      processedEvents += 1;
    }
    const descriptor = encoding.descriptors[nextFrameIndex];
    if (!descriptor || descriptor.tick !== tick) continue;
    const frame = decodeFrame(decodeState.raw, descriptor, decodeState.previous);
    const frameTime = descriptor.timeSeconds;
    assert.ok(Math.abs(frameTime - simulationTimeMs / 1000) < 1e-9, `seed ${seed} archived tick clock ${tick}`);
    for (let cell = 0; cell < CELLS; cell += 1) {
      assert.equal(surface.values[cell], frame.surface[cell], `seed ${seed} SurfaceField replay exact ${nextFrameIndex}:${cell}`);
      assert.equal(history.pointCounts[cell], frame.contactCounts[cell], `seed ${seed} contact-count archive parity ${nextFrameIndex}:${cell}`);
    }
    exactSurfaceCells += CELLS;
    seedSummary.surfaceReplay.maxAbsoluteError = Math.max(seedSummary.surfaceReplay.maxAbsoluteError, 0);
    const target = timeTarget(encoding, nextFrameIndex);
    if (target) {
      fillConditionalSupport(surface, frame.chemicalMemory, supportPrediction);
      supportByteParity(frame.support, supportPrediction, seed, nextFrameIndex);
      supportSamples += CELLS;
    }

    const flags = reconstructFlags({ chemicalMemory: frame.chemicalMemory, support: frame.support,
      distinctContactTimestamps: history.distinctTimestampCounts });
    const flagStart = nextFrameIndex * CELLS;
    assert.deepEqual(Buffer.from(flags), input.flags.subarray(flagStart, flagStart + CELLS),
      `seed ${seed} q flags from exact fields/contact timestamps ${nextFrameIndex}`);
    originalModel.advance({ timeSeconds: frameTime, flags });
    candidateModel.advance({ timeSeconds: frameTime, flags });
    const originalSnapshot = originalModel.getSnapshot();
    const active = Uint8Array.from(originalSnapshot.activeMask);
    const qMask = new Uint8Array(CELLS);
    for (let cell = 0; cell < CELLS; cell += 1) qMask[cell] = Number((flags[cell] & 7) === 7);
    const candidateId0 = candidateModel.getOpenEpisodes().find(episode => episode.id === 0);
    const id0Mask = maskFromCells(candidateId0?.cellIndices ?? []);
    const cohort = new Map();
    const matched = target ? new Map() : null;
    let qChanged = 0, sameCellIntervalPoints = 0, sameCellIntervalDistinctTimes = 0, surfaceFootprintIntervalPoints = 0;
    let uncontactedCells = 0, repeatedHistoryCells = 0, supportObservedCells = 0;
    let id0ActiveCells = 0, id0QCells = 0, activeCells = 0, qCells = 0;
    const passiveResidualStats = basicStats();
    const passiveSnapshot = passive.values;
    const checkpoint = target ? {
      seed, requestedSeconds: target.requestedSeconds, frameIndex: nextFrameIndex, timeSeconds: frameTime,
      previousTimeSeconds: previousFrameTime,
      arrays: Object.fromEntries(['id0HistoricalUnion', 'currentActive', 'q', 'qChanged', 'contactAgeSeconds',
        'surfaceFootprintAgeSeconds', 'sameCellPointsInInterval', 'sameCellDistinctTimestampsInInterval', 'surfaceFootprintPointsInInterval',
        'chemicalMemory', 'surface', 'support', 'deltaChemicalMemory', 'deltaSurface', 'deltaSupport',
        'surfacePassiveExpected', 'surfacePassiveResidual', 'supportSampled', 'supportSampledZero',
        'supportConditionallyUnobserved', 'qChanged'].map(key => [key, new Array(CELLS)]))
    } : null;
    for (let cell = 0; cell < CELLS; cell += 1) {
      const q = qMask[cell], isActive = active[cell], inId0 = id0Mask[cell];
      const sameAge = ageInSeconds(frameTime, history.lastSameCellMs[cell]);
      const surfaceAge = ageInSeconds(frameTime, history.lastSurfaceFootprintMs[cell]);
      const band = contactAgeBand(sameAge), supportSampled = frame.chemicalMemory[cell] >= TRAIL_PLATE_CHEMICAL_THRESHOLD;
      const qTransition = previousFlags === null ? 'initial'
        : Number((previousFlags[cell] & 7) === 7) === q ? 'stable'
          : q ? 'off-to-on' : 'on-to-off';
      if (previousFlags && qTransition !== 'stable') qChanged += 1;
      if (sameAge === null) uncontactedCells += 1;
      if (history.distinctTimestampCounts[cell] >= 2) repeatedHistoryCells += 1;
      if (supportSampled) supportObservedCells += 1;
      activeCells += isActive; qCells += q; id0ActiveCells += inId0 && isActive; id0QCells += inId0 && q;
      sameCellIntervalPoints += interval.sameCellPoints[cell];
      sameCellIntervalDistinctTimes += interval.sameCellDistinctTimestamps[cell];
      surfaceFootprintIntervalPoints += interval.surfaceFootprintPoints[cell];
      const exposure = contactExposure(interval.sameCellPoints[cell], interval.surfaceFootprintPoints[cell]);
      const stateSlot = nextFrameIndex * CELLS + cell;
      stateHistory[stateSlot] = q | (isActive << 1) | (inId0 << 2);
      ageHistory[stateSlot] = sameAge ?? -1;
      surfaceAgeHistory[stateSlot] = surfaceAge ?? -1;
      for (const field of FIELD_KEYS) {
        const value = frame[field][cell], delta = previousFields[field] ? value - previousFields[field][cell] : null;
        fieldHistory[field][stateSlot] = value;
        const key = cohortKey(field, band, Number(inId0), q, isActive, supportSampled);
        addCohort(cohort, key, value, delta);
        if (target && delta !== null) {
          const bin = fixedMagnitudeBin(previousFields[field][cell], field);
          const exposureKey = [field, q, isActive, Number(inId0), qTransition, bin, exposure].join('|');
          addMatched(matched, exposureKey, delta);
        }
        if (checkpoint) checkpoint.arrays[field][cell] = value;
        if (checkpoint && delta !== null) checkpoint.arrays[`delta${field[0].toUpperCase()}${field.slice(1)}`][cell] = delta;
      }
      const passiveResidual = frame.surface[cell] - passiveSnapshot[cell];
      addValue(passiveResidualStats, passiveResidual);
      maxPassiveResidual = Math.max(maxPassiveResidual, Math.abs(passiveResidual));
      if (passiveResidual > 0) passivePositive += 1; else if (passiveResidual === 0) passiveZero += 1;
      if (passiveResidual < 0) maxRoundoffBelowPassive = Math.max(maxRoundoffBelowPassive, -passiveResidual);
      if (frame.support[cell] === 0 && supportSampled) observedSupportZero += 1;
      if (!supportSampled) conditionallyUnobservedSupport += 1;
      if (checkpoint) {
        checkpoint.arrays.id0HistoricalUnion[cell] = inId0;
        checkpoint.arrays.currentActive[cell] = isActive;
        checkpoint.arrays.q[cell] = q;
        checkpoint.arrays.contactAgeSeconds[cell] = sameAge ?? -1;
        checkpoint.arrays.surfaceFootprintAgeSeconds[cell] = surfaceAge ?? -1;
        checkpoint.arrays.sameCellPointsInInterval[cell] = interval.sameCellPoints[cell];
        checkpoint.arrays.sameCellDistinctTimestampsInInterval[cell] = interval.sameCellDistinctTimestamps[cell];
        checkpoint.arrays.surfaceFootprintPointsInInterval[cell] = interval.surfaceFootprintPoints[cell];
        checkpoint.arrays.surfacePassiveExpected[cell] = passiveSnapshot[cell];
        checkpoint.arrays.surfacePassiveResidual[cell] = passiveResidual;
        checkpoint.arrays.supportSampled[cell] = Number(supportSampled);
        checkpoint.arrays.supportSampledZero[cell] = Number(supportSampled && frame.support[cell] === 0);
        checkpoint.arrays.supportConditionallyUnobserved[cell] = Number(!supportSampled);
        checkpoint.arrays.qChanged[cell] = qTransition === 'initial' ? 0 : Number(qTransition !== 'stable');
      }
    }
    if (previousFrameTime !== null) {
      assert.ok(qChanged <= CELLS);
      qStableChanges += qChanged;
    }
    for (const [key, value] of cohort) {
      const [field, band, id0, q, activeState, supportSampled] = key.split('|');
      cohortRows.push([seed, nextFrameIndex, frameTime, field, band, id0, q, activeState,
        supportSampled, value.value.n, value.value.mean, value.value.min, value.value.max,
        value.delta.n, value.delta.n ? value.delta.mean : null, value.delta.n ? Math.sqrt(value.delta.m2 / value.delta.n) : null,
        value.delta.positive, value.delta.negative, value.delta.zero]);
    }
    if (matched) for (const [key, values] of matched) {
      const [field, q, activeState, id0, qTransition, bin, exposure] = key.split('|');
      const [binMin, binMax] = fieldBinBounds(field, Number(bin));
      matchedRows.push([seed, target.requestedSeconds, frameTime, nextFrameIndex, field, q, activeState,
        id0, qTransition, bin, binMin, binMax, exposure, values.n, values.mean,
        values.n ? Math.sqrt(values.m2 / values.n) : null, values.positive, values.negative, values.zero]);
    }
    const passiveStats = finishedStats(passiveResidualStats);
    const timeRow = { seed, frameIndex: nextFrameIndex, timeSeconds: frameTime, previousTimeSeconds: previousFrameTime,
      frameGapSeconds: previousFrameTime === null ? null : frameTime - previousFrameTime,
      id0Alive: Boolean(candidateId0), id0HistoricalCells: candidateId0?.cellIndices.length ?? 0,
      id0CurrentOwnedActiveCells: candidateId0 ? candidateId0.cellIndices.filter(cell => active[cell]).length : 0,
      activeCells, qCells, id0ActiveCells, id0QCells, qChangedCells: previousFrameTime === null ? null : qChanged,
      neverSameCellContactCells: uncontactedCells, repeatedSameCellContactHistoryCells: repeatedHistoryCells,
      supportSampledCells: supportObservedCells, supportSampledZeroCells: observedSupportZero,
      sameCellFootPointsThisInterval: sameCellIntervalPoints,
      sameCellDistinctContactTimestampsThisInterval: sameCellIntervalDistinctTimes,
      surfaceFootprintPointWritesThisInterval: surfaceFootprintIntervalPoints,
      surfacePassiveResidual: passiveStats };
    timeRows.push(timeRow);
    if (checkpoint) {
      for (let cell = 0; cell < CELLS; cell += 1) {
        const row = [seed, target.requestedSeconds, nextFrameIndex, frameTime, previousFrameTime, cell, cell % WIDTH,
          Math.floor(cell / WIDTH), checkpoint.arrays.id0HistoricalUnion[cell], checkpoint.arrays.currentActive[cell],
          checkpoint.arrays.q[cell], checkpoint.arrays.qChanged[cell], checkpoint.arrays.chemicalMemory[cell],
          checkpoint.arrays.surface[cell], checkpoint.arrays.support[cell], checkpoint.arrays.supportSampled[cell],
          checkpoint.arrays.supportSampledZero[cell], checkpoint.arrays.supportConditionallyUnobserved[cell],
          checkpoint.arrays.contactAgeSeconds[cell], checkpoint.arrays.surfaceFootprintAgeSeconds[cell],
          checkpoint.arrays.sameCellPointsInInterval[cell], checkpoint.arrays.sameCellDistinctTimestampsInInterval[cell],
          checkpoint.arrays.surfaceFootprintPointsInInterval[cell],
          checkpoint.arrays.deltaChemicalMemory[cell], checkpoint.arrays.deltaSurface[cell], checkpoint.arrays.deltaSupport[cell],
          checkpoint.arrays.surfacePassiveExpected[cell], checkpoint.arrays.surfacePassiveResidual[cell],
          history.pointCounts[cell], history.distinctTimestampCounts[cell],
          history.lastSameCellMs[cell] >= 0 && frameTime >= history.lastSameCellMs[cell] / 1000 ? 1 : 0];
        checkpointLines.push(csvLine(row));
      }
    }

    if (previousFields.surface) passive.values.set(surface.values);
    for (const key of FIELD_KEYS) previousFields[key] = frame[key].slice();
    previousFlags = flags.slice();
    previousFrameTime = frameTime;
    for (const key of ['sameCellPoints', 'sameCellDistinctTimestamps', 'surfaceFootprintPoints']) interval[key].fill(0);
    interval.timestampSets.fill(undefined);
    nextFrameIndex += 1;
    seedSummary.observations += 1;
    if (target) {
      assert.ok(checkpoint);
    }
  }
  assert.equal(nextFrameIndex, 599);
  assert.equal(surfaceFieldAllEqual(surface, previousFields.surface), true);
  assert.equal(processedEvents, contactTicks.throughCutoff);
  const finalTime = encoding.descriptors.at(-1).timeSeconds;
  assert.equal(contactTicks.afterCutoff + contactTicks.throughCutoff, contactEvents.length);
  assert.equal(history.pointCounts.reduce((sum, value) => sum + value, 0),
    contactEvents.reduce((sum, event) => sum + (event.simulationTimeMs <= finalTime * 1000 ? event.contacts.length : 0), 0));
  const finalId0 = candidateModel.getOpenEpisodes().find(episode => episode.id === 0);
  assert.ok(finalId0, `seed ${seed} ID 0 remains open at final cutoff`);
  seedSummary.finalTimeSeconds = finalTime;
  seedSummary.finalEventCountThroughCutoff = processedEvents;
  seedSummary.postCutoffContactEvents = contactTicks.afterCutoff;
  seedSummary.finalId0HistoricalCells = finalId0.cellIndices.length;
  seedSummary.finalId0Alive = true;
  seedSummary.surfaceReplay.exactCellSamples = exactSurfaceCells;
  seedSummary.surfaceReplay.maxAbsoluteError = 0;
  seedSummary.conditionalSupport.exactFrames = 4;
  seedSummary.conditionalSupport.samples = supportSamples;
  seedSummary.passiveReference = { maxAbsoluteResidual: maxPassiveResidual,
    positiveResidualSamples: passivePositive, exactlyZeroResidualSamples: passiveZero,
    maximumObservedBelowReference: maxRoundoffBelowPassive };
  seedSummary.conditionalSupport.sampledZeroCells = observedSupportZero;
  seedSummary.conditionalSupport.unsampledCells = conditionallyUnobservedSupport;
  seedSummary.qTransitionsAcrossObservedIntervals = qStableChanges;
  seedSummary.finalContactCensoring = summarizeCensoring(history.lastSameCellMs, finalTime);
  seedSummary.finalId0ContactCensoring = summarizeCensoring(history.lastSameCellMs, finalTime,
    maskFromCells(finalId0.cellIndices));

  const reps = selectRepresentatives(finalId0.cellIndices, history.lastSameCellMs, finalTime);
  seedSummary.representativeCells = reps;
  for (const rep of reps) for (let frameIndex = 0; frameIndex < encoding.descriptors.length; frameIndex += 1) {
    const slot = frameIndex * CELLS + rep.cellIndex, state = stateHistory[slot];
    traceRows.push([seed, rep.ageBandAtFinal, rep.cellIndex, rep.x, rep.y, frameIndex,
      encoding.descriptors[frameIndex].timeSeconds, ageHistory[slot], surfaceAgeHistory[slot],
      state & 1, (state >> 1) & 1, (state >> 2) & 1,
      fieldHistory.chemicalMemory[slot], fieldHistory.surface[slot], fieldHistory.support[slot],
      Number(fieldHistory.chemicalMemory[slot] >= TRAIL_PLATE_CHEMICAL_THRESHOLD)]);
  }

  seedSummary.inputSourceHashes = contactState.priorSourceRecord.inputSourceHashes;
  seedSummary.inputPacketFileHashes = contactState.priorSourceRecord.inputPacketFileHashes;
  seedSummary.snapshotProvenance = {
    path: snapshotRecord.path,
    compressedBytes: compressed.length,
    compressedSha256: sha(compressed),
    decodedBytes: raw.length,
    decodedSha256: sha(raw),
    descriptorSha256,
    snapshotCount: encoding.descriptors.length,
    firstDescriptor: encoding.descriptors[0],
    finalDescriptor: encoding.descriptors.at(-1),
    arrayOrder: encoding.arrayOrder,
    bytesPerArrayPerFrame: CELLS * 4,
    contiguousArrayOffsetsValidated: true
  };
  return { summary: seedSummary, checkedSources: contactState.checked };
}

function surfaceFieldAllEqual(field, expected) {
  if (expected.length !== field.values.length) return false;
  for (let i = 0; i < expected.length; i += 1) if (field.values[i] !== expected[i]) return false;
  return true;
}

function summarizeCensoring(lastContactMs, finalTimeSeconds, selectedMask = null) {
  const counts = { neverContactedRightCensored: 0, contactedIntervalRightCensored: 0,
    ages: { never: 0, '0-20': 0, '20-90': 0, '>90': 0 }, minimumObservedNoContactAgeSeconds: null,
    medianObservedNoContactAgeSeconds: null, maximumObservedNoContactAgeSeconds: null, cellCount: 0 };
  const ages = [];
  for (let cell = 0; cell < lastContactMs.length; cell += 1) {
    if (selectedMask && !selectedMask[cell]) continue;
    counts.cellCount += 1;
    const last = lastContactMs[cell];
    const age = ageInSeconds(finalTimeSeconds, last);
    if (age === null) { counts.neverContactedRightCensored += 1; counts.ages.never += 1; }
    else { counts.contactedIntervalRightCensored += 1; counts.ages[contactAgeBand(age)] += 1; ages.push(age); }
  }
  ages.sort((a, b) => a - b);
  counts.minimumObservedNoContactAgeSeconds = ages[0] ?? null;
  counts.medianObservedNoContactAgeSeconds = ages.length ? ages[Math.floor((ages.length - 1) / 2)] : null;
  counts.maximumObservedNoContactAgeSeconds = ages.at(-1) ?? null;
  counts.censoringNote = 'All last-contact-to-final-observation intervals are right-censored; never-contacted cells are a separate run-start-to-cutoff right-censored group.';
  return counts;
}

function selectRepresentatives(finalId0Cells, lastContactMs, finalTimeSeconds) {
  const selected = [];
  for (const band of ['0-20', '20-90', '>90']) {
    const cellIndex = finalId0Cells.find(cell => contactAgeBand(ageInSeconds(finalTimeSeconds, lastContactMs[cell])) === band);
    if (cellIndex !== undefined) selected.push({ ageBandAtFinal: band, cellIndex, x: cellIndex % WIDTH,
      y: Math.floor(cellIndex / WIDTH), selectionRule: 'lowest row-major ID 0 historical-union cell in final same-cell contact-age band; selected before viewing field traces' });
  }
  return selected;
}

async function preserveSources(root) {
  const paths = [
    `${REPLAY_EVIDENCE}/data/replay-verification.json`, `${REPLAY_EVIDENCE}/checksums.json`,
    `${FIELD_PACKAGE}/inputs/field-decisions/INPUT-PROVENANCE.md`, `${CONTACT_PACKAGE}/checksums.json`,
    `${PRIOR_AUDIT}/results/checksums.json`, `${SPLIT_PACKAGE}/checksums.json`, `${CELL_PACKAGE}/checksums.json`,
    `${SPATIAL_PACKAGE}/checksums.json`, `${FIELD_PACKAGE}/checksums.json`
  ];
  for (const seed of SEEDS) paths.push(`${REPLAY}/seed${seed}-summary.json`, `${REPLAY}/seed${seed}-snapshots.bin.gz`,
    `${CONTACT_PACKAGE}/data/seed${seed}-on-raw-events.json.gz`);
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, await fingerprint(root, path)])));
}

function outputSummaryRows(rows) {
  return rows.map(row => [row.seed, row.frameIndex, row.timeSeconds, row.previousTimeSeconds, row.frameGapSeconds,
    row.id0Alive, row.id0HistoricalCells, row.id0CurrentOwnedActiveCells, row.activeCells, row.qCells,
    row.id0ActiveCells, row.id0QCells, row.qChangedCells, row.neverSameCellContactCells,
    row.repeatedSameCellContactHistoryCells, row.supportSampledCells, row.supportSampledZeroCells,
    row.sameCellFootPointsThisInterval, row.sameCellDistinctContactTimestampsThisInterval,
    row.surfaceFootprintPointWritesThisInterval,
    row.surfacePassiveResidual.count, row.surfacePassiveResidual.mean, row.surfacePassiveResidual.min,
    row.surfacePassiveResidual.max, row.surfacePassiveResidual.positive, row.surfacePassiveResidual.exactlyZero]);
}

async function run() {
  const root = resolve('.'), output = resolve(process.argv[2] ?? `${PACKAGE}/results`);
  for (const protectedPath of [FIELD_PACKAGE, REPLAY_EVIDENCE, CONTACT_PACKAGE, PRIOR_AUDIT, SPLIT_PACKAGE, CELL_PACKAGE, SPATIAL_PACKAGE]) {
    const relativePath = relative(resolve(root, protectedPath), output);
    assert.ok(relativePath.startsWith('..') && relativePath !== '.', `write only outside protected source ${protectedPath}`);
  }
  const oldRandom = Math.random;
  Math.random = () => { throw new Error('post-contact audit must not consume RNG'); };
  try {
    const before = await preserveSources(root);
    const previousSummary = await readJson(resolve(root, `${PRIOR_AUDIT}/results/summary.json`));
    assert.equal(previousSummary.decision, 'Informative');
    const replayRecord = await readJson(resolve(root, `${REPLAY_EVIDENCE}/data/replay-verification.json`));
    const validation = await readJson(resolve(root, `${PRIOR_AUDIT}/validation/independent-reproducibility.json`));
    assert.equal(validation.ExactReproduction, true);
    const provenancePath = `${FIELD_PACKAGE}/inputs/field-decisions/INPUT-PROVENANCE.md`;
    const w1Checksum = await readJson(resolve(root, `${FIELD_PACKAGE}/checksums.json`));
    const provenanceLedger = w1Checksum.files.find(file => file.path === `${FIELD_PACKAGE}/inputs/field-decisions/INPUT-PROVENANCE.md`);
    const provenanceFingerprint = await verifyFingerprint(root, provenancePath, provenanceLedger);
    const priorContactLedger = await readJson(resolve(root, `${CONTACT_PACKAGE}/checksums.json`));
    const priorResults = [], checkpointParts = [csvLine(['seed','requestedSeconds','frameIndex','timeSeconds','previousTimeSeconds','cellIndex','x','y',
      'id0HistoricalUnion','currentActive','q','qChanged','chemicalMemory','surface','support','supportSampled','supportSampledZero',
      'supportConditionallyUnobserved','lastSameCellContactAgeSeconds','lastSurfaceFootprintContactAgeSeconds',
      'sameCellFootPointsSincePreviousObservation','sameCellDistinctContactTimestampsSincePreviousObservation',
      'surfaceFootprintContactPointsSincePreviousObservation',
      'deltaChemicalMemory','deltaSurface','deltaSupport','surfacePassiveExpected','surfacePassiveResidual',
      'cumulativeSameCellFootPoints','distinctSameCellContactTimestamps','sameCellContactAgeRightCensored'])];
    const cohortRows = [], matchedRows = [], timeRows = [], traceRows = [];
    for (const seed of SEEDS) {
      const input = await loadSeedInputs(seed, FIELD_PACKAGE);
      const sourceChecks = await verifySourceFiles(root, seed, input, previousSummary, replayRecord);
      const contactRow = priorContactLedger.files.find(file => file.path === `data/seed${seed}-on-raw-events.json.gz`);
      assert.ok(contactRow);
      sourceChecks.checked.push(await verifyFingerprint(root, `${CONTACT_PACKAGE}/${contactRow.path}`, contactRow));
      priorResults.push(await processSeed({ root, seed, replayRecord, input,
        contactState: sourceChecks, checkpointLines: checkpointParts,
        cohortRows, matchedRows, timeRows, traceRows }));
      process.stdout.write(JSON.stringify({ seed, observations: priorResults.at(-1).summary.observations,
        surfaceExactCellSamples: priorResults.at(-1).summary.surfaceReplay.exactCellSamples,
        supportSamples: priorResults.at(-1).summary.conditionalSupport.samples }) + '\n');
    }
    const after = await preserveSources(root);
    assert.deepEqual(after, before, 'frozen inputs and prior evidence remain byte-identical');
    const surfaceResidualMax = Math.max(...priorResults.map(result => result.summary.passiveReference.maxAbsoluteResidual));
    const deltaScales = previousSummary.displayScales.deltaFields;
    const summary = {
      status: 'complete', startingHead: STARTING_HEAD, branch: 'ant-w1-episodic-material-shadow', seedOrder: SEEDS,
      observationsPerSeed: 599, finalObservedTimeSeconds: 599.2500000000696,
      decision: 'Informative / Mixed',
      decisionRationale: 'Observed continuous field states and deltas add temporal detail within unchanged binary q and historical regions. The archived surface is reproduced exactly by the existing per-tick SurfaceField relaxation plus actual FOOT_CONTACT deposits; support is an exact conditional sample of that surface. chemicalMemory continues its existing 20-second EMA update from the pheromone field, but the frozen contact archive does not identify all chemical movement/deposition inputs. The extra state is observable, while an independent material-forming process is not identified.',
      scope: 'Read-only post-contact field retention audit. No material birth, contribution, threshold, weight, geometry, state, closure, or production change.',
      implementationMeaning: {
        surface: { halfLifeSeconds: SURFACE_HALF_LIFE_SECONDS, updateOrder: 'SurfaceField.relax(dt) at each controller tick, then actual FOOT_CONTACT events are applied point-by-point during that tick.',
          deposit: { radius: SURFACE_RADIUS, dose: CONTACT_DOSE, spatialFootprint: 'exact SurfaceField.depositContact radius and weight over cell centers; no additional distance rule' } },
        chemicalMemory: { update: 'TrailPlateBirth.updateChemicalMemory samples the decayed/deposited PheromoneField and approaches the bounded sample with alpha = 1 - exp(-elapsedSeconds / 20).',
          pheromoneHalfLifeSeconds: 15, appliesDirectlyToChemicalMemory: false, chemicalInputPathFullyReconstructed: false },
        support: { derivedFrom: 'SurfaceField.sampleSupport at each 96x96 cell center with the existing 0.025 radius',
          sampledOnlyWhen: `chemicalMemory >= ${TRAIL_PLATE_CHEMICAL_THRESHOLD}`, unqualifiedStorage: 'zero-filled and therefore conditionally unobserved',
          surfaceIsDistinctFromSupport: true }
      },
      contactTiming: { pointCountAndDistinctTimestampCountSeparate: true,
        sameCellMapping: 'round normalized x and y to 96x96 row-major cell centers, matching existing W1 input audit.',
        surfaceNeighborhood: 'exact SurfaceField contact deposit footprint derived from source radius and kernel; no hand-selected radius.',
        ageBandsSeconds: { never: 'no contact observed', '0-20': '[0,20]', '20-90': '(20,90]', '>90': '(90, final cutoff]' },
        finalUnfinishedNoContactIntervals: 'right-censored at 599.25 s; never-contacted cells are reported separately.' },
      matching: { checkpoints: TARGETS, startMagnitudeBins: MAGNITUDE_BINS,
        magnitudeBinRanges: FIELD_RANGES, strata: ['same observed checkpoint', 'current q', 'current active',
          'ID 0 historical union membership', 'q transition', 'common prior-field magnitude bin',
          'same-cell / exact neighboring surface-footprint-only / no footprint input'],
        binsAreDescriptiveOnly: true, noInferenceFromCellIntervalsAsIndependentReplicates: true },
      fields: { chemicalMemory: { unit: 'dimensionless model EMA value', range: FIELD_RANGES.chemicalMemory },
        surface: { unit: 'SurfaceField normalized compaction/hardness model state [0,1]', range: FIELD_RANGES.surface },
        support: { unit: 'conditional sampled SurfaceField neighborhood scalar, not calibrated force', range: FIELD_RANGES.support } },
      displayScales: { fixedWorld: [0, 96, 0, 96], imshowInterpolation: 'nearest',
        fieldRanges: FIELD_RANGES, deltaRanges: deltaScales, contactAgeSeconds: [0, 599.25],
        surfacePassiveResidual: [-surfaceResidualMax, surfaceResidualMax], perPanelNormalization: false },
      validations: { frozenInputsAndPriorEvidenceBefore: before, frozenInputsAndPriorEvidenceAfter: after,
        inputSources: priorResults.map(row => ({ seed: row.summary.seed, files: row.checkedSources,
          hashes: row.summary.inputSourceHashes })), provenanceFingerprint,
        previousRawAuditChecksumsSha256: before[`${PRIOR_AUDIT}/results/checksums.json`].sha256,
        perSeed: priorResults.map(row => row.summary), rngUsed: false, noNaturalReplay: true,
        sourceSnapshotHashesVerifiedAgainstReplayVerification: true,
        outputHashes: null },
      totals: { postCutoffContactsExcluded: priorResults.reduce((sum, row) => sum + row.summary.postCutoffContactEvents, 0),
        surfaceReplayExactCellSamples: priorResults.reduce((sum, row) => sum + row.summary.surfaceReplay.exactCellSamples, 0),
        conditionalSupportExactSamples: priorResults.reduce((sum, row) => sum + row.summary.conditionalSupport.samples, 0),
        checkpointCellRows: checkpointParts.length - 1, fullTimelineRows: timeRows.length,
        ageCohortSummaryRows: cohortRows.length, matchedMilestoneRows: matchedRows.length, representativeTraceRows: traceRows.length },
      artifacts: { representativeSelection: 'At the final cutoff, the lowest row-major ID 0 historical-union cell is selected in each available same-cell contact-age band (0-20, >20-90, >90 seconds). Selection uses contact history and cell index only, before inspecting field traces.',
        traceSampling: 'Archived observation points only; plots use markers without connecting intervals.' }
    };
    const outputFiles = {
      'checkpoint-cells.csv.gz': gzipSync(Buffer.from(checkpointParts.join('')), { level: 9, mtime: 0 }),
      'field-cohort-summary.csv.gz': gzipSync(Buffer.from([
        csvLine(['seed','frameIndex','timeSeconds','field','contactAgeBand','id0HistoricalUnion','q','active','supportSampled',
          'cellCount','fieldMean','fieldMin','fieldMax','deltaCount','deltaMean','deltaSD','deltaPositive','deltaNegative','deltaExactlyZero']),
        ...cohortRows.map(csvLine)
      ].join('')), { level: 9, mtime: 0 }),
      'matched-milestone-deltas.csv': Buffer.from([
        csvLine(['seed','requestedSeconds','actualTimeSeconds','frameIndex','field','q','active','id0HistoricalUnion','qTransition',
          'priorMagnitudeBin','priorMagnitudeMin','priorMagnitudeMax','contactExposure','cellCount','deltaMean','deltaSD','deltaPositive','deltaNegative','deltaExactlyZero']),
        ...matchedRows.map(csvLine)
      ].join('')),
      'observation-time-series.csv': Buffer.from([
        csvLine(['seed','frameIndex','timeSeconds','previousTimeSeconds','frameGapSeconds','id0Alive','id0HistoricalCells',
          'id0CurrentOwnedActiveCells','activeCells','qCells','id0ActiveCells','id0QCells','qChangedCells',
          'neverSameCellContactCells','repeatedSameCellContactHistoryCells','supportSampledCells','supportSampledZeroCells',
          'sameCellFootPointsThisInterval','sameCellDistinctContactTimestampsThisInterval','surfaceFootprintPointWritesThisInterval','surfacePassiveResidualCellCount',
          'surfacePassiveResidualMean','surfacePassiveResidualMin','surfacePassiveResidualMax','surfacePassiveResidualPositiveCells','surfacePassiveResidualExactlyZeroCells']),
        ...outputSummaryRows(timeRows).map(csvLine)
      ].join('')),
      'representative-cell-traces.csv': Buffer.from([
        csvLine(['seed','finalAgeBand','cellIndex','x','y','frameIndex','timeSeconds','sameCellContactAgeSeconds',
          'surfaceFootprintContactAgeSeconds','q','active','id0HistoricalUnion','chemicalMemory','surface','support','supportSampled']),
        ...traceRows.map(csvLine)
      ].join('')),
      'source-fingerprints.json': Buffer.from(JSON.stringify({ frozenInputsAndEvidence: before, after }, null, 2) + '\n')
    };
    const fileHashes = Object.fromEntries(Object.entries(outputFiles).map(([name, bytes]) => [name,
      { bytes: bytes.length, sha256: sha(bytes) }]));
    summary.validations.outputHashes = fileHashes;
    outputFiles['summary.json'] = Buffer.from(JSON.stringify(summary, null, 2) + '\n');
    outputFiles['checksums.json'] = Buffer.from(JSON.stringify({ schemaVersion: 1,
      files: Object.entries(outputFiles).map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes) }))
        .sort((a, b) => a.path.localeCompare(b.path)) }, null, 2) + '\n');
    await mkdir(output, { recursive: true });
    for (const [name, bytes] of Object.entries(outputFiles)) await writeFile(resolve(output, name), bytes);
    process.stdout.write(JSON.stringify({ output, status: summary.status, decision: summary.decision,
      files: Object.keys(outputFiles).length, frozenSourcesPreserved: true }) + '\n');
  } finally { Math.random = oldRandom; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
