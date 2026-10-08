import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { indexTrajectory } from './ant-social-null.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOCIAL = 'docs/ant/evidence/2026-10-07-social-graph';
const ALLOWED_SEEDS = [20261005, 20261006, 20261007];
const GRID_SIZE = 96;
const SOCIAL_CHECKSUMS_SHA256 = '77bfc7f34174b1853acf6a77e6bdbc2409d69e22271d4ab7e509c26d04343dbb';
const HASH = value => createHash('sha256').update(value).digest('hex');

function assertHash(bytes, expected, label) {
  assert.equal(HASH(bytes), expected, `${label} SHA-256`);
}

function positionAt(trajectory, life, frameIndex) {
  if (frameIndex < life.startFrame || frameIndex > life.endFrame) return null;
  const offset = life.sampleOffsets[frameIndex - life.startFrame];
  return { x: trajectory.bytes.readDoubleLE(offset + 4), y: trajectory.bytes.readDoubleLE(offset + 12) };
}

function directionAt(trajectory, life, timeSeconds) {
  assert.ok(Number.isFinite(timeSeconds) && timeSeconds >= 0, 'finite nonnegative contact time');
  const frameIndex = latestFrameAtOrBefore(trajectory.frames, timeSeconds + 1e-9);
  if (frameIndex < 1) return null;
  const from = positionAt(trajectory, life, frameIndex - 1);
  const to = positionAt(trajectory, life, frameIndex);
  if (!from || !to) return null;
  const dx = to.x - from.x, dy = to.y - from.y, magnitude = Math.hypot(dx, dy);
  if (magnitude === 0) return null;
  const segmentStartSeconds = trajectory.frames[frameIndex - 1].timeSeconds;
  const segmentEndSeconds = trajectory.frames[frameIndex].timeSeconds;
  assert.ok(segmentEndSeconds <= timeSeconds + 1e-9, 'movement segment ends no later than contact time');
  const theta = Math.atan2(dy, dx);
  return { nematicX: Math.cos(2 * theta), nematicY: Math.sin(2 * theta),
    segmentStartSeconds, segmentEndSeconds, travelDistance: magnitude };
}

function latestFrameAtOrBefore(frames, timeSeconds) {
  let low = 0, high = frames.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (frames[middle].timeSeconds <= timeSeconds) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

function makeFootInputs(contacts, trajectory, metadata) {
  const lives = new Map(trajectory.lives.map(life => [life.id, life]));
  const fieldTimes = metadata.frames.map(frame => frame.timeSeconds);
  assert.ok(fieldTimes.length > 0);
  fieldTimes.forEach((time, index) => {
    assert.ok(Number.isFinite(time) && time >= 0 && time <= 600, 'finite field sample time');
    if (index) assert.ok(time > fieldTimes[index - 1], 'strictly increasing field sample time');
  });
  const intervals = fieldTimes.map((endSeconds, index) => ({
    index,
    startSeconds: index === 0 ? 0 : fieldTimes[index - 1],
    endSeconds,
    feet: [],
    contactGroups: 0,
    uniqueAnts: new Set(),
    invalidDirections: 0
  }));
  const sorted = contacts.map((event, sourceIndex) => ({ event, sourceIndex }));
  sorted.sort((a, b) => a.event.simulationTimeMs - b.event.simulationTimeMs || a.sourceIndex - b.sourceIndex);
  const feet = [];
  let previousTime = -Infinity, invalidPositions = 0, unbucketedGroups = 0;
  for (const [contactIndex, { event }] of sorted.entries()) {
    assert.equal(event.type, 'FOOT_CONTACT', 'contact type');
    assert.ok(typeof event.antId === 'string' && lives.has(event.antId), 'known stable ant ID');
    assert.ok(Number.isFinite(event.simulationTimeMs) && event.simulationTimeMs >= 0, 'finite contact time');
    const timeSeconds = event.simulationTimeMs / 1000;
    assert.ok(timeSeconds <= trajectory.frames.at(-1).timeSeconds + 1e-9, 'contact lies within recording');
    assert.ok(timeSeconds + 1e-12 >= previousTime, 'contacts are sorted on copied list');
    previousTime = timeSeconds;
    const intervalIndex = lowerBound(fieldTimes, timeSeconds - 1e-9);
    const interval = intervals[intervalIndex];
    const inside = interval && timeSeconds > interval.startSeconds + 1e-9 && timeSeconds <= interval.endSeconds + 1e-9;
    if (!inside) unbucketedGroups += 1;
    const direction = directionAt(trajectory, lives.get(event.antId), timeSeconds);
    const eventFeet = event.contacts;
    assert.ok(Array.isArray(eventFeet) && eventFeet.length > 0, 'individual foot contacts');
    if (inside) {
      interval.contactGroups += 1;
      interval.uniqueAnts.add(event.antId);
      if (!direction) interval.invalidDirections += 1;
    }
    for (const foot of eventFeet) {
      const x = foot.position?.x, y = foot.position?.y;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        invalidPositions += 1;
        continue;
      }
      const row = {
        timeSeconds,
        antId: event.antId,
        contactIndex,
        cellIndex: Math.round(y * (GRID_SIZE - 1)) * GRID_SIZE + Math.round(x * (GRID_SIZE - 1)),
        nematicX: direction?.nematicX ?? null,
        nematicY: direction?.nematicY ?? null,
        directionAvailable: Boolean(direction),
        segmentStartSeconds: direction?.segmentStartSeconds ?? null,
        segmentEndSeconds: direction?.segmentEndSeconds ?? null,
        travelDistance: direction?.travelDistance ?? null,
        intervalIndex: inside ? intervalIndex : null
      };
      feet.push(row);
      if (inside) interval.feet.push(row);
    }
  }
  for (const interval of intervals) {
    interval.uniqueAntCount = interval.uniqueAnts.size;
    delete interval.uniqueAnts;
  }
  return { feet, intervals, invalidPositions, unbucketedGroups };
}

function lowerBound(values, target) {
  let low = 0, high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function verifySocialFile(name, checksumFiles, bytes) {
  const record = checksumFiles.find(file => file.path === `data/${name}`);
  assert.ok(record, `social checksum record for ${name}`);
  assert.equal(bytes.length, record.bytes, `${name} byte count`);
  assertHash(bytes, record.sha256, name);
  return record.sha256;
}

export async function loadSeedInputs(seed, packetDirectory) {
  assert.ok(ALLOWED_SEEDS.includes(seed), 'known archived seed');
  const packetRoot = resolve(packetDirectory);
  const fieldDir = resolve(packetRoot, 'inputs/field-decisions');
  const fieldManifestBytes = await readFile(resolve(fieldDir, 'manifest.json'));
  const baselineCopiesBytes = await readFile(resolve(packetRoot, 'validation/baseline-copies.json'));
  const socialChecksumsBytes = await readFile(resolve(ROOT, SOCIAL, 'checksums.json'));
  const fieldManifest = JSON.parse(fieldManifestBytes);
  const baselineCopies = JSON.parse(baselineCopiesBytes);
  const socialChecksums = JSON.parse(socialChecksumsBytes);
  assertHash(socialChecksumsBytes, SOCIAL_CHECKSUMS_SHA256, 'committed social checksums ledger');
  assert.equal(baselineCopies.copiedGitBytesIdentical, true, 'packet copies match old committed Git bytes');
  const socialFiles = socialChecksums.files;
  const packetFiles = new Map();
  const verifyCopied = async (path, commit, sourcePath) => {
    const bytes = await readFile(resolve(packetRoot, path));
    const record = baselineCopies.files.find(file => file.targetPath.endsWith(`/${path.replaceAll('\\', '/')}`));
    assert.ok(record, `packet descriptor record for ${path}`);
    assert.equal(bytes.length, record.bytes, `${path} byte count`);
    assertHash(bytes, record.sha256, path);
    assert.equal(record.sourceCommit, commit, `${path} old source commit`);
    assert.equal(record.sourcePath, sourcePath, `${path} old source path`);
    packetFiles.set(path, record.sha256);
    return bytes;
  };
  await Promise.all(baselineCopies.files.map(async record => {
    const target = record.targetPath.split('/inputs/')[1];
    assert.ok(target && record.targetPath.startsWith('docs/ant/evidence/2026-10-08-w1-episodic-material-shadow/'),
      'copied input remains in W1 packet');
    const bytes = await readFile(resolve(packetRoot, 'inputs', target));
    assert.equal(bytes.length, record.bytes, `${target} packet byte count`);
    assertHash(bytes, record.sha256, target);
    assert.equal(typeof record.sourceCommit, 'string');
    assert.equal(typeof record.sourcePath, 'string');
    packetFiles.set(target, record.sha256);
  }));
  const names = [`seed${seed}-metadata.json`, `seed${seed}-flags.bin.gz`, `seed${seed}-milestones.bin.gz`];
  const [metadataBytes, flagsBytes, milestonesBytes, baselineBytes] = await Promise.all([
    ...names.map(name => verifyCopied(`inputs/field-decisions/${name}`, baselineCopies.sourceCommit,
      `docs/ant/evidence/2026-10-08-local-accretion-shadow/inputs/${name}`)),
    verifyCopied('inputs/baselines/local-accretion-analysis.json.gz', baselineCopies.sourceCommit,
      'docs/ant/evidence/2026-10-08-local-accretion-shadow/data/analysis.json.gz')
  ]);
  const metadata = JSON.parse(metadataBytes);
  assert.equal(metadata.seed, seed);
  assert.equal(metadata.frameCount, 599);
  assert.deepEqual(metadata.fieldDimensions, [GRID_SIZE, GRID_SIZE]);
  assert.equal(fieldManifest.seeds.find(item => item.seed === seed)?.frames, metadata.frameCount);
  const flags = gunzipSync(flagsBytes);
  const milestones = gunzipSync(milestonesBytes);
  assert.equal(flags.length, metadata.frameCount * GRID_SIZE * GRID_SIZE, 'field flag packet length');
  assert.equal(metadata.files.flags.compressedSha256, HASH(flagsBytes), 'legacy flags checksum');
  assert.equal(metadata.files.milestones.compressedSha256, HASH(milestonesBytes), 'legacy milestones checksum');
  assert.equal(metadata.files.flags.uncompressedSha256, HASH(flags), 'legacy flags payload checksum');
  assert.equal(metadata.files.milestones.uncompressedSha256, HASH(milestones), 'legacy milestones payload checksum');
  assert.ok(flags.every(value => value <= 7), 'field flags use only documented bits');
  assert.equal(milestones.length, metadata.files.milestones.uncompressedBytes,
    'milestone packet length');
  const socialNames = [`seed${seed}-summary.json`, `seed${seed}-trajectory.f64.gz`, `seed${seed}-on-raw-events.json.gz`];
  const socialBuffers = await Promise.all(socialNames.map(name => readFile(resolve(ROOT, SOCIAL, 'data', name))));
  const [summaryHash, trajectoryHash, rawHash] = socialBuffers.map((bytes, index) =>
    verifySocialFile(socialNames[index], socialFiles, bytes));
  assert.equal(metadata.sourceHashes.rawFootContactsCompressedSha256, rawHash, 'field metadata raw-contact checksum');
  const summary = JSON.parse(socialBuffers[0]);
  const raw = JSON.parse(gunzipSync(socialBuffers[2]));
  assert.equal(summary.seed, seed);
  assert.equal(raw.seed, seed);
  assert.equal(summary.seconds, 600);
  assert.equal(summary.runs.on.frameCount, 36001);
  assert.ok(Array.isArray(raw.contacts) && Array.isArray(raw.births));
  assert.equal(raw.contacts.length, metadata.archivedFootContactGroups);
  assert.equal(metadata.directFootContactCountsMatchedEveryFrame, true);
  const trajectoryBytes = gunzipSync(socialBuffers[1]);
  assert.equal(HASH(trajectoryBytes), summary.trajectory.enabledHash, 'trajectory payload checksum');
  const trajectory = indexTrajectory(trajectoryBytes, summary.runs.on.idDictionary);
  assert.equal(trajectory.frames.length, 36001);
  assert.ok(Math.abs(trajectory.frames.at(-1).timeSeconds - 600) <= 1e-9);
  const sourceHashes = {
    fieldManifest: HASH(fieldManifestBytes), baselineCopies: HASH(baselineCopiesBytes),
    socialChecksums: HASH(socialChecksumsBytes), fieldMetadata: HASH(metadataBytes),
    fieldFlags: HASH(flagsBytes), fieldMilestones: HASH(milestonesBytes), baselineAnalysis: HASH(baselineBytes),
    socialSummary: summaryHash, trajectory: trajectoryHash, rawContacts: rawHash
  };
  const footInput = makeFootInputs(raw.contacts, trajectory, metadata);
  return {
    metadata: { seed, frameCount: trajectory.frames.length, firstTimeSeconds: 0, lastTimeSeconds: 600,
      fieldTimeRangeSeconds: [metadata.frames[0].timeSeconds, metadata.frames.at(-1).timeSeconds],
      fieldIntervals: metadata.frameCount, fieldDimensions: metadata.fieldDimensions,
      activeAnts: trajectory.lives.length, sourceHashes,
      packetFileHashes: Object.fromEntries([...packetFiles].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) },
    fieldMetadata: metadata,
    flags,
    rawContacts: raw.contacts,
    births: raw.births,
    milestones,
    feet: footInput.feet,
    intervals: footInput.intervals,
    coverage: { contactGroups: raw.contacts.length, footRecords: footInput.feet.length,
      intervalContactGroups: footInput.intervals.reduce((sum, interval) => sum + interval.contactGroups, 0),
      uniqueAnts: new Set(footInput.feet.map(foot => foot.antId)).size,
      directionAvailableFeet: footInput.feet.filter(foot => foot.directionAvailable).length,
      directionMissingFeet: footInput.feet.filter(foot => !foot.directionAvailable).length,
      intervalGroupsWithMissingDirection: footInput.intervals.reduce((sum, interval) => sum + interval.invalidDirections, 0),
      skippedOutOfDomainFeet: footInput.invalidPositions, unbucketedContactGroups: footInput.unbucketedGroups }
  };
}

export const _w1InputTest = { directionAt, makeFootInputs };
