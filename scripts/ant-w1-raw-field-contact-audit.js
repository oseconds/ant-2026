import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createW1Crystallizer } from './ant-w1-crystallization.js';
import { createMaxOverlapCrystallizer } from './ant-w1-max-overlap-crystallization.js';
import { analyzeSeed, W1_PACKAGE } from './ant-w1-analysis.js';
import { loadSeedInputs } from './ant-w1-inputs.js';
import { loadCandidateAnalyzer } from './ant-w1-max-overlap-analysis.js';

export const PACKAGE = 'docs/ant/evidence/2026-10-10-w1-raw-field-contact-history-audit';
const STARTING_HEAD = 'aad8c30960a8b8511b855321ecc10450b55057b3';
const SPLIT = 'docs/ant/evidence/2026-10-09-w1-max-overlap-split-shadow';
const CELL = 'docs/ant/evidence/2026-10-09-w1-per-cell-formation-history';
const SPATIOTEMPORAL = 'docs/ant/evidence/2026-10-09-w1-spatiotemporal-local-coherence-audit';
const REPLAY = 'test-results/ant-interior-endpoint-shadow';
const REPLAY_EVIDENCE = 'docs/ant/evidence/2026-10-08-interior-endpoint-shadow';
const CONTACTS = 'docs/ant/evidence/2026-10-07-social-graph';
const FIELD_DECISIONS = `${W1_PACKAGE}/inputs/field-decisions`;
const SEEDS = [20261005, 20261006, 20261007], SIZE = 96, CELLS = SIZE ** 2;
const FIELD_ORDER = ['chemical', 'chemicalMemory', 'surface', 'support', 'contactCounts'];
const ANALYZED_FIELDS = ['chemicalMemory', 'support', 'surface'];
const TARGETS = [120, 300, 480, 599.25], BINS = 64;
const SOCIAL_CHECKSUMS_SHA256 = '77bfc7f34174b1853acf6a77e6bdbc2409d69e22271d4ab7e509c26d04343dbb';
const sha = value => createHash('sha256').update(value).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const readGzJson = async path => JSON.parse(gunzipSync(await readFile(path)));

export function gridIndex(position) {
  assert.ok(Number.isFinite(position?.x) && Number.isFinite(position?.y));
  assert.ok(position.x >= 0 && position.x <= 1 && position.y >= 0 && position.y <= 1);
  return Math.round(position.y * (SIZE - 1)) * SIZE + Math.round(position.x * (SIZE - 1));
}

export function reconstructFlags({ chemicalMemory, support, distinctContactTimestamps }) {
  assert.equal(chemicalMemory.length, CELLS);
  assert.equal(support.length, CELLS);
  assert.equal(distinctContactTimestamps.length, CELLS);
  const flags = new Uint8Array(CELLS);
  for (let cell = 0; cell < CELLS; cell += 1) {
    assert.ok(Number.isFinite(chemicalMemory[cell]) && Number.isFinite(support[cell]));
    flags[cell] = Number(chemicalMemory[cell] >= 0.30)
      | (Number(support[cell] >= 0.015) << 1)
      | (Number(distinctContactTimestamps[cell] >= 2) << 2);
  }
  return flags;
}

export function inObservationInterval(timeSeconds, previousSeconds, currentSeconds) {
  assert.ok(Number.isFinite(timeSeconds) && Number.isFinite(currentSeconds));
  assert.ok(previousSeconds === null || (Number.isFinite(previousSeconds) && previousSeconds < currentSeconds));
  return timeSeconds <= currentSeconds && (previousSeconds === null || timeSeconds > previousSeconds);
}

export function createContactHistoryState(cellCount = CELLS) {
  assert.ok(Number.isSafeInteger(cellCount) && cellCount > 0);
  return { individualCounts: new Uint32Array(cellCount), distinctTimestamps: new Uint32Array(cellCount),
    lastTimestampsMs: new Float64Array(cellCount).fill(-1) };
}

export function recordFootContact(state, { cellIndex, timestampMs }) {
  assert.ok(Number.isSafeInteger(cellIndex) && cellIndex >= 0 && cellIndex < state.individualCounts.length);
  assert.ok(Number.isFinite(timestampMs) && timestampMs >= 0);
  assert.ok(timestampMs >= state.lastTimestampsMs[cellIndex], 'per-cell contact timestamp order');
  const newTimestamp = state.lastTimestampsMs[cellIndex] !== timestampMs;
  state.individualCounts[cellIndex] = Math.min(0xffffffff, state.individualCounts[cellIndex] + 1);
  if (newTimestamp) state.distinctTimestamps[cellIndex] += 1;
  state.lastTimestampsMs[cellIndex] = timestampMs;
  return newTimestamp;
}

export function archivedFootPoints(events) {
  const feet = [];
  for (const [eventIndex, event] of events.entries()) {
    assert.equal(event.type, 'FOOT_CONTACT');
    assert.ok(Number.isFinite(event.simulationTimeMs) && event.simulationTimeMs >= 0);
    assert.ok(Array.isArray(event.contacts));
    for (const contact of event.contacts) feet.push({ cellIndex: gridIndex(contact.position),
      timestampMs: event.simulationTimeMs, timeSeconds: event.simulationTimeMs / 1000, eventIndex });
  }
  return feet.sort((a, b) => a.timestampMs - b.timestampMs || a.eventIndex - b.eventIndex);
}

function csv(rows, columns) {
  const cell = value => {
    if (value === undefined || value === null) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[,"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `${columns.join(',')}\n${rows.map(row => columns.map(key => cell(row[key])).join(',')).join('\n')}\n`;
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function verifyFile(root, path, record) {
  assert.ok(record && Number.isSafeInteger(record.bytes) && typeof record.sha256 === 'string', `source ledger row ${path}`);
  const absolute = resolve(root, path), info = await stat(absolute), digest = await sha256File(absolute);
  assert.equal(info.size, record.bytes, `${path} byte size`);
  assert.equal(digest, record.sha256, `${path} SHA-256`);
  return { path, bytes: info.size, sha256: digest };
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
      assert.ok(opening >= 0, `${property} object starts on the same line`);
      active = true;
      parts.push(line.slice(opening));
    } else parts.push(line);
    const segment = parts.at(-1);
    for (const char of segment) {
      if (escaped) { escaped = false; continue; }
      if (quoted && char === '\\') { escaped = true; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (!quoted) {
        if (char === '{') depth += 1;
        else if (char === '}') depth -= 1;
      }
    }
    if (active && depth === 0) {
      reader.close();
      return JSON.parse(parts.join('\n').replace(/,\s*$/, ''));
    }
  }
  throw new Error(`${property} object missing in ${path}`);
}

function validateEncoding(encoding, metadata) {
  assert.equal(encoding.type, 'per-array XOR delta of exact Float32/Uint32 bytes, concatenated in snapshot order');
  assert.deepEqual(encoding.arrayOrder, FIELD_ORDER);
  assert.equal(encoding.descriptors.length, 599);
  assert.equal(metadata.frameCount, 599);
  assert.deepEqual(metadata.fieldDimensions, [SIZE, SIZE]);
  let expectedOffset = 0;
  for (let frame = 0; frame < encoding.descriptors.length; frame += 1) {
    const descriptor = encoding.descriptors[frame], recorded = metadata.frames[frame];
    assert.equal(descriptor.tick, recorded.tick, `descriptor tick ${frame}`);
    assert.equal(descriptor.timeSeconds, recorded.timeSeconds, `descriptor time ${frame}`);
    assert.ok(Number.isFinite(descriptor.timeSeconds) && (!frame || descriptor.timeSeconds > encoding.descriptors[frame - 1].timeSeconds));
    assert.deepEqual(Object.keys(descriptor.arrays), FIELD_ORDER, `array keys ${frame}`);
    for (const key of FIELD_ORDER) {
      assert.deepEqual(descriptor.arrays[key], { offset: expectedOffset, bytes: CELLS * 4 }, `${key} offset ${frame}`);
      expectedOffset += CELLS * 4;
    }
  }
  assert.equal(expectedOffset, 599 * FIELD_ORDER.length * CELLS * 4);
  return expectedOffset;
}

function decodeFrame(raw, descriptor, previous) {
  const arrays = {};
  for (const key of FIELD_ORDER) {
    const { offset, bytes } = descriptor.arrays[key];
    const current = Buffer.from(raw.subarray(offset, offset + bytes));
    assert.equal(current.length, CELLS * 4);
    const prior = previous.get(key);
    if (prior) for (let i = 0; i < bytes; i += 1) current[i] ^= prior[i];
    previous.set(key, current);
    arrays[key] = current;
  }
  const floats = {};
  for (const key of ['chemical', 'chemicalMemory', 'surface', 'support']) {
    const values = new Float32Array(CELLS);
    for (let i = 0; i < CELLS; i += 1) {
      values[i] = arrays[key].readFloatLE(i * 4);
      assert.ok(Number.isFinite(values[i]), `${key} finite at cell ${i}`);
    }
    floats[key] = values;
  }
  const contactCounts = new Uint32Array(CELLS);
  for (let i = 0; i < CELLS; i += 1) contactCounts[i] = arrays.contactCounts.readUInt32LE(i * 4);
  return { ...floats, contactCounts };
}

function createStats(range, binCount = BINS) {
  return { count: 0, min: Infinity, max: -Infinity, mean: 0, m2: 0,
    histogram: new Uint32Array(binCount), range, binCount };
}

function addStat(stats, value) {
  assert.ok(Number.isFinite(value));
  stats.count += 1;
  stats.min = Math.min(stats.min, value); stats.max = Math.max(stats.max, value);
  const delta = value - stats.mean; stats.mean += delta / stats.count; stats.m2 += delta * (value - stats.mean);
  const [min, max] = stats.range;
  const index = max === min ? 0 : Math.max(0, Math.min(stats.binCount - 1, Math.floor((value - min) / (max - min) * stats.binCount)));
  stats.histogram[index] += 1;
}

function finishStats(stats) {
  return { count: stats.count, min: stats.count ? stats.min : null, max: stats.count ? stats.max : null,
    mean: stats.count ? stats.mean : null, standardDeviation: stats.count ? Math.sqrt(stats.m2 / stats.count) : null,
    binCount: stats.binCount, binRange: stats.range, histogram: Array.from(stats.histogram) };
}

function basicStats() {
  return { count: 0, min: Infinity, max: -Infinity, mean: 0, m2: 0, positive: 0, negative: 0, zero: 0, absoluteSum: 0 };
}

function addBasic(stats, value) {
  assert.ok(Number.isFinite(value));
  stats.count += 1; stats.min = Math.min(stats.min, value); stats.max = Math.max(stats.max, value);
  const delta = value - stats.mean; stats.mean += delta / stats.count; stats.m2 += delta * (value - stats.mean);
  stats.absoluteSum += Math.abs(value);
  if (value > 0) stats.positive += 1; else if (value < 0) stats.negative += 1; else stats.zero += 1;
}

function finishBasic(stats) {
  return { count: stats.count, min: stats.count ? stats.min : null, max: stats.count ? stats.max : null,
    mean: stats.count ? stats.mean : null, meanAbsolute: stats.count ? stats.absoluteSum / stats.count : null,
    standardDeviation: stats.count ? Math.sqrt(stats.m2 / stats.count) : null,
    positive: stats.positive, negative: stats.negative, exactlyZero: stats.zero };
}

function distributionKeys() {
  const result = {};
  for (const field of ANALYZED_FIELDS) for (const scope of ['world', 'candidateId0HistoricalUnion']) for (const q of [0, 1])
    result[`${scope}:${field}:q${q}`] = null;
  return result;
}

function closestTargets(frames) {
  return TARGETS.map(target => {
    const frameIndex = frames.map((frame, index) => ({ index, gap: Math.abs(frame.timeSeconds - target) }))
      .sort((a, b) => a.gap - b.gap || a.index - b.index)[0].index;
    return { target, frameIndex, actualTimeSeconds: frames[frameIndex].timeSeconds };
  });
}

function maskFromCells(cells) {
  const mask = new Uint8Array(CELLS);
  for (const cell of cells) {
    assert.ok(Number.isSafeInteger(cell) && cell >= 0 && cell < CELLS, `valid cell index ${cell}`);
    assert.equal(mask[cell], 0, `no duplicate cell ${cell}`); mask[cell] = 1;
  }
  return mask;
}

function hashOutputs(outputs) {
  return Object.fromEntries(Object.entries(outputs).map(([name, bytes]) => [name,
    { bytes: bytes.length, sha256: sha(bytes) }]));
}

async function verifiedInputs(root) {
  const replayRecord = await readJson(resolve(root, `${REPLAY_EVIDENCE}/data/replay-verification.json`));
  const replayLedger = await readJson(resolve(root, `${REPLAY_EVIDENCE}/checksums.json`));
  const w1Ledger = await readJson(resolve(root, `${W1_PACKAGE}/checksums.json`));
  const contactLedger = await readJson(resolve(root, `${CONTACTS}/checksums.json`));
  assert.equal(await sha256File(resolve(root, `${CONTACTS}/checksums.json`)), SOCIAL_CHECKSUMS_SHA256);
  const verified = [];
  const ledgerFile = (ledger, path) => ledger.files.find(file => file.path === path);
  verified.push(await verifyFile(root, `${REPLAY_EVIDENCE}/data/replay-verification.json`,
    ledgerFile(replayLedger, 'data/replay-verification.json')));
  verified.push(await verifyFile(root, `${FIELD_DECISIONS}/INPUT-PROVENANCE.md`,
    ledgerFile(w1Ledger, `${FIELD_DECISIONS}/INPUT-PROVENANCE.md`)));
  for (const seed of SEEDS) {
    const replaySeed = replayRecord.seeds.find(row => row.seed === seed);
    assert.ok(replaySeed && replaySeed.analysisCount === 599, `replay provenance seed ${seed}`);
    const metadataPath = `${FIELD_DECISIONS}/seed${seed}-metadata.json`;
    const metadata = await readJson(resolve(root, metadataPath));
    const summary = replaySeed.artifacts.fullSummary, snapshots = replaySeed.artifacts.fullSnapshots;
    assert.equal(metadata.sourceHashes.fullSummarySha256, summary.sha256);
    assert.equal(metadata.sourceHashes.fullSnapshotsCompressedSha256, snapshots.sha256);
    const contactRecord = ledgerFile(contactLedger, `data/seed${seed}-on-raw-events.json.gz`);
    assert.equal(metadata.sourceHashes.rawFootContactsCompressedSha256, contactRecord?.sha256);
    verified.push(await verifyFile(root, summary.path, summary));
    verified.push(await verifyFile(root, snapshots.path, snapshots));
    verified.push(await verifyFile(root, `${CONTACTS}/${contactRecord.path}`, contactRecord));
  }
  return { verified, replayRecord, contactLedger };
}

async function loadRawSeed(root, seed, input, expected) {
  const metadata = input.fieldMetadata;
  const summaryPath = resolve(root, `${REPLAY}/seed${seed}-summary.json`);
  const encoding = await extractJsonProperty(summaryPath, 'snapshotEncoding');
  const decodedBytes = validateEncoding(encoding, metadata);
  const sourcePath = resolve(root, `${REPLAY}/seed${seed}-snapshots.bin.gz`);
  const compressed = await readFile(sourcePath), raw = gunzipSync(compressed);
  assert.equal(raw.length, decodedBytes);
  const metadataRecord = await readJson(resolve(root, `${FIELD_DECISIONS}/seed${seed}-metadata.json`));
  assert.equal(sha(raw), metadataRecord.rawUncompressedHashes.fullSnapshotsSha256);
  assert.equal(sha(compressed), expected.replayRecord.seeds.find(row => row.seed === seed).artifacts.fullSnapshots.sha256);
  return { encoding, raw, metadataRecord };
}

async function scanGlobalRanges(root, expected) {
  const ranges = Object.fromEntries([...ANALYZED_FIELDS, 'chemical'].map(field => [field, [Infinity, -Infinity]]));
  const contactCounts = [Infinity, -Infinity], deltaMaxAbs = Object.fromEntries(ANALYZED_FIELDS.map(field => [field, 0]));
  for (const seed of SEEDS) {
    const metadata = await readJson(resolve(root, `${FIELD_DECISIONS}/seed${seed}-metadata.json`));
    const encoding = await extractJsonProperty(resolve(root, `${REPLAY}/seed${seed}-summary.json`), 'snapshotEncoding');
    const decodedBytes = validateEncoding(encoding, metadata);
    const compressed = await readFile(resolve(root, `${REPLAY}/seed${seed}-snapshots.bin.gz`));
    const raw = gunzipSync(compressed), previous = new Map();
    assert.equal(raw.length, decodedBytes);
    assert.equal(sha(raw), metadata.rawUncompressedHashes.fullSnapshotsSha256);
    assert.equal(sha(compressed), expected.replayRecord.seeds.find(row => row.seed === seed).artifacts.fullSnapshots.sha256);
    let previousFields = null;
    for (const descriptor of encoding.descriptors) {
      const frame = decodeFrame(raw, descriptor, previous);
      for (const field of [...ANALYZED_FIELDS, 'chemical']) for (const value of frame[field]) {
        ranges[field][0] = Math.min(ranges[field][0], value); ranges[field][1] = Math.max(ranges[field][1], value);
      }
      for (const value of frame.contactCounts) {
        contactCounts[0] = Math.min(contactCounts[0], value); contactCounts[1] = Math.max(contactCounts[1], value);
      }
      if (previousFields) for (const field of ANALYZED_FIELDS) for (let cell = 0; cell < CELLS; cell += 1)
        deltaMaxAbs[field] = Math.max(deltaMaxAbs[field], Math.abs(frame[field][cell] - previousFields[field][cell]));
      previousFields = frame;
    }
  }
  return { ranges, contactCounts, deltaMaxAbs };
}

function makeDistributionAccumulators(scales) {
  return Object.fromEntries(Object.entries(distributionKeys()).map(([key]) => {
    const [, field] = key.split(':');
    return [key, createStats(scales.ranges[field])];
  }));
}

function makeFrameFieldStats() {
  const result = {};
  for (const field of ANALYZED_FIELDS) {
    result[field] = { all: basicStats(), q0: basicStats(), q1: basicStats(), id0: basicStats(), id0q0: basicStats(), id0q1: basicStats() };
  }
  return result;
}

function sourceEvidenceHashes(root, analysisPath, splitPath) {
  return Promise.all([analysisPath, splitPath,
    `${W1_PACKAGE}/checksums.json`, `${CELL}/checksums.json`, `${SPATIOTEMPORAL}/checksums.json`]
    .map(async path => [path, await sha256File(resolve(root, path))])).then(Object.fromEntries);
}

async function processSeed({ root, seed, input, scales, expected, originals, adapter, cellSummarySeed, spatialSeed }) {
  const { encoding, raw, metadataRecord } = await loadRawSeed(root, seed, input, expected);
  const previousArrays = new Map();
  const contactHistory = createContactHistoryState(), { individualCounts: actualFootCounts,
    distinctTimestamps: distinctTimes } = contactHistory;
  const lastContactTime = new Float64Array(CELLS).fill(-1), intervalFootCounts = new Uint32Array(CELLS);
  const feet = archivedFootPoints(input.rawContacts);
  let footIndex = 0, previousTime = null, totalContactPoints = 0, totalDistinctTimestamps = 0;
  const originalModel = createW1Crystallizer({ width: SIZE, height: SIZE });
  const candidateModel = createMaxOverlapCrystallizer({ width: SIZE, height: SIZE });
  const oldSplit = originals.split.seeds.find(row => row.seed === seed);
  const comparison = originals.comparison.seeds.find(row => row.seed === seed);
  const oldSpatial = spatialSeed;
  assert.ok(oldSplit && comparison && oldSpatial);
  const w1Analysis = analyzeSeed(input, comparison);
  assert.deepEqual(w1Analysis, oldSplit.baseline, `seed ${seed} split baseline deep-equal`);
  const candidateAnalysis = adapter.analyzeSeed(input, comparison);
  assert.deepEqual(candidateAnalysis, oldSplit.candidate, `seed ${seed} max-overlap analysis/geometry/character deep-equal`);
  const targets = closestTargets(input.fieldMetadata.frames), targetByIndex = new Map(targets.map(row => [row.frameIndex, row]));
  const checkpoints = [], intervalRows = [], timeSeries = [];
  const fieldRanges = Object.fromEntries(ANALYZED_FIELDS.map(field => [field, scales.ranges[field]]));
  const contactDeltaDistributions = Object.fromEntries(ANALYZED_FIELDS.flatMap(field =>
    ['contacted', 'noContact'].map(status => [`${field}:${status}`,
      createStats([-scales.deltaMaxAbs[field], scales.deltaMaxAbs[field]])])));
  let framePreviousFields = null, id0PreviousCells = new Uint8Array(CELLS);
  const seedDistribution = makeDistributionAccumulators(scales);
  let checkedObservations = 0, priorId0Count = 0;
  for (let frameIndex = 0; frameIndex < encoding.descriptors.length; frameIndex += 1) {
    const descriptor = encoding.descriptors[frameIndex], frameTime = descriptor.timeSeconds;
    const frame = decodeFrame(raw, descriptor, previousArrays), offset = frameIndex * CELLS;
    intervalFootCounts.fill(0);
    let intervalPoints = 0;
    while (footIndex < feet.length && feet[footIndex].timeSeconds <= frameTime) {
      const foot = feet[footIndex++], cell = foot.cellIndex, eventTime = foot.timeSeconds;
      assert.ok(Number.isFinite(eventTime) && eventTime >= 0 && eventTime <= 600);
      assert.ok(Number.isSafeInteger(cell) && cell >= 0 && cell < CELLS);
      assert.ok(inObservationInterval(eventTime, previousTime, frameTime), 'contact lies in this exact observation interval');
      const newTimestamp = recordFootContact(contactHistory, foot);
      lastContactTime[cell] = eventTime;
      totalContactPoints += 1; intervalPoints += 1;
      intervalFootCounts[cell] += 1;
      if (newTimestamp) totalDistinctTimestamps += 1;
    }
    for (let cell = 0; cell < CELLS; cell += 1) {
      assert.equal(frame.contactCounts[cell], actualFootCounts[cell], `seed ${seed} contactCounts/archive parity ${frameIndex}:${cell}`);
    }
    const flags = reconstructFlags({ chemicalMemory: frame.chemicalMemory, support: frame.support, distinctContactTimestamps: distinctTimes });
    assert.deepEqual(Buffer.from(flags), input.flags.subarray(offset, offset + CELLS),
      `seed ${seed} raw field/contact q flags ${frameIndex}`);
    const qCount = flags.reduce((sum, value) => sum + Number((value & 7) === 7), 0);
    const oldMatched = oldSplit.matched.frames[frameIndex], oldIdentity = oldSplit.matched.identityFrames[frameIndex];
    assert.equal(oldMatched.frameIndex, frameIndex); assert.equal(oldMatched.timeSeconds, frameTime);
    assert.equal(oldMatched.qCellCount, qCount, `seed ${seed} q count parity ${frameIndex}`);
    const originalStep = originalModel.advance({ timeSeconds: frameTime, flags });
    const candidateStep = candidateModel.advance({ timeSeconds: frameTime, flags });
    const originalSnapshot = originalModel.getSnapshot(), candidateSnapshot = candidateModel.getSnapshot();
    assert.deepEqual(originalSnapshot.activeMask, candidateSnapshot.activeMask, `seed ${seed} baseline/candidate active mask ${frameIndex}`);
    assert.deepEqual(originalStep.stateBounds, candidateStep.stateBounds, `seed ${seed} baseline/candidate EMA ${frameIndex}`);
    assert.deepEqual(originalStep.stateBounds, oldSplit.baseline.history[frameIndex].stateBounds, `seed ${seed} stored EMA ${frameIndex}`);
    assert.equal(originalSnapshot.activeCellCount, oldMatched.activeCells, `seed ${seed} active count parity ${frameIndex}`);
    assert.deepEqual(candidateModel.getLastIdentityDiagnostics(), oldIdentity, `seed ${seed} max-overlap identity/active frame parity ${frameIndex}`);
    checkedObservations += 1;
    const candidateId0 = candidateModel.getOpenEpisodes().find(episode => episode.id === 0);
    const id0Cells = candidateId0?.cellIndices ?? [];
    const id0Mask = maskFromCells(id0Cells);
    const id0Count = id0Cells.length;
    assert.ok(id0Count >= priorId0Count, `seed ${seed} candidate ID 0 union is cumulative`);
    priorId0Count = id0Count;
    const identityId0 = oldIdentity.components.find(component => component.episodeId === 0)?.cellIndices ?? [];
    const id0CurrentMask = maskFromCells(identityId0);
    const activeMask = Uint8Array.from(originalSnapshot.activeMask);
    for (let cell = 0; cell < CELLS; cell += 1) if (id0CurrentMask[cell])
      assert.equal(activeMask[cell], 1, `seed ${seed} ID 0 current cells are active ${frameIndex}:${cell}`);
    const qMask = new Uint8Array(CELLS);
    for (let cell = 0; cell < CELLS; cell += 1) qMask[cell] = Number((flags[cell] & 7) === 7);
    const frameStats = makeFrameFieldStats();
    const deltas = framePreviousFields ? Object.fromEntries(ANALYZED_FIELDS.map(field => [field, new Float32Array(CELLS)])) : null;
    const deltaStats = Object.fromEntries(ANALYZED_FIELDS.map(field => [field, {
      all: basicStats(), qStable0: basicStats(), qStable1: basicStats(), id0: basicStats(),
      id0QStable0: basicStats(), id0QStable1: basicStats()
    }]));
    let id0ActiveCells = 0, id0QCells = 0, id0NewCells = 0, qChangedCells = 0;
    for (let cell = 0; cell < CELLS; cell += 1) {
      const q = qMask[cell];
      id0ActiveCells += id0Mask[cell] && activeMask[cell] ? 1 : 0;
      id0QCells += id0Mask[cell] && q ? 1 : 0;
      id0NewCells += id0Mask[cell] && !id0PreviousCells[cell] ? 1 : 0;
      if (framePreviousFields && q !== Number((input.flags[offset - CELLS + cell] & 7) === 7)) qChangedCells += 1;
      for (const field of ANALYZED_FIELDS) {
        const value = frame[field][cell];
        addBasic(frameStats[field].all, value); addBasic(q ? frameStats[field].q1 : frameStats[field].q0, value);
        addStat(seedDistribution[`world:${field}:q${q}`], value);
        if (id0Mask[cell]) {
          addBasic(frameStats[field].id0, value); addBasic(q ? frameStats[field].id0q1 : frameStats[field].id0q0, value);
          addStat(seedDistribution[`candidateId0HistoricalUnion:${field}:q${q}`], value);
        }
        if (framePreviousFields) {
          const delta = value - framePreviousFields[field][cell]; deltas[field][cell] = delta;
          addBasic(deltaStats[field].all, delta);
          if (q === Number((input.flags[offset - CELLS + cell] & 7) === 7))
            addBasic(q ? deltaStats[field].qStable1 : deltaStats[field].qStable0, delta);
          if (id0Mask[cell] && id0PreviousCells[cell]) {
            addBasic(deltaStats[field].id0, delta);
            if (q === Number((input.flags[offset - CELLS + cell] & 7) === 7))
              addBasic(q ? deltaStats[field].id0QStable1 : deltaStats[field].id0QStable0, delta);
          }
        }
      }
    }
    const currentContacts = new Uint8Array(CELLS), contactAgeSeconds = new Float32Array(CELLS).fill(-1);
    let cellsWithContact = 0, repeatedContactCells = 0, agesOver20 = 0, agesOver90 = 0, ageSum = 0, maxContactAge = 0;
    for (let cell = 0; cell < CELLS; cell += 1) {
      currentContacts[cell] = Number(intervalFootCounts[cell] > 0);
      if (currentContacts[cell]) cellsWithContact += 1;
      if (distinctTimes[cell] > 1) repeatedContactCells += 1;
      if (lastContactTime[cell] >= 0) {
        const age = frameTime - lastContactTime[cell];
        assert.ok(Number.isFinite(age) && age >= 0, `causal contact age ${frameIndex}:${cell}`);
        contactAgeSeconds[cell] = age; ageSum += age; maxContactAge = Math.max(maxContactAge, age);
        if (age > 20) agesOver20 += 1; if (age > 90) agesOver90 += 1;
      }
    }
    if (framePreviousFields) for (const field of ANALYZED_FIELDS) {
      const contactStats = { contacted: basicStats(), noContact: basicStats() };
      let noContactNonzero = 0, noContactZero = 0;
      for (let cell = 0; cell < CELLS; cell += 1) {
        const delta = deltas[field][cell], touched = currentContacts[cell] === 1;
        addBasic(touched ? contactStats.contacted : contactStats.noContact, delta);
        addStat(contactDeltaDistributions[`${field}:${touched ? 'contacted' : 'noContact'}`], delta);
        if (!touched) {
          if (frame[field][cell] !== 0) noContactNonzero += 1; else noContactZero += 1;
        }
      }
      for (const [status, values] of Object.entries(contactStats)) intervalRows.push({ seed, frameIndex,
        previousTimeSeconds: previousTime, timeSeconds: frameTime, intervalDefinition: '(previous,current]',
        field, contactStatus: status, contactPointsThisInterval: intervalPoints, contactCellsThisInterval: cellsWithContact,
        delta: finishBasic(values), noContactCurrentFieldNonzeroCells: status === 'noContact' ? noContactNonzero : null,
        noContactCurrentFieldZeroCells: status === 'noContact' ? noContactZero : null });
    }
    for (const field of ANALYZED_FIELDS) for (let cell = 0; cell < CELLS; cell += 1) {
      assert.ok(Number.isFinite(frame[field][cell]));
      if (deltas) assert.ok(Number.isFinite(deltas[field][cell]));
    }
    const qQualifiedTimestamps = distinctTimes.reduce((sum, value) => sum + value, 0);
    const cellsEverContacted = lastContactTime.reduce((sum, value) => sum + Number(value >= 0), 0);
    const series = { seed, frameIndex, timeSeconds: frameTime, previousTimeSeconds: previousTime,
      frameIntervalSeconds: previousTime === null ? null : frameTime - previousTime, qQualifiedCellCount: qCount,
      currentActiveCellCount: originalSnapshot.activeCellCount, currentActiveCellsWithinId0History: id0ActiveCells,
      candidateId0Alive: Boolean(candidateId0), candidateId0HistoricalCellCount: id0Count,
      candidateId0NewHistoricalCells: id0NewCells, candidateId0QualifiedCellCount: id0QCells,
      candidateId0QualifiedFraction: id0Count ? id0QCells / id0Count : null,
      candidateId0CurrentOwnedActiveCells: identityId0.length, qChangedCellCount: qChangedCells,
      contactPointsThisInterval: intervalPoints, contactCellsThisInterval: cellsWithContact,
      cumulativeIndividualFootContacts: totalContactPoints, cumulativeDistinctCellTimestamps: qQualifiedTimestamps,
      cellsWithAtLeastTwoDistinctContactTimestamps: repeatedContactCells,
      contactedCellsWithAgeSeconds: cellsEverContacted,
      meanContactAgeSeconds: cellsEverContacted ? ageSum / cellsEverContacted : null,
      maxContactAgeSeconds: totalContactPoints ? maxContactAge : null,
      contactAgeBeyond20Seconds: agesOver20, contactAgeBeyond90Seconds: agesOver90 };
    for (const field of ANALYZED_FIELDS) {
      series[`${field}Range`] = fieldRanges[field];
      series[`${field}Mean`] = finishBasic(frameStats[field].all).mean;
      series[`${field}Q0Mean`] = finishBasic(frameStats[field].q0).mean;
      series[`${field}Q1Mean`] = finishBasic(frameStats[field].q1).mean;
      series[`${field}Id0Mean`] = finishBasic(frameStats[field].id0).mean;
      series[`${field}Id0Q0Mean`] = finishBasic(frameStats[field].id0q0).mean;
      series[`${field}Id0Q1Mean`] = finishBasic(frameStats[field].id0q1).mean;
      series[`${field}DeltaMean`] = deltas ? finishBasic(deltaStats[field].all).mean : null;
      series[`${field}DeltaPositiveCells`] = deltas ? deltaStats[field].all.positive : 0;
      series[`${field}DeltaNegativeCells`] = deltas ? deltaStats[field].all.negative : 0;
      series[`${field}DeltaExactlyZeroCells`] = deltas ? deltaStats[field].all.zero : CELLS;
      series[`${field}DeltaQStable0Mean`] = deltas ? finishBasic(deltaStats[field].qStable0).mean : null;
      series[`${field}DeltaQStable1Mean`] = deltas ? finishBasic(deltaStats[field].qStable1).mean : null;
      series[`${field}DeltaId0Mean`] = deltas ? finishBasic(deltaStats[field].id0).mean : null;
      series[`${field}DeltaId0QStable0Mean`] = deltas ? finishBasic(deltaStats[field].id0QStable0).mean : null;
      series[`${field}DeltaId0QStable1Mean`] = deltas ? finishBasic(deltaStats[field].id0QStable1).mean : null;
    }
    timeSeries.push(series);
    if (targetByIndex.has(frameIndex)) {
      const target = targetByIndex.get(frameIndex), old = oldSpatial.milestones.find(row => row.cutoffFrameIndex === frameIndex);
      assert.ok(old, `seed ${seed} old spatiotemporal milestone ${frameIndex}`);
      assert.deepEqual(id0Cells, old.id0HistoricalCellIndices, `seed ${seed} ID0 historical union ${target.target}s`);
      const oldCellMilestone = cellSummarySeed.candidate.milestones.find(row => row.nominalTargetSeconds === target.target);
      assert.equal(oldCellMilestone.historicalCells, id0Count, `seed ${seed} old cell-history union ${target.target}s`);
      assert.equal(oldCellMilestone.currentOwnedActiveCells, identityId0.length, `seed ${seed} old cell-history current ID0 active ${target.target}s`);
      const arrays = { id0HistoricalUnion: id0Mask, currentActiveMask: activeMask, qMask,
        contactInPreviousInterval: currentContacts, contactAgeSeconds,
        cumulativeIndividualFootContacts: actualFootCounts, distinctContactTimestamps: distinctTimes };
      for (const field of ANALYZED_FIELDS) {
        arrays[field] = frame[field]; arrays[`delta_${field}`] = deltas?.[field] ?? new Float32Array(CELLS);
      }
      checkpoints.push({ requestedSeconds: target.target, frameIndex, actualTimeSeconds: frameTime,
        previousTimeSeconds: previousTime, id0Alive: Boolean(candidateId0), id0HistoricalCellCount: id0Count,
        id0CurrentOwnedActiveCells: identityId0.length, currentActiveCellCount: originalSnapshot.activeCellCount,
        qQualifiedCellCount: qCount, contactPointsThisInterval: intervalPoints, contactCellsThisInterval: cellsWithContact,
        arrays: Object.fromEntries(Object.entries(arrays).map(([key, value]) => [key,
          Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64')])) });
      if (oldCellMilestone.currentOwnedActiveCells !== series.candidateId0CurrentOwnedActiveCells)
        throw new Error(`seed ${seed} ID0 active count mismatch at ${target.target}`);
      if (oldCellMilestone.historicalCells !== series.candidateId0HistoricalCellCount)
        throw new Error(`seed ${seed} ID0 union count mismatch at ${target.target}`);
    }
    framePreviousFields = frame; id0PreviousCells = id0Mask; previousTime = frameTime;
  }
  assert.equal(checkedObservations, 599);
  assert.equal(footIndex <= feet.length, true);
  const finalId0 = candidateModel.getOpenEpisodes().find(episode => episode.id === 0);
  assert.ok(finalId0, `seed ${seed} candidate ID 0 remains right-censored at final observation`);
  assert.deepEqual(finalId0.cellIndices, oldSpatial.finalId0CellIndices, `seed ${seed} final ID0 historical union exact`);
  assert.equal(candidateModel.getOpenEpisodes().some(episode => episode.id === 0), true);
  assert.equal(checkpoints.length, 4);
  const distributionsJson = Object.fromEntries(Object.entries(seedDistribution).map(([key, stats]) => [key, finishStats(stats)]));
  return { seed, checks: { observations: checkedObservations, rawFlagAndQParity: true,
    actualFootContactCountArrayParity: true, actualDistinctContactTimestampQualification: true,
    originalW1GeometryAndCharacterDeepEqual: true, maxOverlapGeometryAndCharacterDeepEqual: true,
    originalAndCandidateEMAActiveParity: true, storedCandidateIdentityFramesDeepEqual: true,
    previousCellHistoryId0MilestonesDeepEqual: true, priorSpatiotemporalId0MilestonesDeepEqual: true,
    noRandomness: true }, distributions: distributionsJson, checkpoints, timeSeries, intervalRows,
    sourceRecord: { rawDecodedBytes: raw.length, rawDecodedSha256: metadataRecord.rawUncompressedHashes.fullSnapshotsSha256,
      snapshotCount: encoding.descriptors.length, firstTimeSeconds: encoding.descriptors[0].timeSeconds,
      arrayOrder: encoding.arrayOrder, bytesPerArrayPerFrame: CELLS * 4,
      descriptorSha256: sha(Buffer.from(JSON.stringify(encoding.descriptors))),
      firstDescriptor: encoding.descriptors[0], finalDescriptor: encoding.descriptors.at(-1),
      finalTimeSeconds: encoding.descriptors.at(-1).timeSeconds, totalFootContactPoints: totalContactPoints,
      totalDistinctCellContactTimestamps: totalDistinctTimestamps, finalId0HistoricalCellCount: finalId0.cellIndices.length,
      inputSourceHashes: input.metadata.sourceHashes, inputPacketFileHashes: input.metadata.packetFileHashes },
    contactDeltaDistributions: Object.fromEntries(Object.entries(contactDeltaDistributions).map(([key, stats]) => [key, finishStats(stats)])),
    };
}

function histogramRows(results, globalRanges) {
  const rows = [];
  for (const result of results) for (const [key, value] of Object.entries(result.distributions)) {
    const [scope, field, qualification] = key.split(':');
    const [minimum, maximum] = globalRanges[field];
    for (let bin = 0; bin < value.histogram.length; bin += 1) {
      const binStart = minimum + (maximum - minimum) * bin / value.histogram.length;
      const binEnd = minimum + (maximum - minimum) * (bin + 1) / value.histogram.length;
      rows.push({ seed: result.seed, scope, field, qualification, count: value.count,
        minimum: value.min, maximum: value.max, mean: value.mean, standardDeviation: value.standardDeviation,
        binIndex: bin, binStart, binEnd, samples: value.histogram[bin] });
    }
  }
  return rows;
}

function outputFiles(results, scales, sources) {
  const timeSeries = results.flatMap(result => result.timeSeries);
  const intervals = results.flatMap(result => result.intervalRows);
  const distribution = histogramRows(results, scales.ranges);
  const checkpointRows = results.flatMap(result => result.checkpoints.flatMap(checkpoint => {
    const decoded = Object.fromEntries(Object.entries(checkpoint.arrays).map(([key, text]) => [key, Buffer.from(text, 'base64')]));
    return Array.from({ length: CELLS }, (_, cell) => {
      const float = name => decoded[name].readFloatLE(cell * 4);
      const byte = name => decoded[name][cell];
      const age = float('contactAgeSeconds');
      return { seed: result.seed, requestedSeconds: checkpoint.requestedSeconds, frameIndex: checkpoint.frameIndex,
        timeSeconds: checkpoint.actualTimeSeconds, previousTimeSeconds: checkpoint.previousTimeSeconds,
        cellIndex: cell, x: cell % SIZE, y: Math.floor(cell / SIZE), id0HistoricalUnion: byte('id0HistoricalUnion'),
        currentActive: byte('currentActiveMask'), q: byte('qMask'), chemicalMemory: float('chemicalMemory'),
        support: float('support'), surface: float('surface'), deltaChemicalMemory: float('delta_chemicalMemory'),
        deltaSupport: float('delta_support'), deltaSurface: float('delta_surface'),
        contactInPreviousInterval: byte('contactInPreviousInterval'), contactAgeSeconds: age >= 0 ? age : null,
        cumulativeIndividualFootContacts: decoded.cumulativeIndividualFootContacts.readUInt32LE(cell * 4),
        distinctContactTimestamps: decoded.distinctContactTimestamps.readUInt32LE(cell * 4) };
    });
  }));
  const timeColumns = Object.keys(timeSeries[0]);
  const intervalColumns = ['seed', 'frameIndex', 'previousTimeSeconds', 'timeSeconds', 'intervalDefinition', 'field',
    'contactStatus', 'contactPointsThisInterval', 'contactCellsThisInterval', 'delta',
    'noContactCurrentFieldNonzeroCells', 'noContactCurrentFieldZeroCells'];
  const distributionColumns = Object.keys(distribution[0]);
  const checkpointColumns = Object.keys(checkpointRows[0]);
  return {
    'analysis.json.gz': gzipSync(Buffer.from(JSON.stringify({ schemaVersion: 1, startingHead: STARTING_HEAD,
      fieldRanges: scales.ranges, deltaDisplayRanges: Object.fromEntries(Object.entries(scales.deltaMaxAbs).map(([field, max]) => [field, [-max, max]])),
      contactAgeDisplayRangeSeconds: [0, 599.25], distributionBinCount: BINS,
      seeds: results.map(({ seed, checks, sourceRecord, distributions, checkpoints, timeSeries: series, contactDeltaDistributions }) =>
        ({ seed, checks, sourceRecord, distributions, checkpoints, timeSeries: series, contactDeltaDistributions })) })), { level: 9, mtime: 0 }),
    'field-distributions.csv': Buffer.from(csv(distribution, distributionColumns)),
    'time-series.csv': Buffer.from(csv(timeSeries, timeColumns)),
    'contact-interval-contrasts.csv': Buffer.from(csv(intervals, intervalColumns)),
    'checkpoint-cells.csv.gz': gzipSync(Buffer.from(csv(checkpointRows, checkpointColumns)), { level: 9, mtime: 0 }),
    'source-fingerprints.json': Buffer.from(JSON.stringify(sources, null, 2) + '\n')
  };
}

async function run() {
  const root = resolve('.'), output = resolve(process.argv[2] ?? `${PACKAGE}/results`);
  for (const protectedRoot of [W1_PACKAGE, SPLIT, CELL, SPATIOTEMPORAL]) {
    const path = relative(resolve(protectedRoot), output);
    assert.ok(path.startsWith('..') && path !== '.', `write only outside protected evidence ${protectedRoot}`);
  }
  const expected = await verifiedInputs(root);
  const preservedPaths = [`${W1_PACKAGE}/results/analysis.json.gz`, `${SPLIT}/results/analysis.json.gz`,
    `${CELL}/results/summary.json`, `${CELL}/results/milestones.csv`, `${SPATIOTEMPORAL}/results/analysis.json.gz`,
    `${SPATIOTEMPORAL}/results/summary.json`];
  const preservationBefore = Object.fromEntries(await Promise.all(preservedPaths.map(async path => [path, await sha256File(resolve(root, path))])));
  const sources = await sourceEvidenceHashes(root, `${W1_PACKAGE}/results/analysis.json.gz`, `${SPLIT}/results/analysis.json.gz`);
  const originals = { split: await readGzJson(resolve(root, `${SPLIT}/results/analysis.json.gz`)),
    comparison: await readGzJson(resolve(root, `${W1_PACKAGE}/inputs/baselines/local-accretion-analysis.json.gz`)),
    cellSummary: await readJson(resolve(root, `${CELL}/results/summary.json`)),
    spatial: await readGzJson(resolve(root, `${SPATIOTEMPORAL}/results/analysis.json.gz`)) };
  const previousRandom = Math.random;
  Math.random = () => { throw new Error('raw-field contact audit must not consume RNG'); };
  try {
    const scales = await scanGlobalRanges(root, expected);
    for (const field of ANALYZED_FIELDS) assert.ok(scales.ranges[field][1] > scales.ranges[field][0], `${field} has a nonconstant raw range`);
    const adapter = await loadCandidateAnalyzer(), results = [];
    for (const seed of SEEDS) {
      const input = await loadSeedInputs(seed, W1_PACKAGE);
      const spatialSeed = originals.spatial.seeds.find(row => row.seed === seed);
      results.push(await processSeed({ root, seed, input, scales, expected, originals, adapter,
        cellSummarySeed: originals.cellSummary.seeds.find(row => row.seed === seed), spatialSeed }));
      process.stdout.write(JSON.stringify({ seed, observations: results.at(-1).checks.observations,
        finalId0Cells: results.at(-1).sourceRecord.finalId0HistoricalCellCount,
        contactPoints: results.at(-1).sourceRecord.totalFootContactPoints }) + '\n');
    }
    const outputs = outputFiles(results, scales, expected.verified);
    const summary = { status: 'complete', startingHead: STARTING_HEAD, branch: 'ant-w1-episodic-material-shadow',
      seedOrder: SEEDS, observationsPerSeed: 599, finalObservedTimeSeconds: 599.2500000000696,
      decision: 'Informative',
      decisionRationale: 'Across all three frozen seeds, raw chemicalMemory, support, and surface retain broad within-q variation in ID 0 historical cells; observed field deltas also differ descriptively between intervals with and without same-cell FOOT_CONTACT. These are raw-state distinctions, not physical material measures or causal effects.',
      scope: 'Read-only description of raw saved fields and actual same-cell FOOT_CONTACT history; no material candidate or rule.',
      fields: { chemicalMemory: { sourceType: 'Float32', unit: 'dimensionless model memory scalar', range: scales.ranges.chemicalMemory },
        support: { sourceType: 'Float32', unit: 'raw simulation support scalar; not calibrated force', range: scales.ranges.support },
        surface: { sourceType: 'Float32', unit: 'raw SurfaceField scalar; not equivalent to support', range: scales.ranges.surface },
        chemical: { sourceType: 'Float32', unit: 'raw auxiliary field; validated but not interpreted', range: scales.ranges.chemical },
        contactCounts: { sourceType: 'UInt32', meaning: 'cumulative individual FOOT_CONTACT foot points per cell', range: scales.contactCounts },
        contactAge: { unit: 'seconds from latest archived same-cell FOOT_CONTACT; absent sentinel is null' } },
      qDefinition: 'Existing W1 q=1 iff chemicalMemory >= 0.30, conditional support >= 0.015, and at least two distinct archived FOOT_CONTACT timestamps have occurred at the same cell.',
      activeDefinition: 'Existing EMA: fast tau 20s, slow tau 90s, active iff fast - slow > alpha - beta; q=1 drives both EMA states.',
      timing: 'Each row uses the exact archived observation time. Foot-contact state is causal through the current time. Field deltas use adjacent saved samples only; no between-sample interpolation.',
      displayScales: { rawFields: scales.ranges, deltaFields: Object.fromEntries(Object.entries(scales.deltaMaxAbs).map(([field, max]) => [field, [-max, max]])),
        contactAgeSeconds: [0, 599.25], masks: [0, 1], interpolation: 'nearest cell, fixed 96x96 extent' },
      methods: { rawThresholdBitsReconstructed: true, contactTimestampsFromCommittedArchives: true,
        contactCountsNotUsedAsDistinctTimestampQualification: true, candidateId0UnionIsCausalPrefix: true,
        fieldDifferenceIsDescriptiveNotCausal: true, noNewThresholdWeightGeometryOrClosure: true, noNaturalReplay: true },
      validations: { frozenInputHashes: expected.verified, sourceEvidenceHashes: sources,
        perSeed: results.map(({ seed, checks, sourceRecord }) => ({ seed, checks, sourceRecord })),
        preservedPriorEvidenceHashes: preservationBefore, outputs: hashOutputs(outputs) },
      timeSeriesRows: results.reduce((sum, row) => sum + row.timeSeries.length, 0),
      intervalContrastRows: results.reduce((sum, row) => sum + row.intervalRows.length, 0),
      checkpointCount: results.reduce((sum, row) => sum + row.checkpoints.length, 0),
      results: results.map(({ seed, distributions, contactDeltaDistributions, checkpoints, sourceRecord }) =>
        ({ seed, sourceRecord, distributions, contactDeltaDistributions,
          checkpoints: checkpoints.map(({ arrays, ...rest }) => rest) })) };
    const summaryBytes = Buffer.from(JSON.stringify(summary, null, 2) + '\n');
    outputs['summary.json'] = summaryBytes;
    outputs['checksums.json'] = Buffer.from(JSON.stringify({ schemaVersion: 1, files: Object.entries(outputs)
      .map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes) })).sort((a, b) => a.path.localeCompare(b.path)) }, null, 2) + '\n');
    await mkdir(output, { recursive: true });
    for (const [name, bytes] of Object.entries(outputs)) await writeFile(resolve(output, name), bytes);
  } finally { Math.random = previousRandom; }
  for (const [path, digest] of Object.entries(preservationBefore)) assert.equal(await sha256File(resolve(root, path)), digest, `preserved ${path}`);
  process.stdout.write(JSON.stringify({ output, preservedPriorEvidence: true }) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
