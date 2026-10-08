import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const GRID = 96;
const CELLS = GRID * GRID;
const SEEDS = [20261005, 20261006, 20261007];
const ORDER = ['chemical', 'chemicalMemory', 'surface', 'support', 'contactCounts'];
const REPLAY_VERIFICATION = resolve(ROOT, 'docs/ant/evidence/2026-10-08-interior-endpoint-shadow/data/replay-verification.json');
const PACKAGED_SUMMARY_DIR = resolve(ROOT, 'docs/ant/evidence/2026-10-08-interior-endpoint-shadow/data');
const CONTACT_ARCHIVE_DIR = resolve(ROOT, 'docs/ant/evidence/2026-10-07-social-graph/data');
const CONTACT_ARCHIVE_LEDGER = resolve(ROOT, 'docs/ant/evidence/2026-10-07-social-graph/checksums.json');
const MORPHOLOGY_DATA_DIR = resolve(ROOT, 'docs/ant/evidence/2026-10-08-movement-material-morphology/data');
const MORPHOLOGY_LEDGER = resolve(ROOT, 'docs/ant/evidence/2026-10-08-movement-material-morphology/validation/package-sha256.json');
const args = new Map(process.argv.slice(2).map(value => {
  const at = value.indexOf('=');
  return at < 0 ? [value, true] : [value.slice(0, at), value.slice(at + 1)];
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

async function main() {
  const input = resolve(String(args.get('--input') || resolve(ROOT, 'test-results/ant-interior-endpoint-shadow')));
  const output = resolve(String(args.get('--output') || resolve(ROOT, 'test-results/ant-local-accretion-inputs')));
  const verification = JSON.parse(await readFile(REPLAY_VERIFICATION, 'utf8'));
  const archiveLedger = JSON.parse(await readFile(CONTACT_ARCHIVE_LEDGER, 'utf8'));
  const morphologyLedger = JSON.parse(await readFile(MORPHOLOGY_LEDGER, 'utf8'));
  await mkdir(output, { recursive: true });
  const seeds = [], gapSeeds = [];
  for (const seed of SEEDS) {
    const record = verification.seeds.find(item => item.seed === seed);
    assert.ok(record, `Missing committed verification record for seed ${seed}`);
    const cachedSummary = await checkedFile(resolve(input, `seed${seed}-summary.json`), record.artifacts.fullSummary);
    const packedSummary = await checkedFile(resolve(PACKAGED_SUMMARY_DIR, `seed${seed}-summary.json.gz`), record.artifacts.packagedSummary);
    const snapshotGzip = await checkedFile(resolve(input, `seed${seed}-snapshots.bin.gz`), record.artifacts.fullSnapshots);
    const { snapshotEncoding, rawArchive } = extractTopLevelProperties(cachedSummary, ['snapshotEncoding', 'rawArchive']);
    assert.equal(snapshotEncoding.descriptors.length, 599, `Seed ${seed} captured analysis rows`);
    const snapshotsRaw = gunzipSync(snapshotGzip);
    const snapshots = decodeXorSnapshots(snapshotsRaw, snapshotEncoding);
    const morphologyPath = `data/seed${seed}-summary.json.gz`;
    const morphologyRecord = morphologyLedger.files.find(item => item.path === morphologyPath);
    assert.ok(morphologyRecord, `Missing committed morphology summary checksum for seed ${seed}`);
    const morphologyGzip = await checkedFile(resolve(MORPHOLOGY_DATA_DIR, `seed${seed}-summary.json.gz`), morphologyRecord);
    const morphologyRaw = gunzipSync(morphologyGzip);
    const morphologySummary = JSON.parse(morphologyRaw.toString('utf8'));
    assert.equal(morphologySummary.seed, seed, `Seed ${seed} original morphology summary`);
    const inputGap = compareFunnelInput(seed, morphologySummary.morphology, snapshots);
    gapSeeds.push({ ...inputGap, sourceHashes: { fullSnapshotsCompressedSha256: sha256(snapshotGzip),
      fullSnapshotsSha256: sha256(snapshotsRaw), originalMorphologySummaryCompressedSha256: sha256(morphologyGzip),
      originalMorphologySummarySha256: sha256(morphologyRaw) } });
    const archivePath = resolve(CONTACT_ARCHIVE_DIR, `seed${seed}-on-raw-events.json.gz`);
    const archiveRelativePath = `data/seed${seed}-on-raw-events.json.gz`;
    const archiveRecord = archiveLedger.files.find(item => item.path === archiveRelativePath);
    assert.ok(archiveRecord, `Missing committed raw archive checksum for seed ${seed}`);
    const archiveGzip = await checkedFile(archivePath, archiveRecord);
    const archiveRaw = gunzipSync(archiveGzip);
    const archive = JSON.parse(archiveRaw.toString('utf8'));
    assert.equal(archive.contacts.length, rawArchive.contacts, `Seed ${seed} archived FOOT_CONTACT group count`);
    const decisionPacket = encodeDecisionFlags(archive.contacts, snapshots);
    const flags = decisionPacket.bytes;
    const frames = snapshotEncoding.descriptors.map(({ tick, timeSeconds }) => ({ tick, timeSeconds }));
    const flagPath = `seed${seed}-flags.bin.gz`;
    const flagsGzip = gzipSync(flags, { level: 6 });
    await writeFile(resolve(output, flagPath), flagsGzip);
    const milestones = encodeMilestoneFields(snapshots);
    const milestonePath = `seed${seed}-milestones.bin.gz`;
    const milestonesGzip = gzipSync(milestones.bytes, { level: 6 });
    await writeFile(resolve(output, milestonePath), milestonesGzip);
    const metadata = {
      schemaVersion: 1, seed, source: 'frozen archived natural run; no controller, RNG, or replay invoked',
      frameCount: frames.length, fieldDimensions: [GRID, GRID], encoding: 'row-major byte-per-cell flags; frame-major; gzip compressed',
      flagBits: { 0: 'chemicalMemory >= 0.30', 1: 'conditional mechanical support >= 0.015', 2: 'at least two distinct FOOT_CONTACT simulationTimeMs values in cell' },
      flagReadEquivalence: 'For each bit, Boolean(byte & mask) equals that frame cell threshold predicate; bits are masks, not grayscale amplitudes.',
      thresholds: { chemicalMemory: 0.30, conditionalMechanicalSupport: 0.015, distinctContactTimestamps: 2 },
      frames, sourceHashes: {
        fullSummarySha256: sha256(cachedSummary), fullSnapshotsCompressedSha256: sha256(snapshotGzip),
        packagedSummaryCompressedSha256: sha256(packedSummary), rawFootContactsCompressedSha256: sha256(archiveGzip),
        rawFootContactsLedgerSha256: archiveRecord.sha256
      },
      sourceFiles: { fullSummary: `seed${seed}-summary.json`, fullSnapshots: `seed${seed}-snapshots.bin.gz`,
        packagedSummary: `docs/ant/evidence/2026-10-08-interior-endpoint-shadow/data/seed${seed}-summary.json.gz`,
        rawFootContacts: `docs/ant/evidence/2026-10-07-social-graph/data/seed${seed}-on-raw-events.json.gz`,
        rawFootContactsLedger: 'docs/ant/evidence/2026-10-07-social-graph/checksums.json',
        originalMorphologySummary: `docs/ant/evidence/2026-10-08-movement-material-morphology/${morphologyPath}`,
        originalMorphologyLedger: 'docs/ant/evidence/2026-10-08-movement-material-morphology/validation/package-sha256.json' },
      rawUncompressedHashes: { fullSnapshotsSha256: sha256(snapshotsRaw), packagedSummarySha256: sha256(gunzipSync(packedSummary)),
        rawFootContactsSha256: sha256(archiveRaw) },
      originalMorphologySummary: { compressedSha256: sha256(morphologyGzip),
        compressedBytes: morphologyGzip.length, uncompressedSha256: sha256(morphologyRaw),
        funnelUnionRows: inputGap.rows.length,
        sourceEqualRows: inputGap.equalRows, rowsWithFourMissingCells: inputGap.rowsWithFourMissingCells },
      replayProvenance: { commit: verification.replayManifest.commit, toolingCommit: verification.toolingCommit,
        runnerSha256: verification.replayManifest.runnerHash,
        transformedSourceSha256: verification.replayManifest.transformedSourceHash,
        sourceHashes: verification.replayManifest.sourceHashes },
      files: { flags: { path: flagPath, compressedBytes: flagsGzip.length, uncompressedBytes: flags.length,
        compressedSha256: sha256(flagsGzip), uncompressedSha256: sha256(flags) },
        milestones: { path: milestonePath, compressedBytes: milestonesGzip.length, uncompressedBytes: milestones.bytes.length,
          compressedSha256: sha256(milestonesGzip), uncompressedSha256: sha256(milestones.bytes),
          encoding: 'frame-major; each milestone stores exact Float32 bytes in chemicalMemory, support, surface order',
          fields: ['chemicalMemory', 'support', 'surface'], descriptors: milestones.descriptors } },
      directFootContactCountsMatchedEveryFrame: true,
      archivedFootContactGroups: archive.contacts.length,
      skippedOutOfDomainFootPoints: decisionPacket.skippedOutOfDomainFootPoints,
      replayVerificationRecord: 'docs/ant/evidence/2026-10-08-interior-endpoint-shadow/data/replay-verification.json'
    };
    await writeFile(resolve(output, `seed${seed}-metadata.json`), `${JSON.stringify(metadata, null, 2)}\n`);
    seeds.push({ seed, frames: frames.length, compressedBytes: flagsGzip.length, milestoneBytes: milestonesGzip.length,
      funnelUnionRows: inputGap.rows.length });
  }
  const inputGap = { schemaVersion: 1,
    rule: 'Original funnel union is the union of morphology[].funnel.components[].supportedComponentIndices; source binary is chemicalMemory >= 0.30 AND conditional support >= 0.015.',
    source: 'Full XOR-decoded saved snapshots, hash-verified against committed replay-verification.json; no replay was run.',
    expectedPattern: { rowsWithNoExtraCells: true, rowsWithExactlyFourMissingCells: 25 },
    totalRowsWithExactlyFourMissingCells: gapSeeds.reduce((sum, seed) => sum + seed.rowsWithFourMissingCells, 0),
    totalRowsWithExtraCells: gapSeeds.reduce((sum, seed) => sum + seed.rowsWithExtraCells, 0), seeds: gapSeeds };
  await writeFile(resolve(output, 'input-gap.json'), `${JSON.stringify(inputGap, null, 2)}\n`);
  assert.equal(gapSeeds.reduce((sum, seed) => sum + seed.rows.length, 0), 25,
    'Expected exactly 25 source/funnel mismatch timestamps');
  assert.equal(inputGap.totalRowsWithExactlyFourMissingCells, 25, 'Expected exactly 25 four-cell source/funnel gaps');
  assert.equal(inputGap.totalRowsWithExtraCells, 0, 'Original funnel union must not add cells outside source binary');
  for (const seed of gapSeeds) for (const row of seed.rows) assert.equal(row.missingCellIndices.length, 4,
    `Seed ${seed.seed} tick ${row.tick} must omit exactly four cells`);
  const packet = { schemaVersion: 1, dimensions: [GRID, GRID], flagsPerCell: 1, flagsMeaning: 'bit 0 chemicalMemory; bit 1 conditional support; bit 2 repeated distinct contact time', seeds };
  await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(packet, null, 2)}\n`);
  console.log(JSON.stringify({ output, seeds }));
}

async function checkedFile(path, expected) {
  const bytes = await readFile(path);
  verifyArtifact(bytes, expected, path);
  return bytes;
}

function verifyArtifact(bytes, expected, label = 'Artifact') {
  assert.equal(bytes.length, expected.bytes, `${label} byte size differs from committed record`);
  assert.equal(sha256(bytes), expected.sha256, `${label} SHA-256 differs from committed record`);
}

function extractTopLevelProperties(bytes, names) {
  const text = bytes.toString('utf8'), wanted = new Set(names), result = {};
  let cursor = skipWhitespace(text, 0);
  assert.equal(text[cursor], '{', 'Summary JSON object');
  cursor += 1;
  while (Object.keys(result).length < wanted.size) {
    cursor = skipWhitespace(text, cursor);
    if (text[cursor] === ',') cursor = skipWhitespace(text, cursor + 1);
    if (text[cursor] === '}') break;
    assert.equal(text[cursor], '"', 'Top-level JSON property');
    const keyEnd = jsonStringEnd(text, cursor);
    const key = JSON.parse(text.slice(cursor, keyEnd));
    cursor = skipWhitespace(text, keyEnd);
    assert.equal(text[cursor], ':', 'Top-level JSON property delimiter');
    const valueStart = skipWhitespace(text, cursor + 1);
    const valueEnd = jsonValueEnd(text, valueStart);
    if (wanted.has(key)) result[key] = JSON.parse(text.slice(valueStart, valueEnd));
    cursor = valueEnd;
    if (Object.keys(result).length === wanted.size) break;
    if (text[cursor] === '}') break;
  }
  for (const name of wanted) assert.ok(Object.hasOwn(result, name), `Missing top-level summary field ${name}`);
  return result;
}

function jsonStringEnd(text, start) {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1;
    else if (text[index] === '"') return index + 1;
  }
  throw new Error('Unterminated JSON string');
}

function jsonValueEnd(text, start) {
  if (text[start] === '"') return jsonStringEnd(text, start);
  if (text[start] !== '{' && text[start] !== '[') {
    let index = start;
    while (index < text.length && text[index] !== ',' && text[index] !== '}') index += 1;
    return index;
  }
  const stack = [text[start]];
  let quoted = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '\\') index += 1;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') {
      const open = stack.pop();
      assert.ok((open === '{' && char === '}') || (open === '[' && char === ']'), 'Mismatched JSON delimiters');
      if (!stack.length) return index + 1;
    }
  }
  throw new Error('Unterminated JSON value');
}

function skipWhitespace(text, start) {
  while (/\s/.test(text[start] || '')) start += 1;
  return start;
}

function decodeXorSnapshots(bytes, encoding) {
  assert.equal(encoding?.arrayOrder?.join(','), ORDER.join(','), 'Snapshot array order');
  assert.ok(Array.isArray(encoding.descriptors) && encoding.descriptors.length > 0, 'Snapshot descriptors');
  let previousTick = -Infinity, previousTime = -Infinity, expectedOffset = 0;
  const previous = new Map(), snapshots = [];
  for (const descriptor of encoding.descriptors) {
    assert.ok(Number.isInteger(descriptor.tick) && descriptor.tick > previousTick, 'Snapshot ticks must increase');
    assert.ok(Number.isFinite(descriptor.timeSeconds) && descriptor.timeSeconds > previousTime, 'Snapshot times must increase');
    previousTick = descriptor.tick; previousTime = descriptor.timeSeconds;
    const arrays = {};
    for (const key of ORDER) {
      const range = descriptor.arrays?.[key];
      assert.equal(range?.bytes, CELLS * 4, `${key} byte length`);
      assert.equal(range.offset, expectedOffset, `${key} stream offset`);
      const end = range.offset + range.bytes;
      assert.ok(Number.isSafeInteger(end) && end <= bytes.length, `${key} stream range`);
      const value = Buffer.from(bytes.subarray(range.offset, end));
      assert.equal(value.length, CELLS * 4, `${key} stream truncation`);
      const prior = previous.get(key);
      if (prior) for (let index = 0; index < value.length; index += 1) value[index] ^= prior[index];
      previous.set(key, value);
      expectedOffset = end;
      arrays[key] = value;
    }
    validateFields(arrays);
    snapshots.push({ tick: descriptor.tick, timeSeconds: descriptor.timeSeconds, arrays });
  }
  assert.equal(expectedOffset, bytes.length, 'Snapshot stream has trailing or missing bytes');
  return snapshots;
}

function validateFields(arrays) {
  for (const [key, maximum] of [['chemical', 8], ['chemicalMemory', 1], ['surface', 1], ['support', 1]]) {
    for (let offset = 0; offset < arrays[key].length; offset += 4) {
      const value = arrays[key].readFloatLE(offset);
      assert.ok(Number.isFinite(value) && value >= 0 && value <= maximum,
        `${key} value outside [0,${maximum}] at cell ${offset / 4}`);
    }
  }
}

function contactCellIndex(x, y) {
  assert.ok(Number.isFinite(x) && Number.isFinite(y), 'Foot coordinates must be finite');
  assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, 'Foot coordinates must be in [0,1]');
  const index = Math.round(y * (GRID - 1)) * GRID + Math.round(x * (GRID - 1));
  assert.ok(Number.isInteger(index) && index >= 0 && index < CELLS, 'Mapped grid index outside 96x96 field');
  return index;
}

function encodeDecisionFlags(events, snapshots) {
  let skippedOutOfDomainFootPoints = 0;
  const ordered = events.map((event, index) => {
    assert.ok(Number.isFinite(event?.simulationTimeMs) && event.simulationTimeMs >= 0, 'Invalid FOOT_CONTACT time');
    assert.ok(Array.isArray(event.contacts), 'FOOT_CONTACT contacts must be an array');
    for (const contact of event.contacts) {
      assert.ok(Number.isFinite(contact?.position?.x) && Number.isFinite(contact?.position?.y),
        'Foot coordinates must be finite');
      if (contact.position.x < 0 || contact.position.x > 1 || contact.position.y < 0 || contact.position.y > 1) {
        skippedOutOfDomainFootPoints += 1;
      }
    }
    return { event, index };
  }).sort((left, right) => left.event.simulationTimeMs - right.event.simulationTimeMs || left.index - right.index);
  const frameBytes = CELLS, output = Buffer.alloc(frameBytes * snapshots.length);
  const directCounts = new Uint32Array(CELLS), distinctCounts = new Uint32Array(CELLS);
  const lastTime = new Float64Array(CELLS).fill(-Infinity);
  let eventIndex = 0;
  for (let frame = 0; frame < snapshots.length; frame += 1) {
    const throughMs = snapshots[frame].timeSeconds * 1000 + 1e-7;
    while (eventIndex < ordered.length && ordered[eventIndex].event.simulationTimeMs <= throughMs) {
      const event = ordered[eventIndex].event, timestamp = event.simulationTimeMs;
      for (const contact of event.contacts) {
        const cell = contactCellIndexIfInDomain(contact.position.x, contact.position.y);
        if (cell === null) continue;
        if (directCounts[cell] < 0xffffffff) directCounts[cell] += 1;
        if (lastTime[cell] !== timestamp) {
          if (distinctCounts[cell] < 0xffffffff) distinctCounts[cell] += 1;
          lastTime[cell] = timestamp;
        }
      }
      eventIndex += 1;
    }
    const { chemicalMemory, support } = snapshots[frame].arrays;
    const captured = snapshots[frame].arrays.contactCounts;
    for (let cell = 0; cell < CELLS; cell += 1) {
      assert.equal(captured.readUInt32LE(cell * 4), directCounts[cell],
        `FOOT_CONTACT count mismatch at frame ${frame} cell ${cell}`);
      const memory = chemicalMemory.readFloatLE(cell * 4), mechanicalSupport = support.readFloatLE(cell * 4);
      output[frame * frameBytes + cell] = (memory >= 0.30 ? 1 : 0)
        | (mechanicalSupport >= 0.015 ? 2 : 0) | (distinctCounts[cell] >= 2 ? 4 : 0);
    }
  }
  return { bytes: output, skippedOutOfDomainFootPoints };
}

function contactCellIndexIfInDomain(x, y) {
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return contactCellIndex(x, y);
}

function compareFunnelInput(seed, morphology, snapshots) {
  assert.equal(morphology.length, snapshots.length, `Seed ${seed} morphology/source frame count`);
  const rows = [];
  let equalRows = 0, rowsWithFourMissingCells = 0, rowsWithExtraCells = 0;
  for (let frame = 0; frame < snapshots.length; frame += 1) {
    const original = morphology[frame], snapshot = snapshots[frame];
    assert.equal(original.tick, snapshot.tick, `Seed ${seed} tick alignment at frame ${frame}`);
    assert.ok(Math.abs(original.timeSeconds - snapshot.timeSeconds) < 1e-9,
      `Seed ${seed} time alignment at frame ${frame}`);
    const originalUnion = new Set();
    for (const component of original.funnel.components) {
      assert.ok(Array.isArray(component.supportedComponentIndices),
        `Seed ${seed} frame ${frame} component support indices`);
      for (const index of component.supportedComponentIndices) {
        assert.ok(Number.isInteger(index) && index >= 0 && index < CELLS,
          `Seed ${seed} frame ${frame} has invalid original cell index ${index}`);
        originalUnion.add(index);
      }
    }
    const { chemicalMemory, support } = snapshot.arrays;
    const source = new Set();
    for (let cell = 0; cell < CELLS; cell += 1) if (chemicalMemory.readFloatLE(cell * 4) >= 0.30
      && support.readFloatLE(cell * 4) >= 0.015) source.add(cell);
    const extraCellIndices = [...originalUnion].filter(index => !source.has(index)).sort((a, b) => a - b);
    const missingCellIndices = [...source].filter(index => !originalUnion.has(index)).sort((a, b) => a - b);
    if (!extraCellIndices.length && !missingCellIndices.length) { equalRows += 1; continue; }
    if (extraCellIndices.length) rowsWithExtraCells += 1;
    if (extraCellIndices.length === 0 && missingCellIndices.length === 4) rowsWithFourMissingCells += 1;
    rows.push({ tick: original.tick, timeSeconds: original.timeSeconds,
      originalFunnelUnionCount: originalUnion.size, sourceBinaryCount: source.size,
      extraCellIndices, missingCellIndices });
  }
  return { seed, analysisRows: snapshots.length, equalRows, rowsWithFourMissingCells, rowsWithExtraCells, rows };
}

function encodeMilestoneFields(snapshots, targets = [120, 300, 600]) {
  const fields = ['chemicalMemory', 'support', 'surface'], chunks = [], descriptors = [];
  let offset = 0;
  for (const requestedSeconds of targets) {
    const snapshot = snapshots.reduce((closest, candidate) => !closest
      || Math.abs(candidate.timeSeconds - requestedSeconds) < Math.abs(closest.timeSeconds - requestedSeconds)
      || (Math.abs(candidate.timeSeconds - requestedSeconds) === Math.abs(closest.timeSeconds - requestedSeconds)
        && candidate.timeSeconds > closest.timeSeconds) ? candidate : closest, null);
    const arrays = {};
    for (const field of fields) {
      const bytes = snapshot.arrays[field];
      arrays[field] = { offset, bytes: bytes.length };
      chunks.push(bytes); offset += bytes.length;
    }
    descriptors.push({ requestedSeconds, tick: snapshot.tick, timeSeconds: snapshot.timeSeconds,
      offsetSeconds: snapshot.timeSeconds - requestedSeconds, arrays });
  }
  return { bytes: Buffer.concat(chunks), descriptors };
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

export { compareFunnelInput, contactCellIndex, decodeXorSnapshots, encodeDecisionFlags, encodeMilestoneFields,
  extractTopLevelProperties, sha256, validateFields, verifyArtifact };
