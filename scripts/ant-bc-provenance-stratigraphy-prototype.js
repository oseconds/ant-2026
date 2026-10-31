import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { unpack } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PREVIOUS = resolve(ROOT, 'docs/ant/evidence/2026-10-31-bc-dual-material-shadow');
const SOURCE = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit');
const REVIEW = resolve(ROOT, 'docs/ant/evidence/2026-10-31-b-vs-c-author-review');
const OUT = resolve(ROOT, 'docs/ant/evidence/2026-10-31-bc-provenance-stratigraphy-prototype');
const SEEDS = ['20261005', '20261006', '20261007'];
const EXPECTED_EVENTS = { 20261005: 662, 20261006: 717, 20261007: 710 };
const GRID = 96, CELLS = GRID * GRID, ENTRY = { x: .5, y: .72 }, EVENT_REFERENCE = 256;
const SNAPSHOT_SECONDS = [60, 120, 180, 300, 450, 600];
const PREVIOUS_COMMIT = '248da39a4d7d342022a27a5b9ec183cad9b160e2';
const OPPORTUNITY_COMMIT = 'da599d9f385f53d0bb24df3e737c5ed2e2eb6a23';
const RESPONSIBILITY_COMMIT = 'a75b83ce5dbeece36d60d966b9d86fc85ddb5f54';
const REVIEW_COMMIT = 'dfc29559860ec9e6312d2ea556041d956117bc5e';
const PRODUCTION_AUTHORITY = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const hash = value => createHash('sha256').update(value).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value) + '\n');
const readGzip = async path => JSON.parse(gunzipSync(await readFile(path)).toString('utf8'));
const writeGzip = async (path, value) => {
  const bytes = gzipSync(jsonBytes(value), { level: 9, mtime: 0 });
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
  return { bytes: bytes.length, sha256: hash(bytes) };
};
const point = cell => ({ x: cell % GRID / (GRID - 1), y: Math.floor(cell / GRID) / (GRID - 1) });
const quantile = (sorted, p) => sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
const distribution = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? { count: sorted.length, min: sorted[0], q25: quantile(sorted, .25), median: quantile(sorted, .5),
    q75: quantile(sorted, .75), q90: quantile(sorted, .9), max: sorted.at(-1), mean: sorted.reduce((s, x) => s + x, 0) / sorted.length }
    : { count: 0, min: null, q25: null, median: null, q75: null, q90: null, max: null, mean: null };
};
const sortEvents = (a, b) => a.timeMs - b.timeMs || (a.channel === b.channel ? 0 : a.channel === 'B' ? -1 : 1)
  || a.eventId.localeCompare(b.eventId);
const sortedChannels = flags => ['B', 'C'].filter(channel => flags[channel] > 0);

async function gitHead() {
  let gitDir = resolve(ROOT, '.git');
  const dotGit = await readFile(gitDir, 'utf8').catch(() => '');
  if (dotGit.startsWith('gitdir:')) gitDir = resolve(ROOT, dotGit.slice(7).trim());
  const headText = (await readFile(resolve(gitDir, 'HEAD'), 'utf8')).trim();
  if (!headText.startsWith('ref: ')) return { branch: 'detached', head: headText };
  const ref = headText.slice(5);
  let value = await readFile(resolve(gitDir, ref), 'utf8').catch(() => null);
  if (!value) {
    const commonDir = (await readFile(resolve(gitDir, 'commondir'), 'utf8').catch(() => '..')).trim();
    const packed = await readFile(resolve(gitDir, commonDir, 'packed-refs'), 'utf8').catch(() => '');
    value = packed.split(/\r?\n/).find(line => line.endsWith(` ${ref}`))?.split(' ')[0] || null;
  }
  assert.ok(value, `Git ref resolves: ${ref}`);
  return { branch: ref.replace(/^refs\/heads\//, ''), head: value.trim() };
}

async function verifyAuthority() {
  const previousManifestBytes = await readFile(resolve(PREVIOUS, 'manifest.json'));
  const previousManifest = JSON.parse(previousManifestBytes);
  assert.equal(previousManifest.branch, 'codex/ant-bc-dual-material-shadow-20261031');
  assert.equal(previousManifest.analysisBaseHead, REVIEW_COMMIT);
  assert.equal(previousManifest.productionAuthority, PRODUCTION_AUTHORITY);
  assert.equal(previousManifest.sourcePacketCommit, OPPORTUNITY_COMMIT);
  assert.equal(previousManifest.responsibilityAnalysisCommit, RESPONSIBILITY_COMMIT);
  assert.equal(previousManifest.authorReviewCommit, REVIEW_COMMIT);
  const sumsText = await readFile(resolve(PREVIOUS, 'SHA256SUMS.txt'), 'utf8');
  const sums = new Map(sumsText.trim().split(/\r?\n/).map(line => {
    const [digest, name] = line.split('  '); return [name, digest];
  }));
  assert.equal(sums.size, previousManifest.files.length + 1, 'previous package checksum count');
  assert.equal(sums.get('manifest.json'), hash(previousManifestBytes), 'previous package manifest hash');
  for (const row of previousManifest.files) {
    const bytes = await readFile(resolve(PREVIOUS, row.file));
    assert.equal(bytes.length, row.bytes, `previous package byte count ${row.file}`);
    assert.equal(hash(bytes), row.sha256, `previous package hash ${row.file}`);
    assert.equal(sums.get(row.file), row.sha256, `previous package checksum entry ${row.file}`);
  }

  const sourceManifestBytes = await readFile(resolve(SOURCE, 'manifest.json'));
  assert.equal(hash(sourceManifestBytes), '6dfe9b7f13965126794b753547d81714a95a12da41f829c669f11996aadf8a3a');
  const sourceManifest = JSON.parse(sourceManifestBytes);
  assert.equal(sourceManifest.authority, PRODUCTION_AUTHORITY);
  const reviewManifest = JSON.parse(await readFile(resolve(REVIEW, 'manifest.json'), 'utf8'));
  assert.equal(reviewManifest.responsibilityAnalysisCommit, RESPONSIBILITY_COMMIT);
  const sourceHashesVerified = {};
  for (const [file, expected] of Object.entries(reviewManifest.authorities.sourceHashes)) {
    const sourceText = (await readFile(resolve(ROOT, file), 'utf8')).replace(/\r\n?/g, '\n');
    assert.equal(hash(Buffer.from(sourceText)), expected, `production authority source identity ${file}`);
    sourceHashesVerified[file] = expected;
  }
  const stratigraphySource = (await readFile(resolve(ROOT, 'src/lib/agents/ant/MaterialStratigraphy.js'), 'utf8')).replace(/\r\n?/g, '\n');
  const expectedSourceHash = reviewManifest.authorities.sourceHashes['src/lib/agents/ant/MaterialStratigraphy.js'];
  assert.match(stratigraphySource, /MATERIAL_STRATIGRAPHY_MAX_PLATES\s*=\s*256/);
  const git = await gitHead();
  assert.equal(git.branch, 'codex/ant-bc-provenance-stratigraphy-prototype-20261031');
  return { previousManifestSha256: hash(previousManifestBytes), previousSumsSha256: hash(Buffer.from(sumsText)),
    previousManifest, sourceManifestSha256: hash(sourceManifestBytes), reviewManifestSha256: hash(await readFile(resolve(REVIEW, 'manifest.json'))),
    productionSourceHashes: sourceHashesVerified, stratigraphySourceSha256: expectedSourceHash,
    sourceAuthority: PRODUCTION_AUTHORITY, git };
}

async function loadFrozenWorld(seed) {
  const meta = await readGzip(resolve(SOURCE, `analysis/seed-${seed}.signals.json.gz`));
  assert.equal(meta.authority, PRODUCTION_AUTHORITY, `${seed} frozen production authority`);
  assert.equal(meta.seed, seed); assert.equal(meta.anchorsCount, 599); assert.equal(meta.seconds, 600);
  const anchors = new Map(), chunkHashes = {};
  for (const file of meta.anchorsFiles) {
    const bytes = await readFile(resolve(SOURCE, 'analysis', file));
    assert.equal(hash(bytes), meta.chunkHashes[file], `${seed} source anchor chunk ${file}`);
    chunkHashes[file] = meta.chunkHashes[file];
    for (const anchor of JSON.parse(gunzipSync(bytes).toString('utf8')).anchors) {
      assert.ok(!anchors.has(anchor.index), `${seed} unique source anchor ${anchor.index}`);
      anchors.set(anchor.index, { ...anchor, materialLayers: Array.from(unpack(anchor.material.layers)) });
    }
  }
  assert.equal(anchors.size, 599);
  assert.equal(meta.births.length, seed === '20261005' ? 37 : seed === '20261006' ? 23 : 33);
  return { meta, anchors, chunkHashes };
}

async function loadEvents(seed, previousManifest) {
  const file = `analysis/events-${seed}.json.gz`;
  const manifestRow = previousManifest.files.find(row => row.file === file);
  assert.ok(manifestRow, `prior event receipt registered ${file}`);
  const bytes = await readFile(resolve(PREVIOUS, file));
  assert.equal(hash(bytes), manifestRow.sha256, `exact previous event stream ${seed}`);
  const packet = JSON.parse(gunzipSync(bytes).toString('utf8'));
  assert.equal(packet.seed, seed); assert.equal(packet.productionAuthority, PRODUCTION_AUTHORITY);
  assert.equal(packet.sourcePacketCommit, OPPORTUNITY_COMMIT);
  assert.equal(packet.events.length, EXPECTED_EVENTS[seed]);
  const seen = new Set();
  for (const event of packet.events) {
    assert.equal(event.seed, seed); assert.ok(event.channel === 'B' || event.channel === 'C');
    assert.ok(event.timeMs >= 0 && event.timeMs <= 600_000, `${event.eventId} lies inside frozen run`);
    assert.ok(!seen.has(event.eventId), `${seed} unique event ID`); seen.add(event.eventId);
    assert.ok(event.entryClass === 'entry' || event.entryClass === 'non-entry');
    assert.ok(Number.isInteger(event.trackId) && Number.isInteger(event.anchorIndex));
    assert.ok(Array.isArray(event.xCells) && event.xCells.length === event.xNodeCount);
    assert.deepEqual(event.xCells, [...event.xCells].sort((a, b) => a - b));
    assert.equal(new Set(event.xCells).size, event.xCells.length);
    assert.ok(event.xCells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < CELLS));
    assert.equal(hash(Buffer.from(JSON.stringify(event.xCells))), event.xSha256, `${event.eventId} exact X membership`);
  }
  const events = [...packet.events].sort(sortEvents);
  const channels = { B: events.filter(row => row.channel === 'B').length, C: events.filter(row => row.channel === 'C').length };
  assert.deepEqual(channels, seed === '20261005' ? { B: 354, C: 308 }
    : seed === '20261006' ? { B: 395, C: 322 } : { B: 386, C: 324 });
  return { events, receipt: { file, sha256: hash(bytes), bytes: bytes.length, channels } };
}

function summarizeCounts(bCounts, cCounts, groupCounts, eventCounts, entryCounts, entryIncidences, entryTouched, nonEntryTouched) {
  const layers = new Array(CELLS), groups = new Array(CELLS), layerHistogram = {}, groupHistogram = {};
  let bCoverage = 0, cCoverage = 0, unionCoverage = 0, both = 0, bOnly = 0, cOnly = 0, incidence = 0;
  const coveredLayers = [], coveredGroups = [], coveredDistances = [];
  let weightedRadius = 0, entryTouchedCells = 0, nonEntryTouchedCells = 0, richestLayerCount = 0, richestCells = [];
  for (let cell = 0; cell < CELLS; cell++) {
    const b = bCounts[cell], c = cCounts[cell], layer = b + c, group = groupCounts[cell];
    layers[cell] = layer; groups[cell] = group;
    layerHistogram[layer] = (layerHistogram[layer] || 0) + 1;
    groupHistogram[group] = (groupHistogram[group] || 0) + 1;
    incidence += layer;
    if (layer > richestLayerCount) { richestLayerCount = layer; richestCells = [cell]; }
    else if (layer && layer === richestLayerCount) richestCells.push(cell);
    if (b) bCoverage++;
    if (c) cCoverage++;
    if (layer) {
      unionCoverage++; coveredLayers.push(layer); coveredGroups.push(group);
      const p = point(cell), radius = Math.hypot(p.x - ENTRY.x, p.y - ENTRY.y);
      coveredDistances.push(radius); weightedRadius += radius * layer;
      if (b && c) both++; else if (b) bOnly++; else cOnly++;
    }
    if (entryTouched[cell]) entryTouchedCells++;
    if (nonEntryTouched[cell]) nonEntryTouchedCells++;
  }
  coveredLayers.sort((a, b) => a - b); coveredGroups.sort((a, b) => a - b); coveredDistances.sort((a, b) => a - b);
  const orderStats = values => ({ count: values.length, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
    q90: quantile(values, .9), max: values.at(-1) || 0 });
  return { eventCounts: { ...eventCounts }, entryEvents: { ...entryCounts }, eventLayerIncidencesByEntryClass: { ...entryIncidences },
    coverage: { b: bCoverage, c: cCoverage, both, bOnly, cOnly, union: unionCoverage, untouched: CELLS - unionCoverage,
      bFractionOfGrid: bCoverage / CELLS, cFractionOfGrid: cCoverage / CELLS, unionFractionOfGrid: unionCoverage / CELLS },
    layerCellIncidences: incidence, meanLayersOnCoveredCells: unionCoverage ? incidence / unionCoverage : 0,
    q90LayersOnCoveredCells: quantile(coveredLayers, .9), maxLayers: coveredLayers.at(-1) || 0,
    richestLayerCells: richestLayerCount ? richestCells : [],
    meanTemporalGroupsOnCoveredCells: unionCoverage ? coveredGroups.reduce((a, b) => a + b, 0) / unionCoverage : 0,
    q90TemporalGroupsOnCoveredCells: quantile(coveredGroups, .9), maxTemporalGroups: coveredGroups.at(-1) || 0,
    layerCountHistogram: layerHistogram, temporalGroupCountHistogram: groupHistogram,
    entrySpatial: { coveredCellDistanceFromEntry: distribution(coveredDistances),
      layerIncidenceWeightedMeanDistance: incidence ? weightedRadius / incidence : 0,
      cellsEverTouchedByEntryEvents: entryTouchedCells, cellsEverTouchedByNonEntryEvents: nonEntryTouchedCells } };
}

function buildLedger(seed, events, sourceReceipt) {
  const cells = Array.from({ length: CELLS }, () => []), times = [];
  const bCounts = new Uint16Array(CELLS), cCounts = new Uint16Array(CELLS), groupCounts = new Uint16Array(CELLS);
  const entryTouched = new Uint8Array(CELLS), nonEntryTouched = new Uint8Array(CELLS);
  const eventCounts = { B: 0, C: 0 }, entryCounts = { entry: 0, 'non-entry': 0 };
  const entryIncidences = { entry: 0, 'non-entry': 0 }, series = [];
  let incidence = 0, coevalTimeGroups = 0, first256 = null;
  for (let i = 0; i < events.length;) {
    const timeMs = events[i].timeMs, batch = [];
    while (i < events.length && events[i].timeMs === timeMs) batch.push(events[i++]);
    const touchedAtTime = new Map(), channelsAtTime = new Set();
    let beforeBatch = eventCounts.B + eventCounts.C;
    for (const event of batch) {
      eventCounts[event.channel]++; channelsAtTime.add(event.channel);
      entryCounts[event.entryClass]++; entryIncidences[event.entryClass] += event.xCells.length;
      incidence += event.xCells.length;
      const ref = { eventId: event.eventId, channel: event.channel, timeMs: event.timeMs, seed,
        trackId: event.trackId, center: event.center, entryClass: event.entryClass,
        sourceReceipt: { file: sourceReceipt.file, sha256: sourceReceipt.sha256, xSha256: event.xSha256,
          anchorIndex: event.anchorIndex, captureId: event.captureId } };
      event.prototypeLayer = ref;
      for (const cell of event.xCells) {
        if (!touchedAtTime.has(cell)) touchedAtTime.set(cell, { B: [], C: [] });
        touchedAtTime.get(cell)[event.channel].push(event.eventId);
        if (event.entryClass === 'entry') entryTouched[cell] = 1; else nonEntryTouched[cell] = 1;
        if (event.channel === 'B') bCounts[cell]++; else cCounts[cell]++;
      }
    }
    if (channelsAtTime.has('B') && channelsAtTime.has('C')) coevalTimeGroups++;
    for (const [cell, ids] of touchedAtTime) {
      groupCounts[cell]++;
      const bEvents = ids.B.sort(), cEvents = ids.C.sort();
      cells[cell].push({ timeMs, channels: sortedChannels({ B: bEvents.length, C: cEvents.length }),
        eventIdsByChannel: { B: bEvents, C: cEvents }, layerCount: bEvents.length + cEvents.length });
    }
    const crossingCount = eventCounts.B + eventCounts.C;
    if (!first256 && beforeBatch < EVENT_REFERENCE && crossingCount >= EVENT_REFERENCE) {
      first256 = { timeMs, timeSeconds: timeMs / 1000, countBefore: beforeBatch, countAtTimestamp: crossingCount,
        crossingEventIds: batch.map(row => row.eventId) };
    }
    const metrics = summarizeCounts(bCounts, cCounts, groupCounts, eventCounts, entryCounts, entryIncidences, entryTouched, nonEntryTouched);
    times.push(timeMs);
    series.push({ timeMs, anchorIndex: batch[0].anchorIndex, cumulativeEvents: crossingCount,
      cumulativeB: eventCounts.B, cumulativeC: eventCounts.C, cumulativeProductionBirths: null,
      uniqueCoveredCells: metrics.coverage.union, bCoveredCells: metrics.coverage.b, cCoveredCells: metrics.coverage.c,
      cellsTouchedByBoth: metrics.coverage.both, bOnlyCells: metrics.coverage.bOnly, cOnlyCells: metrics.coverage.cOnly,
      layerCellIncidences: metrics.layerCellIncidences, meanLayersOnCoveredCells: metrics.meanLayersOnCoveredCells,
      q90LayersOnCoveredCells: metrics.q90LayersOnCoveredCells, maxLayers: metrics.maxLayers,
      mixedProvenanceCells: metrics.coverage.both });
  }
  const rows = [];
  for (let cell = 0; cell < CELLS; cell++) {
    if (!cells[cell].length) continue;
    const groups = cells[cell], bLayerCount = groups.reduce((sum, group) => sum + group.eventIdsByChannel.B.length, 0);
    const cLayerCount = groups.reduce((sum, group) => sum + group.eventIdsByChannel.C.length, 0);
    const top = groups.at(-1), priorB = groups.slice(0, -1).some(group => group.eventIdsByChannel.B.length > 0);
    const priorC = groups.slice(0, -1).some(group => group.eventIdsByChannel.C.length > 0);
    const topB = top.eventIdsByChannel.B.length > 0, topC = top.eventIdsByChannel.C.length > 0;
    rows.push({ cell, ...point(cell), groups, temporalGroupCount: groups.length, layerCount: bLayerCount + cLayerCount,
      bLayerCount, cLayerCount, provenanceSequence: groups.map(group => group.channels),
      category: bLayerCount && cLayerCount ? 'mixed' : bLayerCount ? 'B-only' : 'C-only',
      coevalGroupCount: groups.filter(group => group.channels.length === 2).length,
      topChannels: top.channels, topIsCoeval: top.channels.length === 2,
      mixedHistoryBeneathTop: (priorB && priorC) || (topB && !topC && priorC) || (topC && !topB && priorB) });
  }
  const final = summarizeCounts(bCounts, cCounts, groupCounts, eventCounts, entryCounts, entryIncidences, entryTouched, nonEntryTouched);
  const ledger = { schema: 'ant-bc-provenance-stratigraphy-ledger-v1', seed, grid: GRID,
    eventInsertion: 'One immutable provenance layer per exact registered shadow event and X mask. Exact numeric timestamp equality groups coeval deposits; B/C serialization order is not a physical ordering.',
    eventCount: events.length, eventCounts: { ...eventCounts }, first256CombinedEventCrossing: first256,
    coevalGlobalTimestampGroupCount: coevalTimeGroups, finalMetrics: final, cumulativeSeries: series,
    layers: events.map(event => ({ ...event.prototypeLayer, xCells: event.xCells, xNodeCount: event.xCells.length })),
    cells: rows };
  return { ledger, events, times };
}

function summarizeSequences(rows) {
  const multi = rows.filter(row => row.temporalGroupCount >= 2), summary = {
    cellsWithAtLeastTwoStrictTimeGroups: multi.length, BOnly: 0, COnly: 0, mixed: 0,
    strictlyAlternating: 0, oneStrictSwitch: 0, multipleStrictSwitches: 0,
    BtoCTransitions: 0, CtoBTransitions: 0, coevalCellGroups: 0,
    repeatedSameChannelTransitions: 0, repeatedBTransitions: 0, repeatedCTransitions: 0,
    maxProvenanceRunLength: 0, maxGroupsInOneCell: 0
  };
  for (const row of rows) {
    const groups = row.groups;
    summary.coevalCellGroups += row.coevalGroupCount;
    summary.maxGroupsInOneCell = Math.max(summary.maxGroupsInOneCell, groups.length);
    const channels = new Set(groups.flatMap(group => group.channels));
    if (row.temporalGroupCount >= 2) {
      if (channels.size === 1 && channels.has('B')) summary.BOnly++;
      else if (channels.size === 1 && channels.has('C')) summary.COnly++;
      else summary.mixed++;
    }
    let switches = 0, run = 0, previous = null, allSingletonAlternates = groups.length >= 2;
    for (const group of groups) {
      if (group.channels.length !== 1) { run = 0; previous = null; allSingletonAlternates = false; continue; }
      const channel = group.channels[0];
      if (previous === channel) run++;
      else { if (previous && channel !== previous) { switches++; summary[previous === 'B' ? 'BtoCTransitions' : 'CtoBTransitions']++; }
        run = 1; }
      if (previous === channel) { summary.repeatedSameChannelTransitions++; summary[channel === 'B' ? 'repeatedBTransitions' : 'repeatedCTransitions']++; }
      if (previous && channel === previous) allSingletonAlternates = false;
      previous = channel;
      summary.maxProvenanceRunLength = Math.max(summary.maxProvenanceRunLength, run);
    }
    if (allSingletonAlternates) summary.strictlyAlternating++;
    if (switches === 1 && row.temporalGroupCount >= 2) summary.oneStrictSwitch++;
    if (switches > 1) summary.multipleStrictSwitches++;
  }
  return summary;
}

function channelRun(groups, startChannel) {
  let best = { length: 0, startIndex: -1, endIndex: -1 };
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].channels.length !== 1 || groups[i].channels[0] !== startChannel) continue;
    let j = i, expected = startChannel;
    while (j < groups.length && groups[j].channels.length === 1 && groups[j].channels[0] === expected) {
      expected = expected === 'B' ? 'C' : 'B'; j++;
    }
    const length = j - i;
    if (length > best.length) best = { length, startIndex: i, endIndex: j - 1 };
  }
  return best;
}

function selectColumns(seed, ledger) {
  const rows = ledger.cells;
  const by = (score, predicate = () => true) => rows.filter(predicate).sort((a, b) => score(b) - score(a) || a.cell - b.cell)[0] || null;
  const alternating = row => row.groups.reduce((n, group, i, all) => n + Number(i > 0 && group.channels.length === 1
    && all[i - 1].channels.length === 1 && group.channels[0] !== all[i - 1].channels[0]), 0);
  const longestB = rows.map(row => ({ row, run: channelRun(row.groups, 'B') }))
    .sort((a, b) => b.run.length - a.run.length || a.row.cell - b.row.cell)[0];
  const longestC = rows.map(row => ({ row, run: channelRun(row.groups, 'C') }))
    .sort((a, b) => b.run.length - a.run.length || a.row.cell - b.row.cell)[0];
  const chosen = [
    ['richest-total-layer-cell', by(row => row.layerCount)],
    ['richest-alternating-provenance-cell', by(row => alternating(row) * 1000 + row.layerCount,
      row => row.temporalGroupCount > 1)],
    ['richest-B-dominant-mixed-cell', by(row => row.layerCount * 1000 + row.bLayerCount,
      row => row.bLayerCount > row.cLayerCount && row.cLayerCount > 0)],
    ['richest-C-dominant-mixed-cell', by(row => row.layerCount * 1000 + row.cLayerCount,
      row => row.cLayerCount > row.bLayerCount && row.bLayerCount > 0)],
    ['longest-strict-B-to-C-sequence', longestB?.row || null],
    ['longest-strict-C-to-B-sequence', longestC?.row || null],
    ['representative-B-only-cell', by(row => row.layerCount, row => row.category === 'B-only')],
    ['representative-C-only-cell', by(row => row.layerCount, row => row.category === 'C-only')]
  ];
  return chosen.map(([id, row], index) => {
    if (!row) return { id, seed, status: 'none', selectionOrder: index + 1 };
    const run = id.includes('B-to-C') ? longestB.run : id.includes('C-to-B') ? longestC.run : null;
    return { id, seed, status: 'selected', selectionOrder: index + 1, cell: row.cell, x: row.x, y: row.y,
      layerCount: row.layerCount, temporalGroupCount: row.temporalGroupCount,
      bLayerCount: row.bLayerCount, cLayerCount: row.cLayerCount,
      sequence: row.groups.map(group => ({ timeMs: group.timeMs, channels: group.channels,
        eventLayerCount: group.layerCount, eventIdsByChannel: group.eventIdsByChannel })),
      strictAlternations: alternating(row), selectedAlternatingRun: run ? row.groups.slice(run.startIndex, run.endIndex + 1)
        .map(group => ({ timeMs: group.timeMs, channels: group.channels })) : null,
      verticalDisplayOrder: 'latest at top, earliest at bottom; chronology layout only, not physical depth' };
  });
}

function prefixState(ledger, events, timeMs, inclusive = true) {
  const b = new Uint16Array(CELLS), c = new Uint16Array(CELLS), groups = new Uint16Array(CELLS);
  for (const row of ledger.cells) for (const group of row.groups) {
    if (inclusive ? group.timeMs > timeMs : group.timeMs >= timeMs) break;
    groups[row.cell]++;
    b[row.cell] += group.eventIdsByChannel.B.length; c[row.cell] += group.eventIdsByChannel.C.length;
  }
  const eventCounts = { B: 0, C: 0 }, entryCounts = { entry: 0, 'non-entry': 0 };
  const eventIncidences = { entry: 0, 'non-entry': 0 }, entryTouched = new Uint8Array(CELLS), nonEntryTouched = new Uint8Array(CELLS);
  const visible = events.filter(event => inclusive ? event.timeMs <= timeMs : event.timeMs < timeMs);
  for (const event of visible) {
    eventCounts[event.channel]++; entryCounts[event.entryClass]++;
    eventIncidences[event.entryClass] += event.xCells.length;
    for (const cell of event.xCells) {
      if (event.entryClass === 'entry') entryTouched[cell] = 1; else nonEntryTouched[cell] = 1;
    }
  }
  const metrics = summarizeCounts(b, c, groups, eventCounts, entryCounts, eventIncidences, entryTouched, nonEntryTouched);
  return { bCounts: b, cCounts: c, groupCounts: groups, metrics, events: visible };
}

function materialStats(layers) {
  const covered = Array.from(layers).filter(value => value > 0).sort((a, b) => a - b), histogram = {};
  for (const value of layers) histogram[value] = (histogram[value] || 0) + 1;
  return { coveredCells: covered.length, layerCountHistogram: histogram, meanLayersOnCoveredCells: covered.length
    ? covered.reduce((sum, value) => sum + value, 0) / covered.length : 0,
    q90LayersOnCoveredCells: quantile(covered, .9), maxLayers: covered.at(-1) || 0 };
}

function chooseSnapshots(seed, events, ledger, world) {
  const rows = [];
  for (const requestedSeconds of SNAPSHOT_SECONDS) {
    const eligible = events.filter(event => event.timeMs <= requestedSeconds * 1000);
    assert.ok(eligible.length, `${seed} has an event by ${requestedSeconds}s`);
    const last = eligible.at(-1), timeMs = last.timeMs, sameTime = eligible.filter(event => event.timeMs === timeMs);
    assert.ok(sameTime.every(event => event.anchorIndex === last.anchorIndex), 'coeval event times share one saved anchor');
    const anchor = world.anchors.get(last.anchorIndex);
    assert.ok(anchor, `${seed} actual material anchor ${last.anchorIndex}`);
    assert.equal(anchor.timeMs, timeMs, `${seed} exact event/material snapshot time`);
    const prefix = prefixState(ledger, events, timeMs);
    const births = world.meta.births.filter(birth => birth.timeMs <= timeMs);
    rows.push({ seed, requestedSeconds, snapshotTimeMs: timeMs, snapshotTimeSeconds: timeMs / 1000,
      anchorIndex: last.anchorIndex, coevalEventsAtSnapshot: sameTime.map(event => event.eventId),
      cumulativeBEvents: prefix.metrics.eventCounts.B, cumulativeCEvents: prefix.metrics.eventCounts.C,
      cumulativeShadowEvents: prefix.metrics.eventCounts.B + prefix.metrics.eventCounts.C,
      prototypeMetrics: prefix.metrics, cumulativeProductionPlateBirths: births.length,
      productionBirthIds: births.map(birth => birth.id), actualMaterialTimeMs: anchor.timeMs,
      actualMaterialAnchorIndex: anchor.index, actualMaterialLayerStats: materialStats(anchor.materialLayers),
      actualMaterialLayerMapSha256: hash(Buffer.from(JSON.stringify(anchor.materialLayers))),
      sourceMaterialChunk: world.meta.anchorsFiles[Math.floor(anchor.index / 75)],
      sourceMaterialChunkSha256: world.meta.chunkHashes[world.meta.anchorsFiles[Math.floor(anchor.index / 75)]],
      state: { ...prefix, layerCounts: Uint16Array.from(prefix.bCounts, (value, index) => value + prefix.cCounts[index]),
        layerMask: Uint8Array.from(prefix.bCounts, (value, index) => Number(value + prefix.cCounts[index] > 0)),
        actualMaterialLayers: anchor.materialLayers } });
  }
  return rows;
}

function windowCounts(seed, events, births) {
  const windows = [];
  for (let i = 0; i < 10; i++) {
    const startMs = i * 60_000, endMs = (i + 1) * 60_000;
    const inWindow = (timeMs) => timeMs >= startMs && (i === 9 ? timeMs <= endMs : timeMs < endMs);
    const e = events.filter(row => inWindow(row.timeMs)), p = births.filter(row => inWindow(row.timeMs));
    windows.push({ seed, startSeconds: i * 60, endSeconds: (i + 1) * 60,
      B: e.filter(row => row.channel === 'B').length, C: e.filter(row => row.channel === 'C').length,
      shadowTotal: e.length, productionPlateBirths: p.length,
      eventIds: e.map(row => row.eventId), productionBirthIds: p.map(row => row.id) });
  }
  const values = key => windows.map(row => row[key]);
  return { windows, distributions: Object.fromEntries(['B', 'C', 'shadowTotal', 'productionPlateBirths']
    .map(key => [key, distribution(values(key))])) };
}

const COLORS = { B: '#007f73', C: '#d5672c', BC: '#7561a6', neutral: '#72777d', count0: '#ffffff', count1: '#f0eee9', count2: '#d9d4cb', count3: '#beb5a8', count4: '#9e9489', count5: '#786f68' };
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function countColor(value, max) {
  if (!value) return COLORS.count0;
  const shades = [COLORS.count1, COLORS.count2, COLORS.count3, COLORS.count4, COLORS.count5, '#493f39'];
  return shades[Math.min(shades.length - 1, Math.ceil(value / Math.max(1, max) * shades.length) - 1)];
}

function svgPanel(x, y, size, label, mapValues, mode, maxValue = 1) {
  const cellSize = size / GRID, pieces = [`<text x="${x}" y="${y - 10}" class="panel">${esc(label)}</text>`,
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#fff" stroke="#bac2cb"/>`];
  for (let cell = 0; cell < CELLS; cell++) {
    const value = mapValues[cell];
    if (!value) continue;
    let color;
    if (mode === 'neutral') color = COLORS.neutral;
    else if (mode === 'B') color = COLORS.B;
    else if (mode === 'C') color = COLORS.C;
    else if (mode === 'actual') color = countColor(value, maxValue);
    else color = countColor(value, maxValue);
    const px = x + (cell % GRID) * cellSize, py = y + Math.floor(cell / GRID) * cellSize;
    pieces.push(`<rect x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${cellSize + .1}" height="${cellSize + .1}" fill="${color}"/>`);
  }
  return pieces.join('');
}

function provenanceMap(ledger, timeMs) {
  const top = Array(CELLS).fill(null), mixedBeneath = new Uint8Array(CELLS);
  for (const row of ledger.cells) {
    const groups = row.groups.filter(group => group.timeMs <= timeMs);
    if (!groups.length) continue;
    const last = groups.at(-1), prior = groups.slice(0, -1), priorB = prior.some(group => group.eventIdsByChannel.B.length),
      priorC = prior.some(group => group.eventIdsByChannel.C.length), b = last.eventIdsByChannel.B.length > 0,
      c = last.eventIdsByChannel.C.length > 0;
    top[row.cell] = b && c ? 'BC' : b ? 'B' : 'C';
    mixedBeneath[row.cell] = Number((priorB && priorC) || (b && priorC) || (c && priorB));
  }
  return { top, mixedBeneath };
}

function provenancePanel(x, y, size, ledger, timeMs) {
  const cellSize = size / GRID, { top, mixedBeneath } = provenanceMap(ledger, timeMs), pieces = [
    `<text x="${x}" y="${y - 10}" class="panel">Top provenance · hatch = mixed below</text>`,
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#fff" stroke="#bac2cb"/>`];
  for (let cell = 0; cell < CELLS; cell++) if (top[cell]) {
    const px = x + (cell % GRID) * cellSize, py = y + Math.floor(cell / GRID) * cellSize;
    pieces.push(`<rect x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${cellSize + .1}" height="${cellSize + .1}" fill="${top[cell] === 'BC' ? COLORS.BC : COLORS[top[cell]]}"/>`);
    if (mixedBeneath[cell]) pieces.push(`<rect x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${cellSize + .1}" height="${cellSize + .1}" fill="url(#mixHatch)"/>`);
  }
  return pieces.join('');
}

function snapshotSvg(seed, rows, ledger, layerScaleMax, actualScaleMax) {
  const tile = 228, left = 152, top = 114, gapX = 15, rowH = 272, width = left + 7 * tile + 6 * gapX + 30,
    height = top + rows.length * rowH + 32, pieces = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      '<defs><pattern id="mixHatch" patternUnits="userSpaceOnUse" width="5" height="5"><path d="M-1 1L1-1M0 5L5 0M4 6L6 4" stroke="#fff" stroke-width="1.2"/></pattern></defs>',
      '<style>text{font-family:Arial,sans-serif;fill:#1b2430}.title{font-size:23px;font-weight:bold}.sub{font-size:12px;fill:#526071}.row{font-size:13px;font-weight:bold}.panel{font-size:12px;font-weight:bold}</style>',
      `<rect width="100%" height="100%" fill="#fff"/><text x="18" y="30" class="title">B/C provenance prototype · seed ${seed}</text>`,
      `<text x="18" y="52" class="sub">Same normalized 96×96 grid; neutral panel hides provenance; snapshot is last saved shadow event at or before each requested time.</text>`,
      `<text x="18" y="71" class="sub">Count panels use one fixed 0–${layerScaleMax} scale; actual production material uses one fixed 0–${actualScaleMax} scale. No shadow layers enter production.</text>`,
      `<text x="18" y="90" class="sub">B ${COLORS.B} · C ${COLORS.C} · coeval {B,C} ${COLORS.BC} · hatched cells have mixed history beneath current top.</text>`];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], state = row.state, y = top + i * rowH, labelX = 16;
    pieces.push(`<text x="${labelX}" y="${y + 20}" class="row">${row.requestedSeconds}s</text>`);
    pieces.push(`<text x="${labelX}" y="${y + 41}" class="sub">${row.snapshotTimeSeconds.toFixed(3)}s</text>`);
    pieces.push(`<text x="${labelX}" y="${y + 59}" class="sub">B ${row.cumulativeBEvents} · C ${row.cumulativeCEvents}</text>`);
    pieces.push(`<text x="${labelX}" y="${y + 77}" class="sub">births ${row.cumulativeProductionPlateBirths}</text>`);
    const xAt = col => left + col * (tile + gapX);
    pieces.push(svgPanel(xAt(0), y + 25, tile, 'Neutral union', state.layerMask, 'neutral', 1));
    pieces.push(provenancePanel(xAt(1), y + 25, tile, ledger, row.snapshotTimeMs));
    pieces.push(svgPanel(xAt(2), y + 25, tile, `Total layers · 0–${layerScaleMax}`, state.layerCounts, 'count', layerScaleMax));
    pieces.push(svgPanel(xAt(3), y + 25, tile, `Time groups · 0–${layerScaleMax}`, state.groupCounts, 'count', layerScaleMax));
    pieces.push(svgPanel(xAt(4), y + 25, tile, `B layers · 0–${layerScaleMax}`, state.bCounts, 'count', layerScaleMax));
    pieces.push(svgPanel(xAt(5), y + 25, tile, `C layers · 0–${layerScaleMax}`, state.cCounts, 'count', layerScaleMax));
    pieces.push(svgPanel(xAt(6), y + 25, tile, `Actual production material · 0–${actualScaleMax}`, state.actualMaterialLayers, 'actual', actualScaleMax));
  }
  pieces.push('</svg>'); return pieces.join('');
}

function chartPanel(x, y, w, h, label, series, maxY, reference = null) {
  const px = x + 38, py = y + 28, pw = w - 50, ph = h - 54, parts = [
    `<text x="${x}" y="${y + 15}" class="panel">${esc(label)}</text>`,
    `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="#fbfcfd" stroke="#b9c3ce"/>`];
  for (let i = 0; i <= 4; i++) {
    const gy = py + ph * i / 4, value = maxY * (4 - i) / 4;
    parts.push(`<line x1="${px}" y1="${gy}" x2="${px + pw}" y2="${gy}" stroke="#e3e7ec"/>`);
    parts.push(`<text x="${px - 5}" y="${gy + 3}" text-anchor="end" class="tick">${Math.round(value)}</text>`);
  }
  if (reference !== null) {
    const ry = py + ph * (1 - reference / maxY);
    parts.push(`<line x1="${px}" y1="${ry}" x2="${px + pw}" y2="${ry}" stroke="#9d3030" stroke-dasharray="5 4"/>`);
  }
  const colors = ['#007f73', '#d5672c', '#333f50', '#7b61a6'];
  series.forEach((line, index) => {
    const d = line.values.map((row, i) => `${i ? 'L' : 'M'}${px + (row.timeMs / 600_000) * pw},${py + ph * (1 - Math.min(maxY, row[line.key]) / maxY)}`).join('');
    parts.push(`<path d="${d}" fill="none" stroke="${colors[index]}" stroke-width="1.8"/>`);
    parts.push(`<text x="${px + index * Math.min(95, pw / Math.max(1, series.length))}" y="${py + ph + 17}" class="legend" fill="${colors[index]}">${esc(line.label)}</text>`);
  });
  parts.push(`<text x="${px}" y="${py + ph + 34}" class="tick">0 s</text><text x="${px + pw}" y="${py + ph + 34}" text-anchor="end" class="tick">600 s</text>`);
  return parts.join('');
}

function pressureSvg(seedRows, layerScaleMax) {
  const width = 1680, left = 18, rowTop = 104, rowH = 300, gutter = 16, chartW = (width - 36 - gutter * 3) / 4,
    height = rowTop + seedRows.length * rowH + 28, parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      '<style>text{font-family:Arial,sans-serif;fill:#1b2430}.title{font-size:23px;font-weight:bold}.sub{font-size:12px;fill:#526071}.row{font-size:15px;font-weight:bold}.panel{font-size:12px;font-weight:bold}.tick{font-size:9px;fill:#5b6674}.legend{font-size:9px;font-weight:bold}</style>',
      `<rect width="100%" height="100%" fill="#fff"/><text x="18" y="30" class="title">Cumulative shadow pressure and virtual coverage</text>`,
      `<text x="18" y="52" class="sub">All series update at exact event timestamps through 600 s. The dashed 256 combined-event line is the production Plate ceiling shown only as a reference.</text>`,
      `<text x="18" y="71" class="sub">Coverage and layer multiplicity use separate charts. Actual production birth counts are descriptive; virtual layers never feed back.</text>`];
  seedRows.forEach((row, index) => {
    const y = rowTop + index * rowH; parts.push(`<text x="${left}" y="${y - 14}" class="row">Seed ${row.seed}</text>`);
    const series = row.series;
    const xs = [left, left + chartW + gutter, left + 2 * (chartW + gutter), left + 3 * (chartW + gutter)];
    parts.push(chartPanel(xs[0], y, chartW, rowH - 16, 'Events and actual births', [
      { label: 'B', key: 'cumulativeB', values: series }, { label: 'C', key: 'cumulativeC', values: series },
      { label: 'shadow total', key: 'cumulativeEvents', values: series }, { label: 'actual births', key: 'cumulativeProductionBirths', values: series }
    ], Math.ceil(Math.max(...series.map(r => r.cumulativeEvents)) / 100) * 100, EVENT_REFERENCE));
    parts.push(chartPanel(xs[1], y, chartW, rowH - 16, 'Unique covered cells', [
      { label: 'B union', key: 'bCoveredCells', values: series }, { label: 'C union', key: 'cCoveredCells', values: series },
      { label: 'combined', key: 'uniqueCoveredCells', values: series }, { label: 'mixed', key: 'mixedProvenanceCells', values: series }
    ], CELLS));
    parts.push(chartPanel(xs[2], y, chartW, rowH - 16, 'Layer-cell incidences', [
      { label: 'event × cell', key: 'layerCellIncidences', values: series }
    ], Math.ceil(Math.max(...series.map(r => r.layerCellIncidences)) / 5000) * 5000));
    parts.push(chartPanel(xs[3], y, chartW, rowH - 16, 'Layers per covered cell', [
      { label: 'mean', key: 'meanLayersOnCoveredCells', values: series },
      { label: 'q90', key: 'q90LayersOnCoveredCells', values: series },
      { label: 'maximum', key: 'maxLayers', values: series }
    ], layerScaleMax));
  });
  parts.push('</svg>'); return parts.join('');
}

function columnsSvg(seed, columns) {
  const width = 1510, height = 955, margin = 18, gap = 12, colW = 356, rowH = 438, parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<style>text{font-family:Arial,sans-serif;fill:#1b2430}.title{font-size:22px;font-weight:bold}.sub{font-size:11px;fill:#526071}.card{fill:#fff;stroke:#bdc5cf}.head{font-size:11px;font-weight:bold}.line{font-size:10px}.small{font-size:9px;fill:#526071}</style>',
    `<rect width="100%" height="100%" fill="#fff"/><text x="18" y="27" class="title">Representative provenance columns · seed ${seed}</text>`,
    '<text x="18" y="47" class="sub">Newest temporal group at top; earliest at bottom. Vertical placement shows chronology only, not physical burial order; coeval {B,C} shares one group.</text>'];
  columns.forEach((item, index) => {
    if (item.status !== 'selected') return;
    const col = index % 4, row = Math.floor(index / 4), x = margin + col * (colW + gap), y = 65 + row * rowH;
    parts.push(`<rect x="${x}" y="${y}" width="${colW}" height="${rowH - 12}" rx="5" class="card"/>`);
    const title = item.id.replaceAll('-', ' ');
    parts.push(`<text x="${x + 9}" y="${y + 18}" class="head">${esc(title)}</text>`);
    parts.push(`<text x="${x + 9}" y="${y + 34}" class="small">cell ${item.cell} · ${item.layerCount} layers · ${item.temporalGroupCount} time groups</text>`);
    const groups = [...item.sequence].reverse(), bodyY = y + 48, lineH = Math.min(14, 320 / Math.max(1, groups.length));
    groups.forEach((group, j) => {
      const gy = bodyY + j * lineH, channels = group.channels;
      const color = channels.length === 2 ? COLORS.BC : COLORS[channels[0]];
      const layerCount = group.eventLayerCount, label = channels.length === 2 ? `{B,C}${layerCount > 2 ? ` ×${layerCount}` : ''}`
        : `${channels[0]}${layerCount > 1 ? ` ×${layerCount}` : ''}`;
      parts.push(`<rect x="${x + 9}" y="${gy}" width="58" height="${Math.max(10, lineH - 2)}" fill="${color}" rx="2"/>`);
      parts.push(`<text x="${x + 38}" y="${gy + lineH - 4}" text-anchor="middle" class="line" fill="#fff" style="fill:#fff">${esc(label)}</text>`);
      parts.push(`<text x="${x + 74}" y="${gy + lineH - 4}" class="line">${(group.timeMs / 1000).toFixed(6)} s</text>`);
    });
  });
  parts.push('</svg>'); return parts.join('');
}

function buildObjectiveContexts(seed, selection, eventMap, events, ledger, world) {
  const contexts = [];
  for (const selected of selection.cases) {
    if (selected.status !== 'selected') continue;
    const refs = selected.events.map(ref => eventMap.get(ref.eventId)).filter(Boolean);
    if (!refs.length || refs.some(event => event.seed !== seed)) continue;
    const times = refs.map(event => event.timeMs), firstTimeMs = Math.min(...times), lastTimeMs = Math.max(...times);
    const before = prefixState(ledger, events, firstTimeMs, false), after = prefixState(ledger, events, lastTimeMs, true);
    const bEvent = refs.find(event => event.channel === 'B'), cEvent = refs.find(event => event.channel === 'C');
    const contextEvent = refs.reduce((latest, event) => event.timeMs > latest.timeMs ? event : latest, refs[0]);
    const actualAnchor = world.anchors.get(contextEvent.anchorIndex);
    assert.ok(actualAnchor, `${seed} objective actual material anchor ${contextEvent.anchorIndex}`);
    assert.equal(actualAnchor.timeMs, contextEvent.timeMs, `${seed} objective event/material time`);
    const actualBirths = world.meta.births.filter(birth => birth.timeMs <= lastTimeMs);
    const specialCell = selected.cell?.cell ?? null, cellHistory = specialCell === null ? null : {
      beforeGroups: ledger.cells.find(row => row.cell === specialCell)?.groups.filter(group => group.timeMs < firstTimeMs) || [],
      afterGroups: ledger.cells.find(row => row.cell === specialCell)?.groups.filter(group => group.timeMs <= lastTimeMs) || []
    };
    contexts.push({ seed, caseId: selected.id, status: selected.status, criterion: selected.criterion,
      selectedEventIds: refs.map(event => event.eventId), events: refs.map(event => ({ eventId: event.eventId,
        channel: event.channel, timeMs: event.timeMs, xSha256: event.xSha256, xNodeCount: event.xCells.length,
        center: event.center, entryClass: event.entryClass })),
      firstEventTimeMs: firstTimeMs, lastEventTimeMs: lastTimeMs,
      xJaccard: selected.pair?.xJaccard ?? null, xRelation: selected.pair?.xRelation ?? null,
      beforeMetrics: before.metrics, afterMetrics: after.metrics,
      beforeLayerCounts: Array.from(before.bCounts, (value, i) => value + before.cCounts[i]),
      afterLayerCounts: Array.from(after.bCounts, (value, i) => value + after.cCounts[i]),
      actualMaterialAtLaterEvent: { anchorIndex: actualAnchor.index, timeMs: actualAnchor.timeMs,
        layerCounts: actualAnchor.materialLayers, stats: materialStats(actualAnchor.materialLayers),
        mapSha256: hash(Buffer.from(JSON.stringify(actualAnchor.materialLayers))),
        sourceChunk: world.meta.anchorsFiles[Math.floor(actualAnchor.index / 75)],
        sourceChunkSha256: world.chunkHashes[world.meta.anchorsFiles[Math.floor(actualAnchor.index / 75)]],
        productionBirthIdsThroughTime: actualBirths.map(birth => birth.id) },
      bXCells: bEvent?.xCells || [], cXCells: cEvent?.xCells || [],
      specialCell: selected.cell ? { ...selected.cell, historyBefore: cellHistory.beforeGroups, historyAfter: cellHistory.afterGroups } : null,
      physicalDepthInference: false });
  }
  return contexts;
}

function objectiveContextSvg(seed, contexts, layerScaleMax, actualScaleMax) {
  const size = 202, left = 170, gap = 12, top = 100, rowH = 240, width = left + 5 * size + 4 * gap + 28,
    height = top + contexts.length * rowH + 22, pieces = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      '<style>text{font-family:Arial,sans-serif;fill:#1b2430}.title{font-size:20px;font-weight:bold}.sub{font-size:11px;fill:#526071}.row{font-size:12px;font-weight:bold}.panel{font-size:11px;font-weight:bold}</style>',
      `<rect width="100%" height="100%" fill="#fff"/><text x="17" y="28" class="title">Matched B/C episodes · before and after virtual stratigraphy · seed ${seed}</text>`,
      '<text x="17" y="49" class="sub">Candidate X masks remain exact event receipts; before excludes the first event timestamp, after includes the last. No physical order is assigned to ties.</text>',
      `<text x="17" y="68" class="sub">B ${COLORS.B} · C ${COLORS.C} · shadow count fixed at 0–${layerScaleMax}, actual material at 0–${actualScaleMax}; registered objective cases.</text>`];
  contexts.forEach((row, index) => {
    const y = top + index * rowH, x0 = left;
    pieces.push(`<text x="17" y="${y + 18}" class="row">${esc(row.caseId)}</text>`);
    pieces.push(`<text x="17" y="${y + 38}" class="sub">${(row.firstEventTimeMs / 1000).toFixed(3)}–${(row.lastEventTimeMs / 1000).toFixed(3)} s</text>`);
    const x = col => x0 + col * (size + gap);
    pieces.push(svgPanel(x(0), y + 23, size, 'Before · layer count', row.beforeLayerCounts, 'count', layerScaleMax));
    const bMask = new Uint8Array(CELLS), cMask = new Uint8Array(CELLS);
    for (const cell of row.bXCells) bMask[cell] = 1;
    for (const cell of row.cXCells) cMask[cell] = 1;
    pieces.push(svgPanel(x(1), y + 23, size, `B X · ${row.bXCells.length} nodes`, bMask, 'B', 1));
    pieces.push(svgPanel(x(2), y + 23, size, `C X · ${row.cXCells.length} nodes`, cMask, 'C', 1));
    pieces.push(svgPanel(x(3), y + 23, size, 'After · layer count', row.afterLayerCounts, 'count', layerScaleMax));
    pieces.push(svgPanel(x(4), y + 23, size, `Actual material · ${(row.actualMaterialAtLaterEvent.timeMs / 1000).toFixed(3)} s`,
      row.actualMaterialAtLaterEvent.layerCounts, 'actual', actualScaleMax));
  });
  pieces.push('</svg>'); return pieces.join('');
}

async function renderSvgAssets(assets) {
  const { chromium } = await import('playwright');
  const browserPath = process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
  const records = [];
  try {
    for (const asset of assets) {
      const svgPath = resolve(OUT, asset.svg), pngPath = resolve(OUT, asset.png);
      await mkdir(dirname(svgPath), { recursive: true });
      await writeFile(svgPath, asset.content);
      const svg = asset.content;
      const width = Number(svg.match(/<svg[^>]+width="(\d+)"/)?.[1]);
      const height = Number(svg.match(/<svg[^>]+height="(\d+)"/)?.[1]);
      assert.ok(width > 0 && height > 0, `${asset.svg} dimensions`);
      await page.setViewportSize({ width, height });
      await page.setContent(`<!doctype html><html><body style="margin:0;padding:0">${svg}</body></html>`, { waitUntil: 'load' });
      const first = await page.locator('svg').screenshot({ type: 'png', animations: 'disabled' });
      const second = await page.locator('svg').screenshot({ type: 'png', animations: 'disabled' });
      assert.equal(hash(first), hash(second), `${asset.png} deterministic regeneration`);
      await mkdir(dirname(pngPath), { recursive: true }); await writeFile(pngPath, first);
      records.push({ svg: asset.svg, png: asset.png, svgSha256: hash(Buffer.from(svg)), pngBytes: first.length,
        pngSha256: hash(first), dimensions: { width, height }, deterministic: true });
    }
  } finally { await browser.close(); }
  return records;
}

async function listPackageFiles(directory, root = directory) {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await listPackageFiles(full, root));
    else if (entry.isFile()) {
      const bytes = await readFile(full);
      rows.push({ file: full.slice(root.length + 1).replaceAll('\\', '/'), bytes: bytes.length, sha256: hash(bytes) });
    } else assert.fail(`unexpected package entry ${full}`);
  }
  return rows;
}

async function finalizePackage() {
  const files = (await listPackageFiles(OUT)).filter(row => !['manifest.json', 'SHA256SUMS.txt'].includes(row.file))
    .sort((a, b) => a.file.localeCompare(b.file));
  const tool = await readFile(resolve(ROOT, 'scripts/ant-bc-provenance-stratigraphy-prototype.js'));
  const manifest = { schema: 'ant-bc-provenance-stratigraphy-prototype-manifest-v1',
    branch: 'codex/ant-bc-provenance-stratigraphy-prototype-20261031',
    analysisBaseHead: PREVIOUS_COMMIT, productionAuthority: PRODUCTION_AUTHORITY,
    opportunityCommit: OPPORTUNITY_COMMIT, responsibilityCommit: RESPONSIBILITY_COMMIT,
    authorReviewCommit: REVIEW_COMMIT, dualMaturationCommit: PREVIOUS_COMMIT,
    tool: { file: 'scripts/ant-bc-provenance-stratigraphy-prototype.js', sha256: hash(tool) }, files };
  await writeFile(resolve(OUT, 'manifest.json'), jsonBytes(manifest));
  const sums = [...files.map(row => [row.file, row.sha256]),
    ['manifest.json', hash(await readFile(resolve(OUT, 'manifest.json')))]].sort((a, b) => a[0].localeCompare(b[0]));
  await writeFile(resolve(OUT, 'SHA256SUMS.txt'), sums.map(([file, digest]) => `${digest}  ${file}`).join('\n') + '\n');
  return { fileCount: files.length, manifestSha256: hash(await readFile(resolve(OUT, 'manifest.json'))),
    sumsSha256: hash(await readFile(resolve(OUT, 'SHA256SUMS.txt'))), sumsCount: sums.length };
}

async function independentReview(previousManifest) {
  const seedResults = [], snapshotsSaved = JSON.parse(await readFile(resolve(OUT, 'analysis/snapshots.json'), 'utf8'));
  const windowsSaved = JSON.parse(await readFile(resolve(OUT, 'analysis/event-windows.json'), 'utf8'));
  const objectiveBytes = await readFile(resolve(PREVIOUS, 'analysis/objective-cases.json'));
  assert.deepEqual(await readFile(resolve(OUT, 'analysis/objective-case-selection.json')), objectiveBytes,
    'exact registered objective-case receipt copied');
  const objectiveContexts = (await readGzip(resolve(OUT, 'analysis/objective-episode-contexts.json.gz'))).contexts;
  const objectiveEventIds = new Set(JSON.parse(objectiveBytes.toString('utf8')).cases.flatMap(row =>
    row.status === 'selected' ? row.events.map(event => event.eventId) : []));
  for (const seed of SEEDS) {
    const { events, receipt } = await loadEvents(seed, previousManifest);
    const world = await loadFrozenWorld(seed);
    const priorCellLedger = await readGzip(resolve(PREVIOUS, `analysis/virtual-ledger-${seed}.json.gz`));
    assert.deepEqual(priorCellLedger.orderedEventIds, events.map(event => event.eventId), `${seed} registered prior event order`);
    const ledger = await readGzip(resolve(OUT, `analysis/provenance-ledger-${seed}.json.gz`));
    const eventMap = new Map(events.map(event => [event.eventId, event]));
    for (const context of objectiveContexts.filter(row => row.seed === seed)) {
      assert.ok(context.selectedEventIds.every(id => objectiveEventIds.has(id)), `${seed} objective IDs originate in registered selection`);
      for (const eventReceipt of context.events) {
        const event = eventMap.get(eventReceipt.eventId);
        assert.ok(event); assert.equal(event.timeMs, eventReceipt.timeMs); assert.equal(event.xSha256, eventReceipt.xSha256);
      }
      const anchor = world.anchors.get(context.actualMaterialAtLaterEvent.anchorIndex);
      assert.ok(anchor); assert.equal(anchor.timeMs, context.actualMaterialAtLaterEvent.timeMs);
      assert.equal(context.actualMaterialAtLaterEvent.mapSha256,
        hash(Buffer.from(JSON.stringify(anchor.materialLayers))), `${seed} objective production material map`);
    }
    assert.equal(ledger.eventCount, events.length);
    const refs = new Map(ledger.layers.map(layer => [layer.eventId, layer]));
    assert.equal(refs.size, events.length, 'one saved immutable layer per shadow event');
    let layerIncidences = 0;
    const byCell = new Map();
    for (const event of events) {
      const saved = refs.get(event.eventId);
      assert.ok(saved, `layer for exact event ${event.eventId}`);
      assert.equal(saved.timeMs, event.timeMs); assert.equal(saved.channel, event.channel);
      assert.equal(saved.trackId, event.trackId); assert.deepEqual(saved.center, event.center);
      assert.equal(saved.entryClass, event.entryClass); assert.equal(saved.sourceReceipt.xSha256, event.xSha256);
      assert.deepEqual(saved.xCells, event.xCells, `full event X mask ${event.eventId}`);
      layerIncidences += event.xCells.length;
      for (const cell of event.xCells) {
        if (!byCell.has(cell)) byCell.set(cell, new Map());
        const byTime = byCell.get(cell);
        if (!byTime.has(event.timeMs)) byTime.set(event.timeMs, { B: [], C: [] });
        byTime.get(event.timeMs)[event.channel].push(event.eventId);
      }
    }
    const expectedRows = [...byCell].sort((a, b) => a[0] - b[0]).map(([cell, timeMap]) => ({
      cell, groups: [...timeMap].sort((a, b) => a[0] - b[0]).map(([timeMs, ids]) => {
        ids.B.sort(); ids.C.sort();
        return { timeMs, channels: sortedChannels({ B: ids.B.length, C: ids.C.length }),
          eventIdsByChannel: ids, layerCount: ids.B.length + ids.C.length };
      })
    }));
    assert.equal(expectedRows.length, ledger.cells.length, 'independent touched-cell count');
    for (let i = 0; i < expectedRows.length; i++) {
      const expected = expectedRows[i], saved = ledger.cells[i];
      assert.equal(saved.cell, expected.cell, 'independent row-major cell order');
      assert.deepEqual(saved.groups, expected.groups, `independent coeval-aware per-cell groups ${saved.cell}`);
    }
    const histogram = {}, groupHistogram = {}; let strictBC = 0, strictCB = 0, coevalCellGroups = 0;
    let bCoverage = 0, cCoverage = 0, union = 0, mixed = 0, untouched = CELLS;
    for (const row of expectedRows) {
      const b = row.groups.reduce((sum, g) => sum + g.eventIdsByChannel.B.length, 0);
      const c = row.groups.reduce((sum, g) => sum + g.eventIdsByChannel.C.length, 0), layer = b + c;
      histogram[layer] = (histogram[layer] || 0) + 1;
      groupHistogram[row.groups.length] = (groupHistogram[row.groups.length] || 0) + 1;
      if (b) bCoverage++; if (c) cCoverage++; if (b && c) mixed++;
      union++; untouched--;
      coevalCellGroups += row.groups.filter(g => g.channels.length === 2).length;
      for (let i = 1; i < row.groups.length; i++) {
        const previous = row.groups[i - 1].channels, current = row.groups[i].channels;
        if (previous.length === 1 && current.length === 1 && previous[0] === 'B' && current[0] === 'C') strictBC++;
        if (previous.length === 1 && current.length === 1 && previous[0] === 'C' && current[0] === 'B') strictCB++;
      }
    }
    histogram[0] = CELLS - expectedRows.length; groupHistogram[0] = CELLS - expectedRows.length;
    const savedMetrics = ledger.finalMetrics;
    assert.equal(layerIncidences, savedMetrics.layerCellIncidences, 'independent layer-cell incidence total');
    assert.equal(bCoverage, savedMetrics.coverage.b); assert.equal(cCoverage, savedMetrics.coverage.c);
    assert.equal(union, savedMetrics.coverage.union); assert.equal(mixed, savedMetrics.coverage.both);
    assert.equal(untouched, savedMetrics.coverage.untouched);
    assert.deepEqual(histogram, savedMetrics.layerCountHistogram);
    assert.deepEqual(groupHistogram, savedMetrics.temporalGroupCountHistogram);
    const sequenceReceipt = JSON.parse(await readFile(resolve(OUT, 'analysis/sequence-summaries.json'), 'utf8'))
      .find(row => row.seed === seed);
    assert.equal(strictBC, sequenceReceipt.sequenceSummary.BtoCTransitions);
    assert.equal(strictCB, sequenceReceipt.sequenceSummary.CtoBTransitions);
    assert.equal(coevalCellGroups, sequenceReceipt.sequenceSummary.coevalCellGroups);
    assert.equal(ledger.layers.length, events.length, 'no source event dropped');
    assert.ok(events.every(event => event.timeMs <= 600_000), 'all shadow events retained through 600 s');

    let cumulative = 0, expectedCrossing = null;
    for (let i = 0; i < events.length;) {
      const timeMs = events[i].timeMs, batch = [];
      while (i < events.length && events[i].timeMs === timeMs) batch.push(events[i++]);
      const before = cumulative; cumulative += batch.length;
      if (!expectedCrossing && before < EVENT_REFERENCE && cumulative >= EVENT_REFERENCE) expectedCrossing = {
        timeMs, timeSeconds: timeMs / 1000, countBefore: before, countAtTimestamp: cumulative,
        crossingEventIds: batch.map(event => event.eventId) };
    }
    assert.deepEqual(ledger.first256CombinedEventCrossing, expectedCrossing, `${seed} independent 256 reference crossing`);
    const expectedWindows = windowCounts(seed, events, world.meta.births);
    const savedWindow = windowsSaved.find(row => row.seed === seed);
    assert.deepEqual(savedWindow.windows.map(({ seed: _seed, eventIds, productionBirthIds, ...row }) => row),
      expectedWindows.windows.map(({ seed: _seed, eventIds, productionBirthIds, ...row }) => row), 'independent fixed-window arithmetic');
    const seedSnaps = snapshotsSaved.filter(row => row.seed === seed);
    assert.equal(seedSnaps.length, 6, 'six requested snapshot times per seed');
    for (const snapshot of seedSnaps) {
      const last = events.filter(event => event.timeMs <= snapshot.requestedSeconds * 1000).at(-1);
      assert.ok(last, `${seed} saved snapshot has a preceding event`);
      assert.equal(snapshot.snapshotTimeMs, last.timeMs, `${seed} latest exact shadow event at requested time`);
      assert.equal(snapshot.anchorIndex, last.anchorIndex, `${seed} snapshot saved anchor`);
      const anchor = world.anchors.get(last.anchorIndex);
      assert.ok(anchor); assert.equal(anchor.timeMs, last.timeMs, `${seed} actual material anchor time`);
      assert.equal(snapshot.actualMaterialTimeMs, anchor.timeMs);
      assert.equal(snapshot.actualMaterialLayerMapSha256, hash(Buffer.from(JSON.stringify(anchor.materialLayers))));
      assert.equal(snapshot.cumulativeProductionPlateBirths,
        world.meta.births.filter(birth => birth.timeMs <= last.timeMs).length, `${seed} snapshot actual births through exact time`);
    }
    seedResults.push({ seed, eventCount: events.length, eventReceiptSha256: receipt.sha256,
      exactLayerMasksAndMetadata: true, reconstructedCells: expectedRows.length, layerCellIncidences: layerIncidences,
      exactCoevalGroups: coevalCellGroups, BtoCTransitions: strictBC, CtoBTransitions: strictCB,
      layerAndGroupHistograms: true, first256Crossing: expectedCrossing, snapshotCount: seedSnaps.length,
      exactSnapshotBoundariesAndProductionMaterial: true, eventWindowArithmetic: true });
  }
  return { schema: 'ant-bc-provenance-stratigraphy-independent-review-v1', method:
    'Rebuild per-cell exact-time groups directly from the registered event X masks using an independent Map-of-Map pass; recompute layer/group histograms, strict singleton transitions, and fixed-window event/birth counts.',
    eventCount: seedResults.reduce((sum, row) => sum + row.eventCount, 0), seeds: seedResults };
}

async function main() {
  await mkdir(resolve(OUT, 'analysis'), { recursive: true }); await mkdir(resolve(OUT, 'visual'), { recursive: true });
  if (process.argv.includes('--finalize')) {
    console.log(JSON.stringify({ phase: 'package-finalized', ...await finalizePackage() })); return;
  }
  const authority = await verifyAuthority();
  if (process.argv.includes('--verify-only')) {
    const previousManifest = authority.previousManifest;
    const independent = await independentReview(previousManifest);
    const validationPath = resolve(OUT, 'analysis/validation.json'), validation = JSON.parse(await readFile(validationPath, 'utf8'));
    validation.independentLedgerReview = independent;
    await writeFile(validationPath, jsonBytes(validation));
    console.log(JSON.stringify({ phase: 'independent-ledger-review-complete', totalEvents: independent.eventCount,
      seeds: independent.seeds.map(({ seed, reconstructedCells, layerCellIncidences }) => ({ seed, reconstructedCells, layerCellIncidences })) }));
    return;
  }

  const seedData = [], sourceChunkHashes = {};
  const previousManifest = authority.previousManifest;
  const objectiveSelection = JSON.parse(await readFile(resolve(PREVIOUS, 'analysis/objective-cases.json'), 'utf8'));
  const objectiveManifestRow = previousManifest.files.find(row => row.file === 'analysis/objective-cases.json');
  assert.ok(objectiveManifestRow);
  const objectiveBytes = await readFile(resolve(PREVIOUS, 'analysis/objective-cases.json'));
  assert.equal(hash(objectiveBytes), objectiveManifestRow.sha256, 'reuse registered objective event cases');
  await writeFile(resolve(OUT, 'analysis/objective-case-selection.json'), objectiveBytes);
  const sourceInputs = {};
  for (const seed of SEEDS) {
    const { events, receipt } = await loadEvents(seed, previousManifest);
    const world = await loadFrozenWorld(seed);
    for (const [file, digest] of Object.entries(world.chunkHashes)) sourceChunkHashes[`${seed}/${file}`] = digest;
    const priorCellLedger = await readGzip(resolve(PREVIOUS, `analysis/virtual-ledger-${seed}.json.gz`));
    assert.deepEqual(priorCellLedger.orderedEventIds, events.map(row => row.eventId), `${seed} exact prior event order`);
    const { ledger, times } = buildLedger(seed, events, receipt);
    for (const row of ledger.cumulativeSeries) row.cumulativeProductionBirths = world.meta.births.filter(birth => birth.timeMs <= row.timeMs).length;
    const windows = windowCounts(seed, events, world.meta.births);
    const snapshots = chooseSnapshots(seed, events, ledger, world);
    const columns = selectColumns(seed, ledger);
    const sequences = summarizeSequences(ledger.cells);
    const eventCounts = { B: events.filter(row => row.channel === 'B').length,
      C: events.filter(row => row.channel === 'C').length, total: events.length };
    assert.equal(eventCounts.total, EXPECTED_EVENTS[seed]);
    assert.ok(ledger.first256CombinedEventCrossing, `${seed} crosses the 256-event reference`);
    const actualBirthCount = world.meta.births.length;
    const seedSummary = { seed, authority: PRODUCTION_AUTHORITY, seedRun: { hz: 60, modelSeconds: 600, audio: 'Off',
      frozenAnalysisAnchors: 599 }, eventReceipt: receipt, events: eventCounts,
      actualProductionPlateBirths: actualBirthCount, shadowEventsPerActualProductionBirth: eventCounts.total / actualBirthCount,
      first256CombinedEventCrossing: ledger.first256CombinedEventCrossing,
      final: ledger.finalMetrics, sequenceSummary: sequences,
      windowDistributions: windows.distributions,
      snapshotRows: snapshots.map(({ state, ...row }) => row),
      fixed60SecondWindows: windows.windows.map(({ eventIds, productionBirthIds, ...row }) => row),
      actualPlateBirthTimesMs: world.meta.births.map(birth => birth.timeMs) };
    await writeGzip(resolve(OUT, `analysis/provenance-ledger-${seed}.json.gz`), ledger);
    seedData.push({ seed, events, receipt, ledger, world, windows, snapshots, columns, sequences, summary: seedSummary, times });
    sourceInputs[seed] = { signalMetaAuthority: world.meta.authority, anchors: world.anchors.size,
      sourceAnchorChunkHashes: world.chunkHashes, actualProductionPlateBirths: world.meta.births.length,
      sourceBirthCountHash: hash(Buffer.from(JSON.stringify(world.meta.births.map(birth => [birth.id, birth.timeMs, birth.maskIndices])))) };
    console.log(JSON.stringify({ phase: 'seed-ledger-complete', seed, events: eventCounts,
      actualProductionPlateBirths: actualBirthCount, first256Seconds: ledger.first256CombinedEventCrossing.timeSeconds,
      coverage: ledger.finalMetrics.coverage, layerCellIncidences: ledger.finalMetrics.layerCellIncidences }));
  }

  const allContexts = [];
  for (const data of seedData) {
    const eventMap = new Map(data.events.map(event => [event.eventId, event]));
    const contexts = buildObjectiveContexts(data.seed, objectiveSelection, eventMap, data.events, data.ledger, data.world);
    data.objectiveContexts = contexts; allContexts.push(...contexts);
  }
  const allSnapshots = seedData.flatMap(row => row.snapshots);
  const layerScaleMax = Math.max(...seedData.map(row => row.ledger.finalMetrics.maxLayers));
  const actualScaleMax = Math.max(...seedData.flatMap(row => [...row.world.anchors.values()]
    .map(anchor => anchor.materialLayers.reduce((max, value) => Math.max(max, value), 0))));
  const snapshotRows = allSnapshots.map(({ state, ...row }) => row);
  await writeFile(resolve(OUT, 'analysis/snapshots.json'), jsonBytes(snapshotRows));
  await writeFile(resolve(OUT, 'analysis/event-windows.json'), jsonBytes(seedData.map(row => ({ seed: row.seed,
    windows: row.windows.windows, distributions: row.windows.distributions }))));
  await writeFile(resolve(OUT, 'analysis/sequence-summaries.json'), jsonBytes(seedData.map(row => ({ seed: row.seed,
    sequenceSummary: row.sequences, selectedColumns: row.columns }))));
  await writeGzip(resolve(OUT, 'analysis/objective-episode-contexts.json.gz'), { schema: 'ant-bc-objective-stratigraphy-contexts-v1',
    sourceObjectiveCasesSha256: hash(objectiveBytes), contexts: allContexts });
  const totalEvents = seedData.reduce((sum, row) => sum + row.summary.events.total, 0);
  const totalProductionBirths = seedData.reduce((sum, row) => sum + row.summary.actualProductionPlateBirths, 0);
  assert.equal(totalEvents, 2089); assert.equal(totalProductionBirths, 93);
  const summary = { schema: 'ant-bc-provenance-stratigraphy-prototype-summary-v1', authority,
    lineages: { production: PRODUCTION_AUTHORITY, frozenOpportunities: OPPORTUNITY_COMMIT,
      BcResponsibility: RESPONSIBILITY_COMMIT, authorReview: REVIEW_COMMIT, dualMaturation: PREVIOUS_COMMIT },
    meanings: { B: 'qualified chemical-history shadow event', C: 'FOOT_CONTACT-written compaction shadow event',
      eachEvent: 'one immutable provenance layer on its exact registered X cell set',
      sameTime: 'all exact-numeric-time events for one cell share a coeval group; channel sort is serialization only',
      noProductionFeedback: true, noPhysicalOrAudioDifferentiation: true },
    classification: 'COMPLEMENTARY BUT OVERPROLIFIC',
    interpretation: 'Per-cell provenance remains spatially mixed, exclusive and chronologically ordered, while the unarbitrated event count crosses the 256-Plate reference in every seed before 273 s.',
    smallestNextQuestion: 'What separate final commit/arbitration responsibility, if any, can map matured B/C episodes into real immutable layers within current production constraints while preserving exact coeval provenance?',
    limits: { currentMaterialStratigraphyPlateCeiling: 256, ceilingUse: 'comparison reference only; no event truncation or production object insertion',
      trueProductionBirthsAreNotShadowEvents: true },
    totals: { shadowEvents: totalEvents, B: seedData.reduce((s, r) => s + r.summary.events.B, 0),
      C: seedData.reduce((s, r) => s + r.summary.events.C, 0), actualProductionPlateBirths: totalProductionBirths,
      shadowEventsPerActualBirth: totalEvents / totalProductionBirths,
      uniqueBCellsAcrossSeedWorlds: seedData.reduce((s, r) => s + r.ledger.finalMetrics.coverage.b, 0),
      uniqueCCellsAcrossSeedWorlds: seedData.reduce((s, r) => s + r.ledger.finalMetrics.coverage.c, 0),
      unionCellSeedEntries: seedData.reduce((s, r) => s + r.ledger.finalMetrics.coverage.union, 0),
      mixedCellSeedEntries: seedData.reduce((s, r) => s + r.ledger.finalMetrics.coverage.both, 0),
      layerCellIncidences: seedData.reduce((s, r) => s + r.ledger.finalMetrics.layerCellIncidences, 0),
      coevalGlobalTimestampGroups: seedData.reduce((s, r) => s + r.ledger.coevalGlobalTimestampGroupCount, 0),
      coevalCellGroups: seedData.reduce((s, r) => s + r.sequences.coevalCellGroups, 0) },
    scales: { normalizedGrid: `${GRID}x${GRID}`, prototypeLayerCountMax: layerScaleMax,
      actualProductionLayerCountMaxAcrossFrozenAnchors: actualScaleMax, fixedAcrossAllSeedsAndTimes: true },
    seeds: seedData.map(row => row.summary), sourceInputs, sourceAnchorChunkHashes: sourceChunkHashes,
    objectiveSelectionSha256: hash(objectiveBytes), objectiveContextCount: allContexts.length,
    visualReceiptPending: true };
  await writeFile(resolve(OUT, 'analysis/summary.json'), jsonBytes(summary));

  const assets = [];
  for (const data of seedData) {
    assets.push({ svg: `visual/snapshots-${data.seed}.svg`, png: `visual/snapshots-${data.seed}.png`,
      content: snapshotSvg(data.seed, data.snapshots, data.ledger, layerScaleMax, actualScaleMax) });
    assets.push({ svg: `visual/representative-columns-${data.seed}.svg`, png: `visual/representative-columns-${data.seed}.png`,
      content: columnsSvg(data.seed, data.columns) });
    if (data.objectiveContexts.length) assets.push({ svg: `visual/objective-context-${data.seed}.svg`, png: `visual/objective-context-${data.seed}.png`,
      content: objectiveContextSvg(data.seed, data.objectiveContexts, layerScaleMax, actualScaleMax) });
  }
  assets.push({ svg: 'visual/cumulative-pressure-atlas.svg', png: 'visual/cumulative-pressure-atlas.png',
    content: pressureSvg(seedData.map(row => ({ seed: row.seed, series: row.ledger.cumulativeSeries })), layerScaleMax) });
  const visualReceipt = await renderSvgAssets(assets);
  summary.visualReceipt = visualReceipt; summary.visualReceiptPending = false;
  await writeFile(resolve(OUT, 'analysis/summary.json'), jsonBytes(summary));
  const generatedFiles = [];
  for (const file of ['analysis/snapshots.json', 'analysis/event-windows.json', 'analysis/sequence-summaries.json',
    'analysis/objective-case-selection.json',
    'analysis/objective-episode-contexts.json.gz', 'analysis/summary.json', ...SEEDS.map(seed => `analysis/provenance-ledger-${seed}.json.gz`),
    ...visualReceipt.flatMap(row => [row.svg, row.png])]) {
    const bytes = await readFile(resolve(OUT, file)); generatedFiles.push({ file, bytes: bytes.length, sha256: hash(bytes) });
  }
  await writeFile(resolve(OUT, 'analysis/validation.json'), jsonBytes({ schema: 'ant-bc-provenance-stratigraphy-validation-v1',
    authority: { production: PRODUCTION_AUTHORITY, priorShadowCommit: PREVIOUS_COMMIT,
      priorPackageManifestSha256: authority.previousManifestSha256,
      priorPackageSumsSha256: authority.previousSumsSha256,
      sourceManifestSha256: authority.sourceManifestSha256, reviewManifestSha256: authority.reviewManifestSha256,
      productionSourceHashes: authority.productionSourceHashes, currentBranch: authority.git.branch, analysisBaseHead: PREVIOUS_COMMIT },
    frozenEventReceipts: seedData.map(row => ({ seed: row.seed, count: row.events.length,
      channels: row.receipt.channels, eventFileSha256: row.receipt.sha256, exactXMaskHashesVerified: true,
      allEventsThrough600SecondsRetained: row.events.every(event => event.timeMs <= 600_000),
      exactPriorEventOrderMatched: true })),
    frozenWorldMaterialReceipts: sourceInputs, independentPerCellReconstructionPending: true,
    actualNumericTimestampCohorts: true, noRng: true, noProductionStateWrite: true,
    productionMaterialStratigraphyImportedOrCalled: false, srcStaticDiff: 'pending external git diff check',
    snapshots: snapshotRows.map(row => ({ seed: row.seed, requestedSeconds: row.requestedSeconds,
      timeMs: row.snapshotTimeMs, anchorIndex: row.anchorIndex, actualMaterialTimeMs: row.actualMaterialTimeMs })),
    visualReceipt, generatedFiles }));
  console.log(JSON.stringify({ phase: 'provenance-prototype-complete', totalEvents, totalProductionBirths,
    layerScaleMax, actualScaleMax, crossingTimes: seedData.map(row => ({ seed: row.seed, ...row.ledger.first256CombinedEventCrossing })),
    visualCount: visualReceipt.length, evidence: OUT }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
