import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { TrailPlateBirth, TRAIL_PLATE_GRID_SIZE, TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS,
  TRAIL_PLATE_SAME_CORRIDOR_REFRACTORY_MS, TRAIL_PLATE_SIMILARITY_THRESHOLD }
  from '../src/lib/agents/ant/TrailPlateBirth.js';
import { indexTrajectory } from './ant-social-null.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = resolve(ROOT, 'docs/ant/evidence/2026-10-07-social-graph/data');
const IDENTITY = resolve(ROOT,
  'docs/ant/evidence/2026-10-08-movement-material-morphology/validation/candidate-descriptor-identity.json');
const SEEDS = [20261005, 20261006, 20261007];
const CELLS = TRAIL_PLATE_GRID_SIZE ** 2;
const HASH_FIELDS = ['agents', 'rng', 'chemical', 'surface', 'contacts', 'births', 'lifecycle', 'material'];
const HASH_BYTES = 32;
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const gridIndex = (x, y) => Math.round(y * (TRAIL_PLATE_GRID_SIZE - 1)) * TRAIL_PLATE_GRID_SIZE
  + Math.round(x * (TRAIL_PLATE_GRID_SIZE - 1));

export function observationTick(frames, simulationTimeMs) {
  assert.ok(Number.isFinite(simulationTimeMs) && simulationTimeMs >= 0, 'finite nonnegative event milliseconds');
  const seconds = simulationTimeMs / 1000;
  let low = 0, high = frames.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (frames[middle].timeSeconds < seconds) low = middle + 1;
    else high = middle;
  }
  assert.ok(low < frames.length, 'event has a saved trajectory observation at or after its time');
  assert.ok(low === 0 || seconds >= frames[low - 1].timeSeconds - 1e-6, 'event lies after previous frame');
  assert.ok(seconds <= frames[low].timeSeconds + 1e-6, 'event lies no later than assigned frame');
  return low;
}

function eventMillis(row, kind) {
  return kind === 'contact' ? row.simulationTimeMs
    : row.payload?.bornAtSimulationTimeMs ?? row.simulationTimeMs;
}

function groupEvents(rows, kind, frames) {
  const groups = Array.from({ length: frames.length }, () => []);
  let lastTick = -1;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const event = rows[rowIndex], simulationTimeMs = eventMillis(event, kind);
    const tick = observationTick(frames, simulationTimeMs);
    assert.ok(tick >= lastTick, `${kind} archive rows preserve trajectory-tick order`);
    lastTick = tick;
    groups[tick].push({ event, rowIndex, simulationTimeMs, tick });
  }
  return groups;
}

function neighbors(index) {
  const row = Math.floor(index / TRAIL_PLATE_GRID_SIZE), column = index % TRAIL_PLATE_GRID_SIZE;
  const result = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (!dx && !dy) continue;
    const x = column + dx, y = row + dy;
    if (x >= 0 && x < TRAIL_PLATE_GRID_SIZE && y >= 0 && y < TRAIL_PLATE_GRID_SIZE) {
      result.push(y * TRAIL_PLATE_GRID_SIZE + x);
    }
  }
  return result;
}

function maskSimilarity(a, b) {
  let intersection = 0, union = 0;
  for (let index = 0; index < CELLS; index += 1) {
    const left = a[index] ? 1 : 0, right = b[index] ? 1 : 0;
    intersection += left & right;
    union += left | right;
  }
  return union ? intersection / union : 1;
}

function pathSimilarity(a, b) {
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  let overlap = 0;
  for (const index of a) if (bSet.has(index) || neighbors(index).some(adjacent => bSet.has(adjacent))) overlap += 1;
  return overlap / Math.max(a.length, b.length);
}

function mirrorMatch(records, descriptor) {
  let newest = null;
  for (const record of records) {
    const mask = maskSimilarity(record.corridorMask, descriptor.mask);
    const path = pathSimilarity(record.principalPath, descriptor.principalPath);
    const similarity = Math.max(mask, path);
    if (similarity < TRAIL_PLATE_SIMILARITY_THRESHOLD) continue;
    if (!newest || record.bornAtSimulationTimeMs > newest.record.bornAtSimulationTimeMs) {
      newest = { record, maskSimilarity: mask, principalPathSimilarity: path, similarity };
    }
  }
  return newest;
}

function validContact(contact) {
  const point = contact?.position;
  return Number.isFinite(point?.x) && Number.isFinite(point?.y)
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function applyContactEvent(source, mirror, event) {
  assert.equal(event.type, 'FOOT_CONTACT', 'source contact archive contains only actual FOOT_CONTACT events');
  const expected = new Map();
  let accepted = 0;
  for (const contact of event.contacts || []) {
    if (!validContact(contact)) continue;
    const point = contact.position, index = gridIndex(point.x, point.y);
    expected.set(index, (expected.get(index) || 0) + 1);
    accepted += 1;
  }
  const previous = new Map([...expected.keys()].map(index => [index, source.footContactCounts[index]]));
  assert.equal(source.observeFootContact(event), accepted, 'production contact acceptance matches independent point filter');
  for (const [index, count] of expected) {
    const next = Math.min(0xffffffff, mirror[index] + count);
    assert.equal(source.footContactCounts[index], next, 'production grid counter matches independent grid mirror');
    mirror[index] = next;
    assert.ok(source.footContactCounts[index] >= previous.get(index), 'contact counter does not decrease');
  }
  return accepted;
}

function countMask(counter, mask) {
  let total = 0;
  for (let index = 0; index < CELLS; index += 1) if (mask[index]) total += counter[index];
  return total;
}

function cellMembership(index, priorMask, newMask) {
  const prior = Boolean(priorMask[index]), current = Boolean(newMask[index]);
  return { prior, new: current, intersection: prior && current,
    priorOnly: prior && !current, newOnly: current && !prior };
}

function assertDescriptor(descriptor) {
  assert.ok(descriptor && typeof descriptor.id === 'string' && descriptor.id.length, 'Plate descriptor ID');
  assert.equal(descriptor.grid?.width, TRAIL_PLATE_GRID_SIZE);
  assert.equal(descriptor.grid?.height, TRAIL_PLATE_GRID_SIZE);
  assert.equal(descriptor.mask?.length, CELLS);
  assert.ok(descriptor.mask.every(value => value === 0 || value === 1), 'binary frozen mask');
  assert.ok(Array.isArray(descriptor.principalPath) && descriptor.principalPath.length > 0);
  assert.ok(descriptor.principalPath.every(index => Number.isInteger(index) && index >= 0 && index < CELLS));
  assert.ok(Number.isFinite(descriptor.bornAtSimulationTimeMs));
}

function makeRecord(descriptor, source, tick) {
  return { id: descriptor.id, corridorMask: descriptor.mask, principalPath: descriptor.principalPath,
    bornAtSimulationTimeMs: descriptor.bornAtSimulationTimeMs,
    footContactsAtBirth: source.countFootContacts(descriptor.mask), tick,
    baselineCounts: Uint32Array.from(source.footContactCounts) };
}

function channel(match) {
  if (!match) return null;
  const { maskSimilarity: mask, principalPathSimilarity: path } = match;
  return mask === path ? 'mask+principal-path' : mask > path ? 'mask-IoU' : 'tolerant-principal-path';
}

function verifyTickDigests({ contacts, births, tickHashes, summary, manifest }) {
  assert.equal(manifest.hashFields.join(','), HASH_FIELDS.join(','));
  assert.equal(manifest.pairedTickHashBytesPerFrame, 512);
  assert.equal(tickHashes.length, contacts.length * 512);
  const aggregate = { contacts: createHash('sha256'), births: createHash('sha256') };
  for (let tick = 0; tick < contacts.length; tick += 1) {
    for (const [name, fieldIndex, rows] of [['contacts', 4, contacts[tick]], ['births', 5, births[tick]]]) {
      const digest = createHash('sha256').update(`${JSON.stringify(rows.map(row => row.event))}\n`).digest();
      const off = tickHashes.subarray(tick * 512 + fieldIndex * HASH_BYTES,
        tick * 512 + (fieldIndex + 1) * HASH_BYTES);
      const on = tickHashes.subarray(tick * 512 + (HASH_FIELDS.length + fieldIndex) * HASH_BYTES,
        tick * 512 + (HASH_FIELDS.length + fieldIndex + 1) * HASH_BYTES);
      assert.ok(digest.equals(on), `${name} ON digest matches raw archive at tick ${tick}`);
      assert.ok(digest.equals(off), `${name} OFF/ON archived paired digests agree at tick ${tick}`);
      aggregate[name].update(digest);
    }
  }
  for (const name of ['contacts', 'births']) {
    const expected = summary.graphEnabledParity[name];
    assert.equal(expected.match, true);
    assert.equal(expected.firstMismatchingTick, null);
    assert.equal(aggregate[name].digest('hex'), expected.on, `${name} aggregate digest matches summary`);
  }
  return { frames: contacts.length, contactTickDigests: contacts.length, birthTickDigests: births.length,
    contactAggregateDigestMatches: true, birthAggregateDigestMatches: true,
    pairedOnOffContactBirthDigestsMatch: true };
}

function measureRepeat({ source, mirror, priorRecord, priorDescriptor, descriptor, priorMatch,
  currentTick, contactGroups, eventUse }) {
  const counts = { priorMask: 0, newMask: 0, intersection: 0, priorOnly: 0, newOnly: 0 };
  const eventProvenance = new Map();
  for (let tick = priorRecord.tick + 1; tick <= currentTick; tick += 1) {
    for (const row of contactGroups[tick]) {
      const event = row.event;
      for (let footOrdinal = 0; footOrdinal < (event.contacts || []).length; footOrdinal += 1) {
        const contact = event.contacts[footOrdinal];
        if (!validContact(contact)) continue;
        const gridCell = gridIndex(contact.position.x, contact.position.y);
        assert.ok(gridCell >= 0 && gridCell < CELLS, 'contact maps to a valid world-grid cell');
        const inside = cellMembership(gridCell, priorDescriptor.mask, descriptor.mask);
        if (inside.prior) counts.priorMask += 1;
        if (inside.new) counts.newMask += 1;
        if (inside.intersection) counts.intersection += 1;
        if (inside.priorOnly) counts.priorOnly += 1;
        if (inside.newOnly) counts.newOnly += 1;
        if (!inside.prior && !inside.new) continue;
        const eventKey = `${row.rowIndex}:${footOrdinal}`;
        const group = eventProvenance.get(row.rowIndex) || { rawContactRow: row.rowIndex, tick,
          simulationTimeMs: row.simulationTimeMs, contactGroup: event.contactGroup, antId: event.antId,
          footPoints: [] };
        const membership = inside.intersection ? 0 : inside.priorOnly ? 1 : 2;
        group.footPoints.push([footOrdinal, gridCell, membership]);
        eventProvenance.set(row.rowIndex, group);
        const uses = eventUse.get(eventKey) || new Set();
        uses.add(descriptor.id);
        eventUse.set(eventKey, uses);
      }
    }
  }
  assert.equal(counts.priorMask, counts.intersection + counts.priorOnly);
  assert.equal(counts.newMask, counts.intersection + counts.newOnly);
  const sourceDelta = Math.max(0, source.countFootContacts(priorDescriptor.mask) - priorRecord.footContactsAtBirth);
  const mirrorDelta = Math.max(0, countMask(mirror, priorDescriptor.mask) - countMask(priorRecord.baselineCounts, priorDescriptor.mask));
  assert.equal(sourceDelta, mirrorDelta, 'source and independent counter agree on prior-mask delta');
  assert.equal(sourceDelta, counts.priorMask, 'source gate count equals individually replayed post-baseline points');
  return { priorRecord, priorMatch, counts, sourcePriorMaskDelta: sourceDelta,
    sourceGatePass: sourceDelta >= TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS,
    includedContactEvents: [...eventProvenance.values()] };
}

export function runSyntheticFixtures() {
  const identicalMask = new Uint8Array(CELLS);
  for (let column = 10; column < 18; column += 1) identicalMask[20 * TRAIL_PLATE_GRID_SIZE + column] = 1;
  const identicalPath = Array.from({ length: 8 }, (_, index) => 20 * TRAIL_PLATE_GRID_SIZE + 10 + index);
  const sourceControl = new TrailPlateBirth();
  const controlRecord = { id: 'prior-identical', corridorMask: identicalMask, principalPath: identicalPath,
    bornAtSimulationTimeMs: 0, footContactsAtBirth: 0 };
  sourceControl.birthRecords.push(controlRecord);
  const controlContacts = { type: 'FOOT_CONTACT', contacts: [
    { legId: 'FL', position: { x: 10 / 95, y: 20 / 95 } },
    { legId: 'FR', position: { x: 14 / 95, y: 20 / 95 } }
  ] };
  sourceControl.observeFootContact(controlContacts);
  const same = { mask: identicalMask, principalPath: identicalPath };
  const sameMatch = sourceControl.findSameCorridorBirth({ mask: same.mask, path: same.principalPath });
  const sameCounts = { prior: sourceControl.countFootContacts(identicalMask), new: sourceControl.countFootContacts(same.mask) };
  assert.equal(sameMatch.id, controlRecord.id);
  assert.deepEqual(sameCounts, { prior: 2, new: 2 }, 'identical-mask control has equal contact counts');

  const row = 30, commonPath = Array.from({ length: 31 }, (_, index) => row * TRAIL_PLATE_GRID_SIZE + 20 + index);
  const priorMask = new Uint8Array(CELLS), newMask = new Uint8Array(CELLS);
  for (const index of commonPath) { priorMask[index] = 1; newMask[index] = 1; }
  const oldOnly = [];
  for (let column = 20; column < 50; column += 1) {
    const priorCell = (row - 1) * TRAIL_PLATE_GRID_SIZE + column;
    const newCell = (row + 1) * TRAIL_PLATE_GRID_SIZE + column;
    priorMask[priorCell] = 1;
    newMask[newCell] = 1;
    oldOnly.push(priorCell);
  }
  const sourceCounterexample = new TrailPlateBirth();
  const prior = { id: 'prior-branch', corridorMask: priorMask, principalPath: commonPath,
    bornAtSimulationTimeMs: 0, footContactsAtBirth: 0 };
  sourceCounterexample.birthRecords.push(prior);
  const oldOnlyEvent = { type: 'FOOT_CONTACT', contacts: oldOnly.map(index => ({ legId: 'FL',
    position: { x: (index % TRAIL_PLATE_GRID_SIZE) / 95, y: Math.floor(index / TRAIL_PLATE_GRID_SIZE) / 95 } })) };
  sourceCounterexample.observeFootContact(oldOnlyEvent);
  const current = { mask: newMask, principalPath: commonPath };
  const match = sourceCounterexample.findSameCorridorBirth({ mask: current.mask, path: current.principalPath });
  const priorCount = sourceCounterexample.countFootContacts(priorMask);
  const newCount = sourceCounterexample.countFootContacts(newMask);
  assert.equal(match.id, prior.id, 'shared principal path triggers the source repeat match');
  assert.ok(priorCount >= TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS, 'source prior-mask gate passes old-only contacts');
  assert.ok(newCount < TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS, 'new-footprint hypothesis fails old-only contacts');
  assert.equal(priorCount, 30);
  assert.equal(newCount, 0);
  assert.ok(!neighbors(95).includes(96), '8-neighbor lookup does not wrap across a grid row');
  return { identicalMaskControl: { sourceMatch: sameMatch.id, priorCount: sameCounts.prior,
    newCount: sameCounts.new, passed: true }, oldOnlyContactCounterexample: { sourceMatch: match.id,
    priorMaskCount: priorCount, newMaskCount: newCount, pathSimilarity: 1, passed: true },
    gridBoundaryNoWrap: true };
}

async function loadSeed(seed, manifest, identityRows, archiveVerification) {
  const names = [`seed${seed}-summary.json`, `seed${seed}-trajectory.f64.gz`,
    `seed${seed}-on-timeline.json.gz`, `seed${seed}-on-raw-events.json.gz`,
    `seed${seed}-paired-tick-hashes.bin.gz`];
  const buffers = {}, fingerprints = {};
  for (const name of names) {
    buffers[name] = await readFile(resolve(DATA, name));
    fingerprints[name] = { bytes: buffers[name].length, sha256: sha(buffers[name]) };
  }
  const summary = JSON.parse(buffers[`seed${seed}-summary.json`]);
  assert.equal(summary.seed, seed);
  assert.equal(summary.seconds, 600);
  const manifestEntry = manifest.files.find(file => file.summary === `seed${seed}-summary.json`);
  assert.ok(manifestEntry, 'seed files are declared by the frozen archive manifest');
  assert.equal(summary.files.trajectory, manifestEntry.trajectory);
  assert.equal(summary.files.timeline, manifestEntry.timeline);
  assert.equal(summary.files.rawEvents, manifestEntry.rawEvents);
  assert.equal(summary.files.tickHashes, manifestEntry.tickHashes);
  const trajectoryBytes = gunzipSync(buffers[`seed${seed}-trajectory.f64.gz`]);
  const source = indexTrajectory(trajectoryBytes, summary.runs.on.idDictionary);
  assert.equal(sha(trajectoryBytes), summary.trajectory.enabledHash, 'decoded trajectory source hash');
  assert.equal(source.frames.length, 36001);
  assert.ok(Math.abs(source.frames.at(-1).timeSeconds - 600) < 1e-6);
  const raw = JSON.parse(gunzipSync(buffers[`seed${seed}-on-raw-events.json.gz`]));
  assert.ok(raw && raw.seed === seed && raw.graphEnabled === true);
  const identity = identityRows.find(row => row.seed === seed);
  assert.ok(identity && ['principalPathIdentity', 'networkCellIdentity', 'ribbonMaskIdentity']
    .every(key => identity[key] === true), 'birth-time descriptor identity validation');
  const plateRows = raw.births.filter(row => row.type === 'plate-birth');
  assert.equal(plateRows.length, identity.births);
  const archived = archiveVerification.find(row => row.seed === seed);
  assert.ok(archived && archived.parity === true);
  assert.equal(archived.frames, source.frames.length);
  assert.ok(Math.abs(archived.finalTime - 600) < 1e-6);
  assert.equal(raw.contacts.length, archived.rawContactGroups);
  assert.equal(raw.contacts.reduce((total, row) => total + (row.contacts?.length || 0), 0), archived.rawFootPoints);
  const contactGroups = groupEvents(raw.contacts, 'contact', source.frames);
  const birthGroups = groupEvents(raw.births, 'birth', source.frames);
  const tickHashes = gunzipSync(buffers[`seed${seed}-paired-tick-hashes.bin.gz`]);
  const digestValidation = verifyTickDigests({ contacts: contactGroups, births: birthGroups, tickHashes,
    summary, manifest });
  return { seed, source, summary, raw, contactGroups, birthGroups, digestValidation,
    plateRows, fingerprints, descriptorIdentity: identity, archiveValidation: archived };
}

function replaySeed(input, sharedFingerprints) {
  const { seed, source, raw, contactGroups, birthGroups, plateRows } = input;
  const production = new TrailPlateBirth(), mirror = new Uint32Array(CELLS);
  const records = new Map(), descriptors = new Map(), repeats = [], eventUse = new Map();
  let contactRows = 0, footPoints = 0, plateBirthsSeen = 0;
  for (let tick = 0; tick < source.frames.length; tick += 1) {
    for (const row of contactGroups[tick]) {
      const accepted = applyContactEvent(production, mirror, row.event);
      contactRows += 1; footPoints += accepted;
    }
    for (const row of birthGroups[tick]) {
      if (row.event.type !== 'plate-birth') continue;
      const descriptor = row.event.payload;
      assertDescriptor(descriptor);
      assert.ok(!records.has(descriptor.id), 'archived Plate IDs are unique');
      assert.equal(observationTick(source.frames, descriptor.bornAtSimulationTimeMs), tick,
        'Plate birth payload maps to current trajectory tick');
      const sourceMatch = production.findSameCorridorBirth({ mask: descriptor.mask, path: descriptor.principalPath });
      const matched = mirrorMatch([...records.values()], descriptor);
      assert.equal(sourceMatch?.id || null, matched?.record.id || null, 'source matching and independent mirror identity parity');
      let result = null;
      if (sourceMatch) {
        const priorRecord = records.get(sourceMatch.id), priorDescriptor = descriptors.get(sourceMatch.id);
        assert.ok(priorRecord && priorDescriptor, 'matched source prior has an archived descriptor baseline');
        const details = { record: sourceMatch, maskSimilarity: maskSimilarity(sourceMatch.corridorMask, descriptor.mask),
          principalPathSimilarity: pathSimilarity(sourceMatch.principalPath, descriptor.principalPath),
          similarity: Math.max(maskSimilarity(sourceMatch.corridorMask, descriptor.mask),
            pathSimilarity(sourceMatch.principalPath, descriptor.principalPath)) };
        assert.equal(sourceMatch.id, matched.record.id);
        assert.equal(details.maskSimilarity, matched.maskSimilarity);
        assert.equal(details.principalPathSimilarity, matched.principalPathSimilarity);
        assert.equal(details.similarity, matched.similarity);
        const measured = measureRepeat({ source: production, mirror, priorRecord, priorDescriptor,
          descriptor, priorMatch: details, currentTick: tick, contactGroups, eventUse });
        result = {
          seed, currentPlateId: descriptor.id, priorPlateId: priorRecord.id,
          currentBirthTimeMs: descriptor.bornAtSimulationTimeMs, currentBirthTick: tick,
          priorBirthTimeMs: priorRecord.bornAtSimulationTimeMs, priorBirthTick: priorRecord.tick,
          priorAgeMs: descriptor.bornAtSimulationTimeMs - priorRecord.bornAtSimulationTimeMs,
          sourceRefractoryMinimumMs: TRAIL_PLATE_SAME_CORRIDOR_REFRACTORY_MS,
          sourceRefractoryPass: descriptor.bornAtSimulationTimeMs - priorRecord.bornAtSimulationTimeMs
            >= TRAIL_PLATE_SAME_CORRIDOR_REFRACTORY_MS - 1e-9,
          baselineBoundary: 'after all archived FOOT_CONTACT events in the matched prior birth trajectory tick',
          baselineTick: priorRecord.tick, currentTickContactBoundary: 'after all archived FOOT_CONTACT events in the current birth trajectory tick',
          similarity: { threshold: TRAIL_PLATE_SIMILARITY_THRESHOLD, maskIoU: details.maskSimilarity,
            tolerantPrincipalPathOverlap: details.principalPathSimilarity, score: details.similarity,
            channel: channel(details) },
          maskRelation: { priorCells: priorDescriptor.mask.reduce((n, v) => n + Boolean(v), 0),
            newCells: descriptor.mask.reduce((n, v) => n + Boolean(v), 0),
            intersectionCells: priorDescriptor.mask.reduce((n, v, i) => n + Boolean(v && descriptor.mask[i]), 0),
            priorOnlyCells: priorDescriptor.mask.reduce((n, v, i) => n + Boolean(v && !descriptor.mask[i]), 0),
            newOnlyCells: descriptor.mask.reduce((n, v, i) => n + Boolean(v && !priorDescriptor.mask[i]), 0) },
          sourcePriorMaskCountAtBirth: priorRecord.footContactsAtBirth,
          sourcePriorMaskPostBaselineCount: measured.sourcePriorMaskDelta,
          sourcePriorMaskGateMinimum: TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS,
          sourcePriorMaskGatePass: measured.sourceGatePass,
          sourceMirrorCounterParity: true,
          counts: measured.counts,
          localityHypothesisPass: measured.counts.newMask >= TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS,
          includedContactEvents: measured.includedContactEvents
        };
        repeats.push(result);
      }
      const record = makeRecord(descriptor, production, tick);
      records.set(descriptor.id, record);
      descriptors.set(descriptor.id, descriptor);
      production.birthRecords.push({ id: descriptor.id, corridorMask: descriptor.mask,
        principalPath: descriptor.principalPath, bornAtSimulationTimeMs: descriptor.bornAtSimulationTimeMs,
        footContactsAtBirth: record.footContactsAtBirth });
      production.plates.push(descriptor);
      plateBirthsSeen += 1;
    }
  }
  assert.equal(contactRows, raw.contacts.length);
  const rawFootPoints = raw.contacts.reduce((total, row) => total + (row.contacts?.length || 0), 0);
  assert.equal(footPoints, rawFootPoints);
  assert.equal(plateBirthsSeen, plateRows.length);
  for (let index = 0; index < CELLS; index += 1) assert.equal(production.footContactCounts[index], mirror[index],
    'full source and mirror counters agree after replay');
  const reused = [...eventUse].filter(([, ids]) => ids.size > 1).map(([eventKey, ids]) => ({
    eventKey, repeatPlateIds: [...ids].sort()
  }));
  const mismatch = repeats.filter(row => !row.sourcePriorMaskGatePass || !row.sourceRefractoryPass);
  const localityFailures = repeats.filter(row => !row.localityHypothesisPass && row.sourcePriorMaskGatePass);
  const integrity = { contactRows, rawIndividualFootPoints: rawFootPoints,
    acceptedIndividualFootPoints: footPoints, rejectedIndividualFootPoints: rawFootPoints - footPoints, plateBirthsSeen,
    repeatBirths: repeats.length, sourceMirrorMatchParity: true, sourceMirrorCounterParity: true,
    priorGateMismatches: mismatch.map(row => row.currentPlateId), localityFailureCount: localityFailures.length };
  sharedFingerprints[seed] = input.fingerprints;
  return { seed, integrity, repeatBirths: repeats, reusedEventPoints: reused,
    reusedEventPointCount: reused.length };
}

function decide(seeds) {
  const all = seeds.flatMap(seed => seed.repeatBirths);
  const clear = all.filter(row => row.sourceMirrorCounterParity && row.sourcePriorMaskGatePass && row.sourceRefractoryPass);
  const gaps = all.filter(row => !row.sourceMirrorCounterParity || !row.sourcePriorMaskGatePass || !row.sourceRefractoryPass);
  let status = 'Inconclusive';
  if (clear.length) {
    if (gaps.length) status = 'Mixed';
    else if (clear.some(row => !row.localityHypothesisPass)) status = 'Negative';
    else status = 'Supported';
  }
  return { status, actualRepeatBirths: all.length, analyzableRepeatBirths: clear.length,
    sourceOrProvenanceGapCount: gaps.length,
    sourcePriorMaskGatePassCount: clear.filter(row => row.sourcePriorMaskGatePass).length,
    newMaskAtLeast30Count: clear.filter(row => row.localityHypothesisPass).length,
    counterexampleBirthIds: clear.filter(row => !row.localityHypothesisPass).map(row => `${row.seed}:${row.currentPlateId}`),
    interpretation: status === 'Negative'
      ? 'At least one verified actual repeat passed the existing prior-mask gate while its own new footprint had fewer than 30 post-baseline individual FOOT_CONTACT points.'
      : status === 'Supported'
        ? 'Every analyzable actual repeat passed both the existing prior-mask gate and the diagnostic new-footprint count; this describes contact locality only.'
        : status === 'Mixed'
          ? 'Some repeats have interpretable source/mirror measurements while other repeats have a separate source or provenance gap.'
          : 'No verified repeat set supports a locality conclusion.' };
}

export async function runAudit({ outDir = resolve(ROOT,
  'docs/ant/evidence/2026-10-11-w1-repeat-birth-contact-locality-audit/data') } = {}) {
  const fixtures = runSyntheticFixtures();
  const manifestBytes = await readFile(resolve(DATA, 'manifest.json'));
  const archiveVerificationBytes = await readFile(resolve(DATA, 'archive-verification.json'));
  const identityBytes = await readFile(IDENTITY);
  const manifest = JSON.parse(manifestBytes), archiveVerification = JSON.parse(archiveVerificationBytes);
  const identityRows = JSON.parse(identityBytes);
  assert.deepEqual(manifest.seeds, SEEDS);
  assert.equal(manifest.seconds, 600);
  assert.equal(manifest.pairedTickHashBytesPerFrame, 512);
  assert.deepEqual(identityRows.map(row => row.seed), SEEDS);
  const sharedFingerprints = {
    'manifest.json': { bytes: manifestBytes.length, sha256: sha(manifestBytes) },
    'archive-verification.json': { bytes: archiveVerificationBytes.length, sha256: sha(archiveVerificationBytes) },
    'candidate-descriptor-identity.json': { bytes: identityBytes.length, sha256: sha(identityBytes) }
  };
  const results = [];
  for (const seed of SEEDS) {
    const input = await loadSeed(seed, manifest, identityRows, archiveVerification);
    const result = replaySeed(input, sharedFingerprints);
    result.digestValidation = input.digestValidation;
    result.archiveValidation = { rawContactGroups: input.archiveValidation.rawContactGroups,
      rawFootPoints: input.archiveValidation.rawFootPoints, rawBirthEvents: input.raw.births.length,
      archivedParity: input.archiveValidation.parity };
    result.descriptorIdentity = input.descriptorIdentity;
    results.push(result);
  }
  const summary = { schemaVersion: 1, audit: 'ANT W1 repeat-birth contact-locality detached archive diagnostic',
    decision: decide(results), fixtures,
    constraints: { noNaturalReplay: true, noProductionChanges: true, noAdvanceCall: true,
      sourceGateMinimum: TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS, similarityThreshold: TRAIL_PLATE_SIMILARITY_THRESHOLD,
      eventTickRule: 'first saved trajectory frame at or after raw event simulationTimeMs / 1000; stored seconds are never multiplied back to milliseconds',
      contactOrder: 'raw row order within verified trajectory tick; all contacts before replayed Plate birth record' },
    repositoryReferences: { researchStartHead: 'ffd8fcaf419b51e873c8a591e45c958189e8c8b5',
      originMainAtStart: 'fbe3959934158f5a05e51926e89287d503804d05',
      mainAndResearchSourceTreesEqualAtStart: true },
    sourceReferences: { archivedController: 'a6801d609b82f1f1a0b5030b7c6e4b9b5d2ebe72',
      archivedTrailPlateBirth: 'a6801d609b82f1f1a0b5030b7c6e4b9b5d2ebe72',
      archivedGitBlobs: { AntController: '595a2f1de8e901cc1f427310dd98db08574097f3',
        TrailPlateBirth: 'c8c429324c38fb2f8e3520aa88939acdf98ff47b' },
      archivedSourceSha256: { AntController: 'c3515932e4692399e4ac5928b16513643862a8c987f61f878d347a528a15ba40',
        TrailPlateBirth: '3e3e90157879884552232e9b47a5818678b3c302ec4988651e0ba34dcfb94aa2' },
      researchControllerAndTrailPlateBirth: 'f543531d8e32d5b1479311c31e3605b39ae9e5c8',
      researchGitBlobs: { AntController: '5b7e822ae16b53458174780eff7c762ff3fe51bd',
        TrailPlateBirth: '238cc365f2602dc6a22091d69237b88962825a13' },
      productionGate: 'TrailPlateBirth.findSameCorridorBirth / countFootContacts / observeFootContact' },
    inputFingerprints: sharedFingerprints,
    seeds: results.map(({ repeatBirths, reusedEventPoints, ...seed }) => ({ ...seed,
      reusedEventPointCount: reusedEventPoints.length,
      repeatBirths: repeatBirths.map(({ includedContactEvents, ...measurement }) => measurement) })) };
  const toolPath = resolve(ROOT, 'scripts/ant-w1-repeat-birth-contact-locality-audit.js');
  const productionPath = resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js');
  summary.toolSourceSha256 = sha(await readFile(toolPath));
  summary.productionSourceSha256 = sha(await readFile(productionPath));
  summary.controllerSourceSha256 = sha(await readFile(resolve(ROOT, 'src/lib/agents/ant/AntController.js')));
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, 'summary.json'), json(summary));
  for (const seed of results) {
    await writeFile(resolve(outDir, `seed-${seed.seed}-repeat-births.json`), `${JSON.stringify(seed)}\n`);
    const rows = seed.repeatBirths;
    const columns = ['seed', 'currentPlateId', 'priorPlateId', 'currentBirthTimeMs', 'currentBirthTick',
      'priorBirthTimeMs', 'priorBirthTick', 'priorAgeMs', 'sourceRefractoryPass', 'similarityChannel', 'similarityScore', 'priorMaskCount',
      'newMaskCount', 'intersectionCount', 'priorOnlyCount', 'newOnlyCount', 'sourceGatePass',
      'localityHypothesisPass'];
    const csv = [columns.join(','), ...rows.map(row => [row.seed, row.currentPlateId, row.priorPlateId,
      row.currentBirthTimeMs, row.currentBirthTick, row.priorBirthTimeMs, row.priorBirthTick, row.priorAgeMs,
      row.sourceRefractoryPass,
      row.similarity.channel, row.similarity.score, row.counts.priorMask, row.counts.newMask,
      row.counts.intersection, row.counts.priorOnly, row.counts.newOnly,
      row.sourcePriorMaskGatePass, row.localityHypothesisPass].join(','))].join('\n') + '\n';
    await writeFile(resolve(outDir, `seed-${seed.seed}-repeat-births.csv`), csv);
  }
  const fingerprints = { schemaVersion: 1, generatedBy: 'ant-w1-repeat-birth-contact-locality-audit.js',
    inputs: sharedFingerprints, seedInputs: Object.fromEntries(SEEDS.map(seed => [seed, sharedFingerprints[seed]])),
    outputSha256: {} };
  for (const name of ['summary.json', ...results.flatMap(result => [
    `seed-${result.seed}-repeat-births.json`, `seed-${result.seed}-repeat-births.csv`])]) {
    const bytes = await readFile(resolve(outDir, name));
    fingerprints.outputSha256[name] = sha(bytes);
  }
  await writeFile(resolve(outDir, 'artifact-hashes.json'), json(fingerprints));
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outIndex = process.argv.indexOf('--out');
  const outDir = outIndex >= 0 ? resolve(process.argv[outIndex + 1]) : undefined;
  try {
    const result = await runAudit({ outDir });
    console.log(JSON.stringify({ status: result.decision.status, ...result.decision,
      seeds: result.seeds.map(seed => ({ seed: seed.seed, repeats: seed.repeatBirths.length,
        localityFailures: seed.integrity.localityFailureCount })) }, null, 2));
  } catch (error) {
    const target = outDir || resolve(ROOT, 'docs/ant/evidence/2026-10-11-w1-repeat-birth-contact-locality-audit/data');
    const gap = { decision: 'Inconclusive', classification: 'typed-provenance-gap',
      gapType: /source matching|production grid counter|prior-mask delta/i.test(error.message)
        ? 'source-mirror-parity-gap' : /digest|trajectory|archive|descriptor|tick|timestamp|frame|source prior/i.test(error.message)
          ? 'archive-or-descriptor-provenance-gap' : 'audit-validation-gap',
      error: error.message, localityConclusion: null,
      note: 'The failed source or archive validation is not evidence for or against contact locality.' };
    await mkdir(target, { recursive: true });
    await writeFile(resolve(target, 'typed-provenance-gap.json'), json(gap));
    console.error(JSON.stringify(gap, null, 2));
    process.exitCode = 1;
  }
}
