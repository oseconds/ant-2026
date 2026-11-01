import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { unpack } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CONFLICT = resolve(ROOT, 'docs/ant/evidence/2026-11-01-bc-local-conflict-decomposition');
const SLOT_SOURCE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-bc-commit-slot-ambiguity-audit');
const DUAL = resolve(ROOT, 'docs/ant/evidence/2026-10-31-bc-dual-material-shadow');
const RAW = resolve(ROOT, 'docs/ant/evidence/2026-10-31-bc-provenance-stratigraphy-prototype');
const WORLD = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit');
const OUT = resolve(ROOT, 'docs/ant/evidence/2026-11-01-bc-material-capacity-necessity-audit');
const SEEDS = ['20261005', '20261006', '20261007'];
const EXPECTED_COMPONENTS = { 20261005: 422, 20261006: 486, 20261007: 444 };
const EXPECTED_RAW_EVENTS = { 20261005: 662, 20261006: 717, 20261007: 710 };
const GRID = 96, CELLS = GRID * GRID, ENTRY = { x: .5, y: .72 }, REFERENCE = 256;
const SNAPSHOTS = [60, 120, 180, 300, 450, 600];
const STARTING_HEAD = '86f0b57bb67bc2b60794108ce5e04dc5e761d45a';
const PRODUCTION = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const UPSTREAM = {
  dual: '248da39a4d7d342022a27a5b9ec183cad9b160e2',
  rawPrototype: 'a80a613be68ede94fce89008a076fbe582178f41',
  slotAudit: 'e960d135afec30e7c9f35722359e15f0f2d39ce3',
  conflict: '86f0b57bb67bc2b60794108ce5e04dc5e761d45a'
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const readGzip = async path => JSON.parse(gunzipSync(await readFile(path)).toString('utf8'));
const quantile = (sorted, p) => sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
const distribution = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return { count: sorted.length, min: sorted[0] ?? null, q25: quantile(sorted, .25), median: quantile(sorted, .5),
    q75: quantile(sorted, .75), q90: quantile(sorted, .9), max: sorted.at(-1) ?? null,
    mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null };
};
const codeCompare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sortedUnique = values => [...new Set(values)].sort((a, b) => a - b);
const point = cell => ({ x: (cell % GRID) / (GRID - 1), y: Math.floor(cell / GRID) / (GRID - 1) });
const readBytes = async path => readFile(path);
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, jsonBytes(value)); };
const writeGzip = async (path, value) => {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, gzipSync(Buffer.from(JSON.stringify(value) + '\n'), { level: 9, mtime: 0 }));
};

async function packageIndex(root) {
  const manifestBytes = await readBytes(resolve(root, 'manifest.json'));
  const sumsText = await readFile(resolve(root, 'SHA256SUMS.txt'), 'utf8').catch(() => '');
  const manifest = JSON.parse(manifestBytes);
  const sums = new Map(sumsText.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const [digest, file] = line.split(/\s{2}/, 2); return [file, digest];
  }));
  if (sums.size) assert.equal(sums.get('manifest.json'), hash(manifestBytes), `${root} manifest checksum`);
  return { root, manifestBytes, manifest, sums, sumsSha256: hash(Buffer.from(sumsText)) };
}

async function verifyRegisteredFile(index, relativePath) {
  const row = index.manifest.files?.find(item => item.file === relativePath);
  assert.ok(row, `${relativePath} is listed in ${index.root} manifest`);
  const data = await readBytes(resolve(index.root, relativePath));
  assert.equal(data.length, row.bytes, `${relativePath} byte count`);
  assert.equal(hash(data), row.sha256, `${relativePath} package hash`);
  if (index.sums.size) assert.equal(index.sums.get(relativePath), row.sha256, `${relativePath} checksum index`);
  return { relativePath, bytes: data.length, sha256: row.sha256, data };
}

async function loadInputs() {
  // shortcut: hash only analysis receipts and final material anchors consumed here; expand if package-wide archives need revalidation.
  const conflict = await packageIndex(CONFLICT), slotsSource = await packageIndex(SLOT_SOURCE);
  const dual = await packageIndex(DUAL), raw = await packageIndex(RAW), world = await packageIndex(WORLD);
  assert.equal(conflict.manifest.branch, 'codex/ant-bc-local-conflict-decomposition-20261101');
  assert.equal(conflict.manifest.startingCommit, UPSTREAM.slotAudit);
  assert.equal(conflict.manifest.productionAuthority, PRODUCTION);
  assert.equal(slotsSource.manifest.branch, 'codex/ant-bc-commit-slot-ambiguity-audit-20261101');
  assert.equal(slotsSource.manifest.productionAuthority, PRODUCTION);
  assert.equal(dual.manifest.branch, 'codex/ant-bc-dual-material-shadow-20261031');
  assert.equal(dual.manifest.analysisBaseHead, 'dfc29559860ec9e6312d2ea556041d956117bc5e');
  assert.equal(dual.manifest.productionAuthority, PRODUCTION);
  assert.equal(raw.manifest.branch, 'codex/ant-bc-provenance-stratigraphy-prototype-20261031');
  assert.equal(raw.manifest.productionAuthority, PRODUCTION);
  assert.equal(hash(world.manifestBytes), '6dfe9b7f13965126794b753547d81714a95a12da41f829c669f11996aadf8a3a', 'frozen source manifest hash');
  assert.equal(world.manifest.authority, PRODUCTION);
  const conflictSummaryFile = await verifyRegisteredFile(conflict, 'analysis/summary.json');
  const conflictValidationFile = await verifyRegisteredFile(conflict, 'analysis/validation.json');
  const conflictSummary = JSON.parse(conflictSummaryFile.data), conflictValidation = JSON.parse(conflictValidationFile.data);
  assert.equal(conflictSummary.totalSlots, 163);
  assert.equal(conflictSummary.totalOptions, 1846);
  assert.equal(conflictSummary.totalComponents, 1352);
  assert.equal(conflictValidation.observerRngCalls, 0);
  assert.equal(conflictValidation.exact163SlotReceiptsReused, true);
  assert.equal(conflictValidation.exactXCellSetsReused, true);
  assert.equal(conflictValidation.exactSavedTimesReused, true);
  assert.equal(conflictValidation.noNaturalSimulation, true);
  const seedRows = [], rawSummaryFile = await verifyRegisteredFile(raw, 'analysis/summary.json');
  const rawSummary = JSON.parse(rawSummaryFile.data);
  assert.deepEqual(rawSummary.seeds.map(row => row.events.total), [662, 717, 710]);
  const eventMaps = new Map();

  for (const seed of SEEDS) {
    const conflictPath = `analysis/conflict-slots-${seed}.json.gz`;
    const sourcePath = `analysis/commit-slots-${seed}.json.gz`;
    const eventPath = `analysis/events-${seed}.json.gz`;
    const rawLedgerPath = `analysis/provenance-ledger-${seed}.json.gz`;
    const capacityPath = `analysis/capacity-${seed}.json`;
    const conflictFile = await verifyRegisteredFile(conflict, conflictPath);
    const sourceFile = await verifyRegisteredFile(slotsSource, sourcePath);
    const eventFile = await verifyRegisteredFile(dual, eventPath);
    const rawFile = await verifyRegisteredFile(raw, rawLedgerPath);
    const capacityFile = await verifyRegisteredFile(conflict, capacityPath);
    const packet = JSON.parse(gunzipSync(conflictFile.data));
    const sourcePacket = JSON.parse(gunzipSync(sourceFile.data));
    const eventsPacket = JSON.parse(gunzipSync(eventFile.data));
    const priorLedger = JSON.parse(gunzipSync(rawFile.data));
    const priorCapacity = JSON.parse(capacityFile.data);
    assert.equal(packet.seed, seed); assert.equal(packet.slots.length, seed === '20261005' ? 55 : 54);
    assert.equal(packet.sourceSlotFileSha256, hash(sourceFile.data), `${seed} exact source slot lineage`);
    assert.equal(sourcePacket.seed, seed); assert.equal(sourcePacket.slots.length, packet.slots.length);
    for (let index = 0; index < packet.slots.length; index++) {
      const derived = packet.slots[index], original = sourcePacket.slots[index];
      assert.equal(derived.anchorIndex, original.anchorIndex, `${seed}/${index} source anchor`);
      assert.equal(derived.timeMs, original.timeMs, `${seed}/${index} exact saved time`);
      assert.equal(derived.nodes.length, original.options.length, `${seed}/${index} source option count`);
      const sourceOptions = new Map(original.options.map(row => [row.optionId, row]));
      for (const option of derived.nodes) {
        const sourceOption = sourceOptions.get(option.optionId);
        assert.ok(sourceOption, `${seed}/${index}/${option.optionId} source option`);
        assert.equal(option.xSha256, sourceOption.xSha256);
        assert.deepEqual(option.xCells, sourceOption.xCells);
      }
    }
    assert.equal(eventsPacket.seed, seed); assert.equal(eventsPacket.productionAuthority, PRODUCTION);
    assert.equal(eventsPacket.events.length, EXPECTED_RAW_EVENTS[seed]);
    assert.equal(priorLedger.eventCount, EXPECTED_RAW_EVENTS[seed]);
    const eventMap = new Map(eventsPacket.events.map(event => [event.eventId, event]));
    assert.equal(eventMap.size, eventsPacket.events.length, `${seed} unique raw event IDs`);
    eventMaps.set(seed, eventMap);
    const signalPath = `analysis/seed-${seed}.signals.json.gz`;
    const metaFile = await verifyRegisteredFile(world, signalPath);
    const meta = JSON.parse(gunzipSync(metaFile.data));
    assert.equal(meta.authority, PRODUCTION); assert.equal(meta.seed, seed);
    assert.equal(meta.hz, 60); assert.equal(meta.seconds, 600); assert.equal(meta.anchorsCount, 599);
    const finalChunkName = meta.anchorsFiles.find(name => name.endsWith('anchors-007.json.gz'));
    assert.ok(finalChunkName, `${seed} final frozen anchor chunk`);
    const chunkPath = `analysis/${finalChunkName}`;
    const chunkFile = await verifyRegisteredFile(world, chunkPath);
    assert.equal(hash(chunkFile.data), meta.chunkHashes[finalChunkName], `${seed} frozen signal chunk receipt`);
    const chunk = JSON.parse(gunzipSync(chunkFile.data));
    const anchor = chunk.anchors.find(row => row.index === 598);
    assert.ok(anchor); assert.equal(anchor.timeMs, 599250.0000000696);
    const materialLayers = unpack(anchor.material.layers);
    assert.equal(materialLayers.length, CELLS);
    const actual = summarizeActual(materialLayers, meta.births, anchor.timeMs);
    seedRows.push({ seed, packet, conflictSha256: conflictFile.sha256, sourceSlotSha256: sourceFile.sha256,
      eventsPacket, eventSha256: eventFile.sha256, priorLedger, rawLedgerSha256: rawFile.sha256, priorCapacity,
      signalMetaSha256: metaFile.sha256, signalChunkSha256: chunkFile.sha256,
      anchorIndex: anchor.index, timeMs: anchor.timeMs, actual });
  }
  assert.equal(seedRows.reduce((sum, row) => sum + row.packet.slots.reduce((s, slot) => s + slot.nodes.length, 0), 0), 1846);
  assert.equal(seedRows.reduce((sum, row) => sum + row.eventsPacket.events.length, 0), 2089);
  return { seedRows, eventMaps, rawSummary, authority: {
    production: PRODUCTION, conflict: UPSTREAM.conflict, dual: UPSTREAM.dual, rawPrototype: UPSTREAM.rawPrototype,
    slotAudit: UPSTREAM.slotAudit, conflictManifestSha256: hash(conflict.manifestBytes),
    slotAuditManifestSha256: hash(slotsSource.manifestBytes), dualManifestSha256: hash(dual.manifestBytes),
    rawPrototypeManifestSha256: hash(raw.manifestBytes), worldManifestSha256: hash(world.manifestBytes),
    conflictSumsSha256: conflict.sumsSha256, slotAuditSumsSha256: slotsSource.sumsSha256,
    dualSumsSha256: dual.sumsSha256, rawSumsSha256: raw.sumsSha256, worldSumsSha256: world.sums.size ? world.sumsSha256 : null
  } };
}

function summarizeActual(layers, births, timeMs) {
  const covered = [], histogram = {}, totalIncidences = layers.reduce((sum, value) => sum + value, 0);
  for (const value of layers) {
    histogram[value] = (histogram[value] || 0) + 1;
    if (value > 0) covered.push(value);
  }
  covered.sort((a, b) => a - b);
  return { snapshotTimeMs: timeMs, totalProductionPlateBirths: births.length,
    birthsThroughSnapshotTime: births.filter(row => row.timeMs <= timeMs).length,
    uniqueMaterialCells: covered.length, totalLayerCellIncidences: totalIncidences,
    meanLayersOnCoveredCells: covered.length ? totalIncidences / covered.length : 0,
    q50LayersOnCoveredCells: quantile(covered, .5), q90LayersOnCoveredCells: quantile(covered, .9),
    q99LayersOnCoveredCells: quantile(covered, .99), maxLayers: covered.at(-1) || 0,
    layerCountHistogram: histogram, layerCounts: Array.from(layers) };
}

function masksIntersect(a, b) {
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) return true;
    if (a[i] < b[j]) i++; else j++;
  }
  return false;
}

function graphPartitions(options) {
  const parent = options.map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < options.length; i++) for (let j = i + 1; j < options.length; j++) {
    if (masksIntersect(options[i].xCells, options[j].xCells)) {
      const a = find(i), b = find(j); if (a !== b) parent[b] = a;
    }
  }
  const groups = new Map();
  options.forEach((option, index) => {
    const root = find(index); if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(option.optionId);
  });
  return [...groups.values()].map(rows => rows.sort(codeCompare)).sort((a, b) => codeCompare(a[0], b[0]));
}

function exactPartitions(slot) {
  const registered = slot.components.map(row => [...row.memberOptionIds].sort(codeCompare)).sort((a, b) => codeCompare(a[0], b[0]));
  const reconstructed = graphPartitions(slot.nodes);
  assert.deepEqual(reconstructed, registered, `${slot.seed}/${slot.anchorIndex} X-overlap component partition`);
  const options = new Map(slot.nodes.map(row => [row.optionId, row]));
  const covered = new Set();
  for (const component of slot.components) {
    const members = component.memberOptionIds.map(id => options.get(id));
    assert.equal(members.length, component.memberXCount);
    for (const option of members) {
      assert.ok(option); assert.ok(!covered.has(option.optionId)); covered.add(option.optionId);
      assert.equal(option.xNodeCount, option.xCells.length);
      assert.equal(new Set(option.xCells).size, option.xCells.length);
      assert.deepEqual(option.xCells, [...option.xCells].sort((a, b) => a - b));
      assert.equal(hash(Buffer.from(JSON.stringify(option.xCells))), option.xSha256);
    }
    const sets = members.map(row => new Set(row.xCells));
    const union = sortedUnique(members.flatMap(row => row.xCells));
    const intersection = members[0].xCells.filter(cell => sets.every(set => set.has(cell)));
    assert.deepEqual(union, component.unionCellIds, `${component.componentId} recorded component union`);
    assert.equal(component.unionCellCount, union.length);
    const independentlyCounted = new Uint16Array(CELLS);
    members.forEach(member => member.xCells.forEach(cell => independentlyCounted[cell]++));
    const independentUnionCount = independentlyCounted.reduce((count, value) => count + (value > 0 ? 1 : 0), 0);
    const independentIntersectionCount = independentlyCounted.reduce((count, value) => count + (value === members.length ? 1 : 0), 0);
    const sizes = members.map(row => row.xCells.length);
    assert.equal(independentUnionCount, union.length, `${component.componentId} independent union count`);
    assert.equal(independentIntersectionCount, intersection.length, `${component.componentId} independent intersection count`);
    assert.equal(Math.min(...sizes), Math.min(...members.map(row => row.xNodeCount)));
    assert.equal(Math.max(...sizes), Math.max(...members.map(row => row.xNodeCount)));
    component._intersectionCellIds = intersection;
  }
  assert.equal(covered.size, slot.nodes.length);
  return options;
}

function pickMode(mode, members) {
  const byId = [...members].sort((a, b) => codeCompare(a.optionId, b.optionId));
  if (mode === 'MIN-FOOTPRINT') return [...members].sort((a, b) => a.xNodeCount - b.xNodeCount || codeCompare(a.optionId, b.optionId))[0];
  if (mode === 'MAX-FOOTPRINT') return [...members].sort((a, b) => b.xNodeCount - a.xNodeCount || codeCompare(a.optionId, b.optionId))[0];
  assert.equal(mode, 'CANONICAL'); return byId[0];
}

function candidateClass(option, eventMap) {
  const eventIds = [...new Set(option.candidates.map(row => row.eventId))].sort(codeCompare);
  const events = eventIds.map(id => {
    const event = eventMap.get(id); assert.ok(event, `${id} source event receipt exists`);
    const candidate = option.candidates.find(row => row.eventId === id);
    assert.ok(candidate);
    assert.ok(event.timeMs >= 0 && event.timeMs <= 600_000, `${id} saved maturation time`);
    assert.equal(candidate.xSha256, option.xSha256, `${id} slot-specific X hash`);
    assert.equal(candidate.xNodeCount, option.xCells.length, `${id} slot-specific X node count`);
    assert.equal(event.channel, candidate.channel);
    assert.equal(event.trackId, candidate.trackId, `${id} source track lineage`);
    assert.equal(event.timeMs, candidate.maturityTimeMs, `${id} source maturation time`);
    return event;
  });
  const classes = [...new Set(events.map(row => row.entryClass))].sort(codeCompare);
  return { eventIds, events, entryClass: classes.length === 1 ? classes[0] : 'mixed', entryClasses: classes };
}

function buildSeed(seedRow, eventMap) {
  let totalComponents = 0, totalOptions = 0, totalSingleton = 0, totalContested = 0;
  const slots = [], selected = { 'MIN-FOOTPRINT': [], 'MAX-FOOTPRINT': [], CANONICAL: [] };
  const envelopeSeries = [];
  let cumulative = { lower: 0, upper: 0, singleton: 0, contestedLower: 0, contestedUpper: 0, events: 0 };
  let firstCrossing = null;
  for (const slot of seedRow.packet.slots) {
    const options = exactPartitions(slot), components = [];
    let lower = 0, upper = 0, singletonIncidence = 0, contestedLower = 0, contestedUpper = 0;
    for (const registered of slot.components) {
      const members = registered.memberOptionIds.map(id => options.get(id));
      const sizes = members.map(row => row.xCells.length).sort((a, b) => a - b);
      const intersection = registered._intersectionCellIds, union = registered.unionCellIds;
      const single = members.length === 1;
      const refs = {};
      for (const mode of Object.keys(selected)) {
        const option = pickMode(mode, members), source = candidateClass(option, eventMap);
        assert.ok(registered.memberOptionIds.includes(option.optionId), `${mode} uses a registered component member`);
        const layerId = `${seedRow.seed}:${slot.anchorIndex}:${registered.componentId}`;
        const layer = { layerId, seed: seedRow.seed, mode, componentId: registered.componentId,
          slotIndex: slot.slotIndex, anchorIndex: slot.anchorIndex, timeMs: slot.timeMs,
          optionId: option.optionId, xSha256: option.xSha256, xCells: option.xCells,
          xNodeCount: option.xNodeCount, channels: option.channels, composition: option.composition,
          entryClass: source.entryClass, entryClasses: source.entryClasses,
          candidateEventIds: source.eventIds, sourceReceipt: { conflictPacketSha256: seedRow.conflictSha256,
            sourceSlotPacketSha256: seedRow.sourceSlotSha256, optionId: option.optionId, xSha256: option.xSha256 } };
        refs[mode] = { optionId: option.optionId, xSha256: option.xSha256, xNodeCount: option.xNodeCount,
          composition: option.composition, channels: option.channels, candidateEventIds: source.eventIds };
        selected[mode].push(layer);
      }
      const comp = { componentId: registered.componentId, memberOptionIds: registered.memberOptionIds,
        memberXHashes: registered.memberXHashes, memberXCount: registered.memberXCount,
        memberXCellCounts: sizes, minimumMemberXSize: sizes[0], maximumMemberXSize: sizes.at(-1),
        medianMemberXSize: quantile(sizes, .5), singleton: single,
        singletonExactCells: single ? members[0].xCells : null,
        intersectionCells: intersection, intersectionCellCount: intersection.length,
        unionCells: union, unionCellCount: union.length,
        possibleCompositions: [...new Set(members.map(row => row.composition))].sort(codeCompare),
        BOnlyMembers: members.filter(row => row.composition === 'B-only').length,
        COnlyMembers: members.filter(row => row.composition === 'C-only').length,
        dualProvenanceMembers: members.filter(row => row.composition === '{B,C}').length,
        fComponents: sortedUnique(members.flatMap(row => row.components)), references: refs };
      components.push(comp);
      lower += comp.minimumMemberXSize; upper += comp.maximumMemberXSize;
      if (single) singletonIncidence += comp.minimumMemberXSize;
      else { contestedLower += comp.minimumMemberXSize; contestedUpper += comp.maximumMemberXSize; }
    }
    assert.equal(lower, singletonIncidence + contestedLower);
    assert.equal(upper, singletonIncidence + contestedUpper);
    assert.equal(components.length, slot.components.length);
    totalComponents += components.length; totalOptions += slot.nodes.length;
    totalSingleton += components.filter(row => row.singleton).length;
    totalContested += components.filter(row => !row.singleton).length;
    cumulative.events += components.length; cumulative.lower += lower; cumulative.upper += upper;
    cumulative.singleton += singletonIncidence; cumulative.contestedLower += contestedLower; cumulative.contestedUpper += contestedUpper;
    if (!firstCrossing && cumulative.events > REFERENCE) firstCrossing = { slotIndex: slot.slotIndex,
      anchorIndex: slot.anchorIndex, timeMs: slot.timeMs, cumulativeComponentEvents: cumulative.events };
    const slotSummary = { slotIndex: slot.slotIndex, anchorIndex: slot.anchorIndex, timeMs: slot.timeMs,
      uniqueOptions: slot.nodes.length, components: components.length, singletonComponents: components.filter(row => row.singleton).length,
      contestedComponents: components.filter(row => !row.singleton).length, minimumCommittedCells: lower,
      maximumCommittedCells: upper, exactSingletonCells: singletonIncidence,
      contestedMinimumCells: contestedLower, contestedMaximumCells: contestedUpper,
      cumulative: { ...cumulative }, components };
    slots.push(slotSummary);
    envelopeSeries.push({ slotIndex: slot.slotIndex, anchorIndex: slot.anchorIndex, timeMs: slot.timeMs, components });
  }
  assert.equal(totalComponents, EXPECTED_COMPONENTS[seedRow.seed]);
  assert.equal(totalOptions, seedRow.packet.slots.reduce((sum, row) => sum + row.nodes.length, 0));
  assert.deepEqual(firstCrossing && { anchorIndex: firstCrossing.anchorIndex, timeMs: firstCrossing.timeMs,
    cumulative: firstCrossing.cumulativeComponentEvents }, seedRow.priorCapacity.firstAbove256,
    `${seedRow.seed} registered one-per-component 256 reference crossing`);
  return { seed: seedRow.seed, slots, selected, totalComponents, totalOptions, totalSingleton, totalContested,
    bounds: { minimumLayerCellIncidences: cumulative.lower, maximumLayerCellIncidences: cumulative.upper,
      exactSingletonLayerCellIncidences: cumulative.singleton, contestedMinimumLayerCellIncidences: cumulative.contestedLower,
      contestedMaximumLayerCellIncidences: cumulative.contestedUpper }, firstCrossing,
    envelopeSeries, actual: seedRow.actual, eventSha256: seedRow.eventSha256, rawLedgerSha256: seedRow.rawLedgerSha256,
    signalMetaSha256: seedRow.signalMetaSha256, signalChunkSha256: seedRow.signalChunkSha256 };
}

function makeLedger(seed, mode, layers) {
  const byCell = Array.from({ length: CELLS }, () => []), totals = new Uint32Array(CELLS);
  const bCounts = new Uint32Array(CELLS), cCounts = new Uint32Array(CELLS);
  const entryTouched = new Uint8Array(CELLS), nonEntryTouched = new Uint8Array(CELLS), mixedEntryTouched = new Uint8Array(CELLS);
  let incidence = 0, bIncidence = 0, cIncidence = 0;
  const compositionCounts = { 'B-only': 0, 'C-only': 0, '{B,C}': 0 };
  const entryIncidences = { entry: 0, 'non-entry': 0, mixed: 0 };
  for (const layer of [...layers].sort((a, b) => a.timeMs - b.timeMs || codeCompare(a.layerId, b.layerId))) {
    compositionCounts[layer.composition]++;
    incidence += layer.xCells.length;
    if (layer.channels.includes('B')) bIncidence += layer.xCells.length;
    if (layer.channels.includes('C')) cIncidence += layer.xCells.length;
    entryIncidences[layer.entryClass] += layer.xCells.length;
    for (const cell of layer.xCells) {
      totals[cell]++;
      if (layer.channels.includes('B')) bCounts[cell]++;
      if (layer.channels.includes('C')) cCounts[cell]++;
      if (layer.entryClass === 'entry') entryTouched[cell] = 1;
      else if (layer.entryClass === 'non-entry') nonEntryTouched[cell] = 1;
      else mixedEntryTouched[cell] = 1;
      const existing = byCell[cell].at(-1);
      if (existing && existing.timeMs === layer.timeMs) {
        existing.channels = [...new Set([...existing.channels, ...layer.channels])].sort(codeCompare);
        existing.layerIds.push(layer.layerId);
      } else byCell[cell].push({ timeMs: layer.timeMs, channels: [...layer.channels].sort(codeCompare), layerIds: [layer.layerId] });
    }
  }
  const coveredLayers = [], histogram = {}, groupHistogram = {};
  let union = 0, bCoverage = 0, cCoverage = 0, bothCoverage = 0, bOnly = 0, cOnly = 0, repeatedCells = 0;
  for (let cell = 0; cell < CELLS; cell++) {
    const total = totals[cell], groupCount = byCell[cell].length;
    histogram[total] = (histogram[total] || 0) + 1;
    groupHistogram[groupCount] = (groupHistogram[groupCount] || 0) + 1;
    if (total) { union++; coveredLayers.push(total); if (total >= 2) repeatedCells++; }
    const b = bCounts[cell] > 0, c = cCounts[cell] > 0;
    if (b) bCoverage++; if (c) cCoverage++;
    if (b && c) bothCoverage++; else if (b) bOnly++; else if (c) cOnly++;
  }
  coveredLayers.sort((a, b) => a - b);
  const cells = [];
  for (let cell = 0; cell < CELLS; cell++) if (byCell[cell].length) {
    cells.push({ cell, groups: byCell[cell].map(group => ({ ...group, layerIds: group.layerIds.sort(codeCompare) })),
      temporalGroupCount: byCell[cell].length, layerCount: totals[cell], bLayerCount: bCounts[cell], cLayerCount: cCounts[cell],
      category: bCounts[cell] && cCounts[cell] ? 'mixed' : bCounts[cell] ? 'B-only' : 'C-only' });
  }
  const metrics = { episodeCount: layers.length, compositionCounts, unionCoverageCells: union,
    BOnlyCoveredCells: bOnly, COnlyCoveredCells: cOnly, cellsTouchedByBothChannels: bothCoverage,
    totalLayerCellIncidences: incidence, BProvenanceLayerCellIncidences: bIncidence,
    CProvenanceLayerCellIncidences: cIncidence, meanLayersOnCoveredCells: union ? incidence / union : 0,
    q50LayersOnCoveredCells: quantile(coveredLayers, .5), q90LayersOnCoveredCells: quantile(coveredLayers, .9),
    q99LayersOnCoveredCells: quantile(coveredLayers, .99), maxLayers: coveredLayers.at(-1) || 0,
    repeatedLayerCells: repeatedCells, layerCountHistogram: histogram, temporalGroupCountHistogram: groupHistogram,
    mixedProvenanceCells: bothCoverage, entryIncidences, entryTouchedCells: entryTouched.reduce((a, b) => a + b, 0),
    nonEntryTouchedCells: nonEntryTouched.reduce((a, b) => a + b, 0),
    mixedEntryTouchedCells: mixedEntryTouched.reduce((a, b) => a + b, 0) };
  const validation = independentLedgerCheck(layers, metrics, cells);
  return { ledger: { schema: 'ant-bc-capacity-reference-ledger-v1', seed, mode,
    layerSemantics: 'One selected existing member X per registered exact-overlap component per slot; each selected X is one immutable episode layer. A {B,C} option is one layer tagged with both provenance channels.',
    eventOrder: 'actual saved slot time, then deterministic component layer ID; exact per-cell time ties are grouped without causal ordering.',
    layerCountReference: 256, layers, cells, metrics }, validation };
}

function independentLedgerCheck(layers, expected, rows) {
  const total = new Uint32Array(CELLS), b = new Uint32Array(CELLS), c = new Uint32Array(CELLS);
  const histories = Array.from({ length: CELLS }, () => new Map());
  let incidence = 0;
  for (const layer of layers) for (const cell of layer.xCells) {
    total[cell]++; incidence++;
    if (layer.channels.includes('B')) b[cell]++;
    if (layer.channels.includes('C')) c[cell]++;
    if (!histories[cell].has(layer.timeMs)) histories[cell].set(layer.timeMs, { channels: new Set(), layerIds: [] });
    const group = histories[cell].get(layer.timeMs);
    for (const channel of layer.channels) group.channels.add(channel);
    group.layerIds.push(layer.layerId);
  }
  const sorted = [], histogram = {}, unionCells = [];
  let bCoverage = 0, cCoverage = 0, both = 0, repeated = 0;
  for (let cell = 0; cell < CELLS; cell++) {
    histogram[total[cell]] = (histogram[total[cell]] || 0) + 1;
    if (total[cell]) { sorted.push(total[cell]); unionCells.push(cell); if (total[cell] > 1) repeated++; }
    if (b[cell]) bCoverage++; if (c[cell]) cCoverage++; if (b[cell] && c[cell]) both++;
  }
  sorted.sort((a, b) => a - b);
  assert.equal(incidence, expected.totalLayerCellIncidences);
  assert.equal(unionCells.length, expected.unionCoverageCells);
  assert.equal(bCoverage + cCoverage - both, unionCells.length);
  assert.equal(bCoverage, expected.BOnlyCoveredCells + both);
  assert.equal(cCoverage, expected.COnlyCoveredCells + both);
  assert.equal(both, expected.cellsTouchedByBothChannels);
  assert.equal(repeated, expected.repeatedLayerCells);
  assert.deepEqual(histogram, expected.layerCountHistogram);
  assert.equal(sorted.length ? sorted[Math.floor((sorted.length - 1) * .5)] : null, expected.q50LayersOnCoveredCells);
  assert.equal(sorted.length ? sorted[Math.floor((sorted.length - 1) * .9)] : null, expected.q90LayersOnCoveredCells);
  assert.equal(sorted.at(-1) || 0, expected.maxLayers);
  for (const row of rows) {
    assert.equal(row.layerCount, total[row.cell]); assert.equal(row.bLayerCount, b[row.cell]); assert.equal(row.cLayerCount, c[row.cell]);
    const groups = [...histories[row.cell]].sort((a, b) => a[0] - b[0]).map(([timeMs, group]) => ({ timeMs,
      channels: [...group.channels].sort(codeCompare), layerIds: group.layerIds.sort(codeCompare) }));
    assert.deepEqual(row.groups, groups, `${row.cell} independent temporal/provenance groups`);
  }
  return { independentPerCellReconstruction: true, incidence: true, coverage: true, histograms: true, rowCounts: true };
}

function envelopeAt(seedData, requestedSeconds) {
  const cells = { singleton: new Uint16Array(CELLS), guaranteedContested: new Uint16Array(CELLS), possibleContested: new Uint16Array(CELLS) };
  const included = seedData.slots.filter(slot => slot.timeMs <= requestedSeconds * 1000);
  for (const slot of included) for (const comp of slot.components) {
    if (comp.singleton) for (const cell of comp.singletonExactCells) cells.singleton[cell]++;
    else {
      for (const cell of comp.intersectionCells) cells.guaranteedContested[cell]++;
      for (const cell of comp.unionCells) cells.possibleContested[cell]++;
    }
  }
  return { requestedSeconds, lastSavedTimeMs: included.at(-1)?.timeMs ?? null,
    lastSavedAnchorIndex: included.at(-1)?.anchorIndex ?? null,
    cumulativeComponentEvents: included.reduce((sum, row) => sum + row.components.length, 0),
    maps: Object.fromEntries(Object.entries(cells).map(([key, value]) => [key, Array.from(value)])),
    envelopeWarning: 'Possible contested incidence is a per-cell union envelope; its spatial pattern need not be jointly realizable by one winner selection.' };
}

function componentSnapshots(seedData, modes) {
  return SNAPSHOTS.map(seconds => {
    const slotRows = seedData.slots.filter(row => row.timeMs <= seconds * 1000), latest = slotRows.at(-1) ?? null;
    const summary = { requestedSeconds: seconds, latestAnalysisTimeMs: latest?.timeMs ?? null,
      latestAnchorIndex: latest?.anchorIndex ?? null, slots: slotRows.length,
      components: slotRows.reduce((sum, row) => sum + row.components.length, 0),
      minimumLayerCellIncidences: slotRows.reduce((sum, row) => sum + row.minimumCommittedCells, 0),
      maximumLayerCellIncidences: slotRows.reduce((sum, row) => sum + row.maximumCommittedCells, 0),
      exactSingletonLayerCellIncidences: slotRows.reduce((sum, row) => sum + row.exactSingletonCells, 0),
      contestedMinimumLayerCellIncidences: slotRows.reduce((sum, row) => sum + row.contestedMinimumCells, 0),
      contestedMaximumLayerCellIncidences: slotRows.reduce((sum, row) => sum + row.contestedMaximumCells, 0), references: {} };
    for (const mode of Object.keys(modes)) {
      const layers = modes[mode].filter(row => row.timeMs <= seconds * 1000);
      const { ledger } = makeLedger(seedData.seed, mode, layers);
      summary.references[mode] = ledger.metrics;
    }
    if (seconds === 600) {
      const { layerCounts, ...actualStats } = seedData.actual;
      summary.actualProduction = actualStats;
    }
    return summary;
  });
}

function windowRows(seedData) {
  return Array.from({ length: 10 }, (_, index) => {
    const startMs = index * 60_000, endMs = (index + 1) * 60_000;
    const slots = seedData.slots.filter(row => row.timeMs >= startMs && row.timeMs < endMs);
    const components = slots.flatMap(row => row.components);
    const refs = {};
    for (const mode of ['MIN-FOOTPRINT', 'MAX-FOOTPRINT', 'CANONICAL']) {
      const layers = seedData.selected[mode].filter(row => row.timeMs >= startMs && row.timeMs < endMs);
      refs[mode] = { episodes: layers.length, layerCellIncidences: layers.reduce((sum, row) => sum + row.xCells.length, 0) };
    }
    return { seed: seedData.seed, window: `${index * 60}–${(index + 1) * 60}`, startMs, endMs,
      slots: slots.length, componentEvents: components.length, singletonComponents: components.filter(row => row.singleton).length,
      contestedComponents: components.filter(row => !row.singleton).length,
      minimumLayerCellIncidences: slots.reduce((sum, row) => sum + row.contestedMinimumCells + row.exactSingletonCells, 0),
      maximumLayerCellIncidences: slots.reduce((sum, row) => sum + row.contestedMaximumCells + row.exactSingletonCells, 0),
      exactSingletonLayerCellIncidences: slots.reduce((sum, row) => sum + row.exactSingletonCells, 0),
      contestedMinimumLayerCellIncidences: slots.reduce((sum, row) => sum + row.contestedMinimumCells, 0),
      contestedMaximumLayerCellIncidences: slots.reduce((sum, row) => sum + row.contestedMaximumCells, 0), references: refs };
  });
}

function componentCensus(seedData) {
  const components = seedData.slots.flatMap(slot => slot.components);
  const summarize = rows => ({ count: rows.length,
    optionCount: distribution(rows.map(row => row.memberXCount)),
    minMemberXSize: distribution(rows.map(row => row.minimumMemberXSize)),
    medianMemberXSize: distribution(rows.map(row => row.medianMemberXSize)),
    maxMemberXSize: distribution(rows.map(row => row.maximumMemberXSize)),
    intersectionCells: distribution(rows.map(row => row.intersectionCellCount)),
    unionCells: distribution(rows.map(row => row.unionCellCount)) });
  return { total: summarize(components), singleton: summarize(components.filter(row => row.singleton)),
    contested: summarize(components.filter(row => !row.singleton)),
    contestedWithEmptyGuaranteedIntersection: components.filter(row => !row.singleton && !row.intersectionCellCount).length,
    possibleComposition: { 'B-only': components.filter(row => row.possibleCompositions.includes('B-only')).length,
      'C-only': components.filter(row => row.possibleCompositions.includes('C-only')).length,
      '{B,C}': components.filter(row => row.possibleCompositions.includes('{B,C}')).length } };
}

function rawReference(seedRow, eventMap) {
  const events = [...eventMap.values()].sort((a, b) => a.timeMs - b.timeMs || codeCompare(a.eventId, b.eventId));
  for (const event of events) {
    assert.equal(hash(Buffer.from(JSON.stringify(event.xCells))), event.xSha256, `${event.eventId} original event mask hash`);
    assert.ok(event.timeMs >= 0 && event.timeMs <= 600_000);
  }
  const layers = events.map(event => ({ layerId: event.eventId, timeMs: event.timeMs, xCells: event.xCells,
    channels: [event.channel], composition: event.channel === 'B' ? 'B-only' : 'C-only', entryClass: event.entryClass }));
  const counts = new Uint32Array(CELLS), b = new Uint32Array(CELLS), c = new Uint32Array(CELLS), byCell = new Map();
  let incidence = 0;
  for (const event of events) for (const cell of event.xCells) {
    counts[cell]++; incidence++; if (event.channel === 'B') b[cell]++; else c[cell]++;
    if (!byCell.has(cell)) byCell.set(cell, new Map());
    const timeMap = byCell.get(cell); if (!timeMap.has(event.timeMs)) timeMap.set(event.timeMs, { B: [], C: [] });
    timeMap.get(event.timeMs)[event.channel].push(event.eventId);
  }
  const prior = seedRow.priorLedger, cellRows = [...byCell].sort((a, b) => a[0] - b[0]).map(([cell, timeMap]) => ({ cell,
    groups: [...timeMap.entries()].sort((a, b) => a[0] - b[0]).map(([timeMs, ids]) => {
      ids.B.sort(codeCompare); ids.C.sort(codeCompare);
      return { timeMs, channels: ['B', 'C'].filter(channel => ids[channel].length),
        eventIdsByChannel: ids, layerCount: ids.B.length + ids.C.length };
    }) }));
  assert.equal(cellRows.length, prior.cells.length, `${seedRow.seed} raw prototype cell coverage`);
  for (let i = 0; i < cellRows.length; i++) {
    assert.equal(cellRows[i].cell, prior.cells[i].cell);
    assert.deepEqual(cellRows[i].groups, prior.cells[i].groups, `${seedRow.seed} raw per-cell history`);
  }
  const covered = [...counts].filter(value => value > 0).sort((a, b) => a - b);
  const both = [...b].reduce((sum, value, cell) => sum + (value > 0 && c[cell] > 0 ? 1 : 0), 0);
  const metrics = { eventCount: events.length, BEvents: events.filter(row => row.channel === 'B').length,
    CEvents: events.filter(row => row.channel === 'C').length, uniqueCoverageCells: covered.length,
    totalLayerCellIncidences: incidence, meanLayersOnCoveredCells: incidence / covered.length,
    q50LayersOnCoveredCells: quantile(covered, .5), q90LayersOnCoveredCells: quantile(covered, .9),
    q99LayersOnCoveredCells: quantile(covered, .99), maxLayers: covered.at(-1), mixedProvenanceCells: both,
    actualProductionPlateBirths: seedRow.actual.totalProductionPlateBirths,
    eventReferenceCrossing: rawSummaryCrossing(events, REFERENCE) };
  const oldEvents = events.length;
  assert.equal(oldEvents, EXPECTED_RAW_EVENTS[seedRow.seed]);
  return { metrics, layers };
}

function rawSummaryCrossing(events, reference) {
  let count = 0;
  for (const event of events) { count++; if (count > reference) return { count, timeMs: event.timeMs, eventId: event.eventId }; }
  return null;
}

function summarizeSeed(seedData, seedRow, eventMap) {
  const modes = {};
  for (const mode of ['MIN-FOOTPRINT', 'MAX-FOOTPRINT', 'CANONICAL']) {
    const { ledger, validation } = makeLedger(seedData.seed, mode, seedData.selected[mode]);
    modes[mode] = { ledger, validation };
  }
  const lowerCheck = modes['MIN-FOOTPRINT'].ledger.metrics.totalLayerCellIncidences;
  const upperCheck = modes['MAX-FOOTPRINT'].ledger.metrics.totalLayerCellIncidences;
  assert.equal(lowerCheck, seedData.bounds.minimumLayerCellIncidences, `${seedData.seed} exact lower bound`);
  assert.equal(upperCheck, seedData.bounds.maximumLayerCellIncidences, `${seedData.seed} exact upper bound`);
  const raw = rawReference(seedRow, eventMap);
  const rawSeedSummary = rawSummarySeed(seedRow.seed);
  assert.equal(raw.metrics.totalLayerCellIncidences, rawSeedSummary.final.layerCellIncidences);
  assert.equal(raw.metrics.uniqueCoverageCells, rawSeedSummary.final.coverage.union);
  assert.equal(raw.metrics.maxLayers, rawSeedSummary.final.maxLayers);
  const windows = windowRows(seedData), snapshots = componentSnapshots(seedData, seedData.selected);
  const envelopes = SNAPSHOTS.map(seconds => envelopeAt(seedData, seconds));
  const provenanceTotals = Object.fromEntries(Object.entries(modes).map(([mode, row]) => [mode,
    row.ledger.metrics.compositionCounts]));
  const result = { seed: seedData.seed, rawMaturation: raw.metrics,
    componentEventCount: seedData.totalComponents, optionAppearances: seedData.totalOptions,
    singletonComponents: seedData.totalSingleton, contestedComponents: seedData.totalContested,
    componentFootprintCensus: componentCensus(seedData), firstStrictlyAbove256ComponentEvent: seedData.firstCrossing, bounds: seedData.bounds,
    reference600: Object.fromEntries(Object.entries(modes).map(([mode, row]) => [mode, row.ledger.metrics])),
    referenceProvenance: provenanceTotals,
    actualProduction: (({ layerCounts, ...actualStats }) => actualStats)(seedData.actual),
    actualLayerCounts: seedData.actual.layerCounts, latestComponentSlotTimeMs: seedData.slots.at(-1)?.timeMs ?? null,
    snapshots, windows, ledgers: Object.fromEntries(Object.entries(modes).map(([mode, row]) => [mode, row.ledger])),
    ledgerValidation: Object.fromEntries(Object.entries(modes).map(([mode, row]) => [mode, row.validation])), envelopes,
    rawPrototypeParity: { exactEventCount: true, exactPerCellGroups: true, summaryMetricsMatch: true } };
  return result;
}

let _rawSummary;
function rawSummarySeed(seed) { return _rawSummary.seeds.find(row => row.seed === seed); }

function finalClassification(seedResults) {
  const rows = seedResults.map(row => ({ seed: row.seed, min: row.reference600['MIN-FOOTPRINT'],
    max: row.reference600['MAX-FOOTPRINT'], canonical: row.reference600.CANONICAL, raw: row.rawMaturation, actual: row.actualProduction }));
  const winnerSpread = rows.map(row => ({ seed: row.seed,
    incidenceRange: row.max.totalLayerCellIncidences - row.min.totalLayerCellIncidences,
    coverageRange: row.max.unionCoverageCells - row.min.unionCoverageCells,
    maxLayerRange: row.max.maxLayers - row.min.maxLayers }));
  const referenceMeasures = rows.flatMap(row => [row.min, row.max, row.canonical]);
  const incidenceRatioToRaw = rows.map(row => row.min.totalLayerCellIncidences / row.raw.totalLayerCellIncidences);
  const coverageRatioToRaw = rows.map(row => row.min.unionCoverageCells / row.raw.uniqueCoverageCells);
  const materialDensityVsActual = rows.map(row => row.min.meanLayersOnCoveredCells / row.actual.meanLayersOnCoveredCells);
  const classification = 'CAPACITY LAW NOT YET JUSTIFIED';
  const interpretation = 'Every seed exceeds 256 component episodes regardless of member choice, so the current record ceiling is an implementation pressure. All three references cover fewer cells than the raw B/C ledger and saved production material, and their mean layering stays below production; mean layering is close to, and in two of nine seed/reference pairs slightly above, the raw ledger. High-count tails approach or exceed those references in some seeds. Winner choice changes total incidence and the tail, but the comparative pattern does not establish semantically excessive accumulation or an authored world-level capacity law.';
  assert.equal(referenceMeasures.length, 9);
  const modeComparisons = rows.map(row => ({ seed: row.seed, modes: Object.fromEntries(
    ['MIN-FOOTPRINT', 'CANONICAL', 'MAX-FOOTPRINT'].map(mode => {
      const metric = row[mode === 'MIN-FOOTPRINT' ? 'min' : mode === 'MAX-FOOTPRINT' ? 'max' : 'canonical'];
      return [mode, { coverageVsRaw: metric.unionCoverageCells / row.raw.uniqueCoverageCells,
        coverageVsActual: metric.unionCoverageCells / row.actual.uniqueMaterialCells,
        meanLayersVsRaw: metric.meanLayersOnCoveredCells / row.raw.meanLayersOnCoveredCells,
        meanLayersVsActual: metric.meanLayersOnCoveredCells / row.actual.meanLayersOnCoveredCells }];
    })) }));
  return { classification, interpretation, winnerChoiceSensitivity: winnerSpread, modeComparisons,
    minimumIncidenceToRawRatios: incidenceRatioToRaw, minimumCoverageToRawRatios: coverageRatioToRaw,
    minimumMeanLayerDensityToActualRatios: materialDensityVsActual,
    smallestNextQuestion: 'What minimal local arbitration responsibility should choose one existing X inside a contested overlap component, before any world-level capacity question is reopened?',
    limits: ['The reference realizations are deterministic bounds, not candidate winner laws.',
      'The 256 value is an implementation safety reference, not an authored material-capacity law.',
      'Virtual layers do not enter production MaterialStratigraphy or feed movement, nodule, or audio state.'] };
}

function reportMarkdown(summary) {
  const seeds = summary.seeds;
  const rows = seeds.map(row => `| ${row.seed} | ${row.componentEventCount} | ${row.singletonComponents} | ${row.contestedComponents} | ${row.bounds.exactSingletonLayerCellIncidences} | ${row.bounds.contestedMinimumLayerCellIncidences}–${row.bounds.contestedMaximumLayerCellIncidences} | ${row.bounds.minimumLayerCellIncidences.toLocaleString('en-US')}–${row.bounds.maximumLayerCellIncidences.toLocaleString('en-US')} | ${row.firstStrictlyAbove256ComponentEvent?.timeMs.toFixed(3) ?? '—'} ms |`).join('\n');
  const referenceRows = seeds.map(row => ['MIN-FOOTPRINT', 'CANONICAL', 'MAX-FOOTPRINT'].map(mode => {
    const m = row.reference600[mode]; return `| ${row.seed} | ${mode} | ${m.episodeCount} | ${m.unionCoverageCells} | ${m.totalLayerCellIncidences} | ${m.meanLayersOnCoveredCells.toFixed(2)} | ${m.q90LayersOnCoveredCells} | ${m.maxLayers} | ${m.mixedProvenanceCells} |`;
  }).join('\n')).join('\n');
  const rawActual = seeds.map(row => `| ${row.seed} | ${row.rawMaturation.eventCount} | ${row.rawMaturation.uniqueCoverageCells} | ${row.rawMaturation.totalLayerCellIncidences} | ${row.rawMaturation.meanLayersOnCoveredCells.toFixed(2)} | ${row.rawMaturation.maxLayers} | ${row.actualProduction.totalProductionPlateBirths} | ${row.actualProduction.uniqueMaterialCells} | ${row.actualProduction.totalLayerCellIncidences} | ${row.actualProduction.maxLayers} |`).join('\n');
  const censusRows = seeds.map(row => `| ${row.seed} | ${row.componentFootprintCensus.total.optionCount.median} | ${row.componentFootprintCensus.contested.minMemberXSize.median} | ${row.componentFootprintCensus.contested.medianMemberXSize.median} | ${row.componentFootprintCensus.contested.maxMemberXSize.median} | ${row.componentFootprintCensus.contested.intersectionCells.median} | ${row.componentFootprintCensus.contested.unionCells.median} |`).join('\n');
  const snapshots = seeds.flatMap(row => row.snapshots.map(s => `| ${row.seed} | ${s.requestedSeconds} | ${s.latestAnalysisTimeMs?.toFixed(3) ?? '—'} | ${s.components} | ${s.exactSingletonLayerCellIncidences} | ${s.contestedMinimumLayerCellIncidences}–${s.contestedMaximumLayerCellIncidences} | ${s.minimumLayerCellIncidences}–${s.maximumLayerCellIncidences} | ${s.references['MIN-FOOTPRINT'].unionCoverageCells} / ${s.references.CANONICAL.unionCoverageCells} / ${s.references['MAX-FOOTPRINT'].unionCoverageCells} |`)).join('\n');
  const windowRows = seeds.flatMap(row => row.windows.map(w => `| ${row.seed} | ${w.window} | ${w.componentEvents} | ${w.singletonComponents} / ${w.contestedComponents} | ${w.exactSingletonLayerCellIncidences} | ${w.contestedMinimumLayerCellIncidences}–${w.contestedMaximumLayerCellIncidences} | ${w.minimumLayerCellIncidences}–${w.maximumLayerCellIncidences} | ${w.references['MIN-FOOTPRINT'].layerCellIncidences} / ${w.references.CANONICAL.layerCellIncidences} / ${w.references['MAX-FOOTPRINT'].layerCellIncidences} |`)).join('\n');
  return `# B/C one-per-local-component capacity necessity audit\n\n## Classification\n\n**${summary.decision.classification}.** ${summary.decision.interpretation}\n\n## Scope and authority\n\n- Production represented by the frozen histories: \`${PRODUCTION}\`.\n- Input conflict decomposition: \`${UPSTREAM.conflict}\`; exact registered 163 slots, 1,846 option appearances, and 1,352 components.\n- B/C maturation: \`${UPSTREAM.dual}\`; raw event counts are independently rechecked.\n- Provenance reference: \`${UPSTREAM.rawPrototype}\`; per-cell groups are rebuilt and compared.\n- Local conflict source: \`${UPSTREAM.slotAudit}\`.\n- No world simulation or replay occurred. No \`src/\` or \`static/\` behavior changed.\n\n## Implementation fact\n\nEach registered exact-X overlap component contributes one diagnostic episode at its actual saved slot time. Singleton components use their exact only mask. Contested components are not resolved in the bound: their minimum and maximum member sizes define incidence limits; their all-member intersection and union define guaranteed/possible spatial envelopes. Three deterministic references select only an existing member X: smallest mask, largest mask, or lexicographically lowest registered \`optionId\`. None is a candidate law.\n\nA selected \`{B,C}\` option is one episode layer tagged with both provenances. It is not serialized as two physical layers. The current production material is read only as a separate reference. The 256 record count remains an implementation ceiling reference.\n\n## Winner-independent event and footprint bounds\n\n| Seed | Component episodes | Singleton | Contested | Minimum incidences | Maximum incidences | First component count >256 (time) |\n|---|---:|---:|---:|---:|---:|---:|\n${rows}\n\nThese bounds are exact sums over the registered components. Singleton incidence is fixed; contested low/high contributions are unresolved member-mask size bounds. Event count is independent of the selected X.\n\n## Per-slot and fixed 60 s pressure\n\n| Seed | Window (s) | Component episodes | Singletons / contested | Footprint bound | MIN / canonical / MAX incidences |\n|---|---|---:|---:|---:|---:|\n${windowRows}\n\n## Cumulative snapshots\n\nEach requested time uses all saved slots at or before that time. The timestamp is the exact latest included slot. Coverage columns show MIN / canonical / MAX; they are actual selected-mask ledger results, not bounds.\n\n| Seed | Requested (s) | Latest saved time (ms) | Episodes | Incidence bounds | MIN / canonical / MAX coverage cells |\n|---|---:|---:|---:|---:|---:|\n${snapshots}\n\n## 600 s reference realizations\n\n| Seed | Reference | Episodes | Union cells | Layer-cell incidences | Mean layers / covered cell | Q90 | Max | Mixed-provenance cells |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n${referenceRows}\n\n## Raw maturation and actual production context\n\n| Seed | Raw B/C events | Raw union cells | Raw incidences | Raw mean layers | Raw max | Actual Plate births | Actual union cells | Actual incidences | Actual max |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${rawActual}\n\nRaw B/C maturation events and the current source→boundary production Plates have different semantics. Neither is ground truth for the one-per-component counterfactual. The current production values are read from the last saved material snapshot at 599.25 s.\n\n## Validation\n\n- All 163 slot receipts and their source slot packet checksums match the registered packages.\n- All 1,352 components were independently reconstructed from exact X-mask overlap and match the frozen partitions.\n- Each selected reference uses a member mask already present in the frozen component; no synthetic plate mask is created.\n- MIN and MAX incidence totals equal the independent per-component lower and upper sums exactly.\n- Each reference ledger is independently reconstructed cell by cell; all three match their saved histogram, coverage, incidence, and cell counts.\n- All 2,089 raw B/C event masks and timestamps match the frozen event streams; per-cell histories match the prior prototype ledger.\n- Actual material maps are decoded from integrity-checked saved production anchors, not replayed.\n- Observer RNG calls: 0.\n\nQuantiles use the registered observed-value convention: sorted value at \`floor((n−1)×p)\`, no interpolation.\n\n## Interpretation boundary\n\nThe class addresses semantic accumulation evidence only. Exceeding 256 events is not, by itself, evidence for an authored capacity law. This analysis does not choose local winners, impose a world-level limit, delete or turn over material, or feed shadow layers into the world.\n\nSmallest next question: ${summary.decision.classification === 'WINNER-DEPENDENT' ? 'which local arbitration responsibility is justified before revisiting total material pressure?' : 'whether the deterministic local member references are sufficient to proceed to a later local arbitration prototype, while treating storage capacity as a separate implementation task.'}\n`;
}

function censusMarkdown(summary) {
  const format = (seed, census) => `| ${seed} | ${census.total.optionCount.median} | ${census.contested.minMemberXSize.median} | ${census.contested.medianMemberXSize.median} | ${census.contested.maxMemberXSize.median} | ${census.contested.intersectionCells.median} | ${census.contested.unionCells.median} |`;
  const rows = [...summary.seeds.map(row => format(row.seed, row.componentFootprintCensus)),
    format('POOLED', summary.pooledComponentFootprintCensus)].join('\n');
  return `\n### Component mask-size census\n\n| Seed | Median options / component | Contested median min-X | Contested median median-X | Contested median max-X | Median guaranteed cells | Median possible-union cells |\n|---|---:|---:|---:|---:|---:|---:|\n${rows}\n`;
}

function svgHeatmap(values, x, y, size, scale, label, subtitle = '') {
  const cell = size / GRID, bins = new Map();
  for (let id = 0; id < values.length; id++) {
    const value = values[id]; if (!value) continue;
    const bucket = Math.min(scale, Math.max(1, Math.ceil(value)));
    if (!bins.has(bucket)) bins.set(bucket, []);
    bins.get(bucket).push(`M${(x + (id % GRID) * cell).toFixed(2)} ${(y + Math.floor(id / GRID) * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`);
  }
  let parts = `<text x="${x}" y="${y - 22}" class="title">${label}</text>`;
  if (subtitle) parts += `<text x="${x}" y="${y - 8}" class="sub">${subtitle}</text>`;
  parts += `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#faf9f5" stroke="#aaa"/>`;
  for (const [bucket, paths] of bins) {
    const t = bucket / scale, color = `rgb(${Math.round(237 - 170 * t)},${Math.round(231 - 125 * t)},${Math.round(214 - 85 * t)})`;
    parts += `<path d="${paths.join('')}" fill="${color}"/>`;
  }
  return parts;
}

function atlasSvg(seedResults) {
  const panel = 144, margin = 150, width = margin + panel * 3 + 28, height = 72 + 3 * 190;
  const envelopeScale = seedResults.flatMap(seed => Object.values(seed.envelopes.at(-1).maps).flat())
    .reduce((max, value) => Math.max(max, value), 1);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:Arial,sans-serif;fill:#242321}.title{font-size:13px;font-weight:bold}.sub{font-size:10px;fill:#555}.row{font-size:17px;font-weight:bold}</style><rect width="100%" height="100%" fill="#f1efe9"/><text x="18" y="28" font-size="20" font-weight="bold">Winner-agnostic spatial envelopes · 600 s</text><text x="18" y="50" font-size="12">Singleton incidence is exact. Contested guaranteed map sums all-member intersections; possible map sums member unions and is not jointly realizable as a world.</text>`;
  const keys = [['singleton', 'Fixed singleton episodes'], ['guaranteedContested', 'Guaranteed contested incidence'], ['possibleContested', 'Possible contested envelope']];
  seedResults.forEach((seed, row) => {
    const y = 112 + row * 190;
    svg += `<text x="18" y="${y + 72}" class="row">${seed.seed}</text>`;
    const maps = seed.envelopes.at(-1).maps;
    keys.forEach(([key, label], col) => { svg += svgHeatmap(maps[key], margin + col * panel, y, 132, envelopeScale, label, `shared linear scale 0–${envelopeScale}`); });
  });
  return svg + '</svg>\n';
}

function realizationSvg(seedResults) {
  const modes = ['MIN-FOOTPRINT', 'CANONICAL', 'MAX-FOOTPRINT', 'RAW B/C', 'ACTUAL PRODUCTION'];
  const margin = 118, panel = 132, width = margin + panel * modes.length + 20, height = 90 + seedResults.length * 190;
  const allValues = seedResults.flatMap(seed => modes.flatMap(mode => mode === 'RAW B/C'
    ? [seed.rawLayerCounts] : mode === 'ACTUAL PRODUCTION' ? [seed.actualLayerCounts]
      : [seed.ledgers[mode].cells.map(row => row.layerCount)])).flat().filter(Number.isFinite);
  const allMax = allValues.reduce((max, value) => Math.max(max, value), 1);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:Arial,sans-serif;fill:#242321}.title{font-size:12px;font-weight:bold}.sub{font-size:9px;fill:#555}.row{font-size:16px;font-weight:bold}</style><rect width="100%" height="100%" fill="#f1efe9"/><text x="18" y="28" font-size="20" font-weight="bold">600 s local-component reference footprints</text><text x="18" y="49" font-size="12">Identical 96×96 world grid and linear layer-count scale, 0–${allMax}. Raw shadow and production material are context, not targets.</text>`;
  seedResults.forEach((seed, row) => {
    const y = 105 + row * 190; svg += `<text x="18" y="${y + 70}" class="row">${seed.seed}</text>`;
    modes.forEach((mode, col) => {
      let values, subtitle;
      if (mode === 'RAW B/C') { values = seed.rawLayerCounts; subtitle = `${seed.rawMaturation.eventCount} raw events`; }
      else if (mode === 'ACTUAL PRODUCTION') { values = seed.actualLayerCounts; subtitle = `${seed.actualProduction.totalProductionPlateBirths} actual births`; }
      else { values = new Array(CELLS).fill(0); for (const row of seed.ledgers[mode].cells) values[row.cell] = row.layerCount;
        subtitle = `${seed.ledgers[mode].metrics.episodeCount} episodes · through ${(seed.latestComponentSlotTimeMs / 1000).toFixed(2)} s`; }
      svg += svgHeatmap(values, margin + col * panel, y, 120, allMax, mode, subtitle);
    });
  });
  return svg + '</svg>\n';
}

function accumulationSvg(seedResults) {
  const width = 1080, height = 3 * 250 + 70, left = 80, right = 1040, top = 66;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:Arial,sans-serif;fill:#242321}.title{font-size:18px;font-weight:bold}.axis{font-size:11px}.legend{font-size:11px}</style><rect width="100%" height="100%" fill="#f1efe9"/><text x="24" y="28" class="title">Component episodes and cumulative footprint bounds</text><text x="24" y="48" class="axis">Each seed is separate. Dashed horizontal line marks 256 episode records as implementation reference only.</text>`;
  seedResults.forEach((seed, index) => {
    const y = top + index * 250, plotTop = y, plotBottom = y + 180, x = sec => left + sec / 600 * (right - left);
    const eventMax = Math.max(REFERENCE, seed.componentEventCount), incidenceMax = seed.bounds.maximumLayerCellIncidences;
    const yEvent = value => plotBottom - value / eventMax * 180;
    const yInc = value => plotBottom - value / incidenceMax * 180;
    const snapshots = [{ time: 0, event: 0, min: 0, max: 0 }, ...seed.slots.map(row => ({ time: row.timeMs / 1000,
      event: row.cumulative.events, min: row.cumulative.lower, max: row.cumulative.upper }))];
    const line = (key, fn) => snapshots.map((row, i) => `${i ? 'L' : 'M'}${x(row.time).toFixed(1)} ${fn(row[key]).toFixed(1)}`).join(' ');
    svg += `<text x="22" y="${y + 17}" font-size="14" font-weight="bold">${seed.seed}</text><path d="M${left} ${plotBottom}H${right}M${left} ${plotTop}V${plotBottom}" stroke="#777" fill="none"/>`;
    svg += `<path d="M${left} ${yEvent(REFERENCE)}H${right}" stroke="#777" stroke-dasharray="5 4"/><text x="${right - 72}" y="${yEvent(REFERENCE) - 4}" class="axis">256 reference</text>`;
    svg += `<path d="${line('event', yEvent)}" stroke="#2b5965" stroke-width="2.5" fill="none"/><path d="${line('min', yInc)}" stroke="#8d5d37" stroke-width="2" fill="none"/><path d="${line('max', yInc)}" stroke="#ad8a61" stroke-width="2" stroke-dasharray="5 3" fill="none"/>`;
    svg += `<text x="${left}" y="${plotTop - 4}" class="axis">left: episodes 0–${eventMax}</text><text x="${right - 165}" y="${plotTop - 4}" class="axis">right: incidences 0–${incidenceMax}</text>`;
    for (const sec of [0, 120, 240, 360, 480, 600]) svg += `<text x="${x(sec) - 8}" y="${plotBottom + 17}" class="axis">${sec}</text>`;
    svg += `<text x="${left}" y="${plotBottom + 35}" class="legend" fill="#2b5965">episode count</text><text x="${left + 128}" y="${plotBottom + 35}" class="legend" fill="#8d5d37">minimum incidences</text><text x="${left + 282}" y="${plotBottom + 35}" class="legend" fill="#ad8a61">maximum incidences</text>`;
  });
  return svg + '</svg>\n';
}

function writeProtocol(summary) {
  return `# Protocol — B/C component capacity necessity\n\nThis is an observer-only analysis of frozen histories. It uses the 163 saved temporal slots and 1,846 unique-X appearances from the registered conflict decomposition. It does not run or replay the natural world.\n\n## Fixed input architecture\n\nExisting B/C track maturation and exact X-overlap components are reused without change. One diagnostic episode is counted per exact-overlap component per saved slot. No local winner is selected as an authored law.\n\n## Per-component bounds\n\nFor member masks \`X_i\`, the component stores min/median/max \`|X_i|\`, exact all-member intersection, and exact member union. Lower and upper episode footprints use min/max member mask sizes. The union/intersection maps are feasibility envelopes, not synthetic plates. Singleton masks are exact.\n\n## References\n\n- MIN-FOOTPRINT: smallest existing member mask, tie by lexical \`optionId\`.\n- MAX-FOOTPRINT: largest existing member mask, tie by lexical \`optionId\`.\n- CANONICAL: lowest lexical registered \`optionId\`.\n\nThese are reproducibility references, not winner laws.\n\n## Ledger semantics\n\nOne selected component member X contributes one episode layer at that slot's actual time. A selected \`{B,C}\` option remains one layer tagged with both provenance channels. Exact cell timestamp ties are grouped. Layer count counts episode records once; per-channel provenance counts count a dual-tagged episode in each channel.\n\n## Fixed comparisons\n\nCumulative cut times are 60, 120, 180, 300, 450, and 600 s; each includes saved slots with \`timeMs <= requested time\`. Windows are half-open \`[0,60), ... [540,600)\`. Current production material uses the latest saved source anchor at or before 600 s (599.25 s, index 598). Raw B/C and actual production are descriptive references only.\n\nQuantiles use the registered observed-value convention: sorted value at \`floor((n−1)×p)\`, with no interpolation.\n\n## Classification boundary\n\nThe 256 value is storage/implementation context only. No event cap, material deletion, turnover, spatial arbitration, RNG, or world feedback is introduced.\n\n## Results summary\n\n${summary.decision.classification}\n`;
}

async function listOutputFiles(dir, base = dir) {
  const rows = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) rows.push(...await listOutputFiles(path, base));
    else if (entry.isFile()) {
      const file = path.slice(base.length + 1).replaceAll('\\', '/');
      if (file === 'manifest.json' || file === 'SHA256SUMS.txt') continue;
      const data = await readBytes(path); rows.push({ file, bytes: data.length, sha256: hash(data) });
    } else assert.fail(`unexpected package file ${path}`);
  }
  return rows.sort((a, b) => codeCompare(a.file, b.file));
}

async function main() {
  await mkdir(resolve(OUT, 'analysis'), { recursive: true }); await mkdir(resolve(OUT, 'visual'), { recursive: true });
  const inputs = await loadInputs(); _rawSummary = inputs.rawSummary;
  const seedData = [], resultRows = [];
  for (const seedRow of inputs.seedRows) {
    const eventMap = inputs.eventMaps.get(seedRow.seed);
    const data = buildSeed(seedRow, eventMap), result = summarizeSeed(data, seedRow, eventMap);
    seedData.push(data); resultRows.push(result);
    await writeGzip(resolve(OUT, `analysis/components-${seedRow.seed}.json.gz`), {
      schema: 'ant-bc-component-footprint-receipts-v1', seed: seedRow.seed,
      sourceConflictPacketSha256: seedRow.conflictSha256, slots: data.slots });
    for (const mode of ['MIN-FOOTPRINT', 'MAX-FOOTPRINT', 'CANONICAL'])
      await writeGzip(resolve(OUT, `analysis/ledger-${mode.toLowerCase()}-${seedRow.seed}.json.gz`), result.ledgers[mode]);
    await writeGzip(resolve(OUT, `analysis/envelopes-${seedRow.seed}.json.gz`), {
      schema: 'ant-bc-capacity-envelope-v1', seed: seedRow.seed, snapshots: result.envelopes });
    const rawMap = new Uint16Array(CELLS);
    for (const event of seedRow.eventsPacket.events) for (const cell of event.xCells) rawMap[cell]++;
    result.rawLayerCounts = Array.from(rawMap);
  }
  const decision = finalClassification(resultRows);
  const summary = { schema: 'ant-bc-material-capacity-necessity-summary-v1', authority: inputs.authority,
    lockedInputs: { slots: 163, optionAppearances: 1846, overlapComponents: 1352, productionAuthority: PRODUCTION,
      noSimulation: true, observerRngCalls: 0 }, decision,
    pooledComponentFootprintCensus: componentCensus({ slots: seedData.flatMap(row => row.slots) }),
    seeds: resultRows.map(row => {
      const { ledgers, envelopes, rawLayerCounts, actualLayerCounts, ...compact } = row; return compact;
    }),
    descriptiveComparisons: { rawEventTotals: EXPECTED_RAW_EVENTS, componentEpisodeTotals: EXPECTED_COMPONENTS,
      currentMaterialStorageSafetyReference: REFERENCE, interpretation: 'implementation ceiling only' },
    validation: { exactComponentReceipts: true, independentOverlapGraphReconstruction: true,
      minMaxEqualExactBounds: true, existingMemberMasksOnly: true, independentPerCellLedgers: true,
      rawPrototypePerCellParity: true, exactActualMaterialAnchors: true, observerRngCalls: 0,
      productionSrcStaticChanges: false } };
  await writeJson(resolve(OUT, 'analysis/summary.json'), summary);
  await writeJson(resolve(OUT, 'analysis/component-footprint-census.json'), summary.seeds.map(row => ({ seed: row.seed, ...row.componentFootprintCensus })));
  const componentReceiptHashes = new Map(await Promise.all(resultRows.map(async row => [row.seed,
    hash(await readBytes(resolve(OUT, `analysis/components-${row.seed}.json.gz`)))])));
  await writeJson(resolve(OUT, 'analysis/validation.json'), { schema: 'ant-bc-material-capacity-necessity-validation-v1',
    noNewTrajectoryOrReplay: true, frozenSlotCount: 163, optionAppearanceCount: 1846, componentCount: 1352,
    checks: summary.validation, seeds: resultRows.map(row => ({ seed: row.seed,
      components: row.componentEventCount, componentReceiptSha256: componentReceiptHashes.get(row.seed),
      minLedger: row.ledgerValidation['MIN-FOOTPRINT'], maxLedger: row.ledgerValidation['MAX-FOOTPRINT'],
      canonicalLedger: row.ledgerValidation.CANONICAL, rawPrototypeParity: row.rawPrototypeParity })) });
  await writeJson(resolve(OUT, 'analysis/objective-references.json'), {
    schema: 'ant-bc-capacity-reference-selections-v1', method: 'Each selection is an existing member option; deterministic tie-break is lexical optionId.',
    seeds: seedData.map(row => ({ seed: row.seed, references: Object.fromEntries(Object.entries(row.selected).map(([mode, layers]) => [mode,
      layers.map(({ layerId, slotIndex, anchorIndex, timeMs, componentId, optionId, xSha256, xNodeCount, composition, channels, candidateEventIds }) =>
        ({ layerId, slotIndex, anchorIndex, timeMs, componentId, optionId, xSha256, xNodeCount, composition, channels, candidateEventIds }))])) })) });
  await writeJson(resolve(OUT, 'analysis/windows.json'), resultRows.map(row => row.windows).flat());
  await writeJson(resolve(OUT, 'analysis/snapshots.json'), resultRows.map(row => row.snapshots).flat());
  await writeFile(resolve(OUT, 'visual/component-footprint-envelopes.svg'), atlasSvg(resultRows));
  await writeFile(resolve(OUT, 'visual/reference-realizations-600s.svg'), realizationSvg(resultRows));
  await writeFile(resolve(OUT, 'visual/accumulation-bounds.svg'), accumulationSvg(seedData));
  await writeFile(resolve(OUT, 'PROTOCOL.md'), writeProtocol(summary));
  let report = reportMarkdown(summary).replace(/Smallest next question: [^\n]+/,
    `Smallest next question: ${summary.decision.smallestNextQuestion}`);
  report = report.replace(/\| Seed \| Component episodes \| Singleton \| Contested \|[^\n]*/,
    '| Seed | Component episodes | Singleton | Contested | Exact singleton incidence | Contested incidence range | Total incidence bounds | First count >256 |');
  report = report.replace(/\| Seed \| Window \(s\) \| Component episodes \| Singletons \/ contested \|[^\n]*/,
    '| Seed | Window (s) | Episodes | Singletons / contested | Exact singleton incidence | Contested incidence range | Total bounds | MIN / canonical / MAX incidences |');
  report = report.replace(/\| Seed \| Requested \(s\) \| Latest saved time \(ms\) \| Episodes \|[^\n]*/,
    '| Seed | Requested (s) | Latest saved time (ms) | Episodes | Singleton exact incidence | Contested incidence range | Total bounds | MIN / canonical / MAX coverage cells |');
  report = report.replace('\n## Validation',
    '\n## Visual diagnostics\n\n- [Winner-agnostic component footprint envelopes](visual/component-footprint-envelopes.svg)\n- [MIN / canonical / MAX, raw B/C, and production material maps](visual/reference-realizations-600s.svg)\n- [Cumulative event and layer-cell incidence bounds](visual/accumulation-bounds.svg)\n\n## Validation');
  const censusAt = report.indexOf('\n## Per-slot and fixed 60 s pressure');
  assert.ok(censusAt >= 0, 'report census insertion point');
  report = report.slice(0, censusAt) + censusMarkdown(summary) + report.slice(censusAt);
  await writeFile(resolve(OUT, 'REPORT.md'), report);
  await writeFile(resolve(OUT, 'README.md'), `# B/C component capacity necessity audit\n\n${summary.decision.classification}. This research-only pass reuses the exact frozen B/C histories and exact-X conflict components; it creates no production material.\n\nStart with [REPORT.md](REPORT.md), [protocol](PROTOCOL.md), and the [validation receipt](analysis/validation.json).\n`);
  await writeFile(resolve(OUT, 'VALIDATION.md'), `# Validation\n\nFrozen inputs: production \`${PRODUCTION}\`; conflict decomposition \`${UPSTREAM.conflict}\`; 163 slots, 1,846 option appearances, and 1,352 exact-X components. No new simulation or replay. Observer RNG calls: 0.\n\nThe analysis independently rebuilds the exact-X overlap partition, recomputes member-mask min/max/intersection/union, checks that every realization uses an existing option mask, matches MIN/MAX incidence totals to the bounds, independently reconstructs per-cell ledger counts, and rebuilds the previous raw event ledger from all saved event masks. Current production material maps are taken from the checksum-verified anchor 598 (599.25 s) packet.\n\nThe 256 count is reported only as an implementation reference. No production \`src/\` or \`static/\` behavior changes.\n`);
  const files = await listOutputFiles(OUT);
  const manifest = { schema: 'ant-bc-material-capacity-necessity-manifest-v1',
    branch: 'codex/ant-bc-material-capacity-necessity-audit-20261101', startingCommit: STARTING_HEAD,
    productionAuthority: PRODUCTION, sourceConflictCommit: UPSTREAM.conflict, dualMaturationCommit: UPSTREAM.dual,
    provenancePrototypeCommit: UPSTREAM.rawPrototype, commitSlotAuditCommit: UPSTREAM.slotAudit,
    gridSize: GRID, episodeRule: 'one eventual episode per exact-X overlap component at every saved 10 s temporal slot',
    referenceModes: ['MIN-FOOTPRINT', 'MAX-FOOTPRINT', 'CANONICAL'], tools: {
      'scripts/ant-bc-material-capacity-necessity-audit.js': hash(await readBytes(resolve(ROOT, 'scripts/ant-bc-material-capacity-necessity-audit.js')))
    }, inputs: inputs.authority, files };
  await writeJson(resolve(OUT, 'manifest.json'), manifest);
  const sums = [...files, { file: 'manifest.json', bytes: (await readBytes(resolve(OUT, 'manifest.json'))).length,
    sha256: hash(await readBytes(resolve(OUT, 'manifest.json'))) }].sort((a, b) => codeCompare(a.file, b.file));
  await writeFile(resolve(OUT, 'SHA256SUMS.txt'), sums.map(row => `${row.sha256}  ${row.file}`).join('\n') + '\n');
  const compact = metrics => ({ episodes: metrics.episodeCount, coverage: metrics.unionCoverageCells,
    layerIncidences: metrics.totalLayerCellIncidences, meanLayers: Number(metrics.meanLayersOnCoveredCells.toFixed(2)),
    q90: metrics.q90LayersOnCoveredCells, max: metrics.maxLayers });
  console.log(JSON.stringify({ branch: manifest.branch, classification: decision.classification, files: files.length,
    seeds: resultRows.map(row => ({ seed: row.seed, episodes: row.componentEventCount, bounds: row.bounds,
      firstStrictlyAbove256: row.firstStrictlyAbove256ComponentEvent,
      references: Object.fromEntries(Object.entries(row.reference600).map(([mode, metrics]) => [mode, compact(metrics)])),
      raw: { events: row.rawMaturation.eventCount, coverage: row.rawMaturation.uniqueCoverageCells,
        incidence: row.rawMaturation.totalLayerCellIncidences, mean: Number(row.rawMaturation.meanLayersOnCoveredCells.toFixed(2)) },
      actual: { births: row.actualProduction.totalProductionPlateBirths, coverage: row.actualProduction.uniqueMaterialCells,
        incidence: row.actualProduction.totalLayerCellIncidences, mean: Number(row.actualProduction.meanLayersOnCoveredCells.toFixed(2)) } })) }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
