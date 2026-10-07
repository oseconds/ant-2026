import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { decodeFrame } from './ant-social-evidence.js';
import { indexTrajectory, describe, replay, compare, sourceInputs, assertSourcesUnchanged } from './ant-social-null.js';
import { DynamicSocialGraph } from '../src/lib/agents/ant/DynamicSocialGraph.js';
import { boundaryAnalysis } from './ant-social-identity-boundaries.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = resolve(ROOT, 'docs/ant/evidence/2026-10-07-social-graph/data');
const SEEDS = [20261005, 20261006, 20261007], WINDOWS = [0.25, 1, 5, 20];
export const NULL_SEED = 'ANT-S2b-2026-10-08-identity-v1';
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function permutation(labels, seed, replicate, block, nullSeed) {
  const result = [...labels];
  for (let i = result.length - 1; i > 0; i -= 1) {
    // Rejection sampling avoids modulo bias; this stream is independent of behavior RNG.
    const bound = i + 1, ceiling = Math.floor(2 ** 32 / bound) * bound;
    let draw, attempt = 0;
    do { draw = createHash('sha256').update(JSON.stringify([nullSeed, seed, replicate, block, i, attempt++])).digest().readUInt32LE(0); }
    while (draw >= ceiling);
    const j = draw % bound;
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Body handles are source IDs, never coordinates: even duplicate tuples remain separate bodies. */
export function identityTrajectory(source, seed, replicate, { blockTicks = 300, nullSeed = NULL_SEED } = {}) {
  assert.ok(Number.isInteger(blockTicks) && blockTicks > 0);
  assert.ok(Number.isInteger(replicate) && replicate >= 0);
  const bytes = Buffer.from(source.bytes), ledger = [];
  let mapping = new Map(), previousPositions = new Map();
  const sorted = values => [...values].sort((a, b) => order(source.ids[a], source.ids[b]));
  for (let tick = 0; tick < source.frames.length; tick += 1) {
    const frame = source.frames[tick], records = new Map(), positions = new Map();
    for (let i = 0; i < frame.count; i += 1) {
      const at = frame.at + 12 + i * 52, body = source.bytes.readUInt32LE(at);
      records.set(body, at);
      positions.set(body, [source.bytes.readDoubleLE(at + 4), source.bytes.readDoubleLE(at + 12)]);
    }
    const active = new Set(records.keys()), bodies = sorted(active);
    const entered = bodies.filter(body => !mapping.has(body)), exited = sorted(mapping.keys()).filter(body => !active.has(body));
    const record = (type, before, retainedBindings = null) => {
      const oldBodies = new Map([...before].map(([body, label]) => [label, body]));
      const newBodies = new Map([...mapping].map(([body, label]) => [label, body]));
      const labels = sorted(new Set([...oldBodies.keys(), ...newBodies.keys()]));
      const changes = labels.flatMap(label => {
        const oldBody = oldBodies.get(label), newBody = newBodies.get(label);
        if (type !== 'BLOCK_REMAP' && oldBody === newBody) return [];
        const from = positions.get(oldBody) || previousPositions.get(oldBody), to = positions.get(newBody);
        const changed = oldBody !== newBody;
        return [{ label: source.ids[label], oldBody: oldBody === undefined ? null : source.ids[oldBody],
          newBody: newBody === undefined ? null : source.ids[newBody],
          jumpDistance: changed && from && to ? Math.hypot(to[0] - from[0], to[1] - from[1]) : null,
          distanceBasis: changed && from && to ? (positions.has(oldBody) ? 'same-frame bodies' : 'last old-body sample to current new-body sample') : null }];
      });
      ledger.push({ type, tick, timeSeconds: frame.timeSeconds,
        enteredBodies: type === 'BLOCK_REMAP' ? [] : entered.map(body => source.ids[body]),
        exitedBodies: type === 'BLOCK_REMAP' ? [] : exited.map(body => source.ids[body]),
        retainedBindings, fixedPoints: type === 'BLOCK_REMAP' ? changes.filter(change => change.oldBody === change.newBody).length : null,
        changes, mapping: bodies.map(body => ({ body: source.ids[body], label: source.ids[mapping.get(body)] })) });
    };
    if (tick === 0) {
      mapping = new Map(bodies.map(body => [body, body]));
      record('INITIAL', new Map());
    } else if (entered.length || exited.length) {
      const before = mapping;
      mapping = new Map([...before].filter(([body, label]) => active.has(body) && active.has(label)));
      const retained = mapping.size, used = new Set(mapping.values());
      const vacant = bodies.filter(body => !mapping.has(body)), free = bodies.filter(label => !used.has(label));
      assert.equal(vacant.length, free.length);
      vacant.forEach((body, i) => mapping.set(body, free[i]));
      record('LIFECYCLE_REPAIR', before, retained);
    }
    // t=0 has the observed labeling; the terminal frame only closes the recording.
    if (tick > 0 && tick < source.frames.length - 1 && tick % blockTicks === 0) {
      const before = mapping, labels = permutation(bodies, seed, replicate, tick / blockTicks, nullSeed);
      mapping = new Map(bodies.map((body, i) => [body, labels[i]]));
      record('BLOCK_REMAP', before);
    }
    assert.equal(mapping.size, active.size);
    assert.equal(new Set(mapping.values()).size, active.size);
    for (const [body, at] of records) {
      assert.ok(active.has(mapping.get(body)));
      bytes.writeUInt32LE(mapping.get(body), at); // All 48 physical bytes stay at their original record position.
    }
    previousPositions = positions;
  }
  return { bytes, ledger };
}

// Validation oracle only. Encounter edges come from the existing observer's exact k=2 predicate.
function instantaneousSignature(graph) {
  const adjacent = new Map([...graph.nodes.keys()].map(id => [id, []]));
  for (const { antA, antB } of graph.activeEncounters.values()) {
    adjacent.get(antA).push(antB); adjacent.get(antB).push(antA);
  }
  const seen = new Set(), sizes = [];
  for (const id of adjacent.keys()) {
    if (seen.has(id)) continue;
    const queue = [id]; seen.add(id);
    for (let at = 0; at < queue.length; at += 1) for (const next of adjacent.get(queue[at])) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    sizes.push(queue.length);
  }
  return { edges: graph.activeEncounters.size, sizes: sizes.sort((a, b) => a - b).join(',') };
}

export function instantaneousReference(source) {
  const graph = new DynamicSocialGraph({ distanceMultiplier: 2 });
  return source.frames.map(({ at, length, timeSeconds }) => {
    graph.observe(timeSeconds, decodeFrame(source.bytes.subarray(at, at + length), source.ids).agents);
    return instantaneousSignature(graph);
  });
}

export function validateIdentity(source, bytes, ledger, reference = instantaneousReference(source)) {
  const labeled = indexTrajectory(bytes, source.ids), graph = new DynamicSocialGraph({ distanceMultiplier: 2 });
  assert.equal(bytes.length, source.bytes.length);
  assert.equal(labeled.frames.length, source.frames.length);
  assert.equal(reference.length, source.frames.length);
  assert.deepEqual(bytes.subarray(0, 20), source.bytes.subarray(0, 20));
  let eventAt = 0, mapping;
  for (let tick = 0; tick < source.frames.length; tick += 1) {
    while (eventAt < ledger.length && ledger[eventAt].tick === tick) {
      mapping = new Map(ledger[eventAt++].mapping.map(({ body, label }) => [body, label]));
    }
    assert.ok(mapping, 'ledger begins at frame zero');
    const a = source.frames[tick], b = labeled.frames[tick], sourceIds = [], nullIds = [];
    assert.deepEqual(bytes.subarray(b.at, b.at + 12), source.bytes.subarray(a.at, a.at + 12), 'exact frame timestamp/count');
    for (let i = 0; i < a.count; i += 1) {
      const at = a.at + 12 + i * 52, body = source.ids[source.bytes.readUInt32LE(at)], label = source.ids[bytes.readUInt32LE(at)];
      sourceIds.push(body); nullIds.push(label);
      assert.equal(label, mapping.get(body), 'every frame reconstructs logged mapping');
      assert.ok(bytes.subarray(at + 4, at + 52).equals(source.bytes.subarray(at + 4, at + 52)),
        'complete physical tuple stays byte-identical at the same physical record position');
    }
    assert.deepEqual(nullIds.sort(order), sourceIds.sort(order), 'exact active ID set');
    assert.equal(mapping.size, a.count); assert.equal(new Set(mapping.values()).size, a.count, 'bijection');
    graph.observe(a.timeSeconds, decodeFrame(bytes.subarray(a.at, a.at + a.length), source.ids).agents);
    assert.deepEqual(instantaneousSignature(graph), reference[tick], 'exact unlabeled instantaneous edges/component sizes');
  }
  assert.equal(eventAt, ledger.length, 'all ledger events used');
  return { frameCount: labeled.frames.length, timestampAndCountBytes: true, physicalTupleMultisetByteIdentity: true,
    physicalRecordBytesUnchanged: true, exactActiveIdSet: true, mappingBijection: true, ledgerReconstruction: true,
    instantaneousEdgeCounts: true, instantaneousComponentSizeMultisets: true, finiteValues: true, validIdsAndRadii: true };
}

function compact(run) {
  return { raw: { lifetimes: run.raw.lifetimes, pairExposureSeconds: run.raw.pairExposureSeconds },
    windows: run.windows.map(w => ({ ...w, metrics: Object.fromEntries(Object.entries(w.metrics).filter(([key]) =>
      !['componentCount', 'largestComponentRatio'].includes(key))),
    connectors: w.connectors.map(({ seamAdjacentSupport, ...event }) => event) })),
    timeline: run.timeline.map(row => ({ ...row, windows: row.windows.map(({ componentCount, largestComponentRatio, ...w }) => w) })),
    observedArchiveReplay: run.diagnostics.observedArchiveReplay };
}

function measures(run, seconds) {
  const w = run.windows.find(w => w.windowSeconds === seconds);
  return { rawEncounterCount: run.raw.lifetimes.count, rawCompletedLifetimeMeanSeconds: run.raw.lifetimes.completed.mean,
    rawCompletedLifetimeP90Seconds: run.raw.lifetimes.completed.p90, rawPairExposureSeconds: run.raw.pairExposureSeconds,
    rollingEdgeCountMean: w.metrics.edgeCount.mean, weightedDegreeMeanSeconds: w.metrics.weightedDegree.mean,
    temporalEdgeCount: w.temporalEdgeLifetimes.count, temporalCompletedLifetimeMeanSeconds: w.temporalEdgeLifetimes.completed.mean,
    temporalCompletedLifetimeP90Seconds: w.temporalEdgeLifetimes.completed.p90,
    ...Object.fromEntries(['bridge', 'articulation', 'connector'].flatMap(name => [
      [`${name}PersistCount`, w.eventCounts[`${name.toUpperCase()}_PERSIST`] || 0],
      [`${name}PersistenceMeanSeconds`, w[`${name}Persistence`].completed.mean]])),
    mergeCount: w.eventCounts.COMPONENT_MERGE || 0, splitCount: w.eventCounts.COMPONENT_SPLIT || 0 };
}

function parameters(replicates) {
  return { family: 'exact-spatial-movie identity permutation', nullSeed: NULL_SEED, seeds: SEEDS,
    replicatesPerSeed: replicates, identityBlockSeconds: 5, blockTicks: 300, seconds: 600, frameCount: 36001,
    trajectoryHz: 60, topologyHz: 20, k: 2, windowsSeconds: WINDOWS,
    initialAndTerminalPolicy: 'Observed identity at t=0; remap ticks 300..35700; no terminal t=600 remap.',
    permutation: 'Fisher-Yates on lexically sorted active IDs for lexically sorted source body handles; uint32LE SHA256([nullSeed,sourceSeed,replicate,block,index,attempt]) with rejection sampling; fixed points allowed.',
    lifecycleRepair: 'Remove dead bodies and expired labels, retain all valid bindings, lexically zip vacant bodies and free active labels; repair before shuffle if coincident.',
    storage: 'Exact per-event body-to-label mapping ledger and virtual archive hash; physical archives never copied to output.',
    topologyAverages: 'All 12001 analysis samples including t=0; weighted degree pooled over active node-time, isolates included.',
    rank: 'Within-seed midrank 100*(below+equal/2)/available replicates; descriptive only, no acceptance threshold.',
    durationPolicy: 'Existing observer semantics; completed intervals only for duration summaries, right censoring separately.' };
}

async function generate(seed, replicates, output) {
  const { source, sourceHashes, archive } = await sourceInputs(seed), reference = instantaneousReference(source);
  const observedFull = replay(source, source.bytes, null, archive, true), observed = compact(observedFull), nulls = [], hashes = new Set();
  // Preserve the existing replay's default result, including all S0/S1 archive checks.
  const s2a = JSON.parse(gunzipSync(await readFile(resolve(ROOT, `docs/ant/evidence/2026-10-08-s2a-null/data/seed${seed}.json.gz`))));
  const { details, ...oldShape } = observedFull;
  assert.deepEqual(oldShape, s2a.observed, 'additive replay hook leaves committed S2a observed output unchanged');
  for (let replicate = 0; replicate < replicates; replicate += 1) {
    const { bytes, ledger } = identityTrajectory(source, seed, replicate), again = identityTrajectory(source, seed, replicate);
    assert.ok(bytes.equals(again.bytes)); assert.deepEqual(ledger, again.ledger);
    const trajectorySha256 = sha(bytes); assert.ok(!hashes.has(trajectorySha256)); hashes.add(trajectorySha256);
    const validation = validateIdentity(source, bytes, ledger, reference), full = replay(source, bytes, null, null, true);
    nulls.push({ replicate, trajectorySha256, ledger, validation: { ...validation, deterministicGeneration: true,
      distinctVirtualArchive: true, behaviorRngConsumed: false }, ...compact(full),
    boundary: boundaryAnalysis(full.details, ledger, observedFull.details) });
    console.log(JSON.stringify({ seed, replicate, encounters: full.raw.lifetimes.count, valid: true }));
  }
  await assertSourcesUnchanged(sourceHashes);
  const packet = { schemaVersion: 1, seed, parameters: parameters(replicates), sourceHashes,
    sourceUncompressedSha256: sha(source.bytes), observed, nulls, sourceBytesUnchanged: true, s2aObservedOutputUnchanged: true };
  await writeFile(resolve(output, `seed${seed}.json.gz`), gzipSync(Buffer.from(json(packet)), { level: 9 }));
}

async function summarize(output) {
  const packets = await Promise.all(SEEDS.map(async seed => JSON.parse(gunzipSync(await readFile(resolve(output, `seed${seed}.json.gz`))))));
  for (const p of packets) assert.deepEqual(p.parameters, packets[0].parameters);
  const summary = { schemaVersion: 1, parameters: packets[0].parameters, seeds: packets.map(p => ({ seed: p.seed,
    comparisons: WINDOWS.flatMap(seconds => Object.entries(measures(p.observed, seconds)).map(([metric, value]) =>
      ({ windowSeconds: seconds, metric, ...compare(value, p.nulls.map(run => measures(run, seconds)[metric])) }))),
    identityChanges: Object.fromEntries(['BLOCK_REMAP', 'LIFECYCLE_REPAIR'].map(type => [type, {
      eventCount: describe(p.nulls.map(run => run.ledger.filter(e => e.type === type).length)),
      changedSurvivingLabels: describe(p.nulls.map(run => run.ledger.filter(e => e.type === type)
        .flatMap(e => e.changes).filter(c => c.oldBody !== null && c.newBody !== null && c.oldBody !== c.newBody).length)),
      jumpDistance: describe(p.nulls.flatMap(run => run.ledger.filter(e => e.type === type).flatMap(e => e.changes)
        .map(c => c.jumpDistance).filter(Number.isFinite))) }])) })) };
  await writeFile(resolve(output, 'summary.json'), json(summary));
  const rows = ['seed,windowSeconds,metric,observed,nullN,nullMean,nullP10,nullMedian,nullP90,nullMin,nullMax,difference,ratio,standardizedDifference,midPercentile,below,equal,above'];
  for (const seed of summary.seeds) for (const row of seed.comparisons) rows.push([seed.seed, row.windowSeconds, row.metric,
    row.observed, row.null.n, row.null.mean, row.null.p10, row.null.p50, row.null.p90, row.null.min, row.null.max,
    row.differenceFromNullMean, row.ratioToNullMean, row.standardizedDifference, row.rank?.midPercentile,
    row.rank?.below, row.rank?.equal, row.rank?.above].map(x => x ?? '').join(','));
  await writeFile(resolve(output, 'comparisons.csv'), `${rows.join('\n')}\n`);
  await writeFile(resolve(output, 'validation.json'), json(packets.map(p => ({ seed: p.seed, sourceBytesUnchanged: p.sourceBytesUnchanged,
    sourceHashes: p.sourceHashes, sourceUncompressedSha256: p.sourceUncompressedSha256,
    observedArchiveReplay: p.observed.observedArchiveReplay, s2aObservedOutputUnchanged: p.s2aObservedOutputUnchanged,
    replicates: p.nulls.map(run => ({ replicate: run.replicate, trajectorySha256: run.trajectorySha256, ...run.validation })) }))));
  console.log(JSON.stringify({ summarized: SEEDS, replicatesPerSeed: summary.parameters.replicatesPerSeed }));
}

async function verify(output) {
  for (const seed of SEEDS) {
    const packet = JSON.parse(gunzipSync(await readFile(resolve(output, `seed${seed}.json.gz`))));
    const { source, sourceHashes, archive } = await sourceInputs(seed), reference = instantaneousReference(source);
    assert.deepEqual(sourceHashes, packet.sourceHashes);
    const observed = replay(source, source.bytes, null, archive, true);
    assert.deepEqual(compact(observed), packet.observed);
    for (const run of packet.nulls) {
      const { bytes, ledger } = identityTrajectory(source, seed, run.replicate);
      assert.equal(sha(bytes), run.trajectorySha256); assert.deepEqual(ledger, run.ledger);
      validateIdentity(source, bytes, ledger, reference);
      const full = replay(source, bytes, null, null, true);
      assert.deepEqual(compact(full), Object.fromEntries(['raw', 'windows', 'timeline', 'observedArchiveReplay'].map(key => [key, run[key]])));
      assert.deepEqual(boundaryAnalysis(full.details, ledger, observed.details), run.boundary);
      console.log(JSON.stringify({ verifiedSeed: seed, replicate: run.replicate, fullReplay: true, invariants: true }));
    }
    await assertSourcesUnchanged(sourceHashes);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map(process.argv.slice(2).map(value => { const [key, ...rest] = value.split('='); return [key, rest.join('=') || true]; }));
  const output = resolve(String(args.get('--output') || 'test-results/ant-s2b-null')), within = relative(SOURCE, output);
  assert.ok(within === '..' || within.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(within), 'cannot overwrite source archive directory');
  const replicates = Number(args.get('--replicates') || 8);
  assert.ok(Number.isInteger(replicates) && replicates > 0 && replicates <= 8, 'S2b pilot capped at eight');
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
