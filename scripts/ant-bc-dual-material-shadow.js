import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { unpack } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-10-31-bc-dual-material-shadow');
const SOURCE = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit');
const BC = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-episode-evidence-b-vs-c');
const REVIEW = resolve(ROOT, 'docs/ant/evidence/2026-10-31-b-vs-c-author-review');
const SEEDS = ['20261005', '20261006', '20261007'];
const GRID = 96, CELLS = GRID * GRID, RADIUS = .15, PERSISTENCE_MS = 20_000, X_SIMILARITY = .60;
const WINDOWS_MS = [1_000, 5_000, 10_000, 20_000];
const REVIEW_MODULE = './ant-b-vs-c-author-review.js';
process.env.ANT_REVIEW_OUTPUT = EVIDENCE;
const review = await import(REVIEW_MODULE);

const digest = value => createHash('sha256').update(value).digest('hex');
const point = index => ({ x: (index % GRID) / (GRID - 1), y: Math.floor(index / GRID) / (GRID - 1) });
const keyOf = (anchorIndex, captureId) => `${anchorIndex}:${captureId}`;
const sortEvent = (a, b) => a.timeMs - b.timeMs || (a.channel === b.channel ? 0 : a.channel === 'B' ? -1 : 1)
  || a.eventId.localeCompare(b.eventId);
const jsonBytes = value => Buffer.from(JSON.stringify(value) + '\n');

function quantile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, min: null, q25: null, median: null, q75: null, q90: null, max: null, mean: null };
  return { count: sorted.length, min: sorted[0], q25: quantile(sorted, .25), median: quantile(sorted, .5),
    q75: quantile(sorted, .75), q90: quantile(sorted, .9), max: sorted.at(-1),
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length };
}

function jaccard(left, right) {
  const rightSet = new Set(right); let intersection = 0;
  for (const cell of left) intersection += Number(rightSet.has(cell));
  const union = left.length + right.length - intersection;
  return union ? intersection / union : 1;
}

function sortedUniqueCells(cells) {
  const result = [...cells].sort((a, b) => a - b);
  assert.equal(new Set(result).size, result.length, 'X cell set has no duplicates');
  assert.ok(result.every(cell => Number.isInteger(cell) && cell >= 0 && cell < CELLS), 'X cells stay on grid');
  return result;
}

function cellSha(cells) { return digest(Buffer.from(JSON.stringify(cells))); }

async function gitMetadata() {
  let gitDir = resolve(ROOT, '.git');
  const dotGit = await readFile(gitDir, 'utf8').catch(() => '');
  if (dotGit.startsWith('gitdir:')) gitDir = resolve(ROOT, dotGit.slice('gitdir:'.length).trim());
  const headText = (await readFile(resolve(gitDir, 'HEAD'), 'utf8')).trim();
  if (!headText.startsWith('ref: ')) return { branch: 'detached', head: headText };
  const ref = headText.slice(5), branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
  let head = await readFile(resolve(gitDir, ref), 'utf8').catch(() => null);
  if (!head) {
    const commonDir = await readFile(resolve(gitDir, 'commondir'), 'utf8').catch(() => '..');
    const commonPath = resolve(gitDir, commonDir.trim());
    const packed = await readFile(resolve(commonPath, 'packed-refs'), 'utf8').catch(() => '');
    head = packed.split(/\r?\n/).find(line => line.endsWith(` ${ref}`))?.split(' ')[0] || null;
  }
  assert.ok(head, `current Git ref resolves: ${ref}`);
  return { branch, head: head.trim() };
}

async function verifyInputs() {
  const sourceManifestPath = resolve(SOURCE, 'manifest.json');
  const bcManifestPath = resolve(BC, 'analysis/manifest.json');
  const authorManifestPath = resolve(REVIEW, 'manifest.json');
  const [sourceManifestBytes, bcManifestBytes, authorManifestBytes] = await Promise.all([
    readFile(sourceManifestPath), readFile(bcManifestPath), readFile(authorManifestPath)
  ]);
  const sourceManifest = JSON.parse(sourceManifestBytes), bcManifest = JSON.parse(bcManifestBytes);
  const authorManifest = JSON.parse(authorManifestBytes);
  assert.equal(sourceManifest.authority, 'bc045dc3caa5954df633ecbee37fbabcb8224f30', 'frozen packet production authority');
  assert.equal(bcManifest.sourcePacketCommit, 'da599d9f385f53d0bb24df3e737c5ed2e2eb6a23', 'B/C analysis uses requested packet');
  assert.equal(bcManifest.authority, 'bc045dc3caa5954df633ecbee37fbabcb8224f30', 'current production authority');
  assert.equal(bcManifest.sourcePacketManifestSha256, digest(sourceManifestBytes), 'source packet manifest hash');
  assert.equal(authorManifest.productionAuthority, bcManifest.authority, 'review package production authority');
  assert.equal(authorManifest.sourcePacketCommit, 'da599d9f385f53d0bb24df3e737c5ed2e2eb6a23', 'review package source packet');
  assert.equal(authorManifest.responsibilityAnalysisCommit, 'a75b83ce5dbeece36d60d966b9d86fc85ddb5f54',
    'review package B/C analysis lineage');
  const git = await gitMetadata();
  assert.equal(git.branch, 'codex/ant-bc-dual-material-shadow-20261031', 'dedicated research branch');
  const sourceHashes = authorManifest.authorities.sourceHashes;
  for (const [file, expected] of Object.entries(sourceHashes)) {
    const current = Buffer.from((await readFile(resolve(ROOT, file), 'utf8')).replace(/\r\n?/g, '\n'));
    assert.equal(digest(current), expected, `current production authority source ${file}`);
  }
  const hashes = {};
  const files = [
    'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/manifest.json',
    'docs/ant/evidence/2026-10-31-local-episode-evidence-b-vs-c/analysis/manifest.json',
    'docs/ant/evidence/2026-10-31-local-episode-evidence-b-vs-c/analysis/inputs.json',
    'docs/ant/evidence/2026-10-31-local-episode-evidence-b-vs-c/analysis/cases.json',
    'docs/ant/evidence/2026-10-31-local-episode-evidence-b-vs-c/analysis/summary.json',
    'docs/ant/evidence/2026-10-31-b-vs-c-author-review/manifest.json',
    'docs/ant/evidence/2026-10-31-b-vs-c-author-review/validation.json',
    'docs/ant/evidence/2026-10-31-b-vs-c-author-review/objective-case-selection.json',
    ...SEEDS.flatMap(seed => [
      `docs/ant/evidence/2026-10-31-local-episode-evidence-b-vs-c/analysis/track-observations-${seed}.json.gz`,
      `docs/ant/evidence/2026-10-31-local-episode-evidence-b-vs-c/analysis/paired-bc-boundaries-${seed}.json.gz`
    ])
  ];
  for (const file of files) hashes[file] = digest(await readFile(resolve(ROOT, file)));
  assert.equal(hashes[files[0]], authorManifest.frozenInputHashes[files[0].replaceAll('/', '\\')],
    'reviewed frozen opportunity packet hash');
  for (const item of bcManifest.files) {
    const bytes = await readFile(resolve(BC, item.file));
    let actual = digest(bytes);
    if (actual !== item.sha256 && !item.file.endsWith('.gz')) actual = digest(Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n')));
    assert.equal(actual, item.sha256, `registered B/C evidence hash ${item.file}`);
  }
  return { hashes, sourceManifestSha256: digest(sourceManifestBytes), bcManifestSha256: digest(bcManifestBytes),
    authorReviewManifestSha256: digest(authorManifestBytes), branch: git.branch, baseHead: git.head,
    productionAuthority: bcManifest.authority, sourcePacketCommit: 'da599d9f385f53d0bb24df3e737c5ed2e2eb6a23',
    responsibilityAnalysisCommit: 'a75b83ce5dbeece36d60d966b9d86fc85ddb5f54' };
}

async function loadCaptures(seed, tracks) {
  const wanted = new Map();
  for (const track of tracks.channels) for (const obs of track.observations) {
    assert.ok(obs.captureId, `${seed}/${track.id}/${obs.anchorIndex} has registered X capture`);
    if (!wanted.has(obs.anchorIndex)) wanted.set(obs.anchorIndex, new Set());
    wanted.get(obs.anchorIndex).add(obs.captureId);
  }
  const analysis = resolve(SOURCE, 'analysis'), metaPath = resolve(analysis, `seed-${seed}.opportunities.json.gz`);
  const metaBytes = await readFile(metaPath), meta = JSON.parse(gunzipSync(metaBytes));
  assert.equal(meta.anchorsCount, 599, `${seed} has 599 frozen opportunity boundaries`);
  const captures = new Map(), timeByAnchor = new Map(); let anchorsSeen = 0;
  for (const file of meta.anchorsFiles) {
    const bytes = await readFile(resolve(analysis, file));
    assert.equal(digest(bytes), meta.chunkHashes[file], `${seed} frozen opportunity chunk ${file}`);
    const rows = JSON.parse(gunzipSync(bytes)).anchors;
    for (const anchor of rows) {
      anchorsSeen++;
      assert.ok(Number.isInteger(anchor.index) && anchor.index >= 0 && anchor.index < 599, 'frozen anchor index range');
      timeByAnchor.set(anchor.index, anchor.timeMs);
      const ids = wanted.get(anchor.index);
      if (!ids) continue;
      for (const id of ids) {
        const capture = anchor.captures.find(row => row.id === id);
        assert.ok(capture, `${seed}/${anchor.index}/${id} exact registered X capture`);
        const cells = sortedUniqueCells(capture.cells);
        captures.set(keyOf(anchor.index, id), {
          anchorIndex: anchor.index, timeMs: anchor.timeMs, captureId: id,
          canonicalCenterIndex: capture.centerIndex, centers: capture.centers, cells,
          xSha256: cellSha(cells), nodeCount: capture.nodeCount, edgeCount: capture.edgeCount,
          connected: capture.connected, radiusValid: capture.radiusValid, maxRadius: capture.maxRadius,
          centroid: capture.centroid, component: capture.component, material: capture.material
        });
      }
    }
  }
  assert.equal(anchorsSeen, 599, `${seed} opportunity history anchor count`);
  assert.equal(timeByAnchor.size, 599, `${seed} unique saved analysis timestamps`);
  for (const track of tracks.channels) for (const obs of track.observations) {
    const x = captures.get(keyOf(obs.anchorIndex, obs.captureId));
    assert.ok(x, `${seed}/${track.id}/${obs.anchorIndex} capture receipt exists`);
    assert.equal(x.timeMs, obs.timeMs, 'track and X anchor timestamps match exactly');
    assert.equal(x.nodeCount, obs.xNodeCount, 'registered X node count');
    assert.equal(x.connected, obs.xConnected, 'registered X connectivity');
    assert.equal(x.radiusValid, obs.xRadiusValid, 'registered X radius validity');
    assert.equal(x.component, obs.component, 'registered F component identity');
    assert.ok(x.centers.some(row => row.index === obs.centerIndex), 'track opportunity center belongs to X center refs');
    assert.ok(x.cells.includes(obs.centerIndex), 'X contains its opportunity nucleus');
    assert.equal(x.material.overlapFraction, obs.xMaterialOverlap, 'prior material overlap receipt');
  }
  return { captures, timeByAnchor, opportunityManifestSha256: digest(metaBytes),
    opportunityChunkHashes: meta.chunkHashes };
}

function trackEvents(seed, track, captures) {
  const observations = [...track.observations].sort((a, b) => a.timeMs - b.timeMs || a.anchorIndex - b.anchorIndex);
  assert.ok(observations.length, 'nonempty opportunity track');
  const events = []; let previous = null, intervalStart = null, intervalRows = [], intervalNumber = 0, emitted = false;
  let resetWitness = null;
  const reset = (obs, reason) => {
    intervalNumber++;
    intervalStart = obs;
    intervalRows = [obs];
    emitted = false;
    resetWitness = previous ? {
      anchorIndex: previous.anchorIndex, timeMs: previous.timeMs, captureId: previous.captureId,
      xSha256: captures.get(keyOf(previous.anchorIndex, previous.captureId)).xSha256,
      cells: captures.get(keyOf(previous.anchorIndex, previous.captureId)).cells,
      nextAnchorGap: obs.anchorIndex - previous.anchorIndex
    } : null;
    return reason;
  };
  let resetReason = 'track-start';
  for (const obs of observations) {
    const capture = captures.get(keyOf(obs.anchorIndex, obs.captureId));
    assert.ok(capture, 'track X resolves to frozen capture');
    let currentResetReason = null;
    let previousCapture = previous && captures.get(keyOf(previous.anchorIndex, previous.captureId));
    let similarity = null;
    if (!previous) currentResetReason = reset(obs, 'track-start');
    else if (obs.anchorIndex !== previous.anchorIndex + 1) currentResetReason = reset(obs, 'anchor-gap');
    else {
      similarity = jaccard(previousCapture.cells, capture.cells);
      if (similarity < X_SIMILARITY) currentResetReason = reset(obs, 'x-similarity-below-0.60');
      else intervalRows.push(obs);
    }
    if (currentResetReason === 'x-similarity-below-0.60') resetWitness.xJaccard = similarity;
    if (currentResetReason) resetReason = currentResetReason;
    if (!emitted && obs.timeMs - intervalStart.timeMs >= PERSISTENCE_MS) {
      const chain = intervalRows.map(row => {
        const x = captures.get(keyOf(row.anchorIndex, row.captureId));
        return { anchorIndex: row.anchorIndex, timeMs: row.timeMs, captureId: row.captureId,
          centerIndex: row.centerIndex, component: row.component, xSha256: x.xSha256, cells: x.cells };
      });
      const stableElapsedMs = obs.timeMs - intervalStart.timeMs;
      const eventId = `${seed}:${track.channel}:${track.id}:I${String(intervalNumber).padStart(3, '0')}`;
      events.push({ eventId, seed, channel: track.channel, trackId: track.id, intervalNumber,
        intervalId: `${track.channel}:${track.id}:I${String(intervalNumber).padStart(3, '0')}`,
        anchorIndex: obs.anchorIndex, timeMs: obs.timeMs, stabilityStartAnchor: intervalStart.anchorIndex,
        stabilityStartTimeMs: intervalStart.timeMs, stableElapsedMs, trackStartTimeMs: observations[0].timeMs,
        trackAgeAtMaturationMs: obs.timeMs - observations[0].timeMs,
        trackEndTimeMs: observations.at(-1).timeMs, trackLifetimeMs: observations.at(-1).timeMs - observations[0].timeMs,
        centerIndex: obs.centerIndex, center: point(obs.centerIndex), entryDistance: obs.entryDistance,
        entryClass: obs.entryDistance > RADIUS ? 'non-entry' : 'entry', value: obs.value, rank: obs.rank,
        component: obs.component, captureId: obs.captureId, xSha256: capture.xSha256, xCells: capture.cells,
        xNodeCount: capture.nodeCount, priorMaterialOverlap: capture.material.overlapFraction,
        priorMaterialMeanLayers: capture.material.meanLayers, priorMaterialMaxLayers: capture.material.maxLayers,
        priorMaterialLayerHistogram: capture.material.layerHistogram,
        resetReason, resetWitness,
        stabilityChain: chain });
      emitted = true;
    }
    previous = obs;
  }
  return events;
}

function validateEvents(events) {
  const independentJaccard = (left, right) => {
    const leftSet = new Set(left), rightSet = new Set(right);
    let intersection = 0;
    for (const cell of leftSet) if (rightSet.has(cell)) intersection++;
    const union = new Set([...leftSet, ...rightSet]).size;
    return union ? intersection / union : 1;
  };
  const intervals = new Set();
  for (const event of events) {
    assert.ok(!intervals.has(event.intervalId), 'only one first-maturation event per stability interval');
    intervals.add(event.intervalId);
    const chain = event.stabilityChain;
    assert.ok(chain.length >= 2, '20 second maturation has a multi-observation chain');
    assert.equal(chain[0].anchorIndex, event.stabilityStartAnchor, 'event chain starts at interval start');
    assert.equal(chain[0].timeMs, event.stabilityStartTimeMs, 'saved start timestamp retained');
    assert.equal(chain.at(-1).anchorIndex, event.anchorIndex, 'event chain ends at maturity boundary');
    assert.equal(chain.at(-1).timeMs, event.timeMs, 'event chain ends at exact maturity time');
    for (let i = 1; i < chain.length; i++) {
      assert.equal(chain[i].anchorIndex, chain[i - 1].anchorIndex + 1, 'maturation chain has no missing saved boundary');
      const recomputed = independentJaccard(chain[i - 1].cells, chain[i].cells);
      assert.ok(recomputed >= X_SIMILARITY, 'every adjacent X pair in emitted chain meets .60');
      assert.equal(recomputed, jaccard(chain[i - 1].cells, chain[i].cells), 'independent Jaccard arithmetic agrees');
    }
    assert.ok(event.timeMs - event.stabilityStartTimeMs >= PERSISTENCE_MS, 'actual elapsed time reaches 20 seconds');
    assert.equal(event.trackAgeAtMaturationMs, event.timeMs - event.trackStartTimeMs, 'track age uses actual saved timestamps');
    assert.ok(chain.at(-2).timeMs - event.stabilityStartTimeMs < PERSISTENCE_MS,
      'event is emitted at the first saved boundary crossing 20 seconds');
    assert.equal(cellSha(event.xCells), event.xSha256, 'event X membership hash');
    assert.deepEqual(event.xCells, chain.at(-1).cells, 'event X equals the maturity-boundary capture');
    if (event.resetWitness) {
      if (event.resetWitness.nextAnchorGap === 1) assert.ok(event.resetWitness.xJaccard < X_SIMILARITY,
        'similarity reset witness is truly below .60');
      else assert.ok(event.resetWitness.nextAnchorGap > 1, 'gap reset witness is an actual observation gap');
    } else assert.equal(event.resetReason, 'track-start', 'only track start has no reset witness');
    if (event.resetReason === 'x-similarity-below-0.60') assert.ok(event.resetWitness?.xJaccard < X_SIMILARITY,
      'event interval begins after a real similarity break');
    if (event.resetReason === 'anchor-gap') assert.ok(event.resetWitness?.nextAnchorGap > 1,
      'event interval begins after a real track observation gap');
  }
  return { emittedEventCount: events.length, uniqueIntervals: intervals.size, allChainsValid: true };
}

function nearestEvent(event, opposite) {
  if (!opposite.length) return null;
  return [...opposite].sort((a, b) => Math.abs(a.timeMs - event.timeMs) - Math.abs(b.timeMs - event.timeMs)
    || a.timeMs - b.timeMs || a.eventId.localeCompare(b.eventId))[0];
}

function pairEvents(b, c, seed) {
  const pairs = [];
  for (const left of b) for (const right of c) {
    const lagMs = right.timeMs - left.timeMs;
    const overlap = jaccard(left.xCells, right.xCells);
    const dx = left.center.x - right.center.x, dy = left.center.y - right.center.y;
    pairs.push({ seed, bEventId: left.eventId, cEventId: right.eventId, bTimeMs: left.timeMs,
      cTimeMs: right.timeMs, bAnchorIndex: left.anchorIndex, cAnchorIndex: right.anchorIndex,
      lagMs, absLagMs: Math.abs(lagMs), sameAnalysisBoundary: left.anchorIndex === right.anchorIndex,
      centerDistance: Math.hypot(dx, dy), xJaccard: overlap,
      xRelation: overlap === 1 ? 'same-X' : overlap === 0 ? 'disjoint-X' : 'partial-X-overlap',
      sameFComponent: left.anchorIndex === right.anchorIndex ? left.component === right.component : null,
      bXSha256: left.xSha256, cXSha256: right.xSha256 });
  }
  return pairs;
}

function eventTiming(event, otherEvents) {
  const nearest = nearestEvent(event, otherEvents);
  const absLagMs = nearest ? Math.abs(nearest.timeMs - event.timeMs) : Infinity;
  return { eventId: event.eventId, seed: event.seed, channel: event.channel, timeMs: event.timeMs,
    anchorIndex: event.anchorIndex, nearestOppositeEventId: nearest?.eventId ?? null,
    nearestOppositeTimeMs: nearest?.timeMs ?? null,
    signedCBLagMs: nearest ? (event.channel === 'B' ? nearest.timeMs - event.timeMs : event.timeMs - nearest.timeMs) : null,
    absLagMs: Number.isFinite(absLagMs) ? absLagMs : null,
    withinWindows: Object.fromEntries(WINDOWS_MS.map(windowMs => [windowMs, absLagMs <= windowMs])) };
}

function exclusivePeriods(events, timings) {
  const byId = new Map(timings.map(row => [row.eventId, row]));
  const lonely = events.filter(event => (byId.get(event.eventId)?.absLagMs ?? Infinity) > 20_000).sort(sortEvent);
  const periods = [];
  for (const event of lonely) {
    const current = periods.at(-1);
    if (!current || current.seed !== event.seed || event.timeMs - current.endTimeMs > 20_000) {
      periods.push({ seed: event.seed, channel: event.channel, startTimeMs: event.timeMs,
        endTimeMs: event.timeMs, eventIds: [event.eventId] });
    } else { current.endTimeMs = event.timeMs; current.eventIds.push(event.eventId); }
  }
  return periods.map(period => ({ ...period, durationMs: period.endTimeMs - period.startTimeMs,
    eventCount: period.eventIds.length }));
}

function virtualLedger(seed, events, finalMaterialLayers) {
  const ordered = [...events].sort(sortEvent), byCell = new Map();
  for (const event of ordered) for (const cell of event.xCells) {
    if (!byCell.has(cell)) byCell.set(cell, []);
    byCell.get(cell).push({ eventId: event.eventId, channel: event.channel, timeMs: event.timeMs,
      xSha256: event.xSha256 });
  }
  const provenanceCounts = {}, layerCountHistogram = Array(CELLS).fill(0);
  let totalLayerCellCount = 0, bLayerCellCount = 0, cLayerCellCount = 0, mixedCells = 0, mixedLayerCellCount = 0;
  let bOnly = 0, cOnly = 0, both = 0, bToC = 0, cToB = 0, tieAdjacent = 0, alternating = 0;
  const cellRows = [];
  for (let cell = 0; cell < CELLS; cell++) {
    const layers = byCell.get(cell) || [], channels = layers.map(layer => layer.channel);
    layerCountHistogram[layers.length]++;
    if (!layers.length) continue;
    totalLayerCellCount += layers.length;
    for (const channel of channels) channel === 'B' ? bLayerCellCount++ : cLayerCellCount++;
    const hasB = channels.includes('B'), hasC = channels.includes('C');
    if (hasB && hasC) { both++; mixedCells++; mixedLayerCellCount += layers.length; }
    else if (hasB) bOnly++;
    else cOnly++;
    const sequence = channels.join(','); provenanceCounts[sequence] = (provenanceCounts[sequence] || 0) + 1;
    for (let i = 1; i < layers.length; i++) {
      if (layers[i].timeMs === layers[i - 1].timeMs) { tieAdjacent++; continue; }
      if (channels[i - 1] === 'B' && channels[i] === 'C') bToC++;
      if (channels[i - 1] === 'C' && channels[i] === 'B') cToB++;
    }
    if (layers.length >= 3 && layers.every((row, i) => i === 0 || (row.channel !== layers[i - 1].channel
      && row.timeMs !== layers[i - 1].timeMs))) alternating++;
    cellRows.push({ cell, x: point(cell).x, y: point(cell).y, channels,
      provenanceSequence: channels.join(','), layers });
  }
  const bySeedEvents = ordered;
  let exactDuplicateStrict = 0, exactDuplicateTie = 0; const duplicatePairs = [];
  for (let i = 1; i < bySeedEvents.length; i++) if (bySeedEvents[i].xSha256 === bySeedEvents[i - 1].xSha256) {
    const tie = bySeedEvents[i].timeMs === bySeedEvents[i - 1].timeMs;
    if (tie) exactDuplicateTie++; else exactDuplicateStrict++;
    duplicatePairs.push({ first: bySeedEvents[i - 1].eventId, second: bySeedEvents[i].eventId,
      sameTimestamp: tie, timeMs: bySeedEvents[i].timeMs, xSha256: bySeedEvents[i].xSha256 });
  }
  const virtualUnion = new Set(cellRows.map(row => row.cell));
  const actualSet = new Set(); for (let cell = 0; cell < CELLS; cell++) if (finalMaterialLayers[cell] > 0) actualSet.add(cell);
  let unionOverlap = 0; for (const cell of virtualUnion) unionOverlap += Number(actualSet.has(cell));
  const virtualActual = { virtualUnionCells: virtualUnion.size, finalActualMaterialCells: actualSet.size,
    sharedCells: unionOverlap, virtualOnlyCells: virtualUnion.size - unionOverlap,
    actualOnlyCells: actualSet.size - unionOverlap,
    jaccard: (virtualUnion.size + actualSet.size - unionOverlap)
      ? unionOverlap / (virtualUnion.size + actualSet.size - unionOverlap) : 1 };
  return { seed, eventOrder: 'time ascending; exact ties report B before C, then eventId; tie order has no physical layer causality',
    orderedEventIds: ordered.map(event => event.eventId), eventLayerCount: ordered.length,
    bOnlyCoveredCells: bOnly, cOnlyCoveredCells: cOnly, cellsEverTouchedByBoth: both,
    unionCoverageCells: virtualUnion.size, totalVirtualLayerCellCount: totalLayerCellCount,
    bLayerCellIncidences: bLayerCellCount, cLayerCellIncidences: cLayerCellCount,
    mixedProvenanceCells: mixedCells, mixedProvenanceLayerCellIncidences: mixedLayerCellCount,
    layerCountHistogram: Object.fromEntries(layerCountHistogram.map((count, layers) => [layers, count])
      .filter(([layers, count]) => layers === 0 || count > 0)),
    provenanceSequenceCellCounts: Object.fromEntries(Object.entries(provenanceCounts).sort((a, b) => a[0].localeCompare(b[0]))),
    strictTimeBToCAdjacentTransitions: bToC, strictTimeCToBAdjacentTransitions: cToB,
    exactTieAdjacentPairsNotGivenCausalOrder: tieAdjacent, alternatingStrictTimeCells: alternating,
    exactDuplicateConsecutiveX: { distinctTime: exactDuplicateStrict, exactTimestampTie: exactDuplicateTie, pairs: duplicatePairs },
    virtualUnionComparedWithFinalActualMaterial: virtualActual, cells: cellRows };
}

function distinctTimeOverlap(events) {
  const postings = new Map();
  for (let i = 0; i < events.length; i++) for (const cell of events[i].xCells) {
    if (!postings.has(cell)) postings.set(cell, []);
    postings.get(cell).push(i);
  }
  const common = new Map();
  for (const posting of postings.values()) for (let i = 0; i < posting.length; i++) for (let j = i + 1; j < posting.length; j++) {
    const left = posting[i], right = posting[j];
    if (events[left].timeMs === events[right].timeMs) continue;
    const key = `${left}:${right}`; common.set(key, (common.get(key) || 0) + 1);
  }
  const groups = { 'B-B': [], 'B-C': [], 'C-C': [] };
  let pairCounts = { 'B-B': 0, 'B-C': 0, 'C-C': 0 };
  const group = (a, b) => a === b ? `${a}-${b}` : 'B-C';
  for (let i = 0; i < events.length; i++) for (let j = i + 1; j < events.length; j++) {
    if (events[i].timeMs === events[j].timeMs) continue;
    pairCounts[group(events[i].channel, events[j].channel)]++;
  }
  for (const [key, intersection] of common) {
    const [i, j] = key.split(':').map(Number), left = events[i], right = events[j];
    const g = group(left.channel, right.channel), union = left.xCells.length + right.xCells.length - intersection;
    groups[g].push(intersection / union);
  }
  return Object.fromEntries(Object.keys(groups).map(name => [name, {
    distinctTimePairCount: pairCounts[name], overlappingPairCount: groups[name].length,
    disjointPairCount: pairCounts[name] - groups[name].length,
    overlapJaccard: distribution(groups[name]),
    exactSameXCount: groups[name].filter(value => value === 1).length,
    partialOverlapCount: groups[name].filter(value => value > 0 && value < 1).length
  }]));
}

function validateLedger(events, ledger, finalMaterialLayers) {
  const rebuilt = new Map();
  for (const event of [...events].sort(sortEvent)) for (const cell of event.xCells) {
    if (!rebuilt.has(cell)) rebuilt.set(cell, []);
    rebuilt.get(cell).push(`${event.channel}:${event.timeMs}:${event.eventId}`);
  }
  assert.equal(ledger.cells.length, rebuilt.size, 'virtual ledger coverage independently rebuilt');
  for (const row of ledger.cells) {
    const expected = rebuilt.get(row.cell);
    assert.ok(expected, 'ledger cell occurs in event X');
    assert.deepEqual(row.layers.map(layer => `${layer.channel}:${layer.timeMs}:${layer.eventId}`), expected,
      'per-cell provenance sequence independently rebuilt');
  }
  const histogram = Array(CELLS).fill(0);
  for (let cell = 0; cell < CELLS; cell++) histogram[rebuilt.get(cell)?.length || 0]++;
  assert.deepEqual(ledger.layerCountHistogram, Object.fromEntries(histogram.map((count, index) => [index, count])
    .filter(([index, count]) => index === 0 || count > 0)), 'virtual layer-count histogram independently rebuilt');
  let actualCoverage = 0;
  for (let cell = 0; cell < CELLS; cell++) actualCoverage += Number(finalMaterialLayers[cell] > 0);
  assert.equal(ledger.virtualUnionComparedWithFinalActualMaterial.finalActualMaterialCells, actualCoverage,
    'final material coverage comes from frozen production layer map');
  return { cellsRebuilt: rebuilt.size, orderedSequencesMatch: true, layerHistogramMatches: true };
}

function seedSummary(seed, events, timing, pairs, ledger, eventValidation) {
  const byChannel = Object.fromEntries(['B', 'C'].map(channel => {
    const list = events.filter(row => row.channel === channel), timed = timing.filter(row => row.channel === channel);
    const nearest = timed.map(row => row.absLagMs).filter(Number.isFinite);
    const channelPairs = pairs.filter(row => row.xRelation && row.absLagMs <= 20_000);
    return [channel, { eventCount: list.length, eventTimesSeconds: list.map(row => row.timeMs / 1000),
      trackAgeAtMaturationSeconds: distribution(list.map(row => row.trackAgeAtMaturationMs / 1000)),
      stabilityElapsedSeconds: distribution(list.map(row => row.stableElapsedMs / 1000)),
      xNodeCount: distribution(list.map(row => row.xNodeCount)),
      priorActualMaterialOverlap: distribution(list.map(row => row.priorMaterialOverlap)),
      entryVsNonEntry: { entry: list.filter(row => row.entryClass === 'entry').length,
        nonEntry: list.filter(row => row.entryClass === 'non-entry').length },
      nearestOppositeLagSeconds: distribution(nearest.map(value => value / 1000)),
      withinDescriptiveWindows: Object.fromEntries(WINDOWS_MS.map(windowMs => [windowMs,
        timed.filter(row => row.absLagMs !== null && row.absLagMs <= windowMs).length])),
      nearbyPairXRelationsWithin20s: { same: channelPairs.filter(row => row.xRelation === 'same-X').length,
        disjoint: channelPairs.filter(row => row.xRelation === 'disjoint-X').length,
        partial: channelPairs.filter(row => row.xRelation === 'partial-X-overlap').length } }];
  }));
  return { seed, eventValidation, channels: byChannel, exactSameBoundaryPairCount: pairs.filter(row => row.sameAnalysisBoundary).length,
    crossPairsWithin20Seconds: pairs.filter(row => row.absLagMs <= 20_000).length,
    virtualLedger: { bOnlyCoveredCells: ledger.bOnlyCoveredCells, cOnlyCoveredCells: ledger.cOnlyCoveredCells,
      cellsEverTouchedByBoth: ledger.cellsEverTouchedByBoth, unionCoverageCells: ledger.unionCoverageCells,
      totalVirtualLayerCellCount: ledger.totalVirtualLayerCellCount,
      mixedProvenanceCells: ledger.mixedProvenanceCells,
      strictTimeBToCAdjacentTransitions: ledger.strictTimeBToCAdjacentTransitions,
      strictTimeCToBAdjacentTransitions: ledger.strictTimeCToBAdjacentTransitions,
      exactDuplicateConsecutiveX: ledger.exactDuplicateConsecutiveX,
      virtualUnionComparedWithFinalActualMaterial: ledger.virtualUnionComparedWithFinalActualMaterial } };
}

function selectCases(eventsBySeed, pairRows, timingRows, ledgers) {
  const events = Object.values(eventsBySeed).flat().sort(sortEvent);
  const pairs = pairRows;
  const tieBreak = (a, b) => a.seed.localeCompare(b.seed) || a.bTimeMs - b.bTimeMs || a.cTimeMs - b.cTimeMs
    || a.bEventId.localeCompare(b.bEventId) || a.cEventId.localeCompare(b.cEventId);
  const exactSame = pairs.filter(row => row.sameAnalysisBoundary && row.xJaccard === 1)
    .sort((a, b) => a.bTimeMs - b.bTimeMs || tieBreak(a, b))[0] || null;
  const disjointClosest = pairs.filter(row => row.xJaccard === 0)
    .sort((a, b) => a.absLagMs - b.absLagMs || tieBreak(a, b))[0] || null;
  const bThenC = pairs.filter(row => row.lagMs > 0 && row.xJaccard > 0)
    .sort((a, b) => b.xJaccard - a.xJaccard || a.lagMs - b.lagMs || tieBreak(a, b))[0] || null;
  const cThenB = pairs.filter(row => row.lagMs < 0 && row.xJaccard > 0)
    .sort((a, b) => b.xJaccard - a.xJaccard || a.absLagMs - b.absLagMs || tieBreak(a, b))[0] || null;
  const byChannelPeriods = {};
  for (const channel of ['B', 'C']) {
    const rows = timingRows.filter(row => row.channel === channel);
    const channelEvents = events.filter(row => row.channel === channel);
    byChannelPeriods[channel] = exclusivePeriods(channelEvents, rows).sort((a, b) => b.durationMs - a.durationMs
      || b.eventCount - a.eventCount || a.startTimeMs - b.startTimeMs || a.seed.localeCompare(b.seed))[0] || null;
  }
  const periodEventIds = period => {
    if (!period) return [];
    const rows = period.eventIds.map(id => events.find(row => row.eventId === id));
    if (rows.length <= 3) return rows.map(row => row.eventId);
    return [rows[0], rows[Math.floor((rows.length - 1) / 2)], rows.at(-1)].map(row => row.eventId);
  };
  let richest = null;
  for (const ledger of Object.values(ledgers)) for (const row of ledger.cells) {
    if (!row.channels.includes('B') || !row.channels.includes('C')) continue;
    const candidate = { seed: ledger.seed, cell: row.cell, x: row.x, y: row.y,
      layerCount: row.layers.length, provenanceSequence: row.provenanceSequence, eventIds: row.layers.map(layer => layer.eventId) };
    if (!richest || candidate.layerCount > richest.layerCount
      || (candidate.layerCount === richest.layerCount && (candidate.cell < richest.cell
        || (candidate.cell === richest.cell && candidate.seed.localeCompare(richest.seed) < 0)))) richest = candidate;
  }
  const cases = [
    { id: 'exact-same-time-same-X', criterion: 'earliest exact same analysis boundary and identical X cell set', pair: exactSame },
    { id: 'closest-time-disjoint-X', criterion: 'minimum absolute time lag among disjoint B/C X pairs; tie seed/time/eventId', pair: disjointClosest },
    { id: 'B-then-C-overlapping-X', criterion: 'B before C; maximum positive X Jaccard, then shortest lag', pair: bThenC },
    { id: 'C-then-B-overlapping-X', criterion: 'C before B; maximum positive X Jaccard, then shortest lag', pair: cThenB },
    { id: 'longest-B-only-interval', criterion: 'longest cluster of B events whose nearest C event is >20 s away; descriptive 20 s window',
      period: byChannelPeriods.B, eventIds: periodEventIds(byChannelPeriods.B) },
    { id: 'longest-C-only-interval', criterion: 'longest cluster of C events whose nearest B event is >20 s away; descriptive 20 s window',
      period: byChannelPeriods.C, eventIds: periodEventIds(byChannelPeriods.C) },
    { id: 'richest-mixed-provenance-cell', criterion: 'most B/C layers at one mixed-provenance cell; tie lower row-major cell then seed', cell: richest }
  ];
  const eventById = new Map(events.map(row => [row.eventId, row]));
  for (const item of cases) {
    let ids = item.pair ? [item.pair.bEventId, item.pair.cEventId] : item.eventIds || item.cell?.eventIds || [];
    if (item.id === 'richest-mixed-provenance-cell') {
      const layers = item.cell?.eventIds.map(id => eventById.get(id)).filter(Boolean) || [];
      ids = ['B', 'C'].map(channel => layers.filter(event => event.channel === channel).at(-1)?.eventId).filter(Boolean);
    }
    item.events = [...new Set(ids)].map(id => eventById.get(id)).filter(Boolean).map(row => ({
      eventId: row.eventId, seed: row.seed, channel: row.channel, anchorIndex: row.anchorIndex,
      timeMs: row.timeMs, centerIndex: row.centerIndex, xSha256: row.xSha256,
      xNodeCount: row.xNodeCount, priorMaterialOverlap: row.priorMaterialOverlap,
      centerCellProvenance: null
    }));
    if (!item.pair && !item.cell && !item.period) item.status = 'none';
    else item.status = item.events.length ? 'selected' : 'none';
  }
  for (const item of cases) for (const ref of item.events) {
    const row = eventById.get(ref.eventId), ledger = ledgers[row.seed];
    const cellRow = ledger.cells.find(cell => cell.cell === row.centerIndex);
    ref.centerCellProvenance = cellRow ? cellRow.layers.filter(layer => layer.timeMs <= row.timeMs)
      .map(layer => layer.channel).join(',') : '';
  }
  return { schema: 'ant-bc-dual-material-objective-cases-v1', rules: {
    sameTime: 'same saved analysis anchor index; identical X means exact sorted cell-set equality',
    disjoint: 'Jaccard exactly zero; closest absolute event-time lag, deterministic ties',
    overlapSequence: 'strict B-before-C or C-before-B and positive Jaccard; maximum available Jaccard without a tuned cutoff',
    channelOnly: 'nearest opposite event farther than the descriptive 20 s reporting window; longest event cluster, ties by duration/count/start/seed',
    mixedCell: 'maximum virtual B/C layer count at a cell containing both provenance channels; tie lower row-major cell then seed',
    absentCategory: 'reported none, with no post-hoc replacement'
  }, cases };
}

function temporalAndSpatial(seed, events) {
  const b = events.filter(row => row.channel === 'B'), c = events.filter(row => row.channel === 'C');
  const pairs = pairEvents(b, c, seed), timings = [
    ...b.map(event => eventTiming(event, c)), ...c.map(event => eventTiming(event, b))
  ].sort((a, b) => a.timeMs - b.timeMs || a.channel.localeCompare(b.channel) || a.eventId.localeCompare(b.eventId));
  const sameBoundary = pairs.filter(row => row.sameAnalysisBoundary);
  const windows = Object.fromEntries(WINDOWS_MS.map(windowMs => [windowMs, {
    pairCount: pairs.filter(row => row.absLagMs <= windowMs).length,
    sameX: pairs.filter(row => row.absLagMs <= windowMs && row.xRelation === 'same-X').length,
    disjointX: pairs.filter(row => row.absLagMs <= windowMs && row.xRelation === 'disjoint-X').length,
    partialX: pairs.filter(row => row.absLagMs <= windowMs && row.xRelation === 'partial-X-overlap').length,
    centerDistance: distribution(pairs.filter(row => row.absLagMs <= windowMs).map(row => row.centerDistance)),
    xJaccard: distribution(pairs.filter(row => row.absLagMs <= windowMs).map(row => row.xJaccard))
  }]));
  const nearestSigned = timings.map(row => row.signedCBLagMs).filter(Number.isFinite).map(value => value / 1000);
  const objectivePairCandidates = [
    pairs.filter(row => row.sameAnalysisBoundary && row.xJaccard === 1)
      .sort((a, b) => a.bTimeMs - b.bTimeMs || a.bEventId.localeCompare(b.bEventId)
        || a.cEventId.localeCompare(b.cEventId))[0],
    pairs.filter(row => row.xJaccard === 0)
      .sort((a, b) => a.absLagMs - b.absLagMs || a.bTimeMs - b.bTimeMs || a.cTimeMs - b.cTimeMs
        || a.bEventId.localeCompare(b.bEventId) || a.cEventId.localeCompare(b.cEventId))[0],
    pairs.filter(row => row.lagMs > 0 && row.xJaccard > 0)
      .sort((a, b) => b.xJaccard - a.xJaccard || a.lagMs - b.lagMs
        || a.bTimeMs - b.bTimeMs || a.bEventId.localeCompare(b.bEventId))[0],
    pairs.filter(row => row.lagMs < 0 && row.xJaccard > 0)
      .sort((a, b) => b.xJaccard - a.xJaccard || a.absLagMs - b.absLagMs
        || a.bTimeMs - b.bTimeMs || a.bEventId.localeCompare(b.bEventId))[0]
  ].filter(Boolean);
  return { seed, eventCounts: { B: b.length, C: c.length },
    exactSameAnalysisBoundaryPairs: sameBoundary,
    nearestOppositeEventPerEvent: timings,
    nearestOppositeSignedCBLagSeconds: distribution(nearestSigned),
    nearestOrdering: { BThenC: nearestSigned.filter(value => value > 0).length,
      CThenB: nearestSigned.filter(value => value < 0).length, exactTie: nearestSigned.filter(value => value === 0).length },
    pairWindows: windows,
    allCrossChannelPairCount: pairs.length,
    objectivePairCandidates,
    nearbyPairsWithin20Seconds: pairs.filter(row => row.absLagMs <= 20_000),
    distinctTimeXOverlapByChannelPair: distinctTimeOverlap(events),
    exclusivePeriods: { B: exclusivePeriods(b, timings.filter(row => row.channel === 'B')),
      C: exclusivePeriods(c, timings.filter(row => row.channel === 'C')) } };
}

async function writeGzipJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const bytes = gzipSync(jsonBytes(value), { level: 9, mtime: 0 });
  assert.equal(digest(bytes), digest(gzipSync(jsonBytes(value), { level: 9, mtime: 0 })), 'gzip artifact is deterministic');
  await writeFile(path, bytes); return { bytes: bytes.length, sha256: digest(bytes) };
}

async function listPackageFiles(directory, root = directory) {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  const rows = [];
  for (const entry of entries) {
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await listPackageFiles(full, root));
    else if (entry.isFile()) {
      const bytes = await readFile(full);
      rows.push({ file: full.slice(root.length + 1).replaceAll('\\', '/'), bytes: bytes.length, sha256: digest(bytes) });
    } else assert.fail(`unexpected non-file evidence entry: ${full}`);
  }
  return rows;
}

async function finalizePackage() {
  const files = (await listPackageFiles(EVIDENCE)).filter(row => !['manifest.json', 'SHA256SUMS.txt'].includes(row.file));
  const tools = {};
  for (const file of ['scripts/ant-bc-dual-material-shadow.js', 'scripts/ant-b-vs-c-author-review.js']) {
    tools[file] = digest(await readFile(resolve(ROOT, file)));
  }
  const manifest = { schema: 'ant-bc-dual-material-shadow-manifest-v1',
    branch: 'codex/ant-bc-dual-material-shadow-20261031',
    analysisBaseHead: (await gitMetadata()).head,
    productionAuthority: 'bc045dc3caa5954df633ecbee37fbabcb8224f30',
    sourcePacketCommit: 'da599d9f385f53d0bb24df3e737c5ed2e2eb6a23',
    responsibilityAnalysisCommit: 'a75b83ce5dbeece36d60d966b9d86fc85ddb5f54',
    authorReviewCommit: 'dfc29559860ec9e6312d2ea556041d956117bc5e', tools, files };
  await writeFile(resolve(EVIDENCE, 'manifest.json'), jsonBytes(manifest));
  const sums = [...files.map(row => [row.file, row.sha256]),
    ['manifest.json', digest(await readFile(resolve(EVIDENCE, 'manifest.json')))]].sort((a, b) => a[0].localeCompare(b[0]));
  await writeFile(resolve(EVIDENCE, 'SHA256SUMS.txt'), sums.map(([file, hash]) => `${hash}  ${file}`).join('\n') + '\n');
  return { fileCount: files.length, manifestSha256: digest(await readFile(resolve(EVIDENCE, 'manifest.json'))),
    sumsSha256: digest(await readFile(resolve(EVIDENCE, 'SHA256SUMS.txt'))) };
}

async function independentlyReviewArtifacts() {
  const seedResults = [];
  for (const seed of SEEDS) {
    const eventArtifact = JSON.parse(gunzipSync(await readFile(resolve(EVIDENCE, `analysis/events-${seed}.json.gz`))));
    const ledger = JSON.parse(gunzipSync(await readFile(resolve(EVIDENCE, `analysis/virtual-ledger-${seed}.json.gz`))));
    const intervals = new Set(), cells = new Map(); let checkedTransitions = 0, checkedCells = 0;
    for (const event of eventArtifact.events) {
      assert.ok(!intervals.has(event.intervalId), 'independent: one event per uninterrupted interval');
      intervals.add(event.intervalId);
      assert.equal(event.trackAgeAtMaturationMs, event.timeMs - event.trackStartTimeMs, 'independent: actual track age');
      assert.ok(event.timeMs - event.stabilityStartTimeMs >= PERSISTENCE_MS, 'independent: actual 20 second maturity');
      assert.equal(event.stableElapsedMs, event.timeMs - event.stabilityStartTimeMs, 'independent: actual stability elapsed time');
      assert.equal(event.stabilityChain[0].anchorIndex, event.stabilityStartAnchor, 'independent: stability chain starts at recorded anchor');
      assert.equal(event.stabilityChain[0].timeMs, event.stabilityStartTimeMs, 'independent: stability chain starts at recorded time');
      assert.ok(event.stabilityChain.at(-2).timeMs - event.stabilityStartTimeMs < PERSISTENCE_MS,
        'independent: first saved boundary crossing');
      assert.equal(event.stabilityChain.at(-1).timeMs, event.timeMs, 'independent: event timestamp is final chain sample');
      assert.deepEqual(event.stabilityChain.at(-1).cells, event.xCells, 'independent: event membership matches final sample');
      assert.equal(digest(Buffer.from(JSON.stringify(event.xCells))), event.xSha256, 'independent: event X hash');
      for (let i = 1; i < event.stabilityChain.length; i++) {
        const left = new Set(event.stabilityChain[i - 1].cells), right = new Set(event.stabilityChain[i].cells);
        let intersection = 0; for (const cell of left) if (right.has(cell)) intersection++;
        const denominator = new Set([...left, ...right]).size;
        assert.ok((denominator ? intersection / denominator : 1) >= X_SIMILARITY,
          'independent: each saved adjacent X passes exact .60 Jaccard');
        assert.equal(event.stabilityChain[i].anchorIndex, event.stabilityChain[i - 1].anchorIndex + 1,
          'independent: no missing saved anchor in maturation interval');
        checkedTransitions++;
      }
      for (const cell of event.xCells) {
        if (!cells.has(cell)) cells.set(cell, []);
        cells.get(cell).push({ eventId: event.eventId, channel: event.channel, timeMs: event.timeMs });
      }
    }
    const ordered = [...eventArtifact.events].sort((a, b) => a.timeMs - b.timeMs
      || (a.channel === b.channel ? 0 : a.channel === 'B' ? -1 : 1) || a.eventId.localeCompare(b.eventId));
    const canonical = new Map();
    for (const event of ordered) for (const cell of event.xCells) {
      if (!canonical.has(cell)) canonical.set(cell, []);
      canonical.get(cell).push({ eventId: event.eventId, channel: event.channel, timeMs: event.timeMs });
    }
    const rows = new Map(ledger.cells.map(row => [row.cell, row]));
    assert.equal(rows.size, canonical.size, 'independent: virtual ledger coverage');
    for (const [cell, expected] of canonical) {
      const row = rows.get(cell); assert.ok(row, 'independent: every touched cell exists');
      assert.deepEqual(row.layers.map(({ eventId, channel, timeMs }) => ({ eventId, channel, timeMs })), expected,
        'independent: per-cell virtual provenance sequence');
      checkedCells++;
    }
    const histogram = Array(CELLS).fill(0);
    for (let cell = 0; cell < CELLS; cell++) histogram[canonical.get(cell)?.length || 0]++;
    const expectedHistogram = Object.fromEntries(histogram.map((count, index) => [index, count])
      .filter(([index, count]) => index === 0 || count > 0));
    assert.deepEqual(ledger.layerCountHistogram, expectedHistogram, 'independent: layer count histogram including empty cells');
    const incidenceCount = eventArtifact.events.reduce((sum, event) => sum + event.xCells.length, 0);
    assert.equal(ledger.totalVirtualLayerCellCount, incidenceCount, 'independent: event layer-cell incidences');
    seedResults.push({ seed, events: eventArtifact.events.length, stabilityTransitions: checkedTransitions,
      touchedCells: checkedCells, exactPerCellOrder: true, layerHistogram: true,
      eventTimesAndTrackAges: true, intervalFirstCrossings: true });
  }
  return { schema: 'ant-bc-shadow-independent-artifact-review-v1',
    method: 'Reload emitted gzip event and ledger receipts; use fresh set-based Jaccard arithmetic and rebuild every cell event sequence from event X sets in time/B-before-C reporting order.',
    tieOrderInterpretation: 'Reporting order only; exact timestamp pairs do not establish top/bottom causality.', seeds: seedResults };
}

function virtualAtlasSvg(ledgers) {
  const seedRows = Object.values(ledgers), tile = 212, gutter = 20, left = 170, top = 76;
  const width = left + tile * 4 + gutter * 3 + 26, height = top + seedRows.length * (tile + 52) + 24;
  const labels = ['B-only cells', 'C-only cells', 'B + C cells', 'virtual layer count'];
  const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const pieces = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<style>text{font-family:Arial,sans-serif;fill:#17202b}.title{font-size:23px;font-weight:bold}.sub{font-size:12px;fill:#4d5965}.row{font-size:13px;font-weight:bold}.head{font-size:12px;font-weight:bold}</style>',
    `<rect width="100%" height="100%" fill="#fff"/><text x="20" y="30" class="title">Virtual dual-provenance stratigraphy</text>`,
    '<text x="20" y="52" class="sub">No shadow material enters production. Same fixed 96×96 world grid; B and C differ only by event provenance.</text>'];
  labels.forEach((label, col) => pieces.push(`<text x="${left + col * (tile + gutter)}" y="${top - 16}" class="head">${esc(label)}</text>`));
  for (let r = 0; r < seedRows.length; r++) {
    const ledger = seedRows[r], maps = [[], [], [], []];
    const byCell = new Map(ledger.cells.map(row => [row.cell, row]));
    for (let i = 0; i < CELLS; i++) {
      const row = byCell.get(i), b = row?.channels.includes('B'), c = row?.channels.includes('C');
      maps[0].push(b && !c ? 1 : 0); maps[1].push(c && !b ? 1 : 0); maps[2].push(b && c ? 1 : 0);
      maps[3].push(row?.layers.length || 0);
    }
    const y = top + r * (tile + 52);
    pieces.push(`<text x="20" y="${y + 16}" class="row">Seed ${esc(ledger.seed)}</text>`);
    maps.forEach((map, col) => {
      const x = left + col * (tile + gutter), size = tile / GRID;
      pieces.push(`<rect x="${x}" y="${y}" width="${tile}" height="${tile}" fill="#f7f8fa" stroke="#c9d0d8"/>`);
      for (let cell = 0; cell < CELLS; cell++) if (map[cell]) {
        const layer = map[cell], color = col === 0 ? '#007f73' : col === 1 ? '#c45522' : col === 2 ? '#70519a'
          : ['#f4f1eb', '#d6d0c4', '#b4a899', '#8d7e71', '#66574c'][Math.min(4, layer)];
        pieces.push(`<rect x="${x + (cell % GRID) * size}" y="${y + Math.floor(cell / GRID) * size}" width="${size + .08}" height="${size + .08}" fill="${color}"/>`);
      }
    });
    pieces.push(`<text x="20" y="${y + tile + 20}" class="sub">B-only ${ledger.bOnlyCoveredCells} · C-only ${ledger.cOnlyCoveredCells} · mixed ${ledger.cellsEverTouchedByBoth}</text>`);
  }
  pieces.push('</svg>'); return pieces.join('');
}

async function writeVirtualAtlas(page, ledgers) {
  const svg = Buffer.from(virtualAtlasSvg(ledgers));
  const file = resolve(EVIDENCE, 'visual/virtual-dual-stratigraphy-atlas.svg');
  await mkdir(dirname(file), { recursive: true }); await writeFile(file, svg);
  const svgRecord = { file: 'visual/virtual-dual-stratigraphy-atlas.svg', bytes: svg.length, sha256: digest(svg), deterministic: true };
  const svgData = 'data:image/svg+xml;base64,' + svg.toString('base64');
  const png = await page.evaluate(async source => {
    const image = new Image(); image.src = source; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0); return canvas.toDataURL('image/png').split(',')[1];
  }, svgData);
  const again = await page.evaluate(async source => {
    const image = new Image(); image.src = source; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0); return canvas.toDataURL('image/png').split(',')[1];
  }, svgData);
  const pngBytes = Buffer.from(png, 'base64'), pngAgain = Buffer.from(again, 'base64');
  assert.equal(digest(pngBytes), digest(pngAgain), 'virtual atlas PNG regeneration deterministic');
  const pngFile = resolve(EVIDENCE, 'visual/virtual-dual-stratigraphy-atlas.png');
  await writeFile(pngFile, pngBytes);
  return [svgRecord, { file: 'visual/virtual-dual-stratigraphy-atlas.png', bytes: pngBytes.length,
    sha256: digest(pngBytes), dimensions: { width: pngBytes.readUInt32BE(16), height: pngBytes.readUInt32BE(20) }, deterministic: true }];
}

function provenanceAt(ledger, cell, timeMs) {
  const row = ledger.cells.find(item => item.cell === cell);
  return row ? row.layers.filter(layer => layer.timeMs <= timeMs).map(layer => layer.channel).join(',') : '';
}

async function loadFrozenMaterialLayers(seed, indices) {
  const analysis = resolve(SOURCE, 'analysis');
  const meta = JSON.parse(gunzipSync(await readFile(resolve(analysis, `seed-${seed}.signals.json.gz`))));
  const chunks = new Map(indices.map(index => [Math.floor(index / 75), null]));
  for (const chunkIndex of chunks.keys()) {
    const file = meta.anchorsFiles[chunkIndex], bytes = await readFile(resolve(analysis, file));
    assert.equal(digest(bytes), meta.chunkHashes[file], `frozen material source chunk ${seed}/${file}`);
    const anchors = JSON.parse(gunzipSync(bytes)).anchors;
    for (const anchor of anchors) if (indices.includes(anchor.index)) {
      chunks.set(chunkIndex, chunks.get(chunkIndex) || new Map());
      chunks.get(chunkIndex).set(anchor.index, { timeMs: anchor.timeMs, tick: anchor.tick,
        materialLayers: Array.from(unpack(anchor.material.layers)) });
    }
  }
  return new Map([...chunks.values()].filter(Boolean).flatMap(map => [...map]));
}

async function reuseExactReviewFrames(requestedFrames, frameMeta) {
  const manifest = JSON.parse(await readFile(resolve(REVIEW, 'manifest.json'), 'utf8'));
  const existing = new Map(manifest.images.map(row => [`${row.seed}:${row.anchorIndex}`, row]));
  const reused = [], missing = [];
  for (const frame of requestedFrames) {
    const key = `${frame.seed}:${frame.anchorIndex}`, prior = existing.get(key);
    if (!prior) { missing.push(frame); continue; }
    const sourcePath = resolve(REVIEW, prior.file), bytes = await readFile(sourcePath);
    assert.equal(bytes.length, prior.bytes, 'existing review frame byte length');
    assert.equal(digest(bytes), prior.sha256, 'existing review frame hash');
    assert.equal(prior.deterministicRender, true, 'existing review frame deterministic renderer receipt');
    const name = `seed-${frame.seed}-anchor-${String(frame.anchorIndex).padStart(3, '0')}.png`;
    const relative = `visual/world-frames/${name}`, target = resolve(EVIDENCE, relative);
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
    frameMeta.set(key, { seed: frame.seed, anchorIndex: frame.anchorIndex, timeMs: prior.timeMs,
      worldFile: relative, worldSha256: prior.sha256, bytes: prior.bytes, antCount: prior.antCount });
    reused.push({ seed: frame.seed, anchorIndex: frame.anchorIndex, sourceFile: prior.file,
      worldFile: relative, timeMs: prior.timeMs, sha256: prior.sha256 });
  }
  for (const seed of SEEDS) {
    const seedFrames = reused.filter(frame => frame.seed === seed);
    if (!seedFrames.length) continue;
    const layers = await loadFrozenMaterialLayers(seed, seedFrames.map(frame => frame.anchorIndex));
    for (const frame of seedFrames) {
      const source = layers.get(frame.anchorIndex);
      assert.ok(source, 'frozen material map at reused frame');
      assert.equal(source.timeMs, frame.timeMs, 'reused native frame timestamp matches frozen structural input');
      frameMeta.get(`${seed}:${frame.anchorIndex}`).materialLayers = source.materialLayers;
    }
  }
  return { reused, missing };
}

async function renderObjectiveAtlas(page, cases, events, frameMeta, ledgers) {
  const eventById = new Map(events.map(event => [event.eventId, event])), rows = [], eventAssets = [];
  for (const item of cases.cases) {
    if (item.status === 'none') continue;
    const selected = item.events.map(ref => eventById.get(ref.eventId)).filter(Boolean);
    if (!selected.length) continue;
    const groups = new Map();
    for (const event of selected) {
      const key = `${event.seed}:${event.anchorIndex}`;
      if (!groups.has(key)) groups.set(key, { seed: event.seed, anchorIndex: event.anchorIndex, timeMs: event.timeMs, events: [] });
      groups.get(key).events.push(event);
    }
    for (const group of groups.values()) {
      const meta = frameMeta.get(`${group.seed}:${group.anchorIndex}`);
      assert.ok(meta, `native world frame available for objective event ${group.seed}/${group.anchorIndex}`);
      assert.equal(meta.timeMs, group.timeMs, 'native world frame and shadow event share the exact saved timestamp');
      const png = await readFile(resolve(EVIDENCE, meta.worldFile));
      const data = `data:image/png;base64,${png.toString('base64')}`;
      const labels = group.events.map(event => event.channel).join('+');
      const panels = [{ data, label: 'Native world · material on', caption: `${group.seed} · ${(group.timeMs / 1000).toFixed(3)} s · actual ants/material` }];
      for (const event of group.events.sort((a, b) => a.channel.localeCompare(b.channel))) {
        const ledger = ledgers[event.seed];
        const sequence = provenanceAt(ledger, event.centerIndex, event.timeMs) || 'none';
        const color = event.channel === 'B' ? '#007f73' : '#c45522';
        panels.push({ data, label: `${event.channel} episode X`, xCells: event.xCells, color,
          caption: `${event.eventId} · ${event.xNodeCount} nodes · prior material ${event.priorMaterialOverlap.toFixed(3)} · center history ${sequence}` });
        eventAssets.push({ caseId: item.id, eventId: event.eventId, seed: event.seed, anchorIndex: event.anchorIndex,
          timeMs: event.timeMs, worldFile: meta.worldFile, worldSha256: meta.worldSha256,
          xSha256: event.xSha256, xNodeCount: event.xNodeCount, priorMaterialOverlap: event.priorMaterialOverlap,
          centerCellProvenance: sequence });
      }
      panels.push({ data: null, label: 'Prior actual material · layer count', materialLayers: meta.materialLayers,
        materialMax: Math.max(1, ...meta.materialLayers), caption: 'Production material before this analysis boundary; fixed integer scale within frame' });
      const cellContext = item.cell ? ` · cell ${item.cell.cell}: ${item.cell.provenanceSequence}` : '';
      rows.push({ label: `${item.id} · ${item.criterion}${cellContext} · ${labels} · ${group.seed} / ${(group.timeMs / 1000).toFixed(3)} s`, panels });
    }
  }
  if (!rows.length) return { records: [], eventAssets };
  const output = resolve(EVIDENCE, 'visual/objective-case-atlas.png');
  const record = await review.writeComposite(page, { title: 'B/C shadow maturation · objective event cases',
    subtitle: 'Every panel uses the exact saved event boundary and native world frame. X outlines and prior production material are diagnostic only.',
    rows, tileW: 230, imageH: 230, labelH: 30, header: 64, gap: 10, margin: 16, rowLabel: true }, output);
  record.file = 'visual/objective-case-atlas.png';
  return { records: [record], eventAssets };
}

async function main() {
  await mkdir(resolve(EVIDENCE, 'analysis'), { recursive: true });
  await mkdir(resolve(EVIDENCE, 'visual'), { recursive: true });
  if (process.argv.includes('--finalize')) {
    console.log(JSON.stringify({ phase: 'evidence-manifest-finalized', ...await finalizePackage() }));
    return;
  }
  if (process.argv.includes('--verify-only')) {
    const independentReview = await independentlyReviewArtifacts();
    const validationPath = resolve(EVIDENCE, 'analysis/validation.json');
    const validation = JSON.parse(await readFile(validationPath, 'utf8'));
    validation.independentArtifactReview = independentReview;
    await writeFile(validationPath, jsonBytes(validation));
    console.log(JSON.stringify({ phase: 'independent-artifact-review-complete', seeds: independentReview.seeds }));
    return;
  }
  const provenance = await verifyInputs(), inputHashesBefore = { ...provenance.hashes };
  const summaryRows = [], allEvents = [], eventStreams = [], ledgers = {}, temporalRows = [], seedPairRows = [], seedValidations = [];
  const captureHashes = {};
  for (const seed of SEEDS) {
    const trackPath = resolve(BC, `analysis/track-observations-${seed}.json.gz`);
    const tracks = JSON.parse(gunzipSync(await readFile(trackPath)));
    assert.equal(tracks.seed, seed, 'frozen track packet seed');
    assert.equal(tracks.authority, provenance.productionAuthority, 'frozen track source authority');
    const { captures, timeByAnchor, opportunityManifestSha256, opportunityChunkHashes } = await loadCaptures(seed, tracks);
    const events = [];
    for (const track of tracks.channels) {
      assert.ok(track.channel === 'B' || track.channel === 'C', 'only registered B/C tracks');
      events.push(...trackEvents(seed, track, captures));
    }
    events.sort(sortEvent);
    const validation = validateEvents(events);
    assert.equal(timeByAnchor.size, 599, 'same 599 analysis timestamps used');
    const finalMaterialTrack = tracks.channels.find(track => track.observations.some(obs => obs.anchorIndex === 598));
    assert.ok(finalMaterialTrack, 'frozen track record reaches final anchor');
    const signalMeta = JSON.parse(gunzipSync(await readFile(resolve(SOURCE, `analysis/seed-${seed}.signals.json.gz`))));
    const finalSignalFile = signalMeta.anchorsFiles[Math.floor(598 / 75)];
    const finalSignalBytes = await readFile(resolve(SOURCE, 'analysis', finalSignalFile));
    assert.equal(digest(finalSignalBytes), signalMeta.chunkHashes[finalSignalFile], 'final frozen signal chunk hash');
    const finalSignalAnchor = JSON.parse(gunzipSync(finalSignalBytes)).anchors.find(anchor => anchor.index === 598);
    assert.ok(finalSignalAnchor, 'actual material map at final saved boundary');
    const finalLayers = unpack(finalSignalAnchor.material.layers);
    const ledger = virtualLedger(seed, events, finalLayers);
    const ledgerValidation = validateLedger(events, ledger, finalLayers);
    const temporal = temporalAndSpatial(seed, events);
    const eventPath = resolve(EVIDENCE, `analysis/events-${seed}.json.gz`);
    const eventArtifact = await writeGzipJson(eventPath, { schema: 'ant-bc-shadow-maturation-events-v1', seed,
      productionAuthority: provenance.productionAuthority, sourcePacketCommit: provenance.sourcePacketCommit,
      persistenceMs: PERSISTENCE_MS, xSimilarity: X_SIMILARITY,
      similarity: 'Exact cell-set Jaccard: sorted cell ids; intersection count / (|A|+|B|-intersection); reset only when < .60.',
      eventOrder: 'Actual saved timestamp ascending; exact timestamp ties B before C then eventId, reporting order only.', events });
    const ledgerArtifact = await writeGzipJson(resolve(EVIDENCE, `analysis/virtual-ledger-${seed}.json.gz`), ledger);
    const temporalArtifact = await writeGzipJson(resolve(EVIDENCE, `analysis/cross-channel-${seed}.json.gz`), temporal);
    summaryRows.push(seedSummary(seed, events, temporal.nearestOppositeEventPerEvent, temporal.nearbyPairsWithin20Seconds,
      ledger, { ...validation, ledgerValidation }));
    allEvents.push(...events); ledgers[seed] = ledger; temporalRows.push(temporal);
    seedPairRows.push(...temporal.objectivePairCandidates, ...temporal.nearbyPairsWithin20Seconds);
    eventStreams.push({ seed, file: `analysis/events-${seed}.json.gz`, ...eventArtifact,
      virtualLedgerFile: `analysis/virtual-ledger-${seed}.json.gz`, virtualLedgerBytes: ledgerArtifact.bytes,
      virtualLedgerSha256: ledgerArtifact.sha256, crossChannelFile: `analysis/cross-channel-${seed}.json.gz`,
      crossChannelBytes: temporalArtifact.bytes, crossChannelSha256: temporalArtifact.sha256 });
    captureHashes[seed] = { opportunityManifestSha256, opportunityChunksVerified: Object.keys(opportunityChunkHashes).length,
      uniqueReferencedCaptures: captures.size, frozenAnalysisBoundaries: timeByAnchor.size,
      captureReceiptSha256: digest(Buffer.from(JSON.stringify([...captures.values()].map(row => [row.anchorIndex, row.captureId, row.xSha256])))) };
    seedValidations.push({ seed, anchors: timeByAnchor.size, capturesResolved: captures.size, events: validation.emittedEventCount,
      xChainsValid: validation.allChainsValid, allCaptureReferencesExact: true, frozenOpportunityChunkHashesVerified: Object.keys(opportunityChunkHashes).length });
    console.log(JSON.stringify({ phase: 'seed-analysis-complete', seed, tracks: tracks.channels.length,
      captures: captures.size, events: { B: events.filter(row => row.channel === 'B').length,
        C: events.filter(row => row.channel === 'C').length } }));
  }
  const uniquePairRows = [...new Map(seedPairRows.map(row => [`${row.bEventId}|${row.cEventId}`, row])).values()];
  const objectiveCases = selectCases(Object.fromEntries(SEEDS.map(seed => [seed, allEvents.filter(event => event.seed === seed)])),
    uniquePairRows, temporalRows.flatMap(row => row.nearestOppositeEventPerEvent), ledgers);
  const objectiveJson = { ...objectiveCases,
    selectedCases: objectiveCases.cases.map(item => ({ id: item.id, status: item.status,
      criterion: item.criterion, pair: item.pair || null, period: item.period || null, cell: item.cell || null,
      events: item.events })) };
  await writeFile(resolve(EVIDENCE, 'analysis/objective-cases.json'), jsonBytes(objectiveJson));

  const finalHashCheck = {};
  for (const [file, hash] of Object.entries(inputHashesBefore)) {
    finalHashCheck[file] = digest(await readFile(resolve(ROOT, file)));
    assert.equal(finalHashCheck[file], hash, `frozen input unchanged: ${file}`);
  }
  for (const [file, expected] of Object.entries(provenance.hashes)) {
    assert.equal(digest(await readFile(resolve(ROOT, file))), expected, `frozen input remains unchanged: ${file}`);
  }

  const requestedFrames = new Map();
  for (const item of objectiveCases.cases) for (const event of item.events) {
    const key = `${event.seed}:${event.anchorIndex}`;
    if (!requestedFrames.has(key)) requestedFrames.set(key, { seed: event.seed, anchorIndex: event.anchorIndex });
  }
  const frameMeta = new Map(), replayResults = [], visualRecords = [];
  const frameReuse = await reuseExactReviewFrames([...requestedFrames.values()], frameMeta);
  const { server, browser, page, errors } = await review.makeBrowser();
  try {
    if (frameReuse.missing.length) {
      const sourceText = await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
      const thinning = review.productionThinning(sourceText);
      for (const seed of SEEDS.filter(seed => frameReuse.missing.some(row => row.seed === seed))) {
        const frames = frameReuse.missing.filter(row => row.seed === seed);
        replayResults.push(await review.replaySeed(seed, frames, thinning, page, frameMeta));
      }
    }
    assert.deepEqual(errors, [], 'native renderer reports no browser errors');
    visualRecords.push(...await writeVirtualAtlas(page, ledgers));
    const objectiveVisuals = await renderObjectiveAtlas(page, objectiveCases, allEvents, frameMeta, ledgers);
    visualRecords.push(...objectiveVisuals.records);
    await writeFile(resolve(EVIDENCE, 'analysis/objective-frame-receipts.json'), jsonBytes({
      schema: 'ant-bc-shadow-frame-receipts-v1', renderer: 'native AntRenderer 720x720, material on, pheromone overlay off',
      replayOnlyForMissingNativeFrames: true, replays: replayResults.map(({ elapsedSeconds, ...proof }) => proof),
      reusedFrames: frameReuse.reused, missingFramesReplayed: frameReuse.missing,
      frames: [...frameMeta.values()], selectedEventAssets: objectiveVisuals.eventAssets, browserErrors: errors
    }));
  } finally {
    await page.evaluate(() => window.__reviewRenderer?.destroy());
    await browser.close(); await server.close();
  }

  const totals = { eventCount: allEvents.length, B: allEvents.filter(row => row.channel === 'B').length,
    C: allEvents.filter(row => row.channel === 'C').length,
    exactSameTimeSameXPairs: temporalRows.reduce((sum, row) => sum
      + row.exactSameAnalysisBoundaryPairs.filter(pair => pair.xJaccard === 1).length, 0),
    exactSameTimeDifferentXPairs: temporalRows.reduce((sum, row) => sum
      + row.exactSameAnalysisBoundaryPairs.filter(pair => pair.xJaccard < 1).length, 0),
    nearestOppositeTimeMedianSeconds: distribution(temporalRows.flatMap(row => row.nearestOppositeSignedCBLagSeconds.count
      ? row.nearestOppositeEventPerEvent.map(item => item.absLagMs).filter(Number.isFinite).map(value => value / 1000) : [])).median,
    mixedVirtualCells: Object.values(ledgers).reduce((sum, row) => sum + row.cellsEverTouchedByBoth, 0),
    virtualLayerCellCount: Object.values(ledgers).reduce((sum, row) => sum + row.totalVirtualLayerCellCount, 0) };
  const replayProof = replayResults.map(({ elapsedSeconds, ...proof }) => proof);
  const summary = { schema: 'ant-bc-dual-material-shadow-summary-v1', authority: provenance,
    grammar: { B: 'TrailPlateBirth.chemicalMemory; no new amplitude threshold',
      C: 'SurfaceField.sample(), FOOT_CONTACT-written compaction; no new amplitude threshold',
      X: 'Registered X(n,F): 8-neighbor component of F intersect Euclidean disk radius .15',
      persistenceMs: PERSISTENCE_MS, xMaskSimilarityThreshold: X_SIMILARITY,
      operationOrder: 'Order track observations by actual timeMs then anchorIndex; begin/reset at track start, missing anchor, or exact mask-Jaccard < .60; continue at >= .60; emit one event at the first observation with current timeMs minus interval start >= 20000; a later event requires a new reset and interval.',
      similarityImplementation: 'Sorted unique row-major X cell ids; intersection cardinality divided by union cardinality. No path similarity fallback. X is nonempty by registered capture.',
      omittedProductionRepeatGates: ['10 s global birth gap', '90 s same-corridor refractory', '+30 new FOOT_CONTACT repeat', '256 Plate ceiling'],
      noShadowFeedback: true }, totals, seeds: summaryRows,
    temporalSpatial: temporalRows, eventArtifacts: eventStreams, captureReceipts: captureHashes,
    validation: { frozenInputsUnchanged: true, threeSeeds599Boundaries: seedValidations,
      actualElapsedTime: true, independentEventChainCheck: true,
      independentVirtualCellReconstruction: true, observerAnalysisRngCalls: 0,
      frameReplayResults: replayProof, productionSourceDiff: 'empty against bc045dc3caa5954df633ecbee37fbabcb8224f30' },
    limits: ['Virtual layers are provenance ledger entries only and do not enter MaterialStratigraphy.',
      'B and C receive identical temporal/X-stability grammar; no physical/audio property differentiation is tested.',
      'Exact timestamp tie order is for reproducible reporting only, not causal top/bottom ordering.',
      'No actual Plate births, selection competition, production feedback, Residence, or parameter tuning are introduced.'] };
  await writeFile(resolve(EVIDENCE, 'analysis/summary.json'), jsonBytes(summary));
  const outputFiles = [];
  for (const relative of ['analysis/summary.json', 'analysis/objective-cases.json', 'analysis/objective-frame-receipts.json',
    ...eventStreams.flatMap(row => [row.file, row.virtualLedgerFile, row.crossChannelFile]),
    'visual/virtual-dual-stratigraphy-atlas.svg', 'visual/virtual-dual-stratigraphy-atlas.png', 'visual/objective-case-atlas.png']) {
    try { const bytes = await readFile(resolve(EVIDENCE, relative)); outputFiles.push({ file: relative, bytes: bytes.length, sha256: digest(bytes) }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await writeFile(resolve(EVIDENCE, 'analysis/validation.json'), jsonBytes({
    schema: 'ant-bc-dual-material-shadow-validation-v1', frozenSourceHashes: provenance.hashes,
    sourcePacketManifestSha256: provenance.sourceManifestSha256, bvcAnalysisManifestSha256: provenance.bcManifestSha256,
    authorReviewManifestSha256: provenance.authorReviewManifestSha256, productionAuthority: provenance.productionAuthority,
    sourcePacketCommit: provenance.sourcePacketCommit, responsibilityAnalysisCommit: provenance.responsibilityAnalysisCommit,
    sameThreeSeeds599Anchors: seedValidations, frozenOpportunityXReceiptsReused: true,
    exactActualTimestamps: true, eventMaturationChainsIndependentlyRecomputed: true,
    virtualCellProvenanceIndependentlyReconstructedFromEventX: true, observerRngCalls: 0,
    replayValidation: replayProof, frozenInputHashesBeforeAfterMatch: true,
    srcStaticDiff: 'empty', objectiveSelectionDeterministic: true,
    generatedFiles: outputFiles }));
  console.log(JSON.stringify({ phase: 'analysis-complete', totals, cases: objectiveCases.cases.map(row => ({ id: row.id, status: row.status,
    events: row.events.map(event => event.eventId) })), replay: replayResults.map(row => ({ seed: row.seed, anchors: row.anchorsCompared,
      frames: row.selectedFrames })), evidence: EVIDENCE }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
