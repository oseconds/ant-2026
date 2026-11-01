import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit');
const BC = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-episode-evidence-b-vs-c');
const DUAL = resolve(ROOT, 'docs/ant/evidence/2026-10-31-bc-dual-material-shadow');
const OUT = resolve(ROOT, 'docs/ant/evidence/2026-11-01-bc-commit-slot-ambiguity-audit');
const SEEDS = ['20261005', '20261006', '20261007'];
const GRID = 96, CELLS = GRID * GRID, PERSISTENCE_MS = 20_000, X_SIMILARITY = .60, SLOT_GAP_MS = 10_000;
const PRODUCTION_AUTHORITY = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const SOURCE_COMMIT = 'da599d9f385f53d0bb24df3e737c5ed2e2eb6a23';
const BC_COMMIT = 'a75b83ce5dbeece36d60d966b9d86fc85ddb5f54';
const DUAL_COMMIT = '248da39a4d7d342022a27a5b9ec183cad9b160e2';
const REVIEW_COMMIT = 'dfc29559860ec9e6312d2ea556041d956117bc5e';
const BASE_HEAD = 'a80a613be68ede94fce89008a076fbe582178f41';
const BRANCH = 'codex/ant-bc-commit-slot-ambiguity-audit-20261101';
const keyOf = (anchor, captureId) => `${anchor}:${captureId}`;
const sha = value => createHash('sha256').update(value).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const point = index => ({ x: (index % GRID) / (GRID - 1), y: Math.floor(index / GRID) / (GRID - 1) });
const eventSort = (a, b) => a.timeMs - b.timeMs || (a.channel === b.channel ? 0 : a.channel === 'B' ? -1 : 1)
  || a.eventId.localeCompare(b.eventId);

function jaccard(left, right) {
  const set = new Set(right); let intersection = 0;
  for (const cell of left) intersection += Number(set.has(cell));
  const union = left.length + right.length - intersection;
  return union ? intersection / union : 1;
}

function assertCells(cells) {
  assert.ok(Array.isArray(cells));
  assert.equal(new Set(cells).size, cells.length, 'capture cell IDs are unique');
  assert.ok(cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < CELLS), 'capture IDs stay on the registered grid');
  const sorted = [...cells].sort((a, b) => a - b);
  assert.deepEqual(cells, sorted, 'registered X cells are canonical row-major order');
  return sorted;
}

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function readGzip(path) { return JSON.parse(gunzipSync(await readFile(path))); }
async function writeJson(path, value) { await writeFile(path, jsonBytes(value)); }
async function writeGzip(path, value) {
  const data = gzipSync(Buffer.from(JSON.stringify(value) + '\n'), { level: 9, mtime: 0 });
  await writeFile(path, data);
  return { bytes: data.length, sha256: sha(data) };
}

async function listFiles(directory, root = directory) {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await listFiles(full, root));
    else if (entry.isFile()) {
      const bytes = await readFile(full);
      rows.push({ file: full.slice(root.length + 1).replaceAll('\\', '/'), bytes: bytes.length, sha256: sha(bytes) });
    } else assert.fail(`unexpected research package entry ${full}`);
  }
  return rows;
}

async function finalizePackage() {
  const files = (await listFiles(OUT)).filter(row => !['manifest.json', 'SHA256SUMS.txt'].includes(row.file))
    .sort((a, b) => a.file.localeCompare(b.file));
  const tools = {};
  for (const file of ['scripts/ant-bc-commit-slot-ambiguity-audit.js',
    'scripts/render-ant-bc-commit-slot-objectives.js', 'scripts/render-ant-bc-commit-slot-atlas.js'])
    tools[file] = sha(await readFile(resolve(ROOT, file)));
  const manifest = { schema: 'ant-bc-commit-slot-ambiguity-audit-manifest-v1', branch: BRANCH,
    analysisBaseHead: BASE_HEAD, productionAuthority: PRODUCTION_AUTHORITY,
    sourcePacketCommit: SOURCE_COMMIT, responsibilityAnalysisCommit: BC_COMMIT,
    dualHistoryCommit: DUAL_COMMIT, authorReviewCommit: REVIEW_COMMIT,
    priorProvenancePrototypeCommit: BASE_HEAD,
    temporalReferenceMs: SLOT_GAP_MS, maturation: { persistenceMs: PERSISTENCE_MS, xSimilarity: X_SIMILARITY },
    tools, files };
  await writeFile(resolve(OUT, 'manifest.json'), jsonBytes(manifest));
  const sums = [...files.map(row => [row.file, row.sha256]),
    ['manifest.json', sha(await readFile(resolve(OUT, 'manifest.json')))]].sort((a, b) => a[0].localeCompare(b[0]));
  await writeFile(resolve(OUT, 'SHA256SUMS.txt'), sums.map(([file, digest]) => `${digest}  ${file}`).join('\n') + '\n');
  return { files: files.length, manifestSha256: sha(await readFile(resolve(OUT, 'manifest.json'))),
    sha256SumsSha256: sha(await readFile(resolve(OUT, 'SHA256SUMS.txt'))), checksumRows: sums.length };
}

function manifestHash(manifest, file) {
  const row = manifest.files.find(item => item.file.replaceAll('\\', '/') === file);
  assert.ok(row, `manifest includes ${file}`);
  return row.sha256 || row.hash;
}

async function verifyFrozenAuthorities() {
  const sourceManifestBytes = await readFile(resolve(SOURCE, 'manifest.json'));
  const sourceManifest = JSON.parse(sourceManifestBytes);
  const bcManifest = await readJson(resolve(BC, 'analysis/manifest.json'));
  const dualManifest = await readJson(resolve(DUAL, 'manifest.json'));
  const dualValidation = await readJson(resolve(DUAL, 'analysis/validation.json'));
  const frameReceipts = await readJson(resolve(DUAL, 'analysis/objective-frame-receipts.json'));
  assert.equal(sourceManifest.authority, PRODUCTION_AUTHORITY);
  assert.equal(bcManifest.authority, PRODUCTION_AUTHORITY);
  assert.equal(bcManifest.sourcePacketCommit, SOURCE_COMMIT);
  assert.equal(dualManifest.productionAuthority, PRODUCTION_AUTHORITY);
  assert.equal(dualManifest.sourcePacketCommit, SOURCE_COMMIT);
  assert.equal(dualManifest.responsibilityAnalysisCommit, BC_COMMIT);
  assert.equal(dualManifest.analysisBaseHead, REVIEW_COMMIT);
  assert.equal(dualValidation.sourcePacketManifestSha256, sha(sourceManifestBytes));
  assert.equal(dualValidation.bvcAnalysisManifestSha256, sha(await readFile(resolve(BC, 'analysis/manifest.json'))));
  assert.equal(dualValidation.frozenInputHashesBeforeAfterMatch, true);
  assert.equal(dualValidation.eventMaturationChainsIndependentlyRecomputed, true);
  assert.equal(dualValidation.srcStaticDiff, 'empty');

  const inputs = {};
  const check = async (path, expected) => {
    const bytes = await readFile(resolve(ROOT, path));
    const actual = sha(bytes);
    assert.equal(actual, expected, `frozen SHA-256: ${path}`);
    inputs[path] = actual;
  };
  const sourcePath = 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/manifest.json';
  const bcPath = 'docs/ant/evidence/2026-10-31-local-episode-evidence-b-vs-c/analysis/manifest.json';
  const dualPath = 'docs/ant/evidence/2026-10-31-bc-dual-material-shadow/manifest.json';
  inputs[sourcePath] = sha(sourceManifestBytes);
  inputs[bcPath] = sha(await readFile(resolve(ROOT, bcPath)));
  inputs[dualPath] = sha(await readFile(resolve(ROOT, dualPath)));
  const parentValidation = dualValidation.frozenSourceHashes;
  for (const seed of SEEDS) {
    const paths = [
      `docs/ant/evidence/2026-10-31-local-episode-evidence-b-vs-c/analysis/track-observations-${seed}.json.gz`,
      `docs/ant/evidence/2026-10-31-bc-dual-material-shadow/analysis/events-${seed}.json.gz`,
      `docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis/seed-${seed}.opportunities.json.gz`,
      `docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis/seed-${seed}.birth-context.json.gz`
    ];
    for (const path of paths) {
      const relative = path.slice(path.indexOf('analysis/'));
      const expected = path.includes('track-observations') ? manifestHash(bcManifest, relative)
        : path.includes('events-') ? manifestHash(dualManifest, relative)
          : manifestHash(sourceManifest, relative);
      const parentExpected = parentValidation[path.replaceAll('/', '\\')];
      if (parentExpected) assert.equal(expected, parentExpected, `parent validation agrees on ${path}`);
      await check(path, expected);
    }
  }
  return { sourceManifest, bcManifest, dualManifest, dualValidation, frameReceipts, inputHashes: inputs };
}

async function loadSeed(seed, provenance) {
  const trackPath = resolve(BC, `analysis/track-observations-${seed}.json.gz`);
  const tracks = await readGzip(trackPath);
  const eventArtifact = await readGzip(resolve(DUAL, `analysis/events-${seed}.json.gz`));
  assert.equal(tracks.schema, 'ant-local-episode-b-c-track-observations-v1');
  assert.equal(tracks.seed, seed);
  assert.equal(tracks.authority, PRODUCTION_AUTHORITY);
  assert.equal(tracks.representation, 'g15');
  assert.equal(tracks.correspondence, .025);
  assert.equal(eventArtifact.schema, 'ant-bc-shadow-maturation-events-v1');
  assert.equal(eventArtifact.seed, seed);
  assert.equal(eventArtifact.persistenceMs, PERSISTENCE_MS);
  assert.equal(eventArtifact.xSimilarity, X_SIMILARITY);
  assert.equal(eventArtifact.events.length, provenance.dualValidation.sameThreeSeeds599Anchors.find(row => row.seed === seed).events);

  const wanted = new Map();
  for (const track of tracks.channels) for (const obs of track.observations) {
    assert.ok(obs.captureId, `${seed}/${track.channel}/${track.id}/${obs.anchorIndex} has exact capture reference`);
    if (!wanted.has(obs.anchorIndex)) wanted.set(obs.anchorIndex, new Set());
    wanted.get(obs.anchorIndex).add(obs.captureId);
  }
  const metaBytes = await readFile(resolve(SOURCE, `analysis/seed-${seed}.opportunities.json.gz`));
  const meta = JSON.parse(gunzipSync(metaBytes));
  assert.equal(meta.authority, PRODUCTION_AUTHORITY);
  assert.equal(meta.anchorsCount, 599);
  const captures = new Map(), times = new Map(); let seenAnchors = 0;
  for (const file of meta.anchorsFiles) {
    const bytes = await readFile(resolve(SOURCE, 'analysis', file));
    assert.equal(sha(bytes), meta.chunkHashes[file], `${seed} frozen opportunity chunk hash`);
    const rows = JSON.parse(gunzipSync(bytes)).anchors;
    for (const anchor of rows) {
      seenAnchors++;
      times.set(anchor.index, anchor.timeMs);
      for (const id of wanted.get(anchor.index) || []) {
        const row = anchor.captures.find(capture => capture.id === id);
        assert.ok(row, `${seed}/${anchor.index}/${id} exact X receipt`);
        const cells = assertCells(row.cells);
        captures.set(keyOf(anchor.index, id), {
          anchorIndex: anchor.index, timeMs: anchor.timeMs, captureId: id,
          cells, xSha256: sha(Buffer.from(JSON.stringify(cells))), centerIndex: row.centerIndex,
          centers: row.centers, component: row.component, nodeCount: row.nodeCount,
          connected: row.connected, radiusValid: row.radiusValid
        });
      }
    }
  }
  assert.equal(seenAnchors, 599);
  assert.equal(times.size, 599);
  assert.deepEqual([...times.keys()].sort((a, b) => a - b), Array.from({ length: 599 }, (_, i) => i));
  for (const track of tracks.channels) for (const obs of track.observations) {
    const capture = captures.get(keyOf(obs.anchorIndex, obs.captureId));
    assert.ok(capture, 'track observation resolves to frozen X capture');
    assert.equal(capture.timeMs, obs.timeMs);
    assert.equal(capture.component, obs.component);
    assert.equal(capture.nodeCount, obs.xNodeCount);
    assert.ok(capture.cells.includes(obs.centerIndex), 'registered X includes the opportunity center');
  }
  const births = await readGzip(resolve(SOURCE, `analysis/seed-${seed}.birth-context.json.gz`));
  assert.equal(births.seed, seed);
  return { tracks, events: eventArtifact.events, captures, times, births: births.births,
    opportunitiesMetaSha256: sha(metaBytes), trackPacketSha256: sha(await readFile(trackPath)),
    eventPacketSha256: sha(await readFile(resolve(DUAL, `analysis/events-${seed}.json.gz`))),
    opportunityChunksVerified: meta.anchorsFiles.length };
}

function reconstructMatureCandidates(seed, tracks, frozenEvents, captures, times) {
  const registered = new Map(frozenEvents.map(event => [event.eventId, event]));
  assert.equal(registered.size, frozenEvents.length, 'frozen event IDs unique');
  const candidates = [], generatedEventIds = new Set();
  let intervalsSeen = 0, intervalsMatured = 0;
  for (const track of tracks.channels) {
    assert.ok(track.channel === 'B' || track.channel === 'C');
    const observations = [...track.observations].sort((a, b) => a.timeMs - b.timeMs || a.anchorIndex - b.anchorIndex);
    assert.ok(observations.length);
    let current = [], intervalNumber = 0, previous = null, intervalEnd = null;
    const finish = () => {
      if (!current.length) return;
      intervalsSeen++;
      let maturityIndex = current.findIndex(row => row.timeMs - current[0].timeMs >= PERSISTENCE_MS);
      if (maturityIndex >= 0) {
        intervalsMatured++;
        const first = current[maturityIndex], intervalId = `${track.channel}:${track.id}:I${String(intervalNumber).padStart(3, '0')}`;
        const eventId = `${seed}:${intervalId}`;
        const event = registered.get(eventId);
        assert.ok(event, `reconstructed matured interval has registered event ${eventId}`);
        assert.equal(event.anchorIndex, first.anchorIndex);
        assert.equal(event.timeMs, first.timeMs);
        assert.equal(event.stabilityStartAnchor, current[0].anchorIndex);
        assert.equal(event.stabilityStartTimeMs, current[0].timeMs);
        assert.equal(event.trackEndTimeMs, observations.at(-1).timeMs);
        const registeredChain = event.stabilityChain;
        assert.equal(registeredChain.length, maturityIndex + 1);
        for (let i = 0; i <= maturityIndex; i++) {
          const capture = captures.get(keyOf(current[i].anchorIndex, current[i].captureId));
          assert.ok(capture);
          assert.equal(registeredChain[i].anchorIndex, current[i].anchorIndex);
          assert.equal(registeredChain[i].timeMs, current[i].timeMs);
          assert.equal(registeredChain[i].captureId, current[i].captureId);
          assert.equal(registeredChain[i].xSha256, capture.xSha256);
          assert.deepEqual(registeredChain[i].cells, capture.cells);
        }
        assert.ok(maturityIndex === 0 || current[maturityIndex - 1].timeMs - current[0].timeMs < PERSISTENCE_MS,
          'first maturation crossing is the saved boundary that first reaches 20 s');
        generatedEventIds.add(eventId);
        const liveRows = current.slice(maturityIndex).map((obs, liveIndex) => {
          const capture = captures.get(keyOf(obs.anchorIndex, obs.captureId));
          return { anchorIndex: obs.anchorIndex, timeMs: obs.timeMs, captureId: obs.captureId,
            centerIndex: obs.centerIndex, center: point(obs.centerIndex), entryDistance: obs.entryDistance,
            component: obs.component, xSha256: capture.xSha256, xCells: capture.cells,
            xNodeCount: capture.nodeCount, similarityFromPrevious: liveIndex === 0 ? null
              : jaccard(captures.get(keyOf(current[maturityIndex + liveIndex - 1].anchorIndex,
                current[maturityIndex + liveIndex - 1].captureId)).cells, capture.cells) };
        });
        assert.ok(liveRows.length);
        candidates.push({ eventId, intervalId, seed, channel: track.channel, trackId: track.id,
          intervalNumber, maturityAnchorIndex: first.anchorIndex, maturityTimeMs: first.timeMs,
          stabilityStartAnchor: current[0].anchorIndex, stabilityStartTimeMs: current[0].timeMs,
          matureAgeAtEmissionMs: first.timeMs - current[0].timeMs,
          lastValidAnchorIndex: current.at(-1).anchorIndex, lastValidTimeMs: current.at(-1).timeMs,
          termination: intervalEnd, liveRows });
      }
      current = [];
    };
    for (const obs of observations) {
      let reset = null;
      if (!previous) reset = { reason: 'track-start', anchorIndex: obs.anchorIndex, timeMs: obs.timeMs };
      else if (obs.anchorIndex !== previous.anchorIndex + 1) reset = { reason: 'anchor-discontinuity', anchorIndex: obs.anchorIndex,
        timeMs: obs.timeMs, gapAnchors: obs.anchorIndex - previous.anchorIndex };
      else {
        const left = captures.get(keyOf(previous.anchorIndex, previous.captureId));
        const right = captures.get(keyOf(obs.anchorIndex, obs.captureId));
        assert.ok(left && right);
        const similarity = jaccard(left.cells, right.cells);
        if (similarity < X_SIMILARITY) reset = { reason: 'x-similarity-reset', anchorIndex: obs.anchorIndex,
          timeMs: obs.timeMs, similarity };
      }
      if (reset) {
        if (current.length) intervalEnd = { reason: reset.reason, nextAnchorIndex: obs.anchorIndex,
          nextTimeMs: obs.timeMs, similarity: reset.similarity ?? null };
        finish();
        intervalNumber++;
        current = [obs];
        intervalEnd = null;
      } else current.push(obs);
      previous = obs;
    }
    intervalEnd = { reason: 'track-end', nextAnchorIndex: null, nextTimeMs: null, similarity: null };
    finish();
  }
  assert.equal(generatedEventIds.size, registered.size, 'all frozen events and only frozen events reconstructed');
  for (const id of registered.keys()) assert.ok(generatedEventIds.has(id), `frozen event covered: ${id}`);
  candidates.sort((a, b) => a.maturityTimeMs - b.maturityTimeMs || a.eventId.localeCompare(b.eventId));
  return { candidates, intervalsSeen, intervalsMatured };
}

function componentRelation(left, right) {
  const pairs = left.flatMap(a => right.map(b => [a, b]));
  if (!pairs.length || pairs.some(pair => pair.includes(null))) return 'unknown';
  const same = pairs.some(([a, b]) => a === b), different = pairs.some(([a, b]) => a !== b);
  return same && different ? 'mixed' : same ? 'same' : 'different';
}

function uniqueOptions(active, timeMs) {
  const byMask = new Map();
  for (const row of active) {
    const maskKey = JSON.stringify(row.xCells);
    if (!byMask.has(maskKey)) byMask.set(maskKey, { key: maskKey, xSha256: row.xSha256, xCells: row.xCells,
      candidates: [], channels: new Set(), centers: new Map(), components: new Set() });
    const option = byMask.get(maskKey);
    assert.deepEqual(option.xCells, row.xCells, 'exact option key retains exact sorted mask');
    option.candidates.push({ eventId: row.eventId, channel: row.channel, trackId: row.trackId,
      maturityTimeMs: row.maturityTimeMs, matureAgeMs: timeMs - row.maturityTimeMs,
      centerIndex: row.centerIndex, center: row.center, entryDistance: row.entryDistance,
      component: row.component, captureId: row.captureId, xSha256: row.xSha256,
      xNodeCount: row.xNodeCount, similarityFromPrevious: row.similarityFromPrevious });
    option.channels.add(row.channel);
    option.centers.set(row.centerIndex, row.center);
    option.components.add(row.component);
  }
  return [...byMask.values()].map((option, index) => {
    const channels = [...option.channels].sort();
    return { key: option.key, optionId: `X${String(index + 1).padStart(3, '0')}-${option.xSha256.slice(0, 12)}`,
      xSha256: option.xSha256, xCells: option.xCells, xNodeCount: option.xCells.length,
      channels, composition: channels.length === 2 ? '{B,C}' : `${channels[0]}-only`,
      candidates: option.candidates.sort((a, b) => a.eventId.localeCompare(b.eventId)),
      centerIndices: [...option.centers.keys()].sort((a, b) => a - b),
      centers: [...option.centers.values()].sort((a, b) => a.x - b.x || a.y - b.y),
      components: [...option.components].sort((a, b) => a - b) };
  }).sort((a, b) => a.xSha256.localeCompare(b.xSha256));
}

function pairOptions(left, right) {
  const shared = new Set(right.xCells); let intersection = 0;
  for (const cell of left.xCells) intersection += Number(shared.has(cell));
  const union = left.xCells.length + right.xCells.length - intersection;
  const similarity = union ? intersection / union : 1;
  const distanceRows = left.centers.flatMap(a => right.centers.map(b => Math.hypot(a.x - b.x, a.y - b.y)));
  return { leftOptionId: left.optionId, rightOptionId: right.optionId,
    relation: similarity === 0 ? 'disjoint' : similarity === 1 ? 'exact' : 'partial-overlap',
    xJaccard: similarity,
    centerDistance: distanceRows.length ? { min: Math.min(...distanceRows), max: Math.max(...distanceRows) } : null,
    fComponentRelation: componentRelation(left.components, right.components) };
}

function buildSlot(seed, anchorIndex, timeMs, active) {
  const options = uniqueOptions(active, timeMs), pairs = [];
  for (let i = 0; i < options.length; i++) for (let j = i + 1; j < options.length; j++) pairs.push(pairOptions(options[i], options[j]));
  const counts = { B: active.filter(row => row.channel === 'B').length, C: active.filter(row => row.channel === 'C').length };
  const composition = { BOnlyOptions: options.filter(row => row.composition === 'B-only').length,
    COnlyOptions: options.filter(row => row.composition === 'C-only').length,
    mixedBCOptions: options.filter(row => row.composition === '{B,C}').length };
  const bAndCOnDifferentX = options.some((left, i) => left.channels.includes('B')
    && options.some((right, j) => i !== j && right.channels.includes('C')));
  const sameXCollapses = composition.mixedBCOptions;
  const exactBCCandidatePairs = options.filter(row => row.channels.length === 2)
    .reduce((sum, row) => sum + row.candidates.filter(candidate => candidate.channel === 'B').length
      * row.candidates.filter(candidate => candidate.channel === 'C').length, 0);
  return { seed, anchorIndex, timeMs, activeCandidateCount: active.length, matureCandidateCounts: counts,
    sameXBCSpatialOptions: sameXCollapses, exactBCCandidatePairs,
    uniqueSpatialOptionCount: options.length, composition,
    BAndCOnDifferentX: bAndCOnDifferentX,
    relationCounts: { exact: pairs.filter(row => row.relation === 'exact').length,
      partialOverlap: pairs.filter(row => row.relation === 'partial-overlap').length,
      disjoint: pairs.filter(row => row.relation === 'disjoint').length },
    disjointOptionCount: new Set(pairs.filter(row => row.relation === 'disjoint')
      .flatMap(row => [row.leftOptionId, row.rightOptionId])).size,
    options, pairwiseRelations: pairs,
    candidateAgesMs: { B: active.filter(row => row.channel === 'B').map(row => timeMs - row.maturityTimeMs),
      C: active.filter(row => row.channel === 'C').map(row => timeMs - row.maturityTimeMs) } };
}

function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const q = p => sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
  return { count: sorted.length, min: sorted[0] ?? null, q25: q(.25), median: q(.5), q75: q(.75), q90: q(.9),
    max: sorted.at(-1) ?? null, mean: sorted.length ? sorted.reduce((sum, n) => sum + n, 0) / sorted.length : null };
}

function scheduleSlots(seed, times, candidates) {
  const activeByAnchor = new Map();
  for (const candidate of candidates) for (const row of candidate.liveRows) {
    if (!activeByAnchor.has(row.anchorIndex)) activeByAnchor.set(row.anchorIndex, []);
    activeByAnchor.get(row.anchorIndex).push({ ...row, eventId: candidate.eventId, intervalId: candidate.intervalId,
      seed, channel: candidate.channel, trackId: candidate.trackId, maturityTimeMs: candidate.maturityTimeMs });
  }
  const slots = []; let nextTime = -Infinity;
  for (const [anchorIndex, timeMs] of [...times].sort((a, b) => a[0] - b[0])) {
    const active = activeByAnchor.get(anchorIndex) || [];
    if (!active.length || timeMs < nextTime) continue;
    slots.push(buildSlot(seed, anchorIndex, timeMs, active));
    nextTime = timeMs + SLOT_GAP_MS;
  }
  const candidateSlotCounts = new Map();
  const optionSlotCounts = new Map();
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    for (const option of slot.options) optionSlotCounts.set(option.xSha256, (optionSlotCounts.get(option.xSha256) || 0) + 1);
    for (const candidate of slot.options.flatMap(option => option.candidates)) {
      if (!candidateSlotCounts.has(candidate.eventId)) candidateSlotCounts.set(candidate.eventId, []);
      candidateSlotCounts.get(candidate.eventId).push({ slotIndex: i, anchorIndex: slot.anchorIndex, timeMs: slot.timeMs,
        optionId: slot.options.find(option => option.candidates.some(row => row.eventId === candidate.eventId)).optionId,
        unresolved: slot.uniqueSpatialOptionCount > 1 });
    }
  }
  const transitionRows = [];
  for (let i = 1; i < slots.length; i++) {
    const previous = slots[i - 1], current = slots[i];
    const previousIds = new Set(previous.options.flatMap(option => option.candidates.map(row => row.eventId)));
    const currentIds = new Set(current.options.flatMap(option => option.candidates.map(row => row.eventId)));
    const previousKeys = new Set(previous.options.map(option => option.key));
    const currentKeys = new Set(current.options.map(option => option.key));
    const priorUnresolvedIds = previous.uniqueSpatialOptionCount > 1
      ? [...previousIds] : [];
    const survivingUnresolved = priorUnresolvedIds.filter(id => currentIds.has(id));
    const departedUnresolved = priorUnresolvedIds.filter(id => !currentIds.has(id));
    const newIds = [...currentIds].filter(id => !previousIds.has(id));
    const continuingExactMasks = [...previousKeys].filter(key => currentKeys.has(key));
    transitionRows.push({ fromSlotIndex: i - 1, toSlotIndex: i,
      previousOptions: previous.uniqueSpatialOptionCount, currentOptions: current.uniqueSpatialOptionCount,
      priorUnresolvedCandidateCount: priorUnresolvedIds.length,
      survivingPriorUnresolvedCandidates: survivingUnresolved.length,
      unresolvedCandidatesNaturallyEnded: departedUnresolved.length,
      newMatureCandidates: newIds.length,
      newCandidatesJoinedWhilePriorUnresolvedSurvived: survivingUnresolved.length > 0 ? newIds.length : 0,
      sameExactXOptionsAcrossSlots: continuingExactMasks.length,
      sameExactXRemainsUnresolved: previous.uniqueSpatialOptionCount > 1 && current.uniqueSpatialOptionCount > 1
        ? continuingExactMasks.length : 0 });
  }
  return { slots, candidateSlotCounts: [...candidateSlotCounts].map(([eventId, appearances]) => ({ eventId,
    slotCount: appearances.length, firstSlotIndex: appearances[0].slotIndex, lastSlotIndex: appearances.at(-1).slotIndex,
    firstTimeMs: appearances[0].timeMs, lastTimeMs: appearances.at(-1).timeMs,
    unresolvedSlotCount: appearances.filter(row => row.unresolved).length, appearances })),
    exactXSlotCounts: [...optionSlotCounts].map(([xSha256, slotCount]) => ({ xSha256, slotCount })), transitionRows };
}

function independentCheck(seed, tracks, frozenEvents, captures, times, candidates, slots) {
  const eventById = new Map(frozenEvents.map(event => [event.eventId, event]));
  const liveByAnchor = new Map(), independentCandidates = new Map();
  const setJaccard = (a, b) => {
    const aa = new Set(a), bb = new Set(b); let common = 0;
    for (const cell of aa) if (bb.has(cell)) common++;
    const denominator = aa.size + bb.size - common;
    return denominator === 0 ? 1 : common / denominator;
  };
  for (const track of tracks.channels) {
    const rows = [...track.observations].sort((a, b) => a.anchorIndex - b.anchorIndex);
    let chain = [], previous = null, interval = 0, activeCandidate = null;
    for (const row of rows) {
      const currentMask = captures.get(keyOf(row.anchorIndex, row.captureId));
      assert.ok(currentMask, 'independent pass resolves every track mask');
      let reset = !previous;
      let resetReason = previous ? null : 'track-start';
      let adjacentScore = null;
      if (previous && row.anchorIndex !== previous.anchorIndex + 1) {
        reset = true; resetReason = 'anchor-discontinuity';
      } else if (previous) {
        const priorMask = captures.get(keyOf(previous.anchorIndex, previous.captureId));
        adjacentScore = setJaccard(priorMask.cells, currentMask.cells);
        if (adjacentScore < X_SIMILARITY) { reset = true; resetReason = 'x-similarity-reset'; }
      }
      if (reset) {
        if (activeCandidate) activeCandidate.termination = { reason: resetReason, nextAnchorIndex: row.anchorIndex,
          nextTimeMs: row.timeMs, similarity: adjacentScore };
        interval++;
        chain = [];
        activeCandidate = null;
      }
      chain.push(row);
      if (!activeCandidate && row.timeMs - chain[0].timeMs >= PERSISTENCE_MS) {
        const intervalId = `${track.channel}:${track.id}:I${String(interval).padStart(3, '0')}`;
        const eventId = `${seed}:${intervalId}`, event = eventById.get(eventId);
        assert.ok(event, `independent first-crossing event ${eventId}`);
        assert.equal(event.anchorIndex, row.anchorIndex);
        assert.equal(event.timeMs, row.timeMs);
        assert.equal(event.stabilityStartAnchor, chain[0].anchorIndex);
        assert.equal(event.stabilityStartTimeMs, chain[0].timeMs);
        assert.ok(chain.length === 1 || chain.at(-2).timeMs - chain[0].timeMs < PERSISTENCE_MS,
          'previous saved sample had not yet reached maturation');
        assert.equal(event.stabilityChain.length, chain.length);
        for (let i = 0; i < chain.length; i++) {
          const mask = captures.get(keyOf(chain[i].anchorIndex, chain[i].captureId));
          assert.equal(event.stabilityChain[i].anchorIndex, chain[i].anchorIndex);
          assert.equal(event.stabilityChain[i].timeMs, chain[i].timeMs);
          assert.deepEqual(event.stabilityChain[i].cells, mask.cells);
        }
        activeCandidate = { eventId, intervalId, channel: track.channel, trackId: track.id,
          maturityTimeMs: row.timeMs, maturityAnchorIndex: row.anchorIndex, lastValidTimeMs: row.timeMs,
          lastValidAnchorIndex: row.anchorIndex, termination: null, liveRows: [] };
        independentCandidates.set(eventId, activeCandidate);
      }
      if (activeCandidate) {
        activeCandidate.lastValidTimeMs = row.timeMs;
        activeCandidate.lastValidAnchorIndex = row.anchorIndex;
        const record = { anchorIndex: row.anchorIndex, timeMs: row.timeMs, captureId: row.captureId,
          centerIndex: row.centerIndex, component: row.component, xSha256: currentMask.xSha256,
          xCells: currentMask.cells, xNodeCount: currentMask.nodeCount };
        activeCandidate.liveRows.push(record);
        if (!liveByAnchor.has(row.anchorIndex)) liveByAnchor.set(row.anchorIndex, []);
        liveByAnchor.get(row.anchorIndex).push({ ...record, eventId: activeCandidate.eventId,
          channel: activeCandidate.channel, trackId: activeCandidate.trackId,
          maturityTimeMs: activeCandidate.maturityTimeMs, seed });
      }
      previous = row;
    }
    if (activeCandidate) activeCandidate.termination = { reason: 'track-end', nextAnchorIndex: null,
      nextTimeMs: null, similarity: null };
  }
  assert.equal(independentCandidates.size, frozenEvents.length, 'independent pass reconstructs every frozen maturation');
  const primaryById = new Map(candidates.map(row => [row.eventId, row]));
  assert.equal(primaryById.size, independentCandidates.size);
  for (const [eventId, expected] of independentCandidates) {
    const primary = primaryById.get(eventId);
    assert.ok(primary, `primary candidate exists ${eventId}`);
    assert.equal(primary.maturityTimeMs, expected.maturityTimeMs);
    assert.equal(primary.maturityAnchorIndex, expected.maturityAnchorIndex);
    assert.equal(primary.lastValidAnchorIndex, expected.lastValidAnchorIndex);
    assert.equal(primary.lastValidTimeMs, expected.lastValidTimeMs);
    assert.deepEqual(primary.termination, expected.termination);
    assert.equal(primary.liveRows.length, expected.liveRows.length);
    for (let i = 0; i < expected.liveRows.length; i++) {
      assert.equal(primary.liveRows[i].anchorIndex, expected.liveRows[i].anchorIndex);
      assert.equal(primary.liveRows[i].timeMs, expected.liveRows[i].timeMs);
      assert.equal(primary.liveRows[i].captureId, expected.liveRows[i].captureId);
      assert.equal(primary.liveRows[i].xSha256, expected.liveRows[i].xSha256);
      assert.deepEqual(primary.liveRows[i].xCells, expected.liveRows[i].xCells);
    }
  }

  const independentSlots = []; let lastSlotMs = -Infinity;
  for (const [anchorIndex, timeMs] of [...times].sort((a, b) => a[0] - b[0])) {
    const active = liveByAnchor.get(anchorIndex) || [];
    if (!active.length || timeMs < lastSlotMs + SLOT_GAP_MS) continue;
    const groups = new Map();
    for (const row of active) {
      const exactMask = row.xCells.join(',');
      if (!groups.has(exactMask)) groups.set(exactMask, { cells: row.xCells, rows: [] });
      groups.get(exactMask).rows.push(row);
    }
    const options = [...groups.values()].sort((a, b) => sha(Buffer.from(JSON.stringify(a.cells)))
      .localeCompare(sha(Buffer.from(JSON.stringify(b.cells)))));
    const pairs = [];
    for (let i = 0; i < options.length; i++) for (let j = i + 1; j < options.length; j++) {
      const aa = new Set(options[i].cells), bb = new Set(options[j].cells);
      let common = 0; for (const cell of aa) if (bb.has(cell)) common++;
      const union = aa.size + bb.size - common, score = union ? common / union : 1;
      pairs.push(score === 0 ? 'disjoint' : score === 1 ? 'exact' : 'partialOverlap');
    }
    const observed = slots[independentSlots.length];
    assert.ok(observed, `saved slot exists at ${seed}/${anchorIndex}`);
    assert.equal(observed.anchorIndex, anchorIndex, 'earliest eligible saved boundary matches independent schedule');
    assert.equal(observed.timeMs, timeMs);
    assert.equal(observed.activeCandidateCount, active.length);
    assert.equal(observed.matureCandidateCounts.B, active.filter(row => row.channel === 'B').length);
    assert.equal(observed.matureCandidateCounts.C, active.filter(row => row.channel === 'C').length);
    assert.equal(observed.uniqueSpatialOptionCount, groups.size, 'independent exact-mask unique option count');
    const mixed = [...groups.values()].filter(group => new Set(group.rows.map(row => row.channel)).size === 2).length;
    assert.equal(observed.sameXBCSpatialOptions, mixed, 'independent exact B/C same-X collapse count');
    assert.equal(observed.relationCounts.disjoint, pairs.filter(row => row === 'disjoint').length);
    assert.equal(observed.relationCounts.partialOverlap, pairs.filter(row => row === 'partialOverlap').length);
    for (const channel of ['B', 'C']) {
      const expectedAges = active.filter(row => row.channel === channel).map(row => timeMs - row.maturityTimeMs).sort((a, b) => a - b);
      const savedAges = [...observed.candidateAgesMs[channel]].sort((a, b) => a - b);
      assert.deepEqual(savedAges, expectedAges, `${channel} mature age arithmetic`);
    }
    const savedOptions = new Map(observed.options.map(row => [row.xCells.join(','), row]));
    assert.equal(savedOptions.size, groups.size);
    for (const [key, group] of groups) {
      const option = savedOptions.get(key);
      assert.ok(option, 'exact option masks survive grouping');
      const ids = group.rows.map(row => row.eventId).sort();
      assert.deepEqual(option.candidates.map(row => row.eventId).sort(), ids);
      assert.equal(option.xSha256, sha(Buffer.from(JSON.stringify(option.xCells))));
    }
    independentSlots.push({ anchorIndex, timeMs, options: groups.size, active: active.length,
      candidateAgesVerified: true, exactMasksVerified: true, pairwiseRelationshipsVerified: true });
    lastSlotMs = timeMs;
  }
  assert.equal(independentSlots.length, slots.length, 'no saved or independently eligible temporal slot is omitted');
  return { seed, independentlyReconstructedEvents: independentCandidates.size,
    candidateLifetimesCompared: primaryById.size, temporalSlotsCompared: independentSlots.length,
    uniqueOptionCountsVerified: true, candidateAgesVerified: true, sameXBCCollapseVerified: true,
    pairwiseOverlapDisjointnessVerified: true, slots: independentSlots };
}

function timeWindows(seed, slots, candidates) {
  return Array.from({ length: 10 }, (_, index) => {
    const startMs = index * 60_000, endMs = startMs + 60_000;
    const windowSlots = slots.filter(row => row.timeMs >= startMs && row.timeMs < endMs);
    const windowCandidates = candidates.filter(row => row.maturityTimeMs >= startMs && row.maturityTimeMs < endMs);
    const ages = { B: windowSlots.flatMap(row => row.candidateAgesMs.B), C: windowSlots.flatMap(row => row.candidateAgesMs.C) };
    return { seed, window: `${index * 60}–${(index + 1) * 60}`, startMs, endMs,
      maturedEvents: { B: windowCandidates.filter(row => row.channel === 'B').length,
        C: windowCandidates.filter(row => row.channel === 'C').length },
      commitMoments: windowSlots.length,
      optionsPerMoment: summarize(windowSlots.map(row => row.uniqueSpatialOptionCount)),
      exactlyOneMoments: windowSlots.filter(row => row.uniqueSpatialOptionCount === 1).length,
      unresolvedMoments: windowSlots.filter(row => row.uniqueSpatialOptionCount > 1).length,
      overFiveMoments: windowSlots.filter(row => row.uniqueSpatialOptionCount > 5).length,
      provenanceOptionCounts: { BOnly: windowSlots.reduce((sum, row) => sum + row.composition.BOnlyOptions, 0),
        COnly: windowSlots.reduce((sum, row) => sum + row.composition.COnlyOptions, 0),
        mixedBC: windowSlots.reduce((sum, row) => sum + row.composition.mixedBCOptions, 0),
        bothChannelsDifferentXMoments: windowSlots.filter(row => row.BAndCOnDifferentX).length },
      matureAgeMs: { B: summarize(ages.B), C: summarize(ages.C) } };
  });
}

function selectObjectiveSlots(seedResults) {
  const all = seedResults.flatMap(seed => seed.slots.map(slot => ({ ...slot, seed: seed.seed })));
  const order = (a, b) => a.seed.localeCompare(b.seed) || a.timeMs - b.timeMs || a.anchorIndex - b.anchorIndex;
  const pick = (id, criterion, rows, compare) => {
    const sorted = [...rows].sort((a, b) => compare(b, a) || order(a, b));
    if (!sorted.length) return { id, criterion, status: 'none', selected: null };
    const slot = sorted[0];
    return { id, criterion, status: 'selected', selected: { seed: slot.seed, anchorIndex: slot.anchorIndex,
      timeMs: slot.timeMs, uniqueSpatialOptionCount: slot.uniqueSpatialOptionCount,
      matureCandidateCounts: slot.matureCandidateCounts, composition: slot.composition,
      relationCounts: slot.relationCounts, disjointOptionCount: slot.disjointOptionCount,
      oldestCandidateAgeMs: Math.max(0, ...slot.options.flatMap(option => option.candidates.map(row => row.matureAgeMs))),
      optionIds: slot.options.map(option => option.optionId), slot } };
  };
  const firstSingle = [...all].filter(row => row.uniqueSpatialOptionCount === 1).sort(order).slice(0, 1);
  const mixedWithCompetitors = all.filter(row => row.composition.mixedBCOptions > 0 && row.uniqueSpatialOptionCount > 1);
  const Bdom = all.filter(row => row.composition.BOnlyOptions > 0
    && row.composition.BOnlyOptions >= row.composition.COnlyOptions
    && row.composition.BOnlyOptions >= row.composition.mixedBCOptions);
  const Cdom = all.filter(row => row.composition.COnlyOptions > 0
    && row.composition.COnlyOptions >= row.composition.BOnlyOptions
    && row.composition.COnlyOptions >= row.composition.mixedBCOptions);
  const ambiguous = all.filter(row => row.uniqueSpatialOptionCount > 1);
  const oldestRows = ambiguous.flatMap(slot => slot.options.flatMap(option => option.candidates.map(candidate => ({
    ...slot, candidate, candidateAgeMs: candidate.matureAgeMs
  }))));
  const oldestPick = oldestRows.sort((a, b) => b.candidateAgeMs - a.candidateAgeMs || order(a, b)
    || a.candidate.eventId.localeCompare(b.candidate.eventId))[0];
  const maxOptions = Math.max(0, ...all.map(row => row.uniqueSpatialOptionCount));
  const maxDisjoint = Math.max(0, ...all.map(row => row.relationCounts.disjoint));
  return { selectionRules: {
    tieBreak: 'seed ascending, actual time ascending, anchor index ascending; candidate ties use eventId ascending.',
    BOnlyDominated: 'B-only option count is positive and at least each of C-only and mixed {B,C}; among qualifying slots maximize B-only share, then earliest slot.',
    COnlyDominated: 'C-only option count is positive and at least each of B-only and mixed {B,C}; among qualifying slots maximize C-only share, then earliest slot.',
    disjointMaximum: 'Maximize pairwise disjoint unique-X option pairs; ties use more options then earliest slot.'
  }, cases: [
    pick('first-single-option', 'Earliest slot with exactly one unique spatial X option.', firstSingle, () => 0),
    pick('maximum-spatial-options', 'Maximum unique spatial X option count; tie by earliest slot.', all.filter(row => row.uniqueSpatialOptionCount === maxOptions), () => 0),
    pick('maximum-disjoint-options', 'Maximum pairwise disjoint X option pairs; then more options; then earliest slot.',
      all.filter(row => row.relationCounts.disjoint === maxDisjoint), (a, b) => a.uniqueSpatialOptionCount - b.uniqueSpatialOptionCount),
    pick('B-only-dominated', 'Slot with highest B-only share among slots where B-only count is the largest provenance class.',
      Bdom, (a, b) => a.composition.BOnlyOptions / a.uniqueSpatialOptionCount
        - b.composition.BOnlyOptions / b.uniqueSpatialOptionCount),
    pick('C-only-dominated', 'Slot with highest C-only share among slots where C-only count is the largest provenance class.',
      Cdom, (a, b) => a.composition.COnlyOptions / a.uniqueSpatialOptionCount
        - b.composition.COnlyOptions / b.uniqueSpatialOptionCount),
    pick('mixed-plus-distinct-competitors', 'Earliest slot with a same-X {B,C} option and at least one other distinct X.',
      mixedWithCompetitors.sort(order).slice(0, 1), () => 0),
    { id: 'oldest-surviving-unresolved-candidate',
      criterion: 'Maximum mature age among candidates in a slot with more than one unique spatial option.',
      status: oldestPick ? 'selected' : 'none', selected: oldestPick ? {
        seed: oldestPick.seed, anchorIndex: oldestPick.anchorIndex, timeMs: oldestPick.timeMs,
        uniqueSpatialOptionCount: oldestPick.uniqueSpatialOptionCount, eventId: oldestPick.candidate.eventId,
        channel: oldestPick.candidate.channel, matureAgeMs: oldestPick.candidateAgeMs,
        optionIds: oldestPick.options.map(option => option.optionId), slot: oldestPick
      } : null }
  ] };
}

function seedSummary(seed, result, births) {
  const slots = result.slots, counts = slots.map(row => row.uniqueSpatialOptionCount);
  const agesB = slots.flatMap(row => row.candidateAgesMs.B), agesC = slots.flatMap(row => row.candidateAgesMs.C);
  const candidateAppearances = result.candidateSlotCounts;
  const slotGaps = slots.slice(1).map((row, index) => row.timeMs - slots[index].timeMs);
  return { seed, rawMaturationEvents: result.events.length,
    BEvents: result.events.filter(row => row.channel === 'B').length,
    CEvents: result.events.filter(row => row.channel === 'C').length,
    earliestTemporalCommitMoments: slots.length,
    actualProductionPlateBirths: births.length,
    optionsPerMoment: summarize(counts),
    momentsExactlyOneOption: slots.filter(row => row.uniqueSpatialOptionCount === 1).length,
    fractionExactlyOneOption: slots.length ? slots.filter(row => row.uniqueSpatialOptionCount === 1).length / slots.length : null,
    momentsMultipleOptions: slots.filter(row => row.uniqueSpatialOptionCount > 1).length,
    fractionMultipleOptions: slots.length ? slots.filter(row => row.uniqueSpatialOptionCount > 1).length / slots.length : null,
    momentsOverFiveOptions: slots.filter(row => row.uniqueSpatialOptionCount > 5).length,
    fractionOverFiveOptions: slots.length ? slots.filter(row => row.uniqueSpatialOptionCount > 5).length / slots.length : null,
    maxUniqueOptions: Math.max(0, ...counts),
    firstSlotTimeMs: slots[0]?.timeMs ?? null, lastSlotTimeMs: slots.at(-1)?.timeMs ?? null,
    actualSlotGapMs: summarize(slotGaps),
    matureCandidateAgesMs: { B: summarize(agesB), C: summarize(agesC) },
    slotsWithSameXBCProvenance: slots.filter(row => row.sameXBCSpatialOptions > 0).length,
    slotsWithBAndCOnDifferentX: slots.filter(row => row.BAndCOnDifferentX).length,
    disjointOptionPairs: slots.reduce((sum, row) => sum + row.relationCounts.disjoint, 0),
    matureCandidatesNeverPresentAtAnySlot: result.events.length - candidateAppearances.length,
    matureCandidatesPresentAtAnySlot: candidateAppearances.length,
    matureCandidatesPresentAtMultipleSlots: candidateAppearances.filter(row => row.slotCount > 1).length,
    backlog: { matureCandidatesAppearingInMultipleSlots: result.candidateSlotCounts.filter(row => row.slotCount > 1).length,
      candidateSlotCountDistribution: summarize(result.candidateSlotCounts.map(row => row.slotCount)),
      unresolvedCandidateDisappearances: result.transitionRows.reduce((sum, row) => sum + row.unresolvedCandidatesNaturallyEnded, 0),
      newCandidatesJoiningWhileUnresolvedSurvivorsRemain: result.transitionRows
        .filter(row => row.newCandidatesJoinedWhilePriorUnresolvedSurvived > 0).length,
      newCandidateCountDuringThoseTransitions: result.transitionRows
        .reduce((sum, row) => sum + row.newCandidatesJoinedWhilePriorUnresolvedSurvived, 0),
      adjacentSlotsWithSameExactXStillUnresolved: result.transitionRows
        .reduce((sum, row) => sum + row.sameExactXRemainsUnresolved, 0) } };
}

function pathForCells(cells, size) {
  const set = new Set(cells), step = size / (GRID - 1), half = step / 2;
  let path = '';
  for (const cell of cells) {
    const col = cell % GRID, row = Math.floor(cell / GRID), cx = col * step, cy = row * step;
    const l = (cx - half).toFixed(2), r = (cx + half).toFixed(2), t = (cy - half).toFixed(2), b = (cy + half).toFixed(2);
    if (row === 0 || !set.has(cell - GRID)) path += `M${l} ${t}H${r}`;
    if (col === GRID - 1 || !set.has(cell + 1)) path += `M${r} ${t}V${b}`;
    if (row === GRID - 1 || !set.has(cell + GRID)) path += `M${r} ${b}H${l}`;
    if (col === 0 || !set.has(cell - 1)) path += `M${l} ${b}V${t}`;
  }
  return path;
}

async function writeVisualAtlas(objective, frameReceipts) {
  const replay = await readJson(resolve(OUT, 'analysis/render-replay-validation.json')).catch(() => ({ frames: [] }));
  const sourceFrames = frameReceipts.frames.map(row => ({ ...row, file: row.worldFile, sha256: row.worldSha256, root: DUAL,
    frameMethod: 'previously saved native frame' }));
  const replayFrames = replay.frames.map(row => ({ ...row, root: OUT, frameMethod: 'parity-validated frozen-history replay' }));
  const byFrame = new Map([...sourceFrames, ...replayFrames].map(row => [`${row.seed}:${row.anchorIndex}`, row]));
  const rows = [];
  for (const item of objective.cases) {
    if (item.status !== 'selected') continue;
    const selected = item.selected, frame = byFrame.get(`${selected.seed}:${selected.anchorIndex}`);
    if (!frame || frame.timeMs !== selected.timeMs) {
      selected.nativeFrame = null;
      selected.visualStatus = 'no exact frozen native frame; no replay or reconstruction performed';
      continue;
    }
    const imagePath = resolve(frame.root, frame.file);
    const image = await readFile(imagePath);
    assert.equal(sha(image), frame.sha256, 'exact saved native frame hash');
    selected.nativeFrame = { file: frame.file, sha256: frame.sha256, timeMs: frame.timeMs, frameMethod: frame.frameMethod };
    selected.visualStatus = frame.frameMethod;
    const rowIndex = rows.length;
    const optionRows = selected.slot.options.map(option => {
      const color = option.channels.length > 1 ? '#7056a8' : option.channels[0] === 'B' ? '#007f73' : '#c45522';
      return `<path d="${pathForCells(option.xCells, 520)}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/><text x="545" y="${45 + 24 * selected.slot.options.indexOf(option)}" fill="${color}" font-size="15">${option.optionId} · ${option.composition} · ${option.candidates.length} candidate(s)</text>`;
    }).join('');
    rows.push(`<g transform="translate(24 ${75 + rowIndex * 570})"><defs><clipPath id="slot-frame-${rowIndex}"><rect x="0" y="0" width="520" height="520"/></clipPath></defs><text x="0" y="0" font-size="18" font-weight="bold">${item.id} · ${selected.seed} · ${(selected.timeMs / 1000).toFixed(3)} s · ${selected.uniqueSpatialOptionCount} spatial option(s)</text><image x="0" y="25" width="520" height="520" preserveAspectRatio="none" href="data:image/png;base64,${image.toString('base64')}"/><g transform="translate(0 25)" clip-path="url(#slot-frame-${rowIndex})">${optionRows}</g><text x="545" y="535" font-size="12" fill="#485463">${frame.frameMethod}; B teal, C orange, {B,C} violet. Every outlined option is shown; none is a winner.</text></g>`);
  }
  const noFrameRows = objective.cases.filter(row => row.status === 'selected' && row.selected.visualStatus.startsWith('no exact'))
    .map(row => `<text x="24" y="${75 + rows.length * 570 + 28 * (objective.cases.indexOf(row) + 1)}" font-size="14">${row.id} · ${row.selected.seed} · anchor ${row.selected.anchorIndex}: exact saved frame unavailable; candidate receipt remains in JSON.</text>`).join('');
  const height = Math.max(180, 75 + rows.length * 570 + (noFrameRows ? objective.cases.length * 28 + 30 : 20));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="${height}" viewBox="0 0 1280 ${height}"><rect width="100%" height="100%" fill="#fff"/><text x="24" y="34" font-size="24" font-weight="bold">B/C 10 s commit-slot ambiguity · frozen objective cases</text><text x="24" y="56" font-size="13" fill="#485463">Previously saved frames or parity-validated frozen-history replay; no new world history. No winner selected.</text>${rows.join('')}${noFrameRows}</svg>`;
  await writeFile(resolve(OUT, 'visual/objective-slot-atlas.svg'), svg, 'utf8');
}

function writeReport(summary, objective) {
  const seeds = summary.seeds.map(row => `| ${row.seed} | ${row.rawMaturationEvents} (${row.BEvents}/${row.CEvents}) | ${row.earliestTemporalCommitMoments} | ${row.optionsPerMoment.mean.toFixed(1)} / ${row.optionsPerMoment.median} / ${row.maxUniqueOptions} | ${row.momentsExactlyOneOption} | ${row.momentsMultipleOptions} (${(100 * row.fractionMultipleOptions).toFixed(1)}%) | ${row.momentsOverFiveOptions} | ${row.matureCandidatesNeverPresentAtAnySlot} | ${row.matureCandidatesPresentAtMultipleSlots} | ${row.actualProductionPlateBirths} |`).join('\n');
  const windows = summary.windows.map(row => `| ${row.seed} | ${row.window} | ${row.commitMoments} | ${row.optionsPerMoment.median} / ${row.optionsPerMoment.max} | ${row.exactlyOneMoments} / ${row.unresolvedMoments} / ${row.overFiveMoments} | ${row.matureAgeMs.B.median === null ? '—' : (row.matureAgeMs.B.median / 1000).toFixed(1)} / ${row.matureAgeMs.C.median === null ? '—' : (row.matureAgeMs.C.median / 1000).toFixed(1)} | ${row.provenanceOptionCounts.BOnly} / ${row.provenanceOptionCounts.COnly} / ${row.provenanceOptionCounts.mixedBC} |`).join('\n');
  const cases = objective.cases.map(row => {
    const selected = row.selected;
    if (row.status !== 'selected') return `| ${row.id} | none | — | — | — | — | — |`;
    const slot = selected.slot;
    return `| ${row.id} | ${selected.seed} | ${(selected.timeMs / 1000).toFixed(3)} | ${selected.uniqueSpatialOptionCount} | ${slot.matureCandidateCounts.B}/${slot.matureCandidateCounts.C} | ${slot.composition.BOnlyOptions}/${slot.composition.COnlyOptions}/${slot.composition.mixedBCOptions} | ${slot.relationCounts.disjoint}/${slot.relationCounts.partialOverlap} |`;
  }).join('\n');
  const global = summary.global, totalBirths = summary.seeds.reduce((sum, row) => sum + row.actualProductionPlateBirths, 0);
  const fraction = value => `${value} / ${summary.totalSlots} (${(100 * value / summary.totalSlots).toFixed(1)}%)`;
  return `# B/C 10 s commit-slot ambiguity audit\n\n## Decision\n\n**${summary.classification}.** The fixed 10 s temporal reference reduces 2,089 maturation events to 163 earliest-possible world slots, but leaves multiple distinct spatial X options in ${fraction(global.momentsMultipleOptions)}. Median is ${global.optionsPerMoment.median} unique X options per slot; maximum is ${global.optionsPerMoment.max}. Temporal cadence alone does not resolve spatial commit ambiguity.\n\nNo option was selected or committed. This result supports a separate spatial commit-responsibility question; it does not specify a score or authorize a real Plate.\n\n## Authority and scope\n\n- Frozen production authority: \`${PRODUCTION_AUTHORITY}\`.\n- Frozen opportunity packet: \`${SOURCE_COMMIT}\`; B/C responsibility analysis: \`${BC_COMMIT}\`; dual-history maturation: \`${DUAL_COMMIT}\`; matched author-review package: \`${REVIEW_COMMIT}\`; starting prototype branch head: \`${BASE_HEAD}\`.\n- Seeds: \`20261005\`, \`20261006\`, and \`20261007\`; 599 exact saved analysis boundaries per seed. The same 2,089 registered events, tracks, timestamps, and X capture histories were reused.\n- The upstream law remains 20 s uninterrupted adjacent-X Jaccard \`>= .60\`. A mature candidate stays active through only that same registered uninterrupted chain. Track end, a saved-anchor discontinuity, or a below-.60 reset ends it. The reset anchor belongs only to the new interval.\n- The first slot is the earliest saved boundary with a mature spatial option. Each later slot is the earliest saved boundary at or after the previous slot plus 10,000 actual milliseconds that still has an active option.\n- At each slot, only exact sorted X cell-set equality collapses candidates for spatial-option counts. B and C records are both retained as \`{B,C}\`; partial overlap and nearby centers stay distinct.\n- No amplitude, age, size, contact, novelty, material-overlap, pheromone, refractory, ceiling, or winner rule was used. The existing 90 s / repeat-contact / Plate-ceiling gates were omitted.\n\n## Per-seed results\n\n| Seed | Mature events (B/C) | 10 s slots | Unique options mean / median / max | One option | More than one | More than five | Mature events absent at every slot | Candidates seen at multiple slots | Actual production Plates |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${seeds}\n\nAcross all seeds, exactly one option occurred at only ${fraction(global.momentsExactlyOneOption)}. More than five options occurred at ${fraction(global.momentsOverFiveOptions)}. The slots averaged ${(summary.totalEvents / summary.totalSlots).toFixed(2)} upstream events each. Actual production recorded ${totalBirths} Plates across the three runs; that count is context, not a target or validation of the shadow stream.\n\n## B/C option composition and pair relations\n\nAcross slots there were ${global.provenanceOptionOccurrences.BOnly} B-only, ${global.provenanceOptionOccurrences.COnly} C-only, and ${global.provenanceOptionOccurrences.mixedBC} exact same-X \`{B,C}\` option occurrences. Both channels occupied distinct X options in ${global.slotsWithBAndCOnDifferentX} of ${summary.totalSlots} slots. A same-X \`{B,C}\` option coexisted with other distinct options in ${global.slotsWithSameXBCAndOtherOptions} slots, so coeval dual provenance did not account for the broader ambiguity by itself.\n\nAmong ${global.pairwiseUniqueOptionRelations.total.toLocaleString()} pairwise relations between unique options, ${global.pairwiseUniqueOptionRelations.disjoint.toLocaleString()} were disjoint, ${global.pairwiseUniqueOptionRelations.partialOverlap.toLocaleString()} partially overlapped, and none were exact duplicates after the required exact-mask collapse. Pairwise X-Jaccard median was ${global.pairwiseUniqueOptionRelations.xJaccard.median}; q90 was ${global.pairwiseUniqueOptionRelations.xJaccard.q90}. The nearest candidate-center distance across option pairs had median ${global.pairwiseUniqueOptionRelations.nearestCenterDistance.median.toFixed(3)} and q90 ${global.pairwiseUniqueOptionRelations.nearestCenterDistance.q90.toFixed(3)} world units. Frozen F-component relation counts were ${global.pairwiseUniqueOptionRelations.fComponentRelation.same.toLocaleString()} same-component and ${global.pairwiseUniqueOptionRelations.fComponentRelation.different.toLocaleString()} different-component pairs. Full per-slot pair receipts retain exact distances and relations.\n\n## Backlog and candidate age\n\n${summary.seeds.map(row => `- **${row.seed}:** ${row.matureCandidatesNeverPresentAtAnySlot} of ${row.rawMaturationEvents} candidates were never present at a slot; ${row.matureCandidatesPresentAtMultipleSlots} appeared at multiple slots. For candidates appearing at a slot, slot-count median/q90/max was ${row.backlog.candidateSlotCountDistribution.median}/${row.backlog.candidateSlotCountDistribution.q90}/${row.backlog.candidateSlotCountDistribution.max}. ${row.backlog.unresolvedCandidateDisappearances} candidates naturally ended between adjacent slots while the previous slot was unresolved; ${row.backlog.newCandidateCountDuringThoseTransitions} new candidates joined while prior unresolved candidates remained.`).join('\n')}\n\nAcross adjacent slot transitions, an exact X remained unresolved at ${summary.seeds.reduce((n, row) => n + row.backlog.adjacentSlotsWithSameExactXStillUnresolved, 0)} option continuities. Candidates also turned over naturally: the median candidate appeared at one slot. B mature age at a slot had median ${(global.candidateAgesMs.B.median / 1000).toFixed(1)} s, q90 ${(global.candidateAgesMs.B.q90 / 1000).toFixed(1)} s, and maximum ${(global.candidateAgesMs.B.max / 1000).toFixed(1)} s; C had median ${(global.candidateAgesMs.C.median / 1000).toFixed(1)} s, q90 ${(global.candidateAgesMs.C.q90 / 1000).toFixed(1)} s, and maximum ${(global.candidateAgesMs.C.max / 1000).toFixed(1)} s. The long-lived tail coexists with frequent natural expiration and new arrivals.\n\n## Fixed 60 s evolution\n\nEach window shows option median / maximum; then single / multiple / >5-option slot counts; then B/C median mature age in seconds; then B-only / C-only / mixed option occurrences.\n\n| Seed | Window (s) | Slots | Options median / max | Single / multiple / >5 | Median age B / C (s) | B-only / C-only / {B,C} |\n|---|---:|---:|---:|---:|---:|---:|\n${windows}\n\nThe first 60 s are sparse and contain the few single-option slots. After 60 s, all 27 seed-windows contain five or six temporal slots and at least five of those slots retain multiple options. The late 540–600 s windows remain multi-option in every slot.\n\n## Objective cases and visuals\n\n| Objective case | Seed | Time (s) | Options | Mature B/C candidates | B-only / C-only / {B,C} | Disjoint / partial pairs |\n|---|---|---:|---:|---:|---:|---:|\n${cases}\n\n[Native-frame objective atlas (PNG)](visual/objective-slot-atlas.png) · [SVG](visual/objective-slot-atlas.svg). Every selected case has an exact native world/material frame. Colors only label provenance: B teal, C orange, and coeval \`{B,C}\` violet. All candidates have equal display status; no winner is highlighted.\n\nThe selected oldest unresolved candidate is ${objective.cases.find(row => row.id === 'oldest-surviving-unresolved-candidate')?.selected?.channel ?? 'a registered candidate'} at ${objective.cases.find(row => row.id === 'oldest-surviving-unresolved-candidate')?.selected?.matureAgeMs === undefined ? 'the saved slot' : (objective.cases.find(row => row.id === 'oldest-surviving-unresolved-candidate').selected.matureAgeMs / 1000).toFixed(1) + ' s of mature age'}. Its full event/track/X receipt is in \`analysis/objective-slots.json\`.\n\nSelected native frames were rendered by deterministic replay of the same frozen production histories because the registered frame receipt did not contain these objective slots. Both replayed seeds matched all 599 saved boundaries, including E/F/B/C/D, material layer/top/birth maps, birth IDs, and final RNG state. Seed 20261005 anchor 42 reproduced its prior PNG hash exactly. No new history was sampled.\n\n## Interpretation and limit\n\n**Measurement:** 10 s slots filter 635 of 2,089 mature events before any slot, and reduce the stream to 163 time slots. Yet 159 slots contain multiple distinct X options, the median slot contains 12, and many exact candidates/X options survive across adjacent slots. New candidates also join while incumbents remain.\n\n**Classification:** **PERSISTENT MULTI-OPTION COMPETITION.** The ambiguity is persistent at the slot level, with real track turnover rather than one wholly frozen backlog. Cadence reduces pressure but does not provide a spatial commit choice.\n\n**Authored semantics:** 10 s is a comparison reference only. No spatial winner, Plate, material, or production state was created or changed. No B/C signal was ranked against the other.\n\n**Smallest next question:** Which authored spatial responsibility, if any, should resolve the simultaneously mature local X options before dual provenance is mapped to real material? This audit does not design that responsibility.\n`;
}

async function main() {
  await mkdir(resolve(OUT, 'analysis'), { recursive: true });
  await mkdir(resolve(OUT, 'visual'), { recursive: true });
  if (process.argv.includes('--finalize')) {
    console.log(JSON.stringify({ phase: 'package-finalized', ...await finalizePackage() }));
    return;
  }
  const provenance = await verifyFrozenAuthorities();
  const seedResults = [], validations = [];
  for (const seed of SEEDS) {
    const source = await loadSeed(seed, provenance);
    const reconstructed = reconstructMatureCandidates(seed, source.tracks, source.events, source.captures, source.times);
    const schedule = scheduleSlots(seed, source.times, reconstructed.candidates);
    const independent = independentCheck(seed, source.tracks, source.events, source.captures, source.times,
      reconstructed.candidates, schedule.slots);
    const windows = timeWindows(seed, schedule.slots, reconstructed.candidates);
    const result = { seed, events: source.events, candidates: reconstructed.candidates,
      intervalsSeen: reconstructed.intervalsSeen, intervalsMatured: reconstructed.intervalsMatured,
      slots: schedule.slots, candidateSlotCounts: schedule.candidateSlotCounts,
      exactXSlotCounts: schedule.exactXSlotCounts, transitionRows: schedule.transitionRows, windows,
      births: source.births, inputHashes: { trackPacketSha256: source.trackPacketSha256,
        eventPacketSha256: source.eventPacketSha256, opportunitiesMetaSha256: source.opportunitiesMetaSha256,
        opportunityChunksVerified: source.opportunityChunksVerified } };
    await writeGzip(resolve(OUT, `analysis/candidate-lifetimes-${seed}.json.gz`), {
      schema: 'ant-bc-mature-candidate-lifetimes-v1', seed, persistenceMs: PERSISTENCE_MS,
      xSimilarity: X_SIMILARITY, candidates: reconstructed.candidates.map(({ liveRows, ...candidate }) => ({
        ...candidate, liveRows: liveRows.map(({ xCells, ...row }) => row) })) });
    await writeGzip(resolve(OUT, `analysis/commit-slots-${seed}.json.gz`), {
      schema: 'ant-bc-commit-slot-receipts-v1', seed, slotGapMs: SLOT_GAP_MS,
      timeConvention: 'actual frozen anchor times in milliseconds; next slot requires time >= prior slot time + 10000',
      slots: schedule.slots });
    await writeGzip(resolve(OUT, `analysis/backlog-${seed}.json.gz`), {
      schema: 'ant-bc-commit-slot-backlog-v1', seed, candidateSlotCounts: schedule.candidateSlotCounts,
      exactXSlotCounts: schedule.exactXSlotCounts, transitions: schedule.transitionRows });
    const counts = { B: source.events.filter(row => row.channel === 'B').length,
      C: source.events.filter(row => row.channel === 'C').length };
    assert.equal(counts.B + counts.C, source.events.length);
    validations.push({ seed, anchors: source.times.size, events: source.events.length, eventCounts: counts,
      reconstructedIntervals: reconstructed.intervalsSeen, maturedIntervals: reconstructed.intervalsMatured,
      matureCandidates: reconstructed.candidates.length, slots: schedule.slots.length,
      exactXCaptureReferences: true, eventMaturationReceiptsExact: true,
      slotCandidateAgesRecomputed: true, observerRngCalls: 0, independentReview: independent });
    seedResults.push({ ...result, summary: seedSummary(seed, { ...result, slots: schedule.slots }, source.births), windows });
    console.log(JSON.stringify({ seed, anchors: source.times.size, events: source.events.length,
      matureCandidates: reconstructed.candidates.length, slots: schedule.slots.length,
      multipleOptionSlots: schedule.slots.filter(row => row.uniqueSpatialOptionCount > 1).length,
      maxOptions: Math.max(0, ...schedule.slots.map(row => row.uniqueSpatialOptionCount)) }));
  }

  const allSummaryRows = seedResults.map(row => row.summary);
  const allSlots = seedResults.flatMap(row => row.slots);
  const allPairs = allSlots.flatMap(row => row.pairwiseRelations);
  const allBOptionAges = allSlots.flatMap(row => row.candidateAgesMs.B);
  const allCOptionAges = allSlots.flatMap(row => row.candidateAgesMs.C);
  const aggregate = { seeds: allSummaryRows, totalEvents: allSummaryRows.reduce((sum, row) => sum + row.rawMaturationEvents, 0),
    totalSlots: allSummaryRows.reduce((sum, row) => sum + row.earliestTemporalCommitMoments, 0),
    totalSameXBCOptions: seedResults.reduce((sum, row) => sum + row.slots.reduce((n, slot) => n + slot.sameXBCSpatialOptions, 0), 0),
    slotsWithMixedAndOther: seedResults.reduce((sum, row) => sum + row.slots.filter(slot => slot.sameXBCSpatialOptions > 0
      && slot.uniqueSpatialOptionCount > slot.sameXBCSpatialOptions).length, 0),
    global: { optionsPerMoment: summarize(allSlots.map(row => row.uniqueSpatialOptionCount)),
      momentsExactlyOneOption: allSlots.filter(row => row.uniqueSpatialOptionCount === 1).length,
      momentsMultipleOptions: allSlots.filter(row => row.uniqueSpatialOptionCount > 1).length,
      momentsOverFiveOptions: allSlots.filter(row => row.uniqueSpatialOptionCount > 5).length,
      provenanceOptionOccurrences: { BOnly: allSlots.reduce((n, row) => n + row.composition.BOnlyOptions, 0),
        COnly: allSlots.reduce((n, row) => n + row.composition.COnlyOptions, 0),
        mixedBC: allSlots.reduce((n, row) => n + row.composition.mixedBCOptions, 0) },
      slotsWithBAndCOnDifferentX: allSlots.filter(row => row.BAndCOnDifferentX).length,
      slotsWithSameXBCAndOtherOptions: allSlots.filter(row => row.sameXBCSpatialOptions > 0
        && row.uniqueSpatialOptionCount > row.sameXBCSpatialOptions).length,
      exactSameXBCOptionOccurrences: allSlots.reduce((n, row) => n + row.sameXBCSpatialOptions, 0),
      exactBCCandidatePairOccurrences: allSlots.reduce((n, row) => n + row.exactBCCandidatePairs, 0),
      candidateAgesMs: { B: summarize(allBOptionAges), C: summarize(allCOptionAges) },
      pairwiseUniqueOptionRelations: { total: allPairs.length,
        exact: allPairs.filter(row => row.relation === 'exact').length,
        partialOverlap: allPairs.filter(row => row.relation === 'partial-overlap').length,
        disjoint: allPairs.filter(row => row.relation === 'disjoint').length,
        xJaccard: summarize(allPairs.map(row => row.xJaccard)),
        nearestCenterDistance: summarize(allPairs.filter(row => row.centerDistance).map(row => row.centerDistance.min)),
        fComponentRelation: Object.fromEntries(['same', 'different', 'mixed', 'unknown'].map(key => [key,
          allPairs.filter(row => row.fComponentRelation === key).length])) } },
    windows: seedResults.flatMap(row => row.windows) };
  aggregate.classification = 'PERSISTENT MULTI-OPTION COMPETITION';
  aggregate.classificationBasis = 'Multiple distinct X options coexist at almost every saved 10 s slot across all seeds; many candidates and exact X masks persist across adjacent slots, while natural turnover and new arrivals continue. No numerical decision cutoff was applied.';
  assert.equal(aggregate.totalEvents, 2089, 'exact registered B/C event total');
  const objective = selectObjectiveSlots(seedResults.map(row => ({ seed: row.seed, slots: row.slots })));
  await writeVisualAtlas(objective, provenance.frameReceipts);
  await writeJson(resolve(OUT, 'analysis/objective-slots.json'), objective);
  await writeJson(resolve(OUT, 'analysis/summary.json'), aggregate);
  await writeJson(resolve(OUT, 'analysis/validation.json'), {
    schema: 'ant-bc-commit-slot-ambiguity-validation-v1',
    productionAuthority: PRODUCTION_AUTHORITY, sourcePacketCommit: SOURCE_COMMIT,
    responsibilityAnalysisCommit: BC_COMMIT, dualHistoryCommit: DUAL_COMMIT,
    authorReviewCommit: REVIEW_COMMIT, priorPrototypeCommit: BASE_HEAD, branch: BRANCH,
    inputHashes: provenance.inputHashes, seeds: validations,
    classification: aggregate.classification, classificationBasis: aggregate.classificationBasis,
    exactFrozenEventsReused: aggregate.totalEvents === 2089,
    actualSavedTimesUsed: true, maturationGrammarUnchanged: true,
    candidateLifetimeEndsAtRegisteredIntervalEnd: true, exactMaskOnlyDeduplication: true,
    sameXBCProvenanceRetained: true, independentReconstruction: 'second streaming pass over saved tracks and exact captures; independently verified event intervals, slot eligibility, exact-mask counts, pair relations, and candidate ages',
    observerRngCalls: 0, productionFeedback: false, productionSourceChanges: 'none',
    nativeFrames: objective.cases.map(row => ({ id: row.id, status: row.status,
      seed: row.selected?.seed ?? null, anchorIndex: row.selected?.anchorIndex ?? null,
      frame: row.selected?.nativeFrame ?? null, visualStatus: row.selected?.visualStatus ?? null }))
  });
  await writeFile(resolve(OUT, 'REPORT.md'), writeReport(aggregate, objective), 'utf8');
  console.log(JSON.stringify({ complete: true, totalEvents: aggregate.totalEvents,
    totalSlots: aggregate.totalSlots, exactXSameBCSlots: aggregate.totalSameXBCOptions,
    objectiveCases: objective.cases.map(row => ({ id: row.id, status: row.status, visualStatus: row.selected?.visualStatus })) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
