import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { loadSeedInputs } from './ant-w1-inputs.js';
import { createW1Crystallizer } from './ant-w1-crystallization.js';
import { createW1CharacterContext, W1CharacterDataGapError, summarizeValues, pearsonCorrelation, spearmanCorrelation } from './ant-w1-character.js';
import { measureBinaryMask, ANT_LOCAL_ACCRETION_METRIC_DEFINITIONS } from './ant-material-morphology-metrics.js';

export const W1_PACKAGE = 'docs/ant/evidence/2026-10-08-w1-episodic-material-shadow';
export const W1_CHARACTER_PACKAGE = 'docs/ant/evidence/2026-10-08-w1-causal-character-attribution';
const SEEDS = [20261005, 20261006, 20261007];
const WIDTH = 96, HEIGHT = 96, CELLS = WIDTH * HEIGHT, SUBSTANTIAL_CELLS = 18;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const count = mask => mask.reduce((sum, value) => sum + value, 0);

export function maskOf(cells, cellCount = CELLS) {
  const mask = new Uint8Array(cellCount);
  for (const cell of cells) {
    assert.ok(Number.isSafeInteger(cell) && cell >= 0 && cell < cellCount, 'valid geometry index');
    mask[cell] = 1;
  }
  return mask;
}

export function overlapMasks(left, right) {
  assert.equal(left.length, right.length);
  let intersection = 0, union = 0, leftCount = 0, rightCount = 0;
  for (let i = 0; i < left.length; i++) {
    assert.ok((left[i] === 0 || left[i] === 1) && (right[i] === 0 || right[i] === 1));
    intersection += left[i] & right[i]; union += left[i] | right[i];
    leftCount += left[i]; rightCount += right[i];
  }
  return { leftCells: leftCount, rightCells: rightCount, intersectionCells: intersection,
    unionCells: union, jaccard: union ? intersection / union : null,
    mismatch: union ? 1 - intersection / union : null,
    leftOutsideRightFraction: leftCount ? (leftCount - intersection) / leftCount : null,
    rightOutsideLeftFraction: rightCount ? (rightCount - intersection) / rightCount : null };
}

const annulus = Uint8Array.from({ length: CELLS }, (_, i) => {
  const r = Math.hypot(i % WIDTH / (WIDTH - 1) - 0.5, Math.floor(i / WIDTH) / (HEIGHT - 1) - 0.72);
  return Number(r >= 0.055 && r <= 0.115);
});

function metrics(mask) {
  const result = measureBinaryMask({ width: WIDTH, height: HEIGHT, mask, annulusMask: annulus });
  return { ...result,
    largestComponentShare: result.occupiedCellCount ? result.foreground.componentAreasDescending[0] / result.occupiedCellCount : null,
    substantialAreaReferenceCells: SUBSTANTIAL_CELLS,
    substantialHoleCount: result.holes.areasDescending.filter(area => area >= SUBSTANTIAL_CELLS).length,
    substantialComponentCount: result.foreground.components.filter(c => c.areaCellCount >= SUBSTANTIAL_CELLS).length,
    isolatedSubstantialComponentCount: result.foreground.components.filter(c => c.areaCellCount >= SUBSTANTIAL_CELLS && !c.touchesBoundary && !c.touchesAnnulus).length
  };
}

function characterStats(episodes) {
  if (!episodes.length) return { count: 0, axes: null, correlations: null, periods: [] };
  const axes = Object.fromEntries(['consolidation', 'directionalOrder'].map(axis => {
    const values = episodes.map(e => e.character?.[axis]).filter(Number.isFinite);
    return [axis, { ...(values.length ? summarizeValues(values) : {}), count: values.length,
      missingCount: episodes.length - values.length, valuesSorted: [...values].sort((a, b) => a - b),
      zeroCount: values.filter(v => v === 0).length, oneCount: values.filter(v => v === 1).length }];
  }));
  const pairs = [['consolidation', 'directionalOrder'], ...['consolidation', 'directionalOrder'].flatMap(axis =>
    ['occupiedCells', 'durationSeconds', 'newAreaFraction'].map(other => [axis, other]))];
  const value = (episode, key) => episode.character[key] ?? episode[key];
  const correlations = Object.fromEntries(pairs.map(([a, b]) => {
    const rows = episodes.map(e => [value(e, a), value(e, b)]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    const left = rows.map(([x]) => x), right = rows.map(([, y]) => y);
    return [`${a}:${b}`, { count: rows.length, missingCount: episodes.length - rows.length,
      pearson: rows.length < 2 ? null : pearsonCorrelation(left, right),
      spearman: rows.length < 2 ? null : spearmanCorrelation(left, right) }];
  }));
  return { count: episodes.length, axes, correlations,
    periods: [[0, 200], [200, 400], [400, 600]].map(([start, end]) => {
      const subset = episodes.filter(e => e.birthTimeSeconds >= start && e.birthTimeSeconds < end);
      return { birthRangeSeconds: [start, end], count: subset.length,
        consolidation: summarizeAvailable(subset, 'consolidation'),
        directionalOrder: summarizeAvailable(subset, 'directionalOrder') };
    }) };
}

function summarizeAvailable(episodes, axis) {
  const values = episodes.map(e => e.character?.[axis]).filter(Number.isFinite);
  return values.length ? { ...summarizeValues(values), missingCount: episodes.length - values.length } : null;
}

export function analyzeSeed(input, baseline) {
  const frames = input.fieldMetadata.frames;
  assert.equal(frames.length, input.metadata.fieldIntervals);
  assert.equal(baseline.seed, input.metadata.seed);
  const character = createW1CharacterContext({ frames, flags: input.flags, feet: input.feet, width: WIDTH, height: HEIGHT });
  const model = createW1Crystallizer({ width: WIDTH, height: HEIGHT });
  const union = new Uint8Array(CELLS), firstFrozenTime = Array(CELLS).fill(null);
  const episodes = [], history = [], milestones = [];
  const dataGaps = [];
  let stopSnapshot = null;
  let previousPendingCells = 0, totalEpisodeCells = 0, totalOverlapCells = 0;
  for (const [index, frame] of frames.entries()) {
    const step = model.advance({ timeSeconds: frame.timeSeconds, flags: input.flags.subarray(index * CELLS, (index + 1) * CELLS) });
    for (const bounds of Object.values(step.stateBounds)) assert.ok(bounds.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
    let newCells = 0;
    for (const episode of [...step.closedEpisodes].sort((a, b) => a.id - b.id)) {
      const mask = maskOf(episode.cellIndices), overlap = overlapMasks(mask, union);
      let measured;
      try { measured = character.measure(episode); }
      catch (error) {
        if (!(error instanceof W1CharacterDataGapError)) throw error;
        const gap = { code: error.code, details: error.details, timeSeconds: frame.timeSeconds, episodeId: episode.id,
          episode: { ...episode, status: 'closed-character-unresolved', metrics: metrics(mask) },
          causalCellHistory: episode.cellIndices.map((cellIndex, cellOffset) => ({ cellIndex,
            firstAdmissionSeconds: episode.firstAdmissionTimeSecondsByCell[cellOffset],
            predicateObservations: frames.slice(0, index + 1).map((f, frameIndex) => ({
              timeSeconds: f.timeSeconds, flags: input.flags[frameIndex * CELLS + cellIndex] })),
            footSamplesThroughClosure: input.feet.filter(f => f.cellIndex === cellIndex && f.timeSeconds <= frame.timeSeconds + 1e-9)
          })) };
        dataGaps.push(gap);
        measured = { character: { consolidation: error.details.partialCharacter?.consolidation ?? null,
          directionalOrder: null }, evidence: error.details.partialEvidence ?? null,
          characterStatus: 'direction-unavailable', characterGap: { code: error.code, details: error.details } };
      }
      assert.ok(Object.values(measured.character).every(v => v === null || (Number.isFinite(v) && v >= 0 && v <= 1)));
      const added = episode.cellIndices.length - overlap.intersectionCells;
      newCells += added; totalEpisodeCells += episode.cellIndices.length; totalOverlapCells += overlap.intersectionCells;
      episodes.push({ ...episode, durationSeconds: episode.closeTimeSeconds - episode.birthTimeSeconds,
        occupiedCells: episode.cellIndices.length, areaFraction: episode.cellIndices.length / CELLS,
        newCells: added, overlapCells: overlap.intersectionCells,
        newAreaFraction: added / episode.cellIndices.length,
        priorUnionOverlapFraction: overlap.intersectionCells / episode.cellIndices.length,
        ...measured, characterStatus: measured.characterStatus ?? 'complete', metrics: metrics(mask) });
      for (const cell of episode.cellIndices) {
        if (!union[cell]) firstFrozenTime[cell] = frame.timeSeconds;
        union[cell] = 1;
      }
    }
    const pending = model.getOpenEpisodes();
    const pendingMask = maskOf(pending.flatMap(e => e.cellIndices));
    const pendingCells = count(pendingMask), snapshot = model.getSnapshot();
    const prior = baseline.history[index];
    assert.ok(Math.abs(prior.timeSeconds - frame.timeSeconds) < 1e-9, 'matched historical observation');
    history.push({ timeSeconds: frame.timeSeconds, tick: frame.tick,
      frozenCells: count(union), newFrozenCells: newCells, frozenEpisodeCount: episodes.length,
      pendingCells, pendingCellDelta: pendingCells - previousPendingCells,
      activeCells: snapshot.activeCellCount, activeComponents: snapshot.activeComponentCount,
      openEpisodes: pending.length, discardedEpisodeCount: model.getDiscardedEpisodes().length,
      productionCells: prior.production.occupiedCells, localAccretionCells: prior.shadow.occupiedCells,
      stateBounds: step.stateBounds });
    previousPendingCells = pendingCells;
    if (dataGaps.length && !stopSnapshot) {
      const trafficMask = maskOf(input.feet.filter(f => f.timeSeconds > frame.timeSeconds - 20 && f.timeSeconds <= frame.timeSeconds + 1e-9).map(f => f.cellIndex));
      const masks = { frozen: Array.from(union), pending: Array.from(pendingMask), active: snapshot.activeMask,
        traffic20s: Array.from(trafficMask), unresolvedEpisode: Array.from(maskOf(dataGaps[0].causalCellHistory.map(c => c.cellIndex))) };
      stopSnapshot = { sampledSeconds: frame.timeSeconds, masks,
        metrics: Object.fromEntries(Object.entries(masks).map(([key, mask]) => [key, metrics(mask)])),
        trafficMismatch: { frozen: overlapMasks(union, trafficMask), pending: overlapMasks(pendingMask, trafficMask) } };
    }
    const matched = baseline.milestones.find(m => Math.abs(m.sampledSeconds - frame.timeSeconds) < 1e-9);
    if (matched) {
      const trafficMask = maskOf(input.feet.filter(f => f.timeSeconds > frame.timeSeconds - 20 && f.timeSeconds <= frame.timeSeconds + 1e-9).map(f => f.cellIndex));
      const masks = { frozen: Array.from(union), pending: Array.from(pendingMask), active: snapshot.activeMask,
        production: matched.productionMask, localAccretion: matched.shadowMask, traffic20s: Array.from(trafficMask) };
      milestones.push({ requestedSeconds: matched.requestedSeconds, sampledSeconds: frame.timeSeconds,
        openEpisodeIds: pending.map(e => e.id), frozenEpisodeIds: episodes.map(e => e.id), masks,
        metrics: Object.fromEntries(['frozen', 'pending', 'active', 'production', 'localAccretion'].map(key => [key, metrics(masks[key])])),
        trafficMismatch: Object.fromEntries(['frozen', 'pending', 'production', 'localAccretion'].map(key => [key, overlapMasks(masks[key], masks.traffic20s)])),
        fields: { chemicalMemory: matched.chemicalMemory, mechanicalSupport: matched.mechanicalSupport } });
    }
  }
  const last = history.at(-1), late = history.filter(row => row.timeSeconds >= 480);
  const endpointMetrics = milestones.at(-1)?.metrics ?? {
    frozen: metrics(union), pending: metrics(maskOf(model.getOpenEpisodes().flatMap(e => e.cellIndices))),
    production: null, localAccretion: null
  };
  const rightCensored = model.getOpenEpisodes().map(e => ({ ...e, occupiedCells: e.cellIndices.length,
    observedDurationSeconds: last.timeSeconds - e.birthTimeSeconds, metrics: metrics(maskOf(e.cellIndices)) }));
  const discarded = model.getDiscardedEpisodes();
  const hasCharacterGaps = dataGaps.length > 0;
  return { seed: input.metadata.seed, status: hasCharacterGaps ? 'complete-with-character-gaps' : 'complete',
    characterStatus: { status: hasCharacterGaps ? 'directional-coverage-incomplete' : 'complete',
      gapCount: dataGaps.length, resolvedDirectionalCount: episodes.filter(e => Number.isFinite(e.character.directionalOrder)).length },
    dataGap: dataGaps[0] ? (({ causalCellHistory, ...legacy }) => legacy)(dataGaps[0]) : null, dataGaps, stopSnapshot,
    inputProvenance: input.metadata, contactCoverage: input.coverage,
    episodes, discardedEpisodes: discarded, rightCensoredEpisodes: rightCensored, history, milestones,
    character: characterStats(episodes), firstFrozenTime,
    final: { timeSeconds: last.timeSeconds, frozenEpisodeCount: episodes.length,
      discardedEpisodeCount: discarded.length, rightCensoredEpisodeCount: rightCensored.length,
      totalEpisodeCells, totalOverlapCells, reinscriptionFraction: totalEpisodeCells ? totalOverlapCells / totalEpisodeCells : null,
      frozenMetrics: endpointMetrics.frozen, pendingMetrics: endpointMetrics.pending,
      productionMetrics: endpointMetrics.production,
      localAccretionMetrics: endpointMetrics.localAccretion,
      lateRangeSeconds: last.timeSeconds >= 480 ? [480, last.timeSeconds] : null,
      lateClosedEpisodeCount: last.timeSeconds >= 480 ? episodes.filter(e => e.closeTimeSeconds >= 480).length : null,
      lateNewFrozenCells: last.timeSeconds >= 480 ? late.reduce((sum, row) => sum + row.newFrozenCells, 0) : null,
      lateNewFrozenCellsPerSecond: last.timeSeconds >= 480 ? late.reduce((sum, row) => sum + row.newFrozenCells, 0) / (last.timeSeconds - 480) : null,
      latePendingCellDelta: last.timeSeconds >= 480 ? last.pendingCells - history.findLast(row => row.timeSeconds < 480).pendingCells : null,
      discardedAreaDistribution: discarded.map(e => e.cellIndices.length).sort((a, b) => a - b) } };
}

function csv(rows, columns) {
  return [columns.join(','), ...rows.map(row => columns.map(key => row[key] ?? '').join(','))].join('\n') + '\n';
}

async function main() {
  const packageDir = resolve(W1_PACKAGE), outputDir = resolve(process.argv[2] ?? `${W1_CHARACTER_PACKAGE}/results`);
  const formationSourceSha256 = hash(await readFile('scripts/ant-w1-crystallization.js'));
  assert.equal(formationSourceSha256, 'cee5241d663a509bf51b21533b262fde7447f249d81520375be68bd048cc94bf', 'exact W1 formation source remains unchanged');
  const baseline = JSON.parse(gunzipSync(await readFile(`${packageDir}/inputs/baselines/local-accretion-analysis.json.gz`)));
  const seeds = [], checks = [], inputOnlySeeds = [];
  const oldRandom = Math.random;
  Math.random = () => { throw new Error('W1 must not consume RNG'); };
  try {
    for (const seed of SEEDS) {
      const input = await loadSeedInputs(seed, packageDir);
      const comparison = baseline.seeds.find(s => s.seed === seed);
      const first = analyzeSeed(input, comparison), second = analyzeSeed(input, comparison);
      const bytes = Buffer.from(JSON.stringify(first));
      assert.equal(JSON.stringify(first), JSON.stringify(second), 'identical-input complete analysis');
      seeds.push(first); checks.push({ seed, sha256: hash(bytes), identicalReplay: true,
        replayCoverage: 'complete-horizon',
        filterBoundsValidated: true, formationFrozenEpisodeCount: first.episodes.length,
        validatedNaturalCharacterCount: first.characterStatus.resolvedDirectionalCount,
        validIndices: true, rngCalls: 0 });
      process.stdout.write(JSON.stringify({ seed, status: first.status, dataGap: first.dataGap?.details,
        frozenEpisodes: first.episodes.length,
        rightCensored: first.rightCensoredEpisodes.length, frozenCells: first.final.frozenMetrics.occupiedCellCount,
        pendingCells: first.final.pendingMetrics.occupiedCellCount }) + '\n');
    }
  } finally { Math.random = oldRandom; }
  const all = seeds.flatMap(seed => seed.episodes);
  const output = { schemaVersion: 1, family: 'W1 two-timescale episodic crystallization',
    status: seeds.some(s => s.status === 'complete-with-character-gaps') ? 'complete-with-character-gaps' : 'complete',
    designSha256: hash(await readFile(`${W1_CHARACTER_PACKAGE}/DESIGN.md`)),
    formationSourceSha256,
    characterAttribution: { directionalWindowStartSeconds: 0, sameCellActualContactsOnly: true,
      consolidationWindow: 'first cell admission through episode closure, unchanged',
      directionalWindow: 'recorded run start (0 seconds) through episode closure',
      attributionMeaning: 'cumulative local contact-history nematic order; not an exact decomposition of chemical/mechanical or EMA contributions' },
    definitions: ANT_LOCAL_ACCRETION_METRIC_DEFINITIONS, substantialAreaReferenceCells: SUBSTANTIAL_CELLS,
    parameters: { recentSeconds: 20, establishedSeconds: 90, minPersistenceSeconds: 20 },
    deterministicChecks: checks, seeds, inputOnlySeeds,
    baselineMilestones: baseline.seeds.map(s => ({ seed: s.seed, milestones: s.milestones })),
    pooledCharacter: characterStats(all) };
  await mkdir(outputDir, { recursive: true });
  await writeFile(`${outputDir}/analysis.json.gz`, gzipSync(Buffer.from(JSON.stringify(output)), { level: 9, mtime: 0 }));
  const episodeRows = seeds.flatMap(s => s.episodes.map(e => ({ seed: s.seed, ...e, ...e.character,
    characterStatus: e.characterStatus, characterGapCode: e.characterGap?.code ?? '',
    components: e.metrics.foreground.componentCount, holes: e.metrics.holes.beta1,
    substantialHoles: e.metrics.substantialHoleCount, isolatedSubstantial: e.metrics.isolatedSubstantialComponentCount })));
  await writeFile(`${outputDir}/episodes.csv`, csv(episodeRows, ['seed', 'id', 'birthTimeSeconds', 'lastActiveTimeSeconds', 'closeTimeSeconds', 'durationSeconds', 'occupiedCells', 'newCells', 'overlapCells', 'newAreaFraction', 'consolidation', 'directionalOrder', 'characterStatus', 'characterGapCode', 'components', 'holes', 'substantialHoles', 'isolatedSubstantial']));
  const lineages = seeds.flatMap(s => [...s.episodes, ...s.rightCensoredEpisodes,
    ...s.discardedEpisodes].map(e => ({ seed: s.seed,
    ...e, occupiedCells: e.cellIndices.length, observedDurationSeconds: (e.closeTimeSeconds ?? s.final.timeSeconds) - e.birthTimeSeconds,
    ancestryCount: e.ancestryIds.length, components: e.metrics?.foreground.componentCount,
    holes: e.metrics?.holes.beta1, substantialHoles: e.metrics?.substantialHoleCount })));
  await writeFile(`${outputDir}/observed-lineages.csv`, csv(lineages, ['seed', 'id', 'status', 'birthTimeSeconds', 'lastActiveTimeSeconds', 'closeTimeSeconds', 'observedDurationSeconds', 'persistenceSeconds', 'occupiedCells', 'ancestryCount', 'mergeCount', 'splitCount', 'components', 'holes', 'substantialHoles']));
  const milestoneRows = seeds.flatMap(s => s.milestones.flatMap(m => Object.entries(m.metrics).map(([representation, metric]) => ({
    seed: s.seed, timeSeconds: m.sampledSeconds, representation,
    occupiedCells: metric.occupiedCellCount, areaFraction: metric.areaFraction,
    components: metric.foreground.componentCount, largestComponentShare: metric.largestComponentShare,
    endpoints: metric.skeleton.endpointCount, junctions: metric.skeleton.junctionNodeCount,
    holes: metric.holes.beta1, substantialHoles: metric.substantialHoleCount,
    isolatedSubstantial: metric.isolatedSubstantialComponentCount,
    skeletonCycleRank: metric.skeleton.graphCycleRank, trafficMismatch: m.trafficMismatch[representation]?.mismatch
  }))));
  await writeFile(`${outputDir}/milestones.csv`, csv(milestoneRows, ['seed', 'timeSeconds', 'representation', 'occupiedCells', 'areaFraction', 'components', 'largestComponentShare', 'endpoints', 'junctions', 'holes', 'substantialHoles', 'isolatedSubstantial', 'skeletonCycleRank', 'trafficMismatch']));
  const baselineRows = baseline.seeds.flatMap(s => s.milestones.flatMap(m => ['production', 'shadow'].map(key => {
    const metric = m[`${key}Metrics`];
    return { seed: s.seed, timeSeconds: m.sampledSeconds,
      representation: key === 'shadow' ? 'historical-local-accretion' : 'historical-production',
      occupiedCells: metric.occupiedCellCount, areaFraction: metric.areaFraction,
      components: metric.foreground.componentCount,
      largestComponentShare: metric.occupiedCellCount ? metric.foreground.componentAreasDescending[0] / metric.occupiedCellCount : null,
      holes: metric.holes.beta1, endpoints: metric.skeleton.endpointCount, junctions: metric.skeleton.junctionNodeCount };
  })));
  await writeFile(`${outputDir}/baseline-milestones.csv`, csv(baselineRows, ['seed', 'timeSeconds', 'representation', 'occupiedCells', 'areaFraction', 'components', 'largestComponentShare', 'holes', 'endpoints', 'junctions']));
  const stopRows = seeds.filter(s => s.stopSnapshot).flatMap(s => Object.entries(s.stopSnapshot.metrics).map(([representation, metric]) => ({
    seed: s.seed, timeSeconds: s.stopSnapshot.sampledSeconds, representation, occupiedCells: metric.occupiedCellCount,
    areaFraction: metric.areaFraction, components: metric.foreground.componentCount,
    largestComponentShare: metric.largestComponentShare, holes: metric.holes.beta1,
    substantialHoles: metric.substantialHoleCount, isolatedSubstantial: metric.isolatedSubstantialComponentCount,
    endpoints: metric.skeleton.endpointCount, junctions: metric.skeleton.junctionNodeCount,
    skeletonCycleRank: metric.skeleton.graphCycleRank })));
  await writeFile(`${outputDir}/stop-snapshot-metrics.csv`, csv(stopRows, ['seed', 'timeSeconds', 'representation', 'occupiedCells', 'areaFraction', 'components', 'largestComponentShare', 'holes', 'substantialHoles', 'isolatedSubstantial', 'endpoints', 'junctions', 'skeletonCycleRank']));
  await writeFile(`${outputDir}/character-distributions.json`, JSON.stringify({ status: output.status,
    inputOnlySeeds: inputOnlySeeds.map(s => s.seed), pooled: output.pooledCharacter,
    seeds: seeds.map(s => ({ seed: s.seed, status: s.status, ...s.character })) }, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
