import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { readJson, readRun, unpack, sha256 } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const AUTHORITY = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const SOURCE_PACKET = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit');
const BC_EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-episode-evidence-b-vs-c');
const OUTPUT = resolve(ROOT, process.env.ANT_REVIEW_OUTPUT || 'docs/ant/evidence/2026-10-31-b-vs-c-author-review');
const VISUAL = resolve(OUTPUT, 'visual');
const SEEDS = ['20261005', '20261006', '20261007'];
const GRID = 96, COUNT = GRID * GRID, DT = 1 / 60, STEP_MS = 1000 / 60;
const SOURCE_FILES = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/renderers/AntRenderer.js'
];
const BROWSER_EXE = process.env.BROWSER_EXECUTABLE_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const bytes = value => Buffer.from(value.buffer, value.byteOffset, value.byteLength);
const digest = value => createHash('sha256').update(value).digest('hex');
const normalizeText = value => value.replace(/\r\n?/g, '\n');
const indexOf = (x, y) => Math.round(x * (GRID - 1)) + Math.round(y * (GRID - 1)) * GRID;
const point = i => ({ x: i % GRID / (GRID - 1), y: Math.floor(i / GRID) / (GRID - 1) });
const frameKey = (seed, index) => seed + ':' + index;
const safeName = value => value.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

function countedLcg(seed) {
  let state = Number(seed) >>> 0, calls = 0;
  return { random() { calls++; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; },
    get calls() { return calls; }, state() { return state; } };
}

export function productionThinning(sourceText) {
  const neighborStart = sourceText.indexOf('function neighborValues(');
  const samplerStart = sourceText.indexOf('function createPheromoneSampler(', neighborStart);
  const thinStart = sourceText.indexOf('function zhangSuen(');
  const componentsStart = sourceText.indexOf('function skeletonComponents(', thinStart);
  assert.ok(neighborStart >= 0 && samplerStart > neighborStart && thinStart >= 0 && componentsStart > thinStart,
    'production thinning helpers found');
  const math = Object.create(Math); math.random = () => { throw Error('observer called Math.random'); };
  return runInNewContext('const TRAIL_PLATE_GRID_SIZE=96;\n' + sourceText.slice(neighborStart, samplerStart)
    + sourceText.slice(thinStart, componentsStart) + '({zhangSuen})', { Math: math }).zhangSuen;
}

function lastBirthMap(priorPlates, currentBirths = []) {
  const excluded = new Set(currentBirths.map(plate => plate.id));
  const result = new Float64Array(COUNT); result.fill(-1);
  for (const plate of priorPlates) {
    if (excluded.has(plate.id)) continue;
    for (let i = 0; i < COUNT; i++) if (plate.mask[i]) result[i] = plate.bornAtSimulationTimeMs;
  }
  return result;
}

function assertArrayEqual(actual, packed, label) {
  const expected = unpack(packed);
  assert.ok(expected, label + ' source array');
  assert.equal(actual.constructor.name, expected.constructor.name, label + ' type');
  assert.equal(actual.length, expected.length, label + ' length');
  assert.equal(Buffer.compare(bytes(actual), bytes(expected)), 0, label + ' exact bytes');
  return digest(bytes(actual));
}

function sortedRows(rows) {
  return [...rows].sort((a, b) => b.value - a.value || a.index - b.index);
}

function bestNonEntry(rows) {
  return sortedRows(rows.filter(row => row.entryDistance > .15))[0] || null;
}

function toCandidate(row, channel, role) {
  if (!row) return null;
  return { channel, role, centerIndex: row.index, captureId: row.captureId, value: row.value,
    rank: row.rank, entryDistance: row.entryDistance, trackId: row.trackIds?.['0.025'] ?? null,
    component: row.component, x: row.x, y: row.y };
}

function jaccard(a, b) {
  const right = new Set(b); let common = 0;
  for (const value of a) common += Number(right.has(value));
  return common / (a.length + b.length - common);
}

async function verifyAuthorities() {
  const sourceHashes = {};
  for (const file of SOURCE_FILES) {
    const actual = normalizeText(await readFile(resolve(ROOT, file), 'utf8'));
    sourceHashes[file] = digest(Buffer.from(actual));
  }
  return { authority: AUTHORITY, branch: process.env.ANT_REVIEW_BRANCH || null,
    head: process.env.ANT_REVIEW_HEAD || null, sourceCheck: process.env.ANT_REVIEW_SOURCE_CHECK || null, sourceHashes };
}

async function inputHashes() {
  const paths = [
    resolve(SOURCE_PACKET, 'manifest.json'), resolve(BC_EVIDENCE, 'analysis/manifest.json'),
    resolve(BC_EVIDENCE, 'analysis/inputs.json'), resolve(BC_EVIDENCE, 'analysis/cases.json'),
    resolve(BC_EVIDENCE, 'analysis/summary.json')
  ];
  const hashes = {};
  for (const path of paths) hashes[path.slice(ROOT.length + 1)] = digest(await readFile(path));
  return hashes;
}

async function verifyBCEvidenceManifest() {
  const path = resolve(BC_EVIDENCE, 'analysis/manifest.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(manifest.sourcePacketCommit, 'da599d9f385f53d0bb24df3e737c5ed2e2eb6a23',
    'registered frozen opportunity packet commit');
  assert.equal(manifest.authority, AUTHORITY, 'registered production authority');
  assert.equal(manifest.sourcePacketManifestSha256, digest(await readFile(resolve(SOURCE_PACKET, 'manifest.json'))),
    'frozen source manifest hash inherited by B/C analysis');
  for (const item of manifest.files) {
    const packed = await readFile(resolve(BC_EVIDENCE, item.file));
    let actual = digest(packed);
    if (actual !== item.sha256 && !item.file.endsWith('.gz')) actual = digest(Buffer.from(normalizeText(packed.toString('utf8'))));
    assert.equal(actual, item.sha256, 'frozen B/C analysis manifest: ' + item.file);
  }
  return digest(await readFile(path));
}

async function loadTrackRun(seed) {
  return JSON.parse(gunzipSync(await readFile(resolve(BC_EVIDENCE, `analysis/track-observations-${seed}.json.gz`))));
}

function startRunCandidate(track, channel, predicate) {
  let best = null, previous = null, current = [];
  const consider = () => {
    if (!current.length) return;
    const candidate = { seed: track.seed, channel, trackId: track.id, trackClass: track.classification ?? null,
      startAnchor: current[0].anchorIndex, endAnchor: current.at(-1).anchorIndex, observations: current.length,
      chosen: current[Math.floor((current.length - 1) / 2)], trackObservations: track.observations };
    const earlier = !best || candidate.seed.localeCompare(best.seed) < 0
      || (candidate.seed === best.seed && (Number(candidate.trackId) < Number(best.trackId)
        || (candidate.trackId === best.trackId && candidate.startAnchor < best.startAnchor)));
    if (!best || candidate.observations > best.observations
      || (candidate.observations === best.observations && earlier)) best = candidate;
  };
  for (const row of track.observations) {
    if (predicate(row) && (previous === null || row.anchorIndex === previous + 1)) current.push(row);
    else { consider(); current = predicate(row) ? [row] : []; }
    previous = row.anchorIndex;
  }
  consider();
  return best;
}

function betterDelta(current, candidate, key) {
  const earlier = current && (candidate.seed.localeCompare(current.seed) < 0
    || (candidate.seed === current.seed && (Number(candidate.trackId) < Number(current.trackId)
      || (candidate.trackId === current.trackId && candidate.observation.anchorIndex < current.observation.anchorIndex))));
  if (!current || candidate.observation[key] > current.observation[key]
    || (candidate.observation[key] === current.observation[key] && earlier)) return candidate;
  return current;
}

async function scanOpportunities(seed, pairedRows) {
  const base = resolve(SOURCE_PACKET, 'analysis'), metaPath = resolve(base, `seed-${seed}.opportunities.json.gz`);
  const meta = await readJson(metaPath), ratios = [], candidates = new Map(), pairByIndex = new Map(pairedRows.map(row => [row.anchorIndex, row]));
  let entryPair = null;
  for (let chunkIndex = 0; chunkIndex < meta.anchorsFiles.length; chunkIndex++) {
    const file = meta.anchorsFiles[chunkIndex];
    const packed = await readFile(resolve(base, file));
    assert.equal(sha256(packed), meta.chunkHashes[file], 'opportunity chunk hash ' + file);
    const anchors = JSON.parse(gunzipSync(packed)).anchors;
    for (const anchor of anchors) {
      const channels = Object.fromEntries(['B', 'C'].map(channel => [channel,
        sortedRows(anchor.channels[channel].g15)]));
      const winners = Object.fromEntries(['B', 'C'].map(channel => [channel, channels[channel][0] || null]));
      const nonentry = Object.fromEntries(['B', 'C'].map(channel => [channel, bestNonEntry(channels[channel])]));
      const ratio = Object.fromEntries(['B', 'C'].map(channel => {
        const overall = winners[channel]?.value, local = nonentry[channel]?.value;
        return [channel, Number.isFinite(overall) && overall > 0 && Number.isFinite(local) ? local / overall : null];
      }));
      const paired = pairByIndex.get(anchor.index);
      if (paired && ratio.B !== null && ratio.C !== null && nonentry.B && nonentry.C) {
        ratios.push({ seed, anchorIndex: anchor.index, timeMs: anchor.timeMs, B: ratio.B, C: ratio.C,
          weakerRatio: Math.min(ratio.B, ratio.C), pairedXJaccard: paired.winners.xJaccard,
          pairedCenterDistance: paired.winners.centerDistance });
      }
      candidates.set(anchor.index, { seed, anchorIndex: anchor.index, timeMs: anchor.timeMs,
        winnerB: toCandidate(winners.B, 'B', 'winner'), winnerC: toCandidate(winners.C, 'C', 'winner'),
        nonentryB: toCandidate(nonentry.B, 'B', 'strongest-nonentry'),
        nonentryC: toCandidate(nonentry.C, 'C', 'strongest-nonentry'), ratio });

      const entries = Object.fromEntries(['B', 'C'].map(channel => [channel,
        channels[channel].filter(row => row.entryDistance <= .15)]));
      const firstEntryB = entries.B[0], firstEntryC = entries.C[0];
      if (!entryPair && firstEntryB && firstEntryC) entryPair = { seed, anchorIndex: anchor.index,
        timeMs: anchor.timeMs, B: toCandidate(firstEntryB, 'B', 'entry'), C: toCandidate(firstEntryC, 'C', 'entry') };

    }
    if ((chunkIndex + 1) % 15 === 0) console.log(JSON.stringify({ phase: 'opportunity-scan', seed, chunks: chunkIndex + 1,
      totalChunks: meta.anchorsFiles.length, anchors: candidates.size }));
  }
  assert.equal(candidates.size, meta.anchorsCount, 'all frozen opportunity anchors streamed');
  return { candidates, ratios, entryPair };
}

function compareBoundaryRefs(row, paired) {
  const calculatedCenterDistance = Math.hypot(row.winnerB.x - row.winnerC.x, row.winnerB.y - row.winnerC.y);
  assert.ok(Math.abs(calculatedCenterDistance - paired.winners.centerDistance) < 1e-12, 'winner center distance receipt');
  return { ...row, pairedMetrics: { centerDistance: paired.winners.centerDistance,
    winnerXJaccard: paired.winners.xJaccard, exactSameX: paired.winners.identicalX } };
}

function pickTop(rows, key, direction, count = 3) {
  return [...rows].filter(row => Number.isFinite(key(row))).sort((a, b) => direction * (key(a) - key(b))
    || a.seed.localeCompare(b.seed) || a.anchorIndex - b.anchorIndex).slice(0, count);
}

async function prepareSelection() {
  const cases = JSON.parse(await readFile(resolve(BC_EVIDENCE, 'analysis/cases.json'), 'utf8')).cases;
  assert.equal(cases.length, 6, 'registered objective case count');
  const pairedBySeed = new Map();
  for (const seed of SEEDS) {
    const packet = JSON.parse(gunzipSync(await readFile(resolve(BC_EVIDENCE, `analysis/paired-bc-boundaries-${seed}.json.gz`))));
    pairedBySeed.set(seed, packet.boundaries);
  }
  const caseFrames = cases.map(item => {
    const fractions = [['START', 0], ['25%', .25], ['50%', .5], ['75%', .75], ['END', 1]];
    return { seed: item.seed, category: item.category, channel: item.channel, trackId: item.trackId,
      durationSeconds: item.durationSeconds, frames: fractions.map(([label, fraction]) => {
        const i = Math.floor((item.observations.length - 1) * fraction), row = item.observations[i];
        return { label, observationIndex: i, anchorIndex: row.anchorIndex, timeMs: row.timeMs,
          centerIndex: row.centerIndex, captureId: row.captureId, value: row.value, rank: row.rank,
          entryDistance: row.entryDistance, metrics: Object.fromEntries(Object.entries(row)
            .filter(([key]) => /^(center(B|C|DeltaB|DeltaC|Feet|Travel)|x(MaterialOverlap|MeanLayers|MaxLayers|LatestBirthAgeSeconds)|x(B|C|DeltaB|DeltaC|Feet|Travel))/.test(key))) };
      }) };
  });

  const frameRequests = new Map();
  function request(seed, index, descriptor) {
    const key = frameKey(seed, index); if (!frameRequests.has(key)) frameRequests.set(key, { seed, anchorIndex: index, descriptors: [] });
    frameRequests.get(key).descriptors.push(descriptor);
  }
  for (const item of caseFrames) for (const frame of item.frames) request(item.seed, frame.anchorIndex,
    { type: 'objective-case', channel: item.channel, category: item.category, trackId: item.trackId, ...frame });

  const opportunityBySeed = new Map();
  const temporal = { zeroB: null, zeroC: null, riseB: null, riseC: null, matchedQuiet: null, matchedStrengthening: null };
  for (const seed of SEEDS) {
    console.log(JSON.stringify({ phase: 'track-load', seed }));
    const packedTracks = await loadTrackRun(seed), channels = { B: {}, C: {} };
    for (const [id, track] of Object.entries(packedTracks.channels)) channels[track.channel][id] = track;
    const zeroRuns = { B: [], C: [] }, risingAt = { B: new Map(), C: new Map() };
    for (const channel of ['B', 'C']) for (const track of Object.values(channels[channel])) {
      const quietField = channel === 'B' ? 'centerTravel5' : 'centerFeet5';
      const run = startRunCandidate({ ...track, seed }, channel, row => row[quietField] === 0 && row.value > 0);
      if (run) zeroRuns[channel].push(run);
      const old = temporal[channel === 'B' ? 'zeroB' : 'zeroC'];
      const earlierRun = old && (seed.localeCompare(old.seed) < 0
        || (seed === old.seed && (Number(track.id) < Number(old.trackId)
          || (track.id === old.trackId && run?.startAnchor < old.startAnchor))));
      if (run && (!old || run.observations > old.observations
        || (run.observations === old.observations && earlierRun))) temporal[channel === 'B' ? 'zeroB' : 'zeroC'] = run;
      for (const obs of track.observations) {
        const key = channel === 'B' ? 'centerDeltaB20' : 'centerDeltaC5';
        const input = channel === 'B' ? 'centerTravel20' : 'centerFeet5';
        if (obs[input] > 0 && obs[key] > 0) {
          const candidate = { seed, channel, trackId: track.id, observation: obs, trackObservations: track.observations };
          const name = channel === 'B' ? 'riseB' : 'riseC';
          temporal[name] = betterDelta(temporal[name], candidate, key);
          if (!risingAt[channel].has(obs.anchorIndex)) risingAt[channel].set(obs.anchorIndex, candidate);
        }
      }
    }
    const quietPairs = [];
    for (const bRun of zeroRuns.B) for (const cRun of zeroRuns.C) {
      const startAnchor = Math.max(bRun.startAnchor, cRun.startAnchor), endAnchor = Math.min(bRun.endAnchor, cRun.endAnchor);
      if (startAnchor <= endAnchor) quietPairs.push({ bRun, cRun, startAnchor, endAnchor, overlap: endAnchor - startAnchor + 1 });
    }
    quietPairs.sort((a, b) => b.overlap - a.overlap || a.startAnchor - b.startAnchor
      || Number(a.bRun.trackId) - Number(b.bRun.trackId) || Number(a.cRun.trackId) - Number(b.cRun.trackId));
    if (!temporal.matchedQuiet && quietPairs.length) {
      const chosen = quietPairs[0], anchorIndex = Math.floor((chosen.startAnchor + chosen.endAnchor) / 2);
      const b = chosen.bRun.trackObservations.find(row => row.anchorIndex === anchorIndex);
      const c = chosen.cRun.trackObservations.find(row => row.anchorIndex === anchorIndex);
      temporal.matchedQuiet = { seed, anchorIndex, timeMs: b.timeMs, B: { ...b, channel: 'B', role: 'zero-travel', trackId: chosen.bRun.trackId },
        C: { ...c, channel: 'C', role: 'zero-contact', trackId: chosen.cRun.trackId },
        overlapObservations: chosen.overlap };
    }
    const strengtheningIndex = [...risingAt.B.keys()].filter(index => risingAt.C.has(index)).sort((a, b) => a - b)[0];
    if (!temporal.matchedStrengthening && strengtheningIndex !== undefined) {
      const b = risingAt.B.get(strengtheningIndex), c = risingAt.C.get(strengtheningIndex);
      temporal.matchedStrengthening = { seed, anchorIndex: strengtheningIndex, timeMs: b.observation.timeMs,
        B: { ...b.observation, channel: 'B', role: 'travel-plus-rising-B', trackId: b.trackId },
        C: { ...c.observation, channel: 'C', role: 'feet-plus-rising-C', trackId: c.trackId } };
    }
    const paired = pairedBySeed.get(seed);
    console.log(JSON.stringify({ phase: 'track-scan-complete', seed }));
    const scan = await scanOpportunities(seed, paired);
    opportunityBySeed.set(seed, scan);
    console.log(JSON.stringify({ phase: 'seed-selection-complete', seed }));
  }

  const allPairs = SEEDS.flatMap(seed => pairedBySeed.get(seed).map(row => ({ seed, anchorIndex: row.anchorIndex,
    timeMs: row.timeMs, winners: row.winners })));
  const centerDisagreement = pickTop(allPairs, row => row.winners.centerDistance, -1);
  const lowWinnerOverlap = pickTop(allPairs, row => row.winners.xJaccard, 1);
  const localAgreement = pickTop(allPairs, row => row.winners.xJaccard, -1);
  const nonentryRows = SEEDS.flatMap(seed => opportunityBySeed.get(seed).ratios);
  const bothStrongNonentry = [...nonentryRows].sort((a, b) => b.weakerRatio - a.weakerRatio
    || b.B - a.B || b.C - a.C || a.seed.localeCompare(b.seed) || a.anchorIndex - b.anchorIndex).slice(0, 3);
  const selectedBoundaryLists = [
    ['largest-winner-separation', centerDisagreement], ['lowest-winner-X-overlap', lowWinnerOverlap],
    ['highest-winner-X-overlap', localAgreement], ['jointly-strong-nonentry', bothStrongNonentry]
  ];
  const selectedPairs = [];
  for (const [category, list] of selectedBoundaryLists) for (const metric of list) {
    const candidate = opportunityBySeed.get(metric.seed).candidates.get(metric.anchorIndex);
    assert.ok(candidate?.winnerB && candidate?.winnerC, 'paired winners available at selected boundary');
    const paired = pairedBySeed.get(metric.seed).find(row => row.anchorIndex === metric.anchorIndex);
    const row = compareBoundaryRefs(candidate, paired);
    row.categories = [category];
    const prior = selectedPairs.find(item => item.seed === row.seed && item.anchorIndex === row.anchorIndex);
    if (prior) prior.categories.push(category); else selectedPairs.push(row);
  }
  const matchedExamples = {
    entry: SEEDS.map(seed => opportunityBySeed.get(seed).entryPair).find(Boolean) || null,
    quiet: temporal.matchedQuiet,
    strengthening: temporal.matchedStrengthening
  };
  for (const pair of selectedPairs) request(pair.seed, pair.anchorIndex, { type: 'paired-comparison', ...pair });
  for (const [name, pair] of Object.entries(matchedExamples)) if (pair) request(pair.seed, pair.anchorIndex,
    { type: 'matched-' + name, ...pair });
  for (const name of ['zeroB', 'zeroC', 'riseB', 'riseC']) {
    const item = temporal[name]; if (!item) continue;
    const row = item.chosen || item.observation;
    request(item.seed, row.anchorIndex, { type: 'temporal-' + name, channel: item.channel, trackId: item.trackId,
      startAnchor: item.startAnchor ?? null, endAnchor: item.endAnchor ?? null, zeroRunObservations: item.observations ?? null,
      observation: row });
  }

  const targetIndices = new Map(SEEDS.map(seed => [seed, new Set()]));
  for (const frame of frameRequests.values()) targetIndices.get(frame.seed).add(frame.anchorIndex);
  const captureReceipts = new Map();
  for (const seed of SEEDS) {
    const wanted = targetIndices.get(seed), scan = opportunityBySeed.get(seed);
    const captureRefs = [];
    for (const caseItem of caseFrames.filter(row => row.seed === seed)) for (const frame of caseItem.frames) {
      captureRefs.push({ seed, anchorIndex: frame.anchorIndex, channel: caseItem.channel, role: caseItem.category,
        trackId: caseItem.trackId, centerIndex: frame.centerIndex, captureId: frame.captureId });
    }
    for (const pair of selectedPairs.filter(row => row.seed === seed)) {
      for (const role of ['winnerB', 'winnerC', 'nonentryB', 'nonentryC']) if (pair[role]) captureRefs.push({
        seed, anchorIndex: pair.anchorIndex, channel: pair[role].channel, role: pair[role].role,
        trackId: pair[role].trackId, centerIndex: pair[role].centerIndex, captureId: pair[role].captureId });
    }
    for (const pair of Object.values(matchedExamples)) if (pair?.seed === seed) for (const channel of ['B', 'C']) if (pair[channel]) captureRefs.push({
      seed, anchorIndex: pair.anchorIndex, channel, role: pair[channel].role, trackId: pair[channel].trackId,
      centerIndex: pair[channel].centerIndex, captureId: pair[channel].captureId });
    for (const name of ['zeroB', 'zeroC', 'riseB', 'riseC']) {
      const item = temporal[name]; if (!item || item.seed !== seed) continue;
      const row = item.chosen || item.observation;
      captureRefs.push({ seed, anchorIndex: row.anchorIndex, channel: item.channel, role: 'temporal-' + name,
        trackId: item.trackId, centerIndex: row.centerIndex, captureId: row.captureId });
    }
    const sourceMeta = await readJson(resolve(SOURCE_PACKET, `analysis/seed-${seed}.opportunities.json.gz`));
    assert.equal(sourceMeta.anchorsCount, 599, 'frozen opportunity anchor count');
    assert.equal(sourceMeta.anchorsFiles.length, 60, 'frozen opportunity chunk count');
    const selectedChunks = [...new Set([...wanted].map(index => Math.floor(index / 10)))].sort((a, b) => a - b);
    for (const chunkIndex of selectedChunks) {
      const file = sourceMeta.anchorsFiles[chunkIndex];
      assert.ok(file, 'selected opportunity chunk exists');
      const path = resolve(SOURCE_PACKET, 'analysis', file), packed = await readFile(path);
      assert.equal(sha256(packed), sourceMeta.chunkHashes[file], 'target opportunity packet hash ' + file);
      const anchors = JSON.parse(gunzipSync(packed)).anchors;
      assert.equal(anchors[0].index, chunkIndex * 10, 'registered opportunity chunk start index');
      for (const anchor of anchors) {
        if (!wanted.has(anchor.index)) continue;
        const ids = new Set(captureRefs.filter(ref => ref.anchorIndex === anchor.index).map(ref => ref.captureId));
        for (const captureId of ids) {
          const capture = anchor.captures.find(item => item.id === captureId);
          assert.ok(capture, `registered capture ${captureId} exists at ${seed}/${anchor.index}`);
          const refs = captureRefs.filter(ref => ref.anchorIndex === anchor.index && ref.captureId === captureId);
          for (const ref of refs) assert.ok(capture.centerIndex === ref.centerIndex || capture.centers.some(center =>
            center.channel === ref.channel && center.representation === 'g15' && center.index === ref.centerIndex),
          'registered X capture contains the requested channel/center reference');
          const cells = [...capture.cells].sort((a, b) => a - b);
          captureReceipts.set(`${seed}:${anchor.index}:${captureId}`, { seed, anchorIndex: anchor.index,
            timeMs: anchor.timeMs, captureId, canonicalCenterIndex: capture.centerIndex, centerRefs: capture.centers,
            nodeCount: capture.nodeCount,
            xSha256: digest(Buffer.from(JSON.stringify(cells))), cells, material: capture.material,
            centroid: capture.centroid, radiusValid: capture.radiusValid, connected: capture.connected });
        }
      }
    }
    for (const ref of captureRefs) assert.ok(captureReceipts.has(`${seed}:${ref.anchorIndex}:${ref.captureId}`),
      `exact X receipt found for ${seed}/${ref.anchorIndex}/${ref.captureId}`);
  }
  for (const caseItem of caseFrames) for (const frame of caseItem.frames) frame.x = captureReceipts.get(`${caseItem.seed}:${frame.anchorIndex}:${frame.captureId}`);
  for (const pair of selectedPairs) for (const role of ['winnerB', 'winnerC', 'nonentryB', 'nonentryC']) {
    if (pair[role]) pair[role].x = captureReceipts.get(`${pair.seed}:${pair.anchorIndex}:${pair[role].captureId}`);
  }
  for (const pair of Object.values(matchedExamples)) if (pair) for (const channel of ['B', 'C']) if (pair[channel]) {
    pair[channel].x = captureReceipts.get(`${pair.seed}:${pair.anchorIndex}:${pair[channel].captureId}`);
  }
  for (const name of ['zeroB', 'zeroC', 'riseB', 'riseC']) {
    const item = temporal[name]; if (!item) continue; const row = item.chosen || item.observation;
    item.x = captureReceipts.get(`${item.seed}:${row.anchorIndex}:${row.captureId}`);
    item.displayObservation = row;
    item.series = (item.trackObservations || []).map(observation => ({ anchorIndex: observation.anchorIndex,
      timeMs: observation.timeMs, centerValue: item.channel === 'B' ? observation.centerB : observation.centerC,
      input: item.channel === 'B' ? observation.centerTravel20 : observation.centerFeet5,
      signedChange: item.channel === 'B' ? observation.centerDeltaB20 : observation.centerDeltaC5,
      travel1: observation.centerTravel1, travel5: observation.centerTravel5, travel20: observation.centerTravel20,
      feet1: observation.centerFeet1, feet5: observation.centerFeet5, feet20: observation.centerFeet20,
      deltaB20: observation.centerDeltaB20, deltaC5: observation.centerDeltaC5 }));
    delete item.trackObservations;
  }

  const selection = { schema: 'ant-b-vs-c-author-review-selection-v1', authority: AUTHORITY,
    sourcePacketCommit: 'da599d9f385f53d0bb24df3e737c5ed2e2eb6a23', analysisCommit: 'a75b83ce5dbeece36d60d966b9d86fc85ddb5f54',
    selectionRules: {
      objectiveCases: 'Reused six prior registered B/C objective cases; five exact observations at floor((n-1)*{0,.25,.5,.75,1)).',
      disagreement: 'Top three registered boundaries by winner-center distance descending; tie seed then anchor index.',
      lowOverlap: 'Top three by registered winner-X Jaccard ascending; tie seed then anchor index.',
      agreement: 'Top three by registered winner-X Jaccard descending; tie seed then anchor index.',
      nonentry: 'Top three by maximin of separate within-channel strongest-nonentry/overall ratios; display selection only, no B/C evidence score or mechanism.',
      entryQuietStrengthening: 'First chronological shared boundary with available B and C cases meeting the labeled descriptive condition; not a gate.'
    },
    sourceHashes: await inputHashes(), caseSequences: caseFrames, pairedComparisons: selectedPairs,
    matchedExamples, temporal: Object.fromEntries(Object.entries(temporal).map(([key, value]) => [key, value ? {
      seed: value.seed, channel: value.channel, trackId: value.trackId, startAnchor: value.startAnchor ?? null,
      endAnchor: value.endAnchor ?? null, zeroRunObservations: value.observations ?? null,
      chosen: value.displayObservation, strengtheningObservation: value.observation ?? null, x: value.x, series: value.series
    } : null])),
    frames: [...frameRequests.values()].map(row => ({ ...row, descriptors: row.descriptors.map(item => {
      const { metrics, observation, ...safe } = item; return safe;
    }) })).sort((a, b) => a.seed.localeCompare(b.seed) || a.anchorIndex - b.anchorIndex),
    captureReceipts: [...captureReceipts.values()].sort((a, b) => a.seed.localeCompare(b.seed)
      || a.anchorIndex - b.anchorIndex || a.captureId.localeCompare(b.captureId)) };
  assert.ok(selection.frames.length > 0, 'review frames selected');
  return { selection };
}

export async function replaySeed(seed, frames, thinning, page, frameMeta) {
  const source = await readRun(resolve(SOURCE_PACKET, `analysis/seed-${seed}.signals.json.gz`));
  assert.equal(source.anchors.length, 599, 'frozen source analysis anchor count');
  const rng = countedLcg(seed), controller = new AntController({ random: rng.random });
  const birth = controller.trailPlateBirth, originalBuild = birth.buildSupportedMask, originalAdvance = birth.advance;
  let built = null, boundaryContext = null, birthIds = [];
  const frameByIndex = new Map(frames.map(item => [item.anchorIndex, item]));
  const sourceByTime = new Map(source.anchors.map(anchor => [anchor.timeMs, anchor]));
  const targetKeys = [];
  birth.buildSupportedMask = function (...args) {
    const result = originalBuild.apply(this, args);
    built = { E: result.mask.slice(), D: result.supports.slice() };
    return result;
  };
  birth.advance = function (...args) {
    const priorTime = this.lastAnalysisTimeMs, priorPlates = this.getPlates(); built = null;
    const result = originalAdvance.apply(this, args);
    if (this.lastAnalysisTimeMs !== priorTime) {
      const anchor = sourceByTime.get(this.lastAnalysisTimeMs);
      assert.ok(anchor, 'TrailPlateBirth boundary matches a frozen analysis timestamp');
      const material = controller.materialStratigraphy.getSnapshot().stratigraphy;
      const callsBeforeSnapshot = rng.calls;
      boundaryContext = { priorPlates, births: result,
        materialLayers: material.layerCountByCell.slice(), materialTop: material.topLayerByCell.slice(),
        snapshot: frameByIndex.has(anchor.index) ? structuredClone(controller.getSnapshot()) : null };
      assert.equal(rng.calls, callsBeforeSnapshot, 'analysis-boundary snapshot consumes no controller RNG');
    }
    return result;
  };
  controller.subscribe(({ type, payload }) => { if (type === 'plate-birth') birthIds.push(payload.id); });
  await controller.init();
  const start = performance.now(); let anchorCount = 0;
  for (let tick = 1; tick <= 600 * 60; tick++) {
    controller.tick(DT);
    if (birth.lastAnalysisTimeMs !== source.anchors[anchorCount]?.timeMs) {
      if (!source.anchors[anchorCount] || birth.lastAnalysisTimeMs === source.anchors[anchorCount]?.timeMs) continue;
      const sourceAnchor = source.anchors[anchorCount];
      if (!sourceAnchor || Math.abs(birth.lastAnalysisTimeMs - sourceAnchor.timeMs) > 1e-7) continue;
    }
    const sourceAnchor = source.anchors[anchorCount];
    if (!sourceAnchor || Math.abs(birth.lastAnalysisTimeMs - sourceAnchor.timeMs) > 1e-7) continue;
    assert.equal(sourceAnchor.tick, tick, 'frozen exact analysis tick');
    assert.ok(built && boundaryContext, 'production mask and birth context observed at analysis boundary');
    const beforeObserverRng = rng.calls;
    const originalMathRandom = Math.random; let hashes, materialLayers, materialTop;
    Math.random = () => { throw Error('observer attempted Math.random'); };
    try {
      const E = built.E, F = thinning(E), B = birth.chemicalMemory.slice(), D = built.D;
      const C = new Float32Array(COUNT);
      for (let i = 0; i < COUNT; i++) C[i] = controller.surfaceField.sample((i % GRID) / (GRID - 1), Math.floor(i / GRID) / (GRID - 1));
      const lastBirthMs = lastBirthMap(boundaryContext.priorPlates, boundaryContext.births);
      materialLayers = Array.from(boundaryContext.materialLayers); materialTop = Array.from(boundaryContext.materialTop);
      hashes = {
        E: assertArrayEqual(E, sourceAnchor.E, 'E'), F: assertArrayEqual(F, sourceAnchor.F, 'F'),
        B: assertArrayEqual(B, sourceAnchor.B, 'B'), C: assertArrayEqual(C, sourceAnchor.C, 'C'),
        D: assertArrayEqual(D, sourceAnchor.D, 'D'),
        layers: assertArrayEqual(boundaryContext.materialLayers, sourceAnchor.material.layers, 'material layers'),
        top: assertArrayEqual(boundaryContext.materialTop, sourceAnchor.material.top, 'material top'),
        lastBirthMs: assertArrayEqual(lastBirthMs, sourceAnchor.material.lastBirthMs, 'prior local birth map')
      };
    } finally { Math.random = originalMathRandom; }
    assert.deepEqual(birthIds, sourceAnchor.birthIds, 'actual production Plate birth IDs');
    assert.equal(rng.calls, beforeObserverRng, 'observer reads consume zero controller RNG');
    const selected = frameByIndex.get(sourceAnchor.index);
    if (selected) {
      const snapshot = boundaryContext.snapshot;
      assert.ok(snapshot, 'registered analysis-boundary world snapshot captured');
      assert.equal(snapshot.analysis.simulationTimeMs, sourceAnchor.timeMs, 'world frame matches frozen analysis time');
      const png1 = await renderWorld(page, snapshot), png2 = await renderWorld(page, snapshot);
      assert.equal(sha256(png1), sha256(png2), 'same renderer snapshot gives deterministic PNG');
      assert.equal(rng.calls, beforeObserverRng, 'snapshot rendering consumes zero controller RNG');
      const name = `seed-${seed}-anchor-${String(sourceAnchor.index).padStart(3, '0')}.png`;
      const path = resolve(VISUAL, 'world-frames', name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, png1);
      const key = frameKey(seed, sourceAnchor.index);
      frameMeta.set(key, { seed, anchorIndex: sourceAnchor.index, tick, timeMs: sourceAnchor.timeMs,
        worldFile: 'visual/world-frames/' + name, worldSha256: sha256(png1), bytes: png1.length,
        antCount: snapshot.agents.length, birthIds: [...birthIds], arrays: hashes,
        materialLayers, materialTop,
        savedWorldAnchorSha256: digest(Buffer.from(JSON.stringify({ timeMs: sourceAnchor.timeMs, tick,
          E: hashes.E, F: hashes.F, B: hashes.B, C: hashes.C, D: hashes.D,
          layers: hashes.layers, top: hashes.top, lastBirthMs: hashes.lastBirthMs, birthIds: sourceAnchor.birthIds }))) });
      targetKeys.push(key);
    }
    birthIds = []; built = null; boundaryContext = null; anchorCount++;
    if (tick % 3600 === 0) console.log(JSON.stringify({ seed, seconds: tick / 60, anchors: anchorCount,
      selectedFrames: targetKeys.length, elapsedSeconds: (performance.now() - start) / 1000 }));
  }
  assert.equal(anchorCount, 599, 'all current-production boundaries compared to frozen source');
  assert.equal(rng.calls, source.validation?.parity?.rngCalls?.observed ?? rng.calls,
    'final replay RNG count matches frozen observer run when recorded');
  assert.equal(rng.state(), source.validation?.parity?.finalRngState?.observed ?? rng.state(),
    'replay RNG state matches frozen observer run when recorded');
  return { seed, anchorsCompared: anchorCount, selectedFrames: targetKeys.length,
    rngCalls: rng.calls, rngState: rng.state(), elapsedSeconds: (performance.now() - start) / 1000 };
}

async function renderWorld(page, snapshot) {
  await page.evaluate(async state => {
    window.__reviewRenderer.render(state);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, snapshot);
  return await page.locator('#world').screenshot({ type: 'png' });
}

export async function makeBrowser() {
  const server = await createServer({ configFile: false, base: '/', server: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ headless: true, executablePath: BROWSER_EXE });
  const errors = [], page = await browser.newPage({ viewport: { width: 760, height: 760 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.stack || String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__b_v_c_author_review`;
  await page.route(`${new URL(url).origin}/review-harness.js`, route => route.fulfill({ contentType: 'text/javascript', body: '// valid empty harness source\n' }));
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>body{margin:0;background:#fff}canvas{display:block}</style><script src="/review-harness.js"></script></head><body><canvas id="world"></canvas></body></html>' }));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const { AntRenderer } = await import('/src/lib/renderers/AntRenderer.js');
    const renderer = new AntRenderer(document.querySelector('#world'));
    await renderer.init({ width: 720, height: 720, pixelRatio: 1 });
    renderer.setDebugOptions({ pheromone: false, material: true, surface: false, candidate: false,
      source: false, exposure: false, plateIds: false, plateOutlines: false, plateCenterlines: false, platePickups: false });
    window.__reviewRenderer = renderer;
  });
  return { server, browser, page, errors };
}

async function compose(page, spec) {
  return await page.evaluate(async input => {
    const grid = 96, load = async data => { const img = new Image(); img.src = data; await img.decode(); return img; };
    const gap = input.gap ?? 10, margin = input.margin ?? 18, header = input.header ?? 72;
    const tileW = input.tileW ?? 190, imageH = input.imageH ?? 190, labelH = input.labelH ?? 48;
    const columns = input.columns ?? input.rows[0].panels.length;
    const rows = input.rows, rowHeights = rows.map(row => (input.rowLabel ? 26 : 0) + labelH + imageH
      + (row.panels.some(panel => panel.caption) ? 48 : 0));
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    canvas.width = margin * 2 + columns * tileW + (columns - 1) * gap;
    canvas.height = header + margin + rowHeights.reduce((sum, height) => sum + height, 0)
      + Math.max(0, rows.length - 1) * gap + margin;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#17202b'; ctx.font = 'bold 22px Arial'; ctx.fillText(input.title, margin, 30);
    ctx.fillStyle = '#485463'; ctx.font = '13px Arial'; ctx.fillText(input.subtitle || '', margin, 52);
    const drawX = (cells, x, y, size, color) => {
      if (!cells?.length) return;
      const set = new Set(cells), step = size / (grid - 1), half = step / 2;
      ctx.beginPath(); ctx.strokeStyle = color || '#00a08a'; ctx.lineWidth = Math.max(1, size / 480);
      for (const cell of set) {
        const col = cell % grid, row = Math.floor(cell / grid), cx = x + col * step, cy = y + row * step;
        const left = cx - half, right = cx + half, top = cy - half, bottom = cy + half;
        if (row === 0 || !set.has(cell - grid)) { ctx.moveTo(left, top); ctx.lineTo(right, top); }
        if (col === grid - 1 || !set.has(cell + 1)) { ctx.moveTo(right, top); ctx.lineTo(right, bottom); }
        if (row === grid - 1 || !set.has(cell + grid)) { ctx.moveTo(right, bottom); ctx.lineTo(left, bottom); }
        if (col === 0 || !set.has(cell - 1)) { ctx.moveTo(left, bottom); ctx.lineTo(left, top); }
      }
      ctx.stroke();
    };
    const drawMaterial = (values, x, y, size, max) => {
      const scale = size / grid, limit = Math.max(1, max || 1);
      for (let i = 0; i < values.length; i++) if (values[i] > 0) {
        const alpha = .12 + .72 * Math.min(1, values[i] / limit);
        ctx.fillStyle = `rgba(115,70,38,${alpha})`;
        ctx.fillRect(x + (i % grid) * scale, y + Math.floor(i / grid) * scale, scale + .1, scale + .1);
      }
    };
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r], y0 = header + margin + rowHeights.slice(0, r).reduce((sum, height) => sum + height, 0) + r * gap;
      if (input.rowLabel) { ctx.fillStyle = '#344252'; ctx.font = 'bold 12px Arial'; ctx.fillText(row.label || '', margin, y0 + 15); }
      const top = y0 + (input.rowLabel ? 22 : 0);
      for (let c = 0; c < row.panels.length; c++) {
        const panel = row.panels[c], x = margin + c * (tileW + gap), labelY = top + 13;
        ctx.fillStyle = '#17202b'; ctx.font = 'bold 11px Arial'; ctx.fillText(panel.label || '', x, labelY, tileW - 4);
        const iy = top + labelH;
        if (panel.data) { const img = await load(panel.data); ctx.drawImage(img, x, iy, tileW, imageH); }
        else { ctx.fillStyle = '#f4f6f8'; ctx.fillRect(x, iy, tileW, imageH); }
        if (panel.materialLayers) drawMaterial(panel.materialLayers, x, iy, Math.min(tileW, imageH), panel.materialMax);
        if (panel.xCells) drawX(panel.xCells, x, iy, Math.min(tileW, imageH), panel.color);
        if (panel.centerIndex !== undefined && panel.centerIndex !== null) {
          const step = Math.min(tileW, imageH) / (grid - 1), center = panel.centerIndex;
          ctx.beginPath(); ctx.fillStyle = panel.color || '#17202b'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
          ctx.arc(x + (center % grid) * step, iy + Math.floor(center / grid) * step, Math.max(3, tileW / 45), 0, 2 * Math.PI);
          ctx.fill(); ctx.stroke();
        }
        if (panel.textLines) {
          ctx.fillStyle = '#f4f6f8'; ctx.fillRect(x + 1, iy + 1, tileW - 2, imageH - 2);
          ctx.fillStyle = '#24313e'; ctx.font = `${panel.textFont ?? 10}px Arial`;
          panel.textLines.forEach((line, i) => ctx.fillText(line, x + 8, iy + 18 + i * (panel.textLineHeight ?? 19), tileW - 14));
        }
        ctx.strokeStyle = '#b6c0ca'; ctx.lineWidth = 1; ctx.strokeRect(x, iy, tileW, imageH);
        ctx.fillStyle = '#465362'; ctx.font = '10px Arial';
        const caption = panel.caption || '';
        const lines = caption.match(/.{1,34}(?:\s|$)/g) || [caption];
        lines.slice(0, 3).forEach((line, i) => ctx.fillText(line.trim(), x, iy + imageH + 13 + i * 12));
      }
    }
    return canvas.toDataURL('image/png');
  }, spec);
}

export async function writeComposite(page, spec, output) {
  const first = Buffer.from((await compose(page, spec)).split(',')[1], 'base64');
  const second = Buffer.from((await compose(page, spec)).split(',')[1], 'base64');
  assert.equal(sha256(first), sha256(second), 'composite regeneration deterministic');
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, first);
  return { file: output.slice(ROOT.length + 1).replaceAll('\\', '/'), bytes: first.length,
    dimensions: { width: first.readUInt32BE(16), height: first.readUInt32BE(20) }, sha256: sha256(first), deterministic: true };
}

function temporalTraceSvg(selection) {
  const rows = ['zeroB', 'zeroC', 'riseB', 'riseC'].map(key => [key, selection.temporal[key]]).filter(([, row]) => row?.series?.length);
  const width = 1360, header = 92, rowHeight = 220, height = header + rows.length * rowHeight + 24;
  const left = 22, colGap = 18, colWidth = (width - left * 2 - colGap * 2) / 3;
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const pieces = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<style>text{font-family:Arial,sans-serif;fill:#17202b}.title{font-size:22px;font-weight:bold}.sub{font-size:12px;fill:#485463}.row{font-size:14px;font-weight:bold}.head{font-size:11px;font-weight:bold}.axis{font-size:9px;fill:#546170}.grid{stroke:#dce2e8;stroke-width:1}</style>',
    `<rect width="100%" height="100%" fill="#fff"/><text x="${left}" y="30" class="title">B/C episode histories · native state and recent input</text>`,
    `<text x="${left}" y="53" class="sub">Each chart has its own labeled native axis. Rows are separate unpaired track examples; they do not compare B and C magnitudes.</text>`,
    `<text x="${left}" y="72" class="sub">B history is qualified chemical memory; C is contact-written SurfaceField compaction. Δ and activity stay descriptive.</text>`];
  for (let r = 0; r < rows.length; r++) {
    const [key, item] = rows[r], channel = item.channel, isZero = key.startsWith('zero');
    const series = item.series, color = channel === 'B' ? '#007f73' : '#c45522';
    const chosenAnchor = item.chosen?.anchorIndex ?? item.strengtheningObservation?.anchorIndex ?? null;
    const title = isZero ? `${channel} · longest tracked quiet interval · seed ${item.seed} · track ${item.trackId} · ${item.zeroRunObservations} anchors`
      : `${channel} · strongest positive signed change with recent input · seed ${item.seed} · track ${item.trackId} · selected anchor ${chosenAnchor}`;
    const yTop = header + r * rowHeight;
    pieces.push(`<text x="${left}" y="${yTop + 16}" class="row">${escape(title)}</text>`);
    const seriesNames = [
      ['centerValue', channel === 'B' ? 'B level · native value' : 'C sample · native value'],
      [isZero ? (channel === 'B' ? 'travel5' : 'feet5') : 'input',
        isZero ? (channel === 'B' ? 'Realized travel · prior 5 s · world units' : 'FOOT_CONTACT points · prior 5 s')
          : (channel === 'B' ? 'Realized travel · prior 20 s · world units' : 'FOOT_CONTACT points · prior 5 s')],
      ['signedChange', channel === 'B' ? 'ΔB · prior 20 s' : 'ΔC · prior 5 s']
    ];
    for (let c = 0; c < seriesNames.length; c++) {
      const [field, label] = seriesNames[c], x = left + c * (colWidth + colGap), plotX = x + 35, plotY = yTop + 42;
      const plotW = colWidth - 48, plotH = 128, values = series.map(row => field === 'input'
        ? row.input : row[field]).filter(Number.isFinite);
      const min0 = Math.min(...values), max0 = Math.max(...values), pad = Math.max((max0 - min0) * .08, 1e-7);
      const min = min0 - pad, max = max0 + pad, t0 = series[0].timeMs, t1 = series.at(-1).timeMs || t0 + 1;
      const xPos = row => plotX + ((row.timeMs - t0) / (t1 - t0 || 1)) * plotW;
      const yPos = value => plotY + plotH - ((value - min) / (max - min)) * plotH;
      pieces.push(`<text x="${x}" y="${yTop + 34}" class="head">${escape(label)}</text>`);
      for (let g = 0; g <= 2; g++) {
        const y = plotY + g * plotH / 2, val = max - (max - min) * g / 2;
        pieces.push(`<line x1="${plotX}" y1="${y}" x2="${plotX + plotW}" y2="${y}" class="grid"/>`);
        pieces.push(`<text x="${x + 1}" y="${y + 3}" class="axis">${val.toPrecision(3)}</text>`);
      }
      if (isZero) {
        const first = series.find(row => row.anchorIndex === item.startAnchor), last = series.find(row => row.anchorIndex === item.endAnchor);
        if (first && last) pieces.push(`<rect x="${xPos(first)}" y="${plotY}" width="${Math.max(1, xPos(last) - xPos(first))}" height="${plotH}" fill="${color}" opacity=".09"/>`);
      }
      const path = series.filter(row => Number.isFinite(field === 'input' ? row.input : row[field]))
        .map((row, index) => `${index ? 'L' : 'M'}${xPos(row).toFixed(2)},${yPos(field === 'input' ? row.input : row[field]).toFixed(2)}`).join(' ');
      pieces.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="1.6"/>`);
      if (!isZero && chosenAnchor !== null) {
        const chosen = series.find(row => row.anchorIndex === chosenAnchor);
        if (chosen) pieces.push(`<line x1="${xPos(chosen)}" y1="${plotY}" x2="${xPos(chosen)}" y2="${plotY + plotH}" stroke="#26333f" stroke-dasharray="3 3"/>`);
      }
      pieces.push(`<text x="${plotX}" y="${plotY + plotH + 14}" class="axis">${(t0 / 1000).toFixed(1)} s</text>`);
      pieces.push(`<text x="${plotX + plotW - 36}" y="${plotY + plotH + 14}" class="axis">${(t1 / 1000).toFixed(1)} s</text>`);
    }
  }
  pieces.push('</svg>');
  return pieces.join('');
}

async function makeVisualAssets(page, selection, frameMeta) {
  const visualRecords = [], inputData = new Map();
  const fmt = (value, digits = 5) => Number.isFinite(value) ? value.toFixed(digits) : '—';
  let materialScaleMax = 1;
  for (const frame of frameMeta.values()) for (const layers of frame.materialLayers) materialScaleMax = Math.max(materialScaleMax, layers);
  for (const [key, frame] of frameMeta) {
    const bytes = await readFile(resolve(OUTPUT, frame.worldFile));
    inputData.set(key, 'data:image/png;base64,' + bytes.toString('base64'));
  }
  const panel = (seed, index, label, capture, caption = '', color) => ({
    data: inputData.get(frameKey(seed, index)), label, xCells: capture?.cells, color, caption });
  const caseRows = [];
  for (const item of selection.caseSequences) {
    const panels = item.frames.map(frame => panel(item.seed, frame.anchorIndex, frame.label, frame.x,
      `${(frame.timeMs / 1000).toFixed(3)} s · ${item.channel}=${frame.value.toFixed(5)} · layers ${frame.metrics.xMeanLayers.toFixed(2)} / max ${frame.metrics.xMaxLayers}`,
      item.channel === 'B' ? '#007f73' : '#c45522'));
    const sequence = { label: `${item.category} · ${item.channel} · seed ${item.seed} · track ${item.trackId}`,
      panels };
    const spec = { title: sequence.label, subtitle: 'Exact saved analysis anchors. Actual production world rendered unchanged; only the candidate X outline differs.',
      rows: [sequence], tileW: 210, imageH: 210, labelH: 29, header: 60, gap: 8, margin: 16 };
    const output = resolve(VISUAL, 'objective-cases', safeName(item.category) + '.png');
    const made = await writeComposite(page, spec, output); visualRecords.push(made);
    caseRows.push({ ...sequence, file: made.file });

    const technicalRows = item.frames.map(frame => {
      const key = frameKey(item.seed, frame.anchorIndex), materialLayers = frameMeta.get(key).materialLayers;
      const m = frame.metrics, n = value => Number.isFinite(value) ? value.toFixed(5) : '—';
      const channelLines = item.channel === 'B'
        ? [`B ${n(frame.value)} · native chemical memory`, `ΔB 1/5/20 s ${n(m.centerDeltaB1)} / ${n(m.centerDeltaB5)} / ${n(m.centerDeltaB20)}`,
          `Travel 1/5/20 s ${n(m.centerTravel1)} / ${n(m.centerTravel5)} / ${n(m.centerTravel20)} world units`,
          `X material overlap ${n(m.xMaterialOverlap)}`, `Mean/max layers ${n(m.xMeanLayers)} / ${n(m.xMaxLayers)}`,
          `Latest local birth age ${n(m.xLatestBirthAgeSeconds)} s`]
        : [`C ${n(frame.value)} · native SurfaceField sample`, `ΔC 1/5/20 s ${n(m.centerDeltaC1)} / ${n(m.centerDeltaC5)} / ${n(m.centerDeltaC20)}`,
          `FOOT_CONTACT 1/5/20 s ${n(m.centerFeet1)} / ${n(m.centerFeet5)} / ${n(m.centerFeet20)} points`,
          `X material overlap ${n(m.xMaterialOverlap)}`, `Mean/max layers ${n(m.xMeanLayers)} / ${n(m.xMaxLayers)}`,
          `Latest local birth age ${n(m.xLatestBirthAgeSeconds)} s`];
      return { label: `${(frame.timeMs / 1000).toFixed(3)} s · anchor ${frame.anchorIndex}`, panels: [
        panel(item.seed, frame.anchorIndex, 'Actual production world', null, `${frameMeta.get(key).antCount} ants · material on · pheromone overlay off`),
        { data: null, label: 'Evidence channel · native values', textLines: channelLines, textFont: 10, textLineHeight: 27,
          caption: item.channel === 'B' ? 'Qualified chemical-memory state; travel is a descriptive local input.'
            : 'Contact-written compaction readout; FOOT_CONTACT is a descriptive local input.' },
        { ...panel(item.seed, frame.anchorIndex, 'Selected opportunity → locked X', frame.x,
          `center ${frame.centerIndex} · ${item.channel}=${frame.value.toFixed(5)}`,
          item.channel === 'B' ? '#007f73' : '#c45522'), centerIndex: frame.centerIndex },
        { data: null, label: 'Existing material · layer count', materialLayers, materialMax: materialScaleMax,
          caption: `Integer local layers · fixed map scale 0–${materialScaleMax}` }
      ] };
    });
    const technical = await writeComposite(page, { title: `${item.category} · technical episode review`,
      subtitle: 'Each row is the exact same saved model time across world, native evidence, registered X and existing material.',
      rows: technicalRows, tileW: 210, imageH: 210, labelH: 30, header: 62, gap: 8, margin: 14, rowLabel: true },
    resolve(VISUAL, 'objective-cases-technical', safeName(item.category) + '.png'));
    visualRecords.push(technical);
  }
  const objectiveOverviewRows = [];
  for (let i = 0; i < caseRows.length; i += 2) {
    const panels = [];
    for (const item of caseRows.slice(i, i + 2)) {
      const image = await readFile(resolve(ROOT, item.file));
      panels.push({ data: 'data:image/png;base64,' + image.toString('base64'), label: item.label, caption: '' });
    }
    objectiveOverviewRows.push({ label: `Objective cases ${i + 1}–${Math.min(i + 2, caseRows.length)}`, panels });
  }
  const overview = await writeComposite(page, { title: 'Objective B/C episode histories',
    subtitle: 'Six preregistered tracks; each strip uses five exact anchors and one subtle X outline. Images are static, with no interpolation.',
    rows: objectiveOverviewRows, tileW: 420, imageH: 145, labelH: 22, header: 58, gap: 12, margin: 16, rowLabel: true },
  resolve(VISUAL, 'objective-case-sequences.png'));
  visualRecords.push(overview);

  const comparisonRows = [];
  for (const item of selection.pairedComparisons) {
    const key = frameKey(item.seed, item.anchorIndex), materialLayers = frameMeta.get(key).materialLayers;
    comparisonRows.push({ label: `${item.categories.join(' + ')} · ${item.seed} · ${(item.timeMs / 1000).toFixed(3)} s · Δcenter ${item.pairedMetrics.centerDistance.toFixed(3)} · J ${item.pairedMetrics.winnerXJaccard.toFixed(3)}`,
      panels: [
        panel(item.seed, item.anchorIndex, 'Production world · material on', null, `${frameMeta.get(key).antCount} ants · pheromone overlay off`),
        panel(item.seed, item.anchorIndex, 'B winner → X', item.winnerB?.x, item.winnerB ? `B=${item.winnerB.value.toFixed(5)} · rank ${item.winnerB.rank}` : 'Unavailable', '#007f73'),
        panel(item.seed, item.anchorIndex, 'C winner → X', item.winnerC?.x, item.winnerC ? `C=${item.winnerC.value.toFixed(5)} · rank ${item.winnerC.rank}` : 'Unavailable', '#c45522'),
        panel(item.seed, item.anchorIndex, 'B strongest non-entry → X', item.nonentryB?.x, item.nonentryB ? `B=${item.nonentryB.value.toFixed(5)} · entry d ${item.nonentryB.entryDistance.toFixed(3)}` : 'Unavailable', '#007f73'),
        panel(item.seed, item.anchorIndex, 'C strongest non-entry → X', item.nonentryC?.x, item.nonentryC ? `C=${item.nonentryC.value.toFixed(5)} · entry d ${item.nonentryC.entryDistance.toFixed(3)}` : 'Unavailable', '#c45522'),
        { data: null, label: 'Existing material · local layers', materialLayers, materialMax: materialScaleMax,
          caption: `Integer local layer count · fixed map scale 0–${materialScaleMax}` }
      ] });
  }
  const atlas = await writeComposite(page, { title: 'Matched B/C opportunity and X atlas',
    subtitle: 'Same seed, exact saved time, native world frame and existing material in every row. B/C values remain native and separately labeled.',
    rows: comparisonRows, tileW: 168, imageH: 168, labelH: 30, header: 60, gap: 6, margin: 14, rowLabel: true },
  resolve(VISUAL, 'technical-atlas.png'));
  visualRecords.push(atlas);

  const matchedRows = [];
  const labels = [
    ['entry', 'Entry-local histories'], ['nonentry', 'Paired non-entry competitors'],
    ['quiet', 'Recent travel / contact quiet'], ['strengthening', 'Recent input with rising state']
  ];
  const chosenNonentry = selection.pairedComparisons.find(item => item.categories.includes('jointly-strong-nonentry'));
  const chosenDisagreement = selection.pairedComparisons.find(item => item.categories.includes('largest-winner-separation'));
  const chosenAgreement = selection.pairedComparisons.find(item => item.categories.includes('highest-winner-X-overlap'));
  const matchedMap = new Map();
  for (const [name, pair] of Object.entries(selection.matchedExamples)) if (pair) matchedMap.set(name, pair);
  if (chosenNonentry) matchedMap.set('nonentry', { ...chosenNonentry, B: chosenNonentry.nonentryB, C: chosenNonentry.nonentryC });
  if (chosenAgreement) matchedMap.set('agreement', { ...chosenAgreement, B: chosenAgreement.winnerB, C: chosenAgreement.winnerC });
  if (chosenDisagreement) matchedMap.set('disagreement', { ...chosenDisagreement, B: chosenDisagreement.winnerB, C: chosenDisagreement.winnerC });
  for (const [name, title] of [...labels, ['disagreement', 'Winner disagreement'], ['agreement', 'Local agreement']]) {
    const pair = matchedMap.get(name); if (!pair) continue;
    const roleB = pair.B, roleC = pair.C;
    matchedRows.push({ label: `${title} · same ${pair.seed} / ${(pair.timeMs / 1000).toFixed(3)} s`, panels: [
      panel(pair.seed, pair.anchorIndex, 'B — chemical-history episode', roleB?.x,
        roleB ? `B=${roleB.value.toFixed(5)} · ${roleB.role}` : 'Unavailable', '#007f73'),
      panel(pair.seed, pair.anchorIndex, 'C — contact-written episode', roleC?.x,
        roleC ? `C=${roleC.value.toFixed(5)} · ${roleC.role}` : 'Unavailable', '#c45522')
    ] });
  }
  const review = await writeComposite(page, { title: 'B/C author review · matched histories',
    subtitle: 'Paired tiles keep seed, model time, ants, material and framing identical; only evidence selection and X outline vary.',
    rows: matchedRows, tileW: 330, imageH: 330, labelH: 33, header: 62, gap: 12, margin: 16, rowLabel: true },
  resolve(VISUAL, 'author-review-sheet.png'));
  visualRecords.push(review);

  if (chosenDisagreement) {
    const pair = chosenDisagreement, key = frameKey(pair.seed, pair.anchorIndex);
    const clean = await writeComposite(page, { title: 'Clean author view · same world frame',
      subtitle: 'Labels and channel names sit outside each artwork frame. Pheromone overlay off; material on; identical native renderer scale.',
      rows: [{ label: `${pair.seed} · ${(pair.timeMs / 1000).toFixed(3)} s`, panels: [
        panel(pair.seed, pair.anchorIndex, 'B — chemical-history episode', pair.winnerB.x, '', '#007f73'),
        panel(pair.seed, pair.anchorIndex, 'C — contact-written episode', pair.winnerC.x, '', '#c45522')
      ] }], tileW: 540, imageH: 540, labelH: 28, header: 62, gap: 16, margin: 18 },
    resolve(VISUAL, 'clean-artwork-b-vs-c.png'));
    visualRecords.push(clean);
  }

  const temporalRows = [];
  for (const [name, pair] of Object.entries(selection.matchedExamples)) if (pair && (name === 'quiet' || name === 'strengthening')) {
    temporalRows.push({ label: `${name === 'quiet' ? 'Recent input subsides' : 'Recent input with positive signed change'} · ${pair.seed} · ${(pair.timeMs / 1000).toFixed(3)} s`, panels: [
      panel(pair.seed, pair.anchorIndex, `B · ${pair.B.role}`, pair.B.x,
        `travel 1/5/20s ${fmt(pair.B.centerTravel1)}/${fmt(pair.B.centerTravel5)}/${fmt(pair.B.centerTravel20)} · ΔB20 ${fmt(pair.B.centerDeltaB20)}`, '#007f73'),
      panel(pair.seed, pair.anchorIndex, `C · ${pair.C.role}`, pair.C.x,
        `feet 1/5/20s ${pair.C.centerFeet1 ?? '—'}/${pair.C.centerFeet5 ?? '—'}/${pair.C.centerFeet20 ?? '—'} · ΔC5 ${fmt(pair.C.centerDeltaC5, 7)}`, '#c45522')
    ] });
  }
  const temporalAtlas = await writeComposite(page, { title: 'Temporal responsibility · matched examples',
    subtitle: 'Same world frame per row. Values and activity retain their native channel units; this sheet does not normalize B against C.',
    rows: temporalRows, tileW: 350, imageH: 350, labelH: 31, header: 62, gap: 12, margin: 16, rowLabel: true },
  resolve(VISUAL, 'temporal-responsibility.png'));
  visualRecords.push(temporalAtlas);

  const temporalTrackRows = [];
  for (const name of ['zeroB', 'zeroC', 'riseB', 'riseC']) {
    const item = selection.temporal[name]; if (!item) continue;
    const observation = item.chosen || item.strengtheningObservation;
    if (!observation) continue;
    const channel = item.channel, seed = item.seed, at = (observation.timeMs / 1000).toFixed(3);
    const caption = channel === 'B'
      ? `${name.startsWith('zero') ? `travel5 ${fmt(observation.centerTravel5)}` : `travel20 ${fmt(observation.centerTravel20)}`} · ΔB20 ${fmt(observation.centerDeltaB20)}`
      : `feet5 ${observation.centerFeet5 ?? '—'} · ΔC5 ${fmt(observation.centerDeltaC5, 7)}`;
    temporalTrackRows.push({ label: `Unpaired track illustration · ${channel} · seed ${seed} · track ${item.trackId} · ${at} s`, panels: [
      panel(seed, observation.anchorIndex, `${channel} X · native ${channel} evidence`, item.x, caption,
        channel === 'B' ? '#007f73' : '#c45522')
    ] });
  }
  const temporalTracks = await writeComposite(page, { title: 'Single-channel temporal examples',
    subtitle: 'Each row is one objective track illustration, not a B/C matched comparison. Values and recent input are printed in their native units.',
    rows: temporalTrackRows, tileW: 520, imageH: 520, labelH: 30, header: 62, gap: 12, margin: 16, rowLabel: true },
  resolve(VISUAL, 'temporal-track-examples.png'));
  visualRecords.push(temporalTracks);

  const traces = Buffer.from(temporalTraceSvg(selection));
  await writeFile(resolve(VISUAL, 'temporal-track-traces.svg'), traces);
  visualRecords.push({ file: 'docs/ant/evidence/2026-10-31-b-vs-c-author-review/visual/temporal-track-traces.svg',
    bytes: traces.length, sha256: sha256(traces), deterministic: true, format: 'svg' });
  return visualRecords;
}

async function main() {
  await mkdir(resolve(VISUAL, 'world-frames'), { recursive: true });
  const authorities = await verifyAuthorities();
  const bvcManifestSha256 = await verifyBCEvidenceManifest();
  console.log(JSON.stringify({ phase: 'input-manifests-verified', bvcManifestSha256 }));
  const frozenHashesBefore = await inputHashes();
  const selectionPath = resolve(OUTPUT, 'objective-case-selection.json');
  const selection = process.argv.includes('--render-only')
    ? JSON.parse(await readFile(selectionPath, 'utf8')) : (await prepareSelection()).selection;
  if (!process.argv.includes('--render-only')) await writeFile(selectionPath, JSON.stringify(selection, null, 2) + '\n');
  if (process.argv.includes('--prepare-only')) {
    console.log(JSON.stringify({ prepared: true, cases: selection.caseSequences.length,
      pairedBoundaries: selection.pairedComparisons.map(row => ({ seed: row.seed, anchorIndex: row.anchorIndex,
        categories: row.categories, centerDistance: row.pairedMetrics.centerDistance, xJaccard: row.pairedMetrics.winnerXJaccard })),
      matchedExamples: Object.fromEntries(Object.entries(selection.matchedExamples).map(([key, row]) => [key,
        row && { seed: row.seed, anchorIndex: row.anchorIndex, timeMs: row.timeMs }])),
      temporal: Object.fromEntries(Object.entries(selection.temporal).map(([key, row]) => [key,
        row && { seed: row.seed, trackId: row.trackId, startAnchor: row.startAnchor, endAnchor: row.endAnchor,
          zeroRunObservations: row.zeroRunObservations }])), frameCount: selection.frames.length }));
    return;
  }
  const thinning = productionThinning(await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8'));
  const { server, browser, page, errors } = await makeBrowser(), frameMeta = new Map(), replay = [];
  try {
    for (const seed of SEEDS) replay.push(await replaySeed(seed, selection.frames.filter(row => row.seed === seed), thinning, page, frameMeta));
    assert.deepEqual(errors, [], 'native renderer has no browser errors');
    const visualRecords = await makeVisualAssets(page, selection, frameMeta);
    const frozenHashesAfter = await inputHashes(); assert.deepEqual(frozenHashesAfter, frozenHashesBefore, 'frozen inputs unchanged');
    assert.equal(authorities.branch, 'codex/ant-b-vs-c-author-review-20261031', 'dedicated review branch from shell preflight');
    assert.ok(authorities.sourceCheck?.includes('empty'), 'external production source diff is recorded');
    const manifest = { schema: 'ant-b-vs-c-author-review-manifest-v1', authorities,
      productionAuthority: AUTHORITY, sourcePacketCommit: 'da599d9f385f53d0bb24df3e737c5ed2e2eb6a23',
      responsibilityAnalysisCommit: 'a75b83ce5dbeece36d60d966b9d86fc85ddb5f54',
      frozenInputHashes: frozenHashesBefore, bvcAnalysisManifestSha256: bvcManifestSha256,
      replay: { hz: 60, modelSeconds: 600, audio: 'Off',
        comparison: 'All 599 analysis boundaries per seed matched saved E/F/B/C/D, material layer/top/birth map, and actual production birth IDs byte-for-byte.',
        observersConsumeRng: false, render: 'Native AntRenderer; material On; pheromone overlay Off; 720x720; pixel ratio 1.', runs: replay },
      images: [...frameMeta.values()].map(row => ({ file: row.worldFile, seed: row.seed, anchorIndex: row.anchorIndex,
        timeMs: row.timeMs, bytes: row.bytes, sha256: row.worldSha256, antCount: row.antCount, deterministicRender: true }))
        .concat(visualRecords),
      limits: ['No new trajectory was sampled; same seeds and source authority were deterministically replayed only because the frozen packet lacks actual ant/world frames.',
        'No movement or production state received observer data.', 'No interpolation, synthetic ant motion, Plate birth, or material accumulation was made.'] };
    await writeFile(resolve(OUTPUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    const validations = { sourceAuthority: true, currentSourceBytesMatchAuthority: true,
      originalFrozenInputsHashStable: true, bvcAnalysisFilesMatchManifest: true, objectiveSelectionFromRegisteredCases: true,
      exactCaptureReceiptsReused: true, replayedBoundaries: replay.map(row => ({ seed: row.seed, count: row.anchorsCompared })),
      zeroObserverRngCalls: true, rendererRepaintHashesMatch: true, compositeRerenderHashesMatch: true,
      productionSourceDiff: authorities.sourceCheck, browserErrors: errors,
      branch: authorities.branch, preCommitHead: authorities.head };
    await writeFile(resolve(OUTPUT, 'validation.json'), JSON.stringify(validations, null, 2) + '\n');
    console.log(JSON.stringify({ complete: true, frames: frameMeta.size, images: visualRecords.length,
      replay: replay.map(row => ({ seed: row.seed, anchors: row.anchorsCompared, rngCalls: row.rngCalls,
        elapsedSeconds: row.elapsedSeconds })), output: OUTPUT }));
  } finally { await page.evaluate(() => window.__reviewRenderer?.destroy()); await browser.close(); await server.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
