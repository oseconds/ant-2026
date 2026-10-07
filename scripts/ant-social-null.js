import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { decodeFrame, trajectoryHeader } from './ant-social-evidence.js';
import { DynamicSocialGraph } from '../src/lib/agents/ant/DynamicSocialGraph.js';
import { TemporalSocialTopology } from '../src/lib/agents/ant/TemporalSocialTopology.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = resolve(ROOT, 'docs/ant/evidence/2026-10-07-social-graph/data');
const SEEDS = [20261005, 20261006, 20261007];
const WINDOWS = [0.25, 1, 5, 20];
const NULL_SEED = 'ANT-S2a-2026-10-08-phase-v1';
const FIELDS = ['x', 'y', 'vx', 'vy', 'heading', 'radius'];
const BINS = [0, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300, 600];
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;

// The binary index is also the lifecycle oracle: a stable ID may occupy only one contiguous interval.
export function indexTrajectory(bytes, ids) {
  assert.deepEqual(bytes.subarray(0, 20), trajectoryHeader());
  assert.ok(ids.every(id => typeof id === 'string' && id.trim()));
  assert.equal(new Set(ids).size, ids.length);
  const frames = [], lives = ids.map((id, idIndex) => ({ id, idIndex, startFrame: null, endFrame: null, sampleOffsets: [] }));
  let at = 20;
  while (at < bytes.length) {
    assert.ok(at + 12 <= bytes.length, 'complete frame header');
    const timeSeconds = bytes.readDoubleLE(at), count = bytes.readUInt32LE(at + 8);
    const length = 12 + count * 52, tick = frames.length;
    assert.ok(at + length <= bytes.length, 'complete frame records');
    assert.ok(Number.isFinite(timeSeconds) && Math.abs(timeSeconds - tick / 60) < 1e-6, '60 Hz cadence');
    const seen = new Set();
    for (let i = 0; i < count; i += 1) {
      const record = at + 12 + i * 52, idIndex = bytes.readUInt32LE(record), life = lives[idIndex];
      assert.ok(life && !seen.has(idIndex), 'valid unique stable IDs');
      seen.add(idIndex);
      for (let field = 0; field < FIELDS.length; field += 1) {
        const value = bytes.readDoubleLE(record + 4 + field * 8);
        assert.ok(Number.isFinite(value), `finite ${FIELDS[field]}`);
        if (field === 5) assert.ok(value > 0, 'positive radius');
      }
      assert.ok(life.endFrame === null || life.endFrame === tick - 1, 'stable ID cannot re-enter');
      life.startFrame ??= tick;
      life.endFrame = tick;
      life.sampleOffsets.push(record);
    }
    frames.push({ at, length, timeSeconds, count });
    at += length;
  }
  assert.equal(at, bytes.length);
  assert.ok(lives.every(life => life.sampleOffsets.length >= 2), 'nonzero rotation needs at least two samples per ID');
  return { bytes, ids, frames, lives };
}

export function phaseOffsets(source, nullSeed, seed, replicate) {
  return source.lives.map(life => {
    const digest = createHash('sha256').update(JSON.stringify([nullSeed, seed, replicate, life.id])).digest();
    return 1 + Number(digest.readBigUInt64LE(0) % BigInt(life.sampleOffsets.length - 1));
  });
}

export function rotateTrajectory(source, offsets, inverse = false) {
  assert.equal(offsets.length, source.lives.length);
  const bytes = Buffer.from(source.bytes);
  source.lives.forEach((life, ant) => {
    const n = life.sampleOffsets.length, shift = offsets[ant];
    assert.ok(Number.isInteger(shift) && shift > 0 && shift < n, 'nonzero in-lifetime offset');
    for (let i = 0; i < n; i += 1) {
      const from = life.sampleOffsets[(i + (inverse ? n - shift : shift)) % n] + 4;
      source.bytes.copy(bytes, life.sampleOffsets[i] + 4, from, from + 48);
    }
  });
  return bytes;
}

export function validateRotation(source, bytes, offsets) {
  const shifted = indexTrajectory(bytes, source.ids);
  assert.equal(shifted.frames.length, source.frames.length);
  for (let tick = 0; tick < source.frames.length; tick += 1) {
    const a = source.frames[tick], b = shifted.frames[tick];
    assert.equal(b.count, a.count, 'framewise active population');
    assert.deepEqual(bytes.subarray(b.at, b.at + 12), source.bytes.subarray(a.at, a.at + 12), 'exact timestamp/count');
    for (let i = 0; i < a.count; i += 1) assert.equal(bytes.readUInt32LE(b.at + 12 + i * 52),
      source.bytes.readUInt32LE(a.at + 12 + i * 52), 'exact active ID mask and ordering');
  }
  source.lives.forEach((life, ant) => {
    const other = shifted.lives[ant], n = life.sampleOffsets.length;
    assert.deepEqual([other.id, other.startFrame, other.endFrame, other.sampleOffsets.length],
      [life.id, life.startFrame, life.endFrame, n], 'same lifecycle and sample count');
    for (let i = 0; i < n; i += 1) {
      const from = life.sampleOffsets[(i + offsets[ant]) % n] + 4, to = other.sampleOffsets[i] + 4;
      assert.ok(bytes.subarray(to, to + 48).equals(source.bytes.subarray(from, from + 48)), 'whole-tuple pure rotation');
    }
  });
  assert.ok(rotateTrajectory(shifted, offsets, true).equals(source.bytes), 'inverse recovers every source byte');
  return { frameCount: shifted.frames.length, stableIds: shifted.ids.length,
    frameCounts: true, activeCountsAndIds: true, lifetimesAndSampleCounts: true,
    tupleRotations: true, finiteValues: true, validIdsAndRadii: true, inverseByteIdentity: true };
}

export function describe(values) {
  if (!values.length) return { n: 0, mean: null, sd: null, min: null, p10: null, p50: null, p90: null, max: null };
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const quantile = p => {
    const at = (n - 1) * p, i = Math.floor(at), f = at - i;
    return sorted[i] * (1 - f) + sorted[Math.min(i + 1, n - 1)] * f;
  };
  return { n, mean, sd: n > 1 ? Math.sqrt(sorted.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1)) : 0,
    min: sorted[0], p10: quantile(0.1), p50: quantile(0.5), p90: quantile(0.9), max: sorted[n - 1] };
}

export function durations(items, isCensored) {
  const completed = items.filter(item => !isCensored(item)), censored = items.filter(isCensored);
  const values = completed.map(item => item.durationSeconds), histogram = Array(BINS.length).fill(0);
  for (const value of values) {
    const i = BINS.findIndex((edge, j) => j < BINS.length - 1 && value < BINS[j + 1]);
    histogram[i < 0 ? BINS.length - 1 : i] += 1;
  }
  return { count: items.length, completed: describe(values), rightCensoredCount: censored.length,
    rightCensoredElapsedSeconds: censored.reduce((sum, item) => sum + item.durationSeconds, 0),
    histogram: { lowerBoundsSeconds: BINS, counts: histogram, completedOnly: true } };
}

function seamFrames(source, offsets) {
  return new Map(source.lives.map((life, ant) => [life.id, life.startFrame + life.sampleOffsets.length - offsets[ant]]));
}

function overlapSeam(interval, seams) {
  return [interval.antA, interval.antB].some(id => {
    const tick = seams.get(id);
    return tick !== undefined && interval.startSeconds <= (tick + 1) / 60 + 1e-6
      && interval.endSeconds >= (tick - 1) / 60 - 1e-6;
  });
}

export function replay(source, bytes, offsets = null, archive = null, collectDetails = false) {
  const graph = new DynamicSocialGraph({ distanceMultiplier: 2 });
  const states = WINDOWS.map(windowSeconds => ({ windowSeconds, topology: new TemporalSocialTopology({ windowSeconds }),
    samples: Object.fromEntries(['edgeCount', 'componentCount', 'largestComponentRatio', 'weightedDegree',
      'persistentBridgeCount', 'persistentArticulationCount', 'persistentConnectorCount'].map(key => [key, []])) }));
  const timeline = [], connectorPositions = new Map();
  if (collectDetails) for (const state of states) state.detailSamples = [];
  const seams = offsets ? seamFrames(source, offsets) : new Map();
  for (let tick = 0; tick < source.frames.length; tick += 1) {
    const { at, length, timeSeconds } = source.frames[tick];
    const frame = decodeFrame(bytes.subarray(at, at + length), source.ids);
    graph.observe(timeSeconds, frame.agents);
    if (tick % 3 !== 0) continue;
    const row = { tick, seconds: timeSeconds, population: frame.agents.length, windows: [] };
    for (const state of states) {
      const snap = state.topology.observe(graph.getSnapshot(state.windowSeconds)), m = snap.metrics;
      if (collectDetails) state.detailSamples.push({ tick, timeSeconds, nodeCount: m.nodeCount,
        edgeCount: m.edgeCount, weightedDegreeSum: m.weightedDegrees.reduce((sum, degree) => sum + degree.weightSeconds, 0),
        persistentBridgeCount: m.persistentBridgeCount, persistentArticulationCount: m.persistentArticulationCount,
        persistentConnectorCount: m.persistentConnectorCount });
      for (const [key, values] of Object.entries(state.samples)) {
        if (key === 'weightedDegree') for (const degree of m.weightedDegrees) values.push(degree.weightSeconds);
        else values.push(m[key]);
      }
      // Keep event-time positions without cloning the complete event history at each analysis tick.
      for (const event of state.topology.events.slice(state.eventCount || 0)) {
        if (event.type === 'CONNECTOR_PERSIST') {
          const ant = frame.agents.find(ant => ant.id === event.antId), life = source.lives.find(life => life.id === ant.id);
          connectorPositions.set(`${state.windowSeconds}:${event.antId}:${event.onsetSeconds}`, {
            x: ant.x, y: ant.y, distanceToRecruitmentOrigin: Math.hypot(ant.x - 0.5, ant.y - 0.72),
            ageSecondsAtConfirmation: (tick - life.startFrame) / 60 });
        }
      }
      state.eventCount = state.topology.events.length;
      if (tick > 0 && tick % 60 === 0) row.windows.push({ windowSeconds: state.windowSeconds,
        edgeCount: m.edgeCount, componentCount: m.componentCount, largestComponentRatio: m.largestComponentRatio,
        weightedDegreeMean: m.weightedDegrees.reduce((sum, degree) => sum + degree.weightSeconds, 0) / (m.nodeCount || 1),
        persistentBridgeCount: m.persistentBridgeCount, persistentArticulationCount: m.persistentArticulationCount,
        persistentConnectorCount: m.persistentConnectorCount });
      if (archive && tick > 0 && tick % 60 === 0) {
        const saved = archive.timeline[tick / 60 - 1].topologies.find(item => item.distanceMultiplier === 2
          && item.windowSeconds === state.windowSeconds);
        assert.deepEqual(snap, saved.topology, 'observed 1 Hz topology exactly replays S0/S1');
      }
    }
    if (row.windows.length) timeline.push(row);
  }
  for (const state of states) state.topology.finish();
  graph.finish();
  const encounters = graph.getEncounters();
  if (archive) {
    const saved = archive.raw.graph.find(item => item.distanceMultiplier === 2);
    assert.deepEqual(graph.getEvents(), saved.events, 'observed S0 events match committed archive');
    assert.deepEqual(encounters, saved.encounters, 'observed encounter intervals match committed archive');
  }
  const lives = new Map(source.lives.map(life => [life.id, life]));
  const seamAdjacent = encounters.filter(item => overlapSeam(item, seams));
  const seamExcluded = encounters.filter(item => !overlapSeam(item, seams));
  const entryFrame = encounters.filter(item => [item.antA, item.antB].some(id =>
    item.startSeconds === source.frames[lives.get(id).startFrame].timeSeconds));
  const entryAdjacent = encounters.filter(item => [item.antA, item.antB].some(id =>
    item.startSeconds <= (lives.get(id).startFrame + 1) / 60 + 1e-6));
  const birthDistances = source.lives.map(life => {
    const at = life.sampleOffsets[0];
    return Math.hypot(bytes.readDoubleLE(at + 4) - 0.5, bytes.readDoubleLE(at + 12) - 0.72);
  });
  const seamJumps = offsets ? source.lives.map(life => {
    const last = life.sampleOffsets.at(-1), first = life.sampleOffsets[0];
    return Math.hypot(source.bytes.readDoubleLE(last + 4) - source.bytes.readDoubleLE(first + 4),
      source.bytes.readDoubleLE(last + 12) - source.bytes.readDoubleLE(first + 12));
  }) : [];
  const raw = { lifetimes: durations(encounters, item => item.endReason === 'right-censored'),
    pairExposureSeconds: encounters.reduce((sum, item) => sum + item.durationSeconds, 0),
    seamAdjacentEpisodes: seamAdjacent.length, entryFrameEpisodes: entryFrame.length, entryAdjacentEpisodes: entryAdjacent.length,
    seamExcludedPairExposureSeconds: seamExcluded.reduce((sum, item) => sum + item.durationSeconds, 0),
    seamExcludedLifetimes: durations(seamExcluded, item => item.endReason === 'right-censored') };
  const windows = states.map(state => {
    const events = state.topology.getEvents(), edgeLifetimes = state.topology.getEdgeLifetimes();
    if (archive) {
      const saved = archive.raw.topology.find(item => item.distanceMultiplier === 2 && item.windowSeconds === state.windowSeconds);
      assert.deepEqual(events, saved.events, 'observed S1 events match committed archive');
      assert.deepEqual(edgeLifetimes, saved.edgeLifetimes, 'observed temporal lifetimes match committed archive');
    }
    const eventCounts = events.reduce((counts, event) => { counts[event.type] = (counts[event.type] || 0) + 1; return counts; }, {});
    const persistentEnds = (type, property) => events.filter(event => event.type === type && event[property] != null);
    const connectors = events.filter(event => event.type === 'CONNECTOR_END').map(event => ({ ...event,
      ...connectorPositions.get(`${state.windowSeconds}:${event.antId}:${event.onsetSeconds}`),
      seamAdjacentSupport: [event.antId, ...new Set(event.newIncidentEdges.flatMap(key => JSON.parse(key)))].some(id => {
        const tick = seams.get(id);
        return tick !== undefined && event.onsetSeconds <= (tick + 1) / 60 + 1e-6
          && event.timeSeconds >= (tick - 1) / 60 - 1e-6;
      }) }));
    return { windowSeconds: state.windowSeconds, topologySamples: state.samples.edgeCount.length,
      nodeTimeSamples: state.samples.weightedDegree.length,
      metrics: Object.fromEntries(Object.entries(state.samples).map(([key, values]) => [key, describe(values)])),
      eventCounts, temporalEdgeLifetimes: durations(edgeLifetimes, item => item.rightCensored),
      bridgePersistence: durations(persistentEnds('BRIDGE_BREAK', 'persistentSeconds'), item => item.rightCensored),
      articulationPersistence: durations(persistentEnds('ARTICULATION_BREAK', 'persistentSeconds'), item => item.rightCensored),
      connectorPersistence: durations(connectors, item => item.rightCensored), connectors };
  });
  return { raw, windows, timeline, ...(collectDetails ? { details: { encounters,
    windows: states.map(state => ({ windowSeconds: state.windowSeconds, samples: state.detailSamples,
      events: state.topology.getEvents(), edgeLifetimes: state.topology.getEdgeLifetimes() })) } } : {}),
    diagnostics: { birthDistanceToOrigin: describe(birthDistances),
    seamJumpDistance: describe(seamJumps), seamCount: seams.size,
    seamPolicy: 'Flag raw intervals overlapping either endpoint seam +/- one 60 Hz sample; no frames removed from graph/topology.',
    entryPolicy: 'Count episodes starting exactly on either endpoint first active sample; entryAdjacent also includes the next sample.',
    observedArchiveReplay: Boolean(archive) } };
}

function measures(run, windowSeconds) {
  const w = run.windows.find(item => item.windowSeconds === windowSeconds);
  return {
    edgeCountMean: w.metrics.edgeCount.mean, edgeCountP90: w.metrics.edgeCount.p90,
    componentCountMean: w.metrics.componentCount.mean, largestComponentRatioMean: w.metrics.largestComponentRatio.mean,
    weightedDegreeMeanSeconds: w.metrics.weightedDegree.mean, weightedDegreeP90Seconds: w.metrics.weightedDegree.p90,
    rawEncounterCount: run.raw.lifetimes.count, rawPairExposureSeconds: run.raw.pairExposureSeconds,
    rawLifetimeMeanSeconds: run.raw.lifetimes.completed.mean, rawLifetimeP50Seconds: run.raw.lifetimes.completed.p50,
    rawLifetimeP90Seconds: run.raw.lifetimes.completed.p90,
    temporalEdgeCount: w.temporalEdgeLifetimes.count, temporalLifetimeMeanSeconds: w.temporalEdgeLifetimes.completed.mean,
    temporalLifetimeP50Seconds: w.temporalEdgeLifetimes.completed.p50, temporalLifetimeP90Seconds: w.temporalEdgeLifetimes.completed.p90,
    bridgePersistCount: w.eventCounts.BRIDGE_PERSIST || 0, articulationPersistCount: w.eventCounts.ARTICULATION_PERSIST || 0,
    connectorPersistCount: w.eventCounts.CONNECTOR_PERSIST || 0,
    bridgePersistentMeanCount: w.metrics.persistentBridgeCount.mean,
    articulationPersistentMeanCount: w.metrics.persistentArticulationCount.mean,
    connectorPersistentMeanCount: w.metrics.persistentConnectorCount.mean,
    bridgePersistenceMeanSeconds: w.bridgePersistence.completed.mean,
    articulationPersistenceMeanSeconds: w.articulationPersistence.completed.mean,
    connectorPersistenceMeanSeconds: w.connectorPersistence.completed.mean,
    mergeCount: w.eventCounts.COMPONENT_MERGE || 0, splitCount: w.eventCounts.COMPONENT_SPLIT || 0,
    seamExcludedRawLifetimeMeanSeconds: run.raw.seamExcludedLifetimes.completed.mean,
    seamExcludedRawCount: run.raw.seamExcludedLifetimes.count, seamExcludedRawExposureSeconds: run.raw.seamExcludedPairExposureSeconds,
    seamAdjacentRawCount: run.raw.seamAdjacentEpisodes, entryFrameRawCount: run.raw.entryFrameEpisodes,
    entryAdjacentRawCount: run.raw.entryAdjacentEpisodes
  };
}

export function compare(observed, values) {
  const finite = values.filter(Number.isFinite), distribution = describe(finite);
  if (observed === null || !finite.length) return { observed, null: distribution, differenceFromNullMean: null,
    ratioToNullMean: null, standardizedDifference: null, rank: null };
  const below = finite.filter(x => x < observed).length, equal = finite.filter(x => x === observed).length;
  return { observed, null: distribution, differenceFromNullMean: observed - distribution.mean,
    ratioToNullMean: distribution.mean !== 0 ? observed / distribution.mean : null,
    standardizedDifference: distribution.sd > 0 ? (observed - distribution.mean) / distribution.sd : null,
    rank: { below, equal, above: finite.length - below - equal, total: finite.length,
      midPercentile: 100 * (below + equal / 2) / finite.length } };
}

export async function sourceInputs(seed) {
  const names = ['manifest.json', `seed${seed}-summary.json`, `seed${seed}-trajectory.f64.gz`,
    `seed${seed}-on-timeline.json.gz`, `seed${seed}-on-raw-events.json.gz`];
  const hashes = {}, buffers = {};
  for (const name of names) {
    buffers[name] = await readFile(resolve(SOURCE, name));
    hashes[name] = sha(buffers[name]);
    const path = relative(ROOT, resolve(SOURCE, name)).replaceAll('\\', '/');
    assert.equal(hashes[name], sha(execFileSync('git', ['cat-file', 'blob', `HEAD:${path}`],
      { cwd: ROOT, maxBuffer: 100 * 1024 * 1024 })), 'source input equals committed Git blob');
  }
  const manifest = JSON.parse(buffers['manifest.json']), summary = JSON.parse(buffers[`seed${seed}-summary.json`]);
  for (const path of ['src/lib/agents/ant/DynamicSocialGraph.js', 'src/lib/agents/ant/TemporalSocialTopology.js']) {
    assert.equal(sha(await readFile(resolve(ROOT, path))), manifest.sourceHashes[path], 'reuse exact recorded graph/topology source');
  }
  const source = indexTrajectory(gunzipSync(buffers[`seed${seed}-trajectory.f64.gz`]), summary.runs.on.idDictionary);
  assert.equal(sha(source.bytes), summary.trajectory.enabledHash);
  assert.equal(source.frames.length, 36001);
  return { source, sourceHashes: hashes, archive: {
    raw: JSON.parse(gunzipSync(buffers[`seed${seed}-on-raw-events.json.gz`])),
    timeline: gunzipSync(buffers[`seed${seed}-on-timeline.json.gz`]).toString().trim().split('\n').map(JSON.parse)
  } };
}

export async function assertSourcesUnchanged(hashes) {
  for (const [name, hash] of Object.entries(hashes)) assert.equal(sha(await readFile(resolve(SOURCE, name))), hash,
    'source archives remain byte-identical');
}

async function generate(seed, replicates, output) {
  const { source, sourceHashes, archive } = await sourceInputs(seed);
  const observed = replay(source, source.bytes, null, archive), nulls = [], vectors = new Set();
  for (let replicate = 0; replicate < replicates; replicate += 1) {
    const offsets = phaseOffsets(source, NULL_SEED, seed, replicate), vector = JSON.stringify(offsets);
    assert.ok(!vectors.has(vector), 'distinct offset vector per replicate');
    vectors.add(vector);
    const bytes = rotateTrajectory(source, offsets), validation = validateRotation(source, bytes, offsets);
    assert.deepEqual(offsets, phaseOffsets(source, NULL_SEED, seed, replicate));
    assert.ok(bytes.equals(rotateTrajectory(source, offsets)), 'second generation byte-identical');
    const run = replay(source, bytes, offsets);
    if (replicate === 0) assert.deepEqual(replay(source, bytes, offsets), run, 'repeat analysis deterministic');
    nulls.push({ replicate, offsets, trajectorySha256: sha(bytes), validation: { ...validation,
      deterministicRegeneration: true, distinctOffsetVector: true, repeatedAnalysis: replicate === 0 }, ...run });
    console.log(JSON.stringify({ seed, replicate, encounters: run.raw.lifetimes.count, valid: true }));
  }
  await assertSourcesUnchanged(sourceHashes);
  const packet = { schemaVersion: 1, seed, parameters: parameters(replicates), sourceHashes,
    sourceUncompressedSha256: sha(source.bytes), lives: source.lives.map(({ id, idIndex, startFrame, endFrame, sampleOffsets }) =>
      ({ id, idIndex, startFrame, endFrame, sampleCount: sampleOffsets.length })), observed, nulls, sourceBytesUnchanged: true };
  await writeFile(resolve(output, `seed${seed}.json.gz`), gzipSync(Buffer.from(json(packet)), { level: 9 }));
}

function parameters(replicates) {
  return { family: 'per-ant in-lifetime circular whole-tuple phase shift', nullSeed: NULL_SEED, replicatesPerSeed: replicates,
    seeds: SEEDS, seconds: 600, frameCount: 36001, trajectoryHz: 60, topologyHz: 20, k: 2, windowsSeconds: WINDOWS,
    offsetDerivation: '1 + uint64LE(SHA256(JSON.stringify([nullSeed, sourceSeed, zeroBasedReplicate, stableAntId]))[0:8]) modulo (sampleCount-1)',
    direction: 'null sample i = original sample (i+offset) modulo sampleCount', tupleFields: FIELDS,
    storage: 'Offsets and hash of exact virtual binary trajectory; redundant null trajectory archives are not written.',
    durationQuantiles: 'Type 7 linear interpolation; completed durations only, censor counts/elapsed kept separately',
    topologyAverages: 'All 12001 analysis samples including t=0; weighted degrees include active isolates and use pooled node-time samples',
    rank: 'Within-seed null midrank percentile = 100*(below+equal/2)/available replicates; no p-value or decision threshold' };
}

async function summarize(output) {
  const packets = await Promise.all(SEEDS.map(async seed => JSON.parse(gunzipSync(await readFile(resolve(output, `seed${seed}.json.gz`))))));
  for (const packet of packets) assert.deepEqual(packet.parameters, packets[0].parameters);
  const summary = { schemaVersion: 1, parameters: packets[0].parameters, seeds: packets.map(packet => ({ seed: packet.seed,
    comparisons: WINDOWS.flatMap(windowSeconds => Object.entries(measures(packet.observed, windowSeconds)).map(([metric, observed]) =>
      ({ windowSeconds, metric, ...compare(observed, packet.nulls.map(run => measures(run, windowSeconds)[metric])) }))) })) };
  await writeFile(resolve(output, 'summary.json'), json(summary));
  const rows = ['seed,windowSeconds,metric,observed,nullN,nullMean,nullP10,nullMedian,nullP90,nullMin,nullMax,difference,ratio,standardizedDifference,midPercentile,below,equal,above'];
  for (const seed of summary.seeds) for (const row of seed.comparisons) rows.push([seed.seed, row.windowSeconds, row.metric,
    row.observed, row.null.n, row.null.mean, row.null.p10, row.null.p50, row.null.p90, row.null.min, row.null.max,
    row.differenceFromNullMean, row.ratioToNullMean, row.standardizedDifference, row.rank?.midPercentile,
    row.rank?.below, row.rank?.equal, row.rank?.above].map(value => value ?? '').join(','));
  await writeFile(resolve(output, 'comparisons.csv'), `${rows.join('\n')}\n`);
  const validation = packets.map(packet => ({ seed: packet.seed, sourceBytesUnchanged: packet.sourceBytesUnchanged,
    sourceHashes: packet.sourceHashes, sourceUncompressedSha256: packet.sourceUncompressedSha256,
    observedArchiveReplay: packet.observed.diagnostics.observedArchiveReplay,
    replicates: packet.nulls.map(run => ({ replicate: run.replicate, trajectorySha256: run.trajectorySha256, ...run.validation })) }));
  await writeFile(resolve(output, 'validation.json'), json(validation));
  console.log(JSON.stringify({ summarized: SEEDS, replicatesPerSeed: summary.parameters.replicatesPerSeed }));
}

async function verify(output) {
  for (const seed of SEEDS) {
    const packet = JSON.parse(gunzipSync(await readFile(resolve(output, `seed${seed}.json.gz`))));
    const { source, sourceHashes, archive } = await sourceInputs(seed);
    assert.deepEqual(sourceHashes, packet.sourceHashes);
    assert.deepEqual(replay(source, source.bytes, null, archive), packet.observed);
    for (const run of packet.nulls) {
      const offsets = phaseOffsets(source, NULL_SEED, seed, run.replicate);
      assert.deepEqual(offsets, run.offsets);
      const bytes = rotateTrajectory(source, offsets);
      assert.equal(sha(bytes), run.trajectorySha256);
      validateRotation(source, bytes, offsets);
      if (run.replicate === 0) assert.deepEqual(replay(source, bytes, offsets),
        Object.fromEntries(['raw', 'windows', 'timeline', 'diagnostics'].map(key => [key, run[key]])));
    }
    await assertSourcesUnchanged(sourceHashes);
    console.log(JSON.stringify({ verifiedSeed: seed, replicates: packet.nulls.length, archiveReplay: true,
      allVirtualTrajectoryHashes: true, allRotationInvariants: true, firstNullAnalysisReplay: true }));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map(process.argv.slice(2).map(value => { const [key, ...rest] = value.split('='); return [key, rest.join('=') || true]; }));
  const output = resolve(String(args.get('--output') || 'test-results/ant-s2a-null'));
  const withinSource = relative(SOURCE, output);
  assert.ok(withinSource === '..' || withinSource.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    || isAbsolute(withinSource), 'outputs cannot overwrite source archive directory');
  const replicates = Number(args.get('--replicates') || 32);
  assert.ok(Number.isInteger(replicates) && replicates > 0 && replicates <= 32);
  await mkdir(output, { recursive: true });
  if (args.has('--verify')) await verify(output);
  else if (args.has('--summarize')) await summarize(output);
  else {
    const seeds = args.has('--seed') ? [Number(args.get('--seed'))] : SEEDS;
    assert.ok(seeds.every(seed => SEEDS.includes(seed)));
    for (const seed of seeds) await generate(seed, replicates, output);
    if (!args.has('--seed')) await summarize(output);
  }
}
