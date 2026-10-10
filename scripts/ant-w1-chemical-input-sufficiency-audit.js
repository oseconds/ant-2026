import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { gunzipSync } from 'node:zlib';
import os from 'node:os';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { TrailPlateBirth, TRAIL_PLATE_GRID_SIZE } from '../src/lib/agents/ant/TrailPlateBirth.js';

export const PACKAGE = 'docs/ant/evidence/2026-10-10-w1-chemical-input-sufficiency-audit';
export const STARTING_HEAD = '9eeaa2c1e3254ed7c9bdcac25e79e4d5ee161841';
export const CONSISTENCY_PACKAGE = 'docs/ant/evidence/2026-10-10-w1-archived-chemical-memory-recurrence-consistency-check';
export const CONSISTENCY_STARTING_HEAD = '22ead7669af28145e9c6966d4a042a692c905057';
export const SEEDS = [20261005, 20261006, 20261007];
export const WIDTH = TRAIL_PLATE_GRID_SIZE, HEIGHT = TRAIL_PLATE_GRID_SIZE;
export const CELLS = WIDTH * HEIGHT, DT = 1 / 60;
const ARRAY_ORDER = ['chemical', 'chemicalMemory', 'surface', 'support', 'contactCounts'];
export const FIELD_BYTES = CELLS * Float32Array.BYTES_PER_ELEMENT;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPLAY = 'test-results/ant-interior-endpoint-shadow';
const FIELD_PACKAGE = 'docs/ant/evidence/2026-10-08-w1-episodic-material-shadow';
const FIELD_INPUTS = `${FIELD_PACKAGE}/inputs/field-decisions`;
const REPLAY_EVIDENCE = 'docs/ant/evidence/2026-10-08-interior-endpoint-shadow';
const POST_AUDIT = 'docs/ant/evidence/2026-10-10-w1-post-contact-field-retention-audit';
const RAW_AUDIT = 'docs/ant/evidence/2026-10-10-w1-raw-field-contact-history-audit';
const REPLAY_VERIFICATION = `${REPLAY_EVIDENCE}/data/replay-verification.json`;
const POST_FINGERPRINTS = `${POST_AUDIT}/results/source-fingerprints.json`;
const PROVENANCE = `${FIELD_INPUTS}/INPUT-PROVENANCE.md`;
const sha = value => createHash('sha256').update(value).digest('hex');
const readJson = async path => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));

export function validateUpdateCoverage(updateTicks, descriptors) {
  assert.ok(Array.isArray(updateTicks) && Array.isArray(descriptors), 'update and descriptor arrays required');
  assert.deepEqual(descriptors.map(row => row.tick), updateTicks,
    'every production analysis update has one same-tick archive frame in chronological order');
  return updateTicks.length;
}

export function sourceHashGap(path, recordedSha256, observedSha256) {
  assert.ok(typeof path === 'string' && path.length > 0);
  assert.ok(/^[a-f0-9]{64}$/i.test(recordedSha256));
  assert.ok(/^[a-f0-9]{64}$/i.test(observedSha256));
  return recordedSha256.toLowerCase() === observedSha256.toLowerCase() ? null : {
    code: 'ARCHIVED_REPLAY_RUNNER_SOURCE_HASH_MISMATCH', path,
    recordedSha256: recordedSha256.toLowerCase(), observedSha256: observedSha256.toLowerCase(),
    effect: 'The archived capture source cannot be verified, so same-update chemical-input / chemicalMemory-output timing is not established.'
  };
}

export function consistencyCheckMayProceed(gaps) {
  return Array.isArray(gaps) && gaps.length <= 1 && gaps.every(gap =>
    gap.code === 'ARCHIVED_REPLAY_RUNNER_SOURCE_HASH_MISMATCH'
    && gap.path === 'scripts/ant-morphology-replay.js');
}

export function reconstructTickTimes(lastTick, dt = DT) {
  assert.ok(Number.isSafeInteger(lastTick) && lastTick > 0, 'positive final tick required');
  assert.ok(Number.isFinite(dt) && dt > 0, 'finite positive fixed tick required');
  const timesMs = new Float64Array(lastTick + 1);
  let simulationTimeMs = 0;
  for (let tick = 1; tick <= lastTick; tick += 1) {
    simulationTimeMs += dt * 1000;
    timesMs[tick] = simulationTimeMs;
  }
  return timesMs;
}

export function validateEncoding(encoding, metadata) {
  assert.equal(encoding?.type, 'per-array XOR delta of exact Float32/Uint32 bytes, concatenated in snapshot order');
  assert.deepEqual(encoding.arrayOrder, ARRAY_ORDER);
  assert.equal(encoding.descriptors.length, 599);
  assert.equal(metadata.frameCount, encoding.descriptors.length);
  assert.deepEqual(metadata.fieldDimensions, [WIDTH, HEIGHT]);
  assert.equal(metadata.frames.length, encoding.descriptors.length);
  let expectedOffset = 0, previousTick = 0, previousTime = -Infinity;
  for (let frame = 0; frame < encoding.descriptors.length; frame += 1) {
    const descriptor = encoding.descriptors[frame], metadataFrame = metadata.frames[frame];
    assert.ok(Number.isSafeInteger(descriptor.tick) && descriptor.tick > previousTick, `tick order ${frame}`);
    assert.ok(Number.isFinite(descriptor.timeSeconds) && descriptor.timeSeconds > previousTime, `time order ${frame}`);
    assert.equal(descriptor.tick, metadataFrame.tick, `metadata tick ${frame}`);
    assert.equal(descriptor.timeSeconds, metadataFrame.timeSeconds, `metadata time ${frame}`);
    assert.deepEqual(Object.keys(descriptor.arrays), ARRAY_ORDER, `array order ${frame}`);
    for (const key of ARRAY_ORDER) {
      assert.deepEqual(descriptor.arrays[key], { offset: expectedOffset, bytes: FIELD_BYTES }, `${key} range ${frame}`);
      expectedOffset += FIELD_BYTES;
    }
    previousTick = descriptor.tick;
    previousTime = descriptor.timeSeconds;
  }
  assert.equal(expectedOffset, encoding.descriptors.length * ARRAY_ORDER.length * FIELD_BYTES);
  assert.equal(encoding.descriptors[0].tick, 1);
  assert.equal(encoding.descriptors.at(-1).timeSeconds, 599.2500000000696);
  return expectedOffset;
}

export function validateFiniteFloat32(bytes, label) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length === FIELD_BYTES, `${label} Float32 bytes missing or malformed`);
  for (let cell = 0; cell < CELLS; cell += 1) {
    assert.ok(Number.isFinite(bytes.readFloatLE(cell * 4)), `${label} finite at cell ${cell}`);
  }
  return true;
}

function csvLine(values) {
  return values.map(value => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[,"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(',') + '\n';
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function fingerprint(path) {
  const fullPath = resolve(ROOT, path), info = await stat(fullPath);
  return { path, bytes: info.size, sha256: await sha256File(fullPath) };
}

async function verifyFingerprints(records) {
  const verified = [];
  for (const expected of records) {
    const actual = await fingerprint(expected.path);
    assert.equal(actual.bytes, expected.bytes, `${expected.path} byte size`);
    assert.equal(actual.sha256, expected.sha256, `${expected.path} SHA-256`);
    verified.push(actual);
  }
  return verified;
}

function assertPackageChecksum(manifest, path, bytes, label) {
  const record = manifest.files.find(file => file.path === path || file.path.endsWith(`/${path}`));
  assert.ok(record, `${label} records ${path}`);
  assert.equal(record.bytes, bytes.length, `${label} byte count ${path}`);
  assert.equal(record.sha256, sha(bytes), `${label} SHA-256 ${path}`);
}

async function extractJsonProperty(path, property) {
  const reader = createInterface({ input: createReadStream(resolve(ROOT, path)), crlfDelay: Infinity });
  let active = false, depth = 0, quoted = false, escaped = false;
  const parts = [];
  for await (const line of reader) {
    if (!active) {
      const index = line.indexOf(`"${property}"`);
      if (index < 0) continue;
      const opening = line.indexOf('{', index);
      assert.ok(opening >= 0, `${property} object starts on property line`);
      active = true;
      parts.push(line.slice(opening));
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
    if (active && depth === 0) {
      reader.close();
      return JSON.parse(parts.join('\n').replace(/,\s*$/, ''));
    }
  }
  throw new Error(`${property} missing in ${path}`);
}

function decodeFloatArray(raw, descriptor, key, previous) {
  const range = descriptor.arrays[key];
  assert.ok(range && Number.isSafeInteger(range.offset) && range.offset >= 0
    && range.bytes === FIELD_BYTES && range.offset + range.bytes <= raw.length, `${key} archive range`);
  const bytes = Buffer.from(raw.subarray(range.offset, range.offset + range.bytes));
  const prior = previous.get(key);
  if (prior) for (let i = 0; i < bytes.length; i += 1) bytes[i] ^= prior[i];
  previous.set(key, bytes);
  validateFiniteFloat32(bytes, key);
  const values = new Float32Array(CELLS);
  for (let cell = 0; cell < CELLS; cell += 1) values[cell] = bytes.readFloatLE(cell * 4);
  return { bytes, values };
}

function productionUpdateSchedule(lastTick) {
  const model = new TrailPlateBirth();
  const updates = [];
  model.updateChemicalMemory = (_field, elapsedSeconds) => {
    updates.push({ tick: currentTick, simulationTimeMs: model.lastAnalysisTimeMs, elapsedSeconds });
  };
  model.buildSupportedMask = () => ({ mask: new Uint8Array(CELLS), supports: new Float32Array(CELLS),
    diagnostics: { maxChemical: 0, maxSupport: 0, chemicalQualifiedCells: 0, supportedCells: 0 } });
  let currentTick = 0, simulationTimeMs = 0;
  for (currentTick = 1; currentTick <= lastTick; currentTick += 1) {
    simulationTimeMs += DT * 1000;
    model.advance({ pheromone: null, surface: null, simulationTimeMs });
  }
  return updates;
}

function bitsHex(bytes, offset) { return `0x${bytes.readUInt32LE(offset).toString(16).padStart(8, '0')}`; }

async function loadBaseline(root) {
  const prior = await readJson(POST_FINGERPRINTS);
  const postChecksums = await readJson(`${POST_AUDIT}/checksums.json`);
  const fieldChecksums = await readJson(`${FIELD_PACKAGE}/checksums.json`);
  const rawChecksums = await readJson(`${RAW_AUDIT}/results/checksums.json`);
  const expected = Object.values(prior.frozenInputsAndEvidence || {});
  assert.ok(expected.length >= 18, 'prior audits list frozen sources and protected evidence ledgers');
  const protectedInputs = await verifyFingerprints(expected);
  const replayBytes = await readFile(resolve(root, REPLAY_VERIFICATION));
  const provenanceBytes = await readFile(resolve(root, PROVENANCE));
  const postFingerprintBytes = await readFile(resolve(root, POST_FINGERPRINTS));
  assertPackageChecksum(postChecksums, `${POST_AUDIT}/results/source-fingerprints.json`, postFingerprintBytes, 'post-contact ledger');
  const rawSummaryBytes = await readFile(resolve(root, `${RAW_AUDIT}/results/summary.json`));
  const rawFingerprintBytes = await readFile(resolve(root, `${RAW_AUDIT}/results/source-fingerprints.json`));
  assertPackageChecksum(rawChecksums, 'summary.json', rawSummaryBytes, 'raw-field audit ledger');
  assertPackageChecksum(rawChecksums, 'source-fingerprints.json', rawFingerprintBytes, 'raw-field audit ledger');
  const rawSummary = JSON.parse(rawSummaryBytes);
  assert.deepEqual(rawSummary.validations.perSeed.map(row => row.seed), SEEDS);
  const requiredPriorChecks = ['rawFlagAndQParity', 'originalW1GeometryAndCharacterDeepEqual',
    'maxOverlapGeometryAndCharacterDeepEqual', 'originalAndCandidateEMAActiveParity',
    'storedCandidateIdentityFramesDeepEqual'];
  const priorParity = rawSummary.validations.perSeed.map(({ seed, checks }) => {
    for (const key of requiredPriorChecks) assert.equal(checks[key], true, `${key} prior parity seed ${seed}`);
    return { seed, observations: checks.observations,
      rawFlagAndQParity: checks.rawFlagAndQParity,
      originalAndCandidateEMAActiveParity: checks.originalAndCandidateEMAActiveParity,
      originalW1GeometryAndCharacterDeepEqual: checks.originalW1GeometryAndCharacterDeepEqual,
      maxOverlapGeometryAndCharacterDeepEqual: checks.maxOverlapGeometryAndCharacterDeepEqual,
      storedCandidateIdentityFramesDeepEqual: checks.storedCandidateIdentityFramesDeepEqual };
  });
  const replay = JSON.parse(replayBytes);
  assert.equal(sha(replayBytes), prior.frozenInputsAndEvidence[REPLAY_VERIFICATION].sha256);
  assert.equal(sha(provenanceBytes), prior.frozenInputsAndEvidence[PROVENANCE].sha256);
  assert.ok(provenanceBytes.toString('utf8').includes('Float32 `chemical`, `chemicalMemory`, `surface`, and `support`'));
  assert.equal(replay.replayManifest.dtSeconds, DT);
  assert.deepEqual(replay.replayManifest.seeds, SEEDS);
  assert.equal(os.endianness(), 'LE', 'snapshot byte order is little-endian');
  const productionPaths = ['src/lib/agents/ant/AntController.js',
    'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
    'scripts/ant-morphology-replay.js'];
  const productionHashes = {}, gaps = [];
  for (const path of productionPaths) {
    const bytes = await readFile(resolve(root, path));
    const expectedHash = path === 'scripts/ant-morphology-replay.js'
      ? replay.replayManifest.runnerHash : replay.replayManifest.sourceHashes[path];
    const observedHash = sha(bytes);
    if (path === 'scripts/ant-morphology-replay.js') {
      const gap = sourceHashGap(path, expectedHash, observedHash);
      if (gap) gaps.push({ ...gap, replayCommit: replay.replayManifest.commit });
    } else assert.equal(observedHash, expectedHash, `${path} matches archived production replay source`);
    productionHashes[path] = observedHash;
  }
  const sourceRecords = [
    ...protectedInputs,
    await fingerprint(PROVENANCE),
    await fingerprint(REPLAY_VERIFICATION),
    await fingerprint(POST_FINGERPRINTS),
    await fingerprint(`${FIELD_PACKAGE}/checksums.json`),
    await fingerprint(`${POST_AUDIT}/checksums.json`),
    await fingerprint(`${RAW_AUDIT}/results/checksums.json`),
    await fingerprint(`${RAW_AUDIT}/results/summary.json`),
    await fingerprint(`${RAW_AUDIT}/results/source-fingerprints.json`),
    ...await Promise.all(productionPaths.map(path => fingerprint(path)))
  ];
  const uniqueSourceRecords = [...new Map(sourceRecords.map(record => [record.path, record])).values()];
  return { prior, replay, protectedInputs, productionHashes, gaps, priorParity,
    fieldChecksums, postChecksums, rawChecksums,
    sourceRecords: uniqueSourceRecords };
}

async function analyzeSeed(seed, replay, expectedInputs, root, fieldChecksums, { preflightOnly = false } = {}) {
  const summaryPath = `${REPLAY}/seed${seed}-summary.json`;
  const snapshotPath = `${REPLAY}/seed${seed}-snapshots.bin.gz`;
  const metadataPath = `${FIELD_INPUTS}/seed${seed}-metadata.json`;
  const metadataBytes = await readFile(resolve(root, metadataPath));
  assertPackageChecksum(fieldChecksums, metadataPath, metadataBytes, 'field-decision ledger');
  const metadata = JSON.parse(metadataBytes);
  assert.equal(metadata.seed, seed);
  assert.equal(metadata.sourceHashes.fullSummarySha256, expectedInputs[summaryPath].sha256);
  assert.equal(metadata.sourceHashes.fullSnapshotsCompressedSha256, expectedInputs[snapshotPath].sha256);
  assert.equal(metadata.frameCount, 599);
  assert.equal(metadata.directFootContactCountsMatchedEveryFrame, true);
  assert.equal(replay.seeds.find(row => row.seed === seed)?.analysisCount, metadata.frameCount,
    `replay analysis count seed ${seed}`);
  assert.equal(replay.seeds.find(row => row.seed === seed)?.parity?.chemicalMemory, true,
    `archived chemicalMemory field parity seed ${seed}`);

  const encoding = await extractJsonProperty(summaryPath, 'snapshotEncoding');
  const uncompressedBytes = validateEncoding(encoding, metadata);
  const descriptorSha256 = sha(Buffer.from(JSON.stringify(encoding.descriptors)));
  const compressed = await readFile(resolve(root, snapshotPath));
  assert.equal(compressed.length, expectedInputs[snapshotPath].bytes);
  assert.equal(sha(compressed), expectedInputs[snapshotPath].sha256);
  const raw = gunzipSync(compressed);
  assert.equal(raw.length, uncompressedBytes);
  assert.equal(sha(raw), metadata.rawUncompressedHashes.fullSnapshotsSha256);

  const descriptors = encoding.descriptors;
  const updateSchedule = productionUpdateSchedule(descriptors.at(-1).tick);
  validateUpdateCoverage(updateSchedule.map(row => row.tick), descriptors);
  const timesMs = reconstructTickTimes(descriptors.at(-1).tick);
  const elapsed = [];
  let priorAnalysisTimeMs = null;
  for (const row of updateSchedule) {
    assert.equal(row.simulationTimeMs, timesMs[row.tick], `production clock at tick ${row.tick}`);
    const descriptor = descriptors[elapsed.length];
    assert.equal(descriptor.timeSeconds, row.simulationTimeMs / 1000, `snapshot clock at tick ${row.tick}`);
    elapsed.push(priorAnalysisTimeMs === null ? 1 : (row.simulationTimeMs - priorAnalysisTimeMs) / 1000);
    assert.equal(row.elapsedSeconds, elapsed.at(-1), `production elapsed at tick ${row.tick}`);
    priorAnalysisTimeMs = row.simulationTimeMs;
  }
  assert.equal(elapsed[0], 1, 'first production update uses one second');

  if (preflightOnly) {
    const previous = new Map();
    for (const descriptor of descriptors) {
      decodeFloatArray(raw, descriptor, 'chemical', previous);
      decodeFloatArray(raw, descriptor, 'chemicalMemory', previous);
    }
    return { seed, frames: descriptors.length, cellsPerFrame: CELLS,
      updateTicks: updateSchedule.map(row => row.tick), descriptorCount: descriptors.length,
      updateCoverageExact: true, clockExact: true, finiteChemicalValues: true, finiteChemicalMemoryValues: true,
      descriptorSha256, inputCompressedSha256: sha(compressed), inputDecodedSha256: sha(raw),
      firstTick: descriptors[0].tick, firstTimeSeconds: descriptors[0].timeSeconds,
      finalTick: descriptors.at(-1).tick, finalTimeSeconds: descriptors.at(-1).timeSeconds,
      firstUpdateElapsedSeconds: elapsed[0], distinctLaterElapsedSeconds: [...new Set(elapsed.slice(1))].sort((a, b) => a - b),
      recurrenceExecuted: false, comparedValues: 0 };
  }

  const model = new TrailPlateBirth();
  const pheromone = new PheromoneField({ width: WIDTH, height: HEIGHT });
  const originalUpdate = model.updateChemicalMemory.bind(model);
  const observedElapsed = [];
  model.updateChemicalMemory = (field, dt) => { observedElapsed.push(dt); originalUpdate(field, dt); };
  const previous = new Map();
  const mismatchCounts = [];
  let frameIndex = 0, simulationTimeMs = 0, comparedValues = 0, matchingValues = 0;
  let maxAbsoluteError = 0, firstMismatch = null, mismatchedFrames = 0;
  const lastTick = descriptors.at(-1).tick;
  for (let tick = 1; tick <= lastTick; tick += 1) {
    simulationTimeMs += DT * 1000;
    const descriptor = descriptors[frameIndex]?.tick === tick ? descriptors[frameIndex] : null;
    let archivedMemory = null;
    if (descriptor) {
      const chemical = decodeFloatArray(raw, descriptor, 'chemical', previous);
      pheromone.values.set(chemical.values);
      archivedMemory = decodeFloatArray(raw, descriptor, 'chemicalMemory', previous);
    }
    const beforeAnalysisTimeMs = model.lastAnalysisTimeMs;
    model.advance({ pheromone, surface: null, simulationTimeMs });
    const didUpdate = model.lastAnalysisTimeMs !== beforeAnalysisTimeMs;
    assert.equal(didUpdate, Boolean(descriptor), `one archived input per production update at tick ${tick}`);
    if (!didUpdate) continue;
    assert.equal(model.lastAnalysisTimeMs, simulationTimeMs);
    assert.equal(observedElapsed.at(-1), elapsed[frameIndex]);
    const reconstructedBytes = Buffer.from(model.chemicalMemory.buffer,
      model.chemicalMemory.byteOffset, model.chemicalMemory.byteLength);
    let frameMismatches = 0;
    for (let cell = 0; cell < CELLS; cell += 1) {
      const offset = cell * 4;
      const actual = reconstructedBytes.readFloatLE(offset), expected = archivedMemory.values[cell];
      const error = Math.abs(actual - expected);
      maxAbsoluteError = Math.max(maxAbsoluteError, error);
      comparedValues += 1;
      if (!reconstructedBytes.subarray(offset, offset + 4).equals(archivedMemory.bytes.subarray(offset, offset + 4))) {
        frameMismatches += 1;
        if (!firstMismatch) firstMismatch = {
          seed, frame: frameIndex, tick, timeSeconds: descriptor.timeSeconds, cellIndex: cell,
          expectedArchived: { value: expected, bits: bitsHex(archivedMemory.bytes, offset) },
          actualReconstructed: { value: actual, bits: bitsHex(reconstructedBytes, offset) },
          absoluteError: error
        };
      } else matchingValues += 1;
    }
    if (frameMismatches) mismatchedFrames += 1;
    mismatchCounts.push({ seed, frame: frameIndex, tick, timeSeconds: descriptor.timeSeconds,
      mismatches: frameMismatches });
    frameIndex += 1;
  }
  assert.equal(frameIndex, descriptors.length, `all archive frames consumed seed ${seed}`);
  assert.equal(observedElapsed.length, descriptors.length, `all production updates observed seed ${seed}`);
  assert.equal(comparedValues, descriptors.length * CELLS);
  return {
    seed, frames: descriptors.length, comparedFrames: descriptors.length,
    comparedCells: comparedValues, comparedValues, matchingCells: matchingValues, matchingValues,
    mismatches: comparedValues - matchingValues,
    mismatchFraction: (comparedValues - matchingValues) / comparedValues,
    mismatchedFrames, maxAbsoluteError, firstMismatch,
    firstTick: descriptors[0].tick, firstTimeSeconds: descriptors[0].timeSeconds,
    finalTick: descriptors.at(-1).tick, finalTimeSeconds: descriptors.at(-1).timeSeconds,
    updateTicks: updateSchedule.map(row => row.tick),
    descriptorSha256, updateIntervals: {
      count: elapsed.length, firstElapsedSeconds: elapsed[0], minElapsedSeconds: Math.min(...elapsed.slice(1)),
      maxElapsedSeconds: Math.max(...elapsed.slice(1)), distinctElapsedSeconds: [...new Set(elapsed.slice(1))].sort((a, b) => a - b)
    }, mismatchPropagation: firstMismatch ? { firstMismatchFrame: firstMismatch.frame,
      firstMismatchTick: firstMismatch.tick,
      lastMismatchFrame: mismatchCounts.findLast(row => row.mismatches > 0)?.frame ?? null,
      lastMismatchTick: mismatchCounts.findLast(row => row.mismatches > 0)?.tick ?? null,
      framesWithMismatch: mismatchedFrames } : null,
    mismatchCounts
  };
}

async function writeOutputs(output, summary, results, sourceRecords, productionHashes) {
  const frameCsv = csvLine(['seed', 'frame', 'tick', 'timeSeconds', 'mismatches'])
    + results.flatMap(row => row.mismatchCounts || []).map(row => csvLine([row.seed, row.frame, row.tick,
      row.timeSeconds, row.mismatches])).join('');
  const outputPath = resolve(ROOT, output);
  await mkdir(outputPath, { recursive: true });
  const files = {
    'summary.json': Buffer.from(JSON.stringify(summary, null, 2) + '\n'),
    'frame-mismatch-counts.csv': Buffer.from(frameCsv),
    'input-fingerprints.json': Buffer.from(JSON.stringify({ frozenInputs: sourceRecords,
      productionSourceHashes: productionHashes }, null, 2) + '\n')
  };
  files['checksums.json'] = Buffer.from(JSON.stringify({ schemaVersion: 1,
    files: Object.entries(files).map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes) }))
      .sort((a, b) => a.path.localeCompare(b.path)) }, null, 2) + '\n');
  for (const [path, bytes] of Object.entries(files)) await writeFile(resolve(outputPath, path), bytes);
  return outputPath;
}

export async function run(output = `${PACKAGE}/results`) {
  const baseline = await loadBaseline(ROOT);
  const expectedInputs = Object.fromEntries(baseline.protectedInputs.map(row => [row.path, row]));
  if (baseline.gaps.length) {
    const preflight = [];
    for (const seed of SEEDS) preflight.push(await analyzeSeed(seed, baseline.replay, expectedInputs, ROOT,
      baseline.fieldChecksums, { preflightOnly: true }));
    const summary = {
      schemaVersion: 1, status: 'BLOCKED', decision: 'Inconclusive',
      question: 'Can archived chemical inputs reproduce every stored chemicalMemory value byte-for-byte?',
      startingHead: STARTING_HEAD, sourceReplayCommit: baseline.replay.replayManifest.commit,
      inputGap: baseline.gaps, recurrenceExecuted: false,
      note: 'The audit stopped after verifying frozen input bytes, descriptors, field array offsets, exact production tick coverage, timestamps, and finite Float32 inputs. It did not compare reconstructed chemicalMemory values.',
      preflight: { archiveFramesPerSeed: 599, archiveSeeds: SEEDS, seedResults: preflight,
        productionSourceHashes: baseline.productionHashes, frozenSourceFingerprints: baseline.sourceRecords,
        priorW1Parity: baseline.priorParity },
      validations: { archiveAndPriorEvidenceHashes: true, metadataAndDescriptors: true,
        xorOffsetsByteOrderAndFiniteInputs: true, productionUpdateTicksAndClocks: true,
        archivedCaptureTiming: false, recurrenceAnd16_561_152ValueComparison: false,
        qAndActivePriorParityLedgersVerified: true, rngUsed: false },
      limitations: ['The recorded replay runner SHA-256 does not match the available runner source. Without that capture-source proof, the archive cannot establish that each chemical array and chemicalMemory value bracketed the same production update.']
    };
    const outputPath = await writeOutputs(output, summary, preflight, baseline.sourceRecords, baseline.productionHashes);
    process.stdout.write(JSON.stringify({ output: outputPath, status: summary.status,
      decision: summary.decision, gap: baseline.gaps[0].code, recurrenceExecuted: false }) + '\n');
    return summary;
  }
  const results = [];
  for (const seed of SEEDS) results.push(await analyzeSeed(seed, baseline.replay, expectedInputs, ROOT,
    baseline.fieldChecksums));
  const summary = {
    schemaVersion: 1, decision: 'Supported',
    question: 'Do archived Float32 chemical inputs and the existing production sampler, bound, and EMA reproduce every archived chemicalMemory value byte-for-byte?',
    interpretation: 'Input sufficiency for the existing recurrence only; no W1 material ontology or formation mechanism is selected.',
    startingHead: STARTING_HEAD, sourceReplayCommit: baseline.replay.replayManifest.commit,
    replayDtSeconds: DT, clock: 'simulationTimeMs starts at zero and accumulates dt * 1000 once per archived controller tick; first TrailPlateBirth.advance uses elapsedSeconds = 1; later elapsed uses differences of reconstructed simulationTimeMs.',
    recurrence: 'TrailPlateBirth.advance -> updateChemicalMemory -> production createPheromoneSampler -> raw=max(0,sampled) -> bounded=raw/(raw+0.04) -> Float32 in-place memory += (bounded-memory)*(1-exp(-max(0,elapsedSeconds)/20)).',
    inputMoment: 'ant-morphology-replay captures chemical and chemicalMemory from controller.field and TrailPlateBirth after the same successful one-second qualification update; source hashes match the archived replay source.',
    archive: { seeds: SEEDS, framesPerSeed: 599, totalFrames: 1797, cellsPerFrame: CELLS,
      totalComparedValues: results.reduce((sum, row) => sum + row.comparedCells, 0),
      arrays: ARRAY_ORDER, decodedEndian: os.endianness(), xorDecodedAndOffsetsVerified: true },
    productionSourceHashes: baseline.productionHashes,
    frozenSourceFingerprints: baseline.sourceRecords,
    priorRawAndPostContactEvidencePreserved: true,
    results: results.map(({ mismatchCounts, ...row }) => row),
    validations: { sourceProvenance: true, exactSourceHashesAndSizes: true, replayDescriptorsAndMetadataMatch: true,
      productionUpdateScheduleEqualsEveryArchiveTick: true, clockMatchesEveryStoredTime: true,
      allFramesCausalAndSequential: true, productionUpdaterAndSamplerReused: true,
      byteOrderFloat32AndFiniteValuesVerified: true, allCellsCompared: true,
      originalW1GeometryIdentityClosureCharacterUntouched: true,
      qAndActivePriorParityLedgersVerified: true, rngUsed: false }
  };
  assert.equal(summary.archive.totalComparedValues, 16_561_152);
  summary.decision = results.every(row => row.mismatches === 0) ? 'Supported' : 'Falsified / Incomplete';
  const outputPath = await writeOutputs(output, summary, results, baseline.sourceRecords, baseline.productionHashes);
  process.stdout.write(JSON.stringify({ output: outputPath, decision: summary.decision,
    comparedValues: summary.archive.totalComparedValues, mismatches: results.reduce((sum, row) => sum + row.mismatches, 0) }) + '\n');
  return summary;
}

export async function runConsistencyCheck(output = `${CONSISTENCY_PACKAGE}/results`) {
  const baseline = await loadBaseline(ROOT);
  const expectedInputs = Object.fromEntries(baseline.protectedInputs.map(row => [row.path, row]));
  if (!consistencyCheckMayProceed(baseline.gaps)) {
    const preflight = [];
    for (const seed of SEEDS) preflight.push(await analyzeSeed(seed, baseline.replay, expectedInputs, ROOT,
      baseline.fieldChecksums, { preflightOnly: true }));
    const summary = {
      schemaVersion: 1, status: 'INCONCLUSIVE', decision: 'Inconclusive',
      question: 'Are archived chemical and chemicalMemory values numerically consistent with the current production recurrence?',
      scope: 'Archive-internal numerical consistency only; no archived same-update capture relationship is assumed.',
      startingHead: CONSISTENCY_STARTING_HEAD, sourceReplayCommit: baseline.replay.replayManifest.commit,
      runnerProvenanceVerified: false, inputGaps: baseline.gaps, recurrenceExecuted: false,
      preflight: { archiveFramesPerSeed: 599, archiveSeeds: SEEDS, seedResults: preflight,
        productionSourceHashes: baseline.productionHashes, frozenSourceFingerprints: baseline.sourceRecords,
        priorW1Parity: baseline.priorParity },
      validations: { archiveAndPriorEvidenceHashes: true, metadataAndDescriptors: true,
        xorOffsetsByteOrderAndFiniteInputs: true, productionUpdateTicksAndClocks: true,
        archivedCaptureTiming: false, runnerProvenanceVerified: false,
        recurrenceAnd16_561_152ValueComparison: false, rngUsed: false },
      limitations: ['A non-runner input/source gap prevents a valid numerical comparison.']
    };
    const outputPath = await writeOutputs(output, summary, preflight, baseline.sourceRecords, baseline.productionHashes);
    process.stdout.write(JSON.stringify({ output: outputPath, status: summary.status,
      decision: summary.decision, recurrenceExecuted: false }) + '\n');
    return summary;
  }

  const results = [];
  for (const seed of SEEDS) results.push(await analyzeSeed(seed, baseline.replay, expectedInputs, ROOT,
    baseline.fieldChecksums));
  const totalComparedValues = results.reduce((sum, row) => sum + row.comparedValues, 0);
  const totalMismatches = results.reduce((sum, row) => sum + row.mismatches, 0);
  assert.equal(totalComparedValues, 16_561_152);
  const summary = {
    schemaVersion: 1, status: 'COMPLETE',
    decision: totalMismatches === 0 ? 'Consistent' : 'Inconsistent',
    question: 'Are archived chemical and chemicalMemory values numerically consistent with the current production recurrence?',
    scope: 'Archive-internal numerical consistency only. A match does not verify the original replay runner or archived capture timing.',
    startingHead: CONSISTENCY_STARTING_HEAD,
    currentMainBaseline: 'a78249fc02fb7990568d62709e9a087489fe632b',
    sourceReplayCommit: baseline.replay.replayManifest.commit,
    runnerProvenanceVerified: false,
    runnerProvenance: { recordedHash: baseline.replay.replayManifest.runnerHash,
      availableFileHash: baseline.productionHashes['scripts/ant-morphology-replay.js'],
      matched: !baseline.gaps.some(gap => gap.path === 'scripts/ant-morphology-replay.js'),
      limitation: 'The original replay runner bytes and capture timing are not verified; this numerical check does not change the prior provenance or sufficiency-audit status.' },
    clock: 'simulationTimeMs starts at zero and accumulates dt * 1000 once per archived controller tick; the first production update uses elapsedSeconds = 1; subsequent elapsed values use differences between reconstructed simulationTimeMs values.',
    recurrence: 'TrailPlateBirth.advance -> updateChemicalMemory -> production createPheromoneSampler -> raw=max(0,sampled) -> bounded=raw/(raw+0.04) -> Float32 in-place memory += (bounded-memory)*(1-exp(-max(0,elapsedSeconds)/20)).',
    archive: { seeds: SEEDS, framesPerSeed: 599, totalFrames: 1797, cellsPerFrame: CELLS,
      totalComparedValues, totalMismatches, mismatchFraction: totalMismatches / totalComparedValues,
      arrays: ARRAY_ORDER, decodedEndian: os.endianness(), xorDecodedAndOffsetsVerified: true,
      clockCoverageExact: true },
    productionSourceHashes: baseline.productionHashes,
    frozenSourceFingerprints: baseline.sourceRecords,
    priorW1ParityChecks: baseline.priorParity,
    priorRawAndPostContactEvidencePreserved: true,
    results: results.map(({ mismatchCounts, ...row }) => row),
    validations: { frozenInputHashesAndDescriptors: true, xorDecodeOffsetsAndByteOrder: true,
      productionUpdateTicksAndClockCoverage: true, productionUpdaterAndSamplerReused: true,
      float32InPlaceStorage: true, allFramesCausalAndSequential: true, allCellsCompared: true,
      priorW1QAndActiveParityVerified: true,
      runnerProvenanceVerified: false, archivedSameUpdateCaptureTiming: false,
      previousSufficiencyAuditStatusChanged: false, w1OntologyChanged: false, rngUsed: false }
  };
  const outputPath = await writeOutputs(output, summary, results, baseline.sourceRecords, baseline.productionHashes);
  process.stdout.write(JSON.stringify({ output: outputPath, status: summary.status,
    decision: summary.decision, comparedValues: totalComparedValues, mismatches: totalMismatches,
    runnerProvenanceVerified: false }) + '\n');
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--consistency-check') {
    await runConsistencyCheck(process.argv[3] || `${CONSISTENCY_PACKAGE}/results`);
  } else await run(process.argv[2] || `${PACKAGE}/results`);
}
