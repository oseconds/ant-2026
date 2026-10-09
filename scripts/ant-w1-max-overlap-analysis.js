import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { loadSeedInputs } from './ant-w1-inputs.js';
import { analyzeSeed, W1_PACKAGE, W1_CHARACTER_PACKAGE, maskOf } from './ant-w1-analysis.js';
import { createW1Crystallizer } from './ant-w1-crystallization.js';
import { createMaxOverlapCrystallizer } from './ant-w1-max-overlap-crystallization.js';
import { summarizeValues, pearsonCorrelation, spearmanCorrelation } from './ant-w1-character.js';

export const SPLIT_PACKAGE = 'docs/ant/evidence/2026-10-09-w1-max-overlap-split-shadow';
const STARTING_HEAD = '73dac81d29231c40bc5dfecb1cd3f8ff34fc81e8';
const SEEDS = [20261005, 20261006, 20261007], WIDTH = 96, HEIGHT = 96, CELLS = WIDTH * HEIGHT;
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceUrl = new URL('./ant-w1-analysis.js', import.meta.url);

export function deriveAnalyzerSource(source) {
  const modelImport = "import { createW1Crystallizer } from './ant-w1-crystallization.js';";
  const entry = 'if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();';
  assert.equal(source.split(modelImport).length, 2, 'one original model binding');
  assert.equal(source.split(entry).length, 2, 'one original CLI guard');
  const candidateImport = `import { createMaxOverlapCrystallizer as createW1Crystallizer } from '${new URL('./ant-w1-max-overlap-crystallization.js', import.meta.url).href}';`;
  const derived = source.replace(modelImport, candidateImport).replace(entry, '')
    .replace(/from '(\.[^']+)'/g, (_, path) => `from '${new URL(path, sourceUrl).href}'`);
  const analysisFunction = text => text.slice(text.indexOf('export function analyzeSeed('), text.indexOf('function csv('));
  assert.ok(analysisFunction(source).length > 0);
  assert.equal(analysisFunction(derived), analysisFunction(source), 'complete measurement function is unchanged');
  return derived;
}

export async function loadCandidateAnalyzer() {
  const original = await readFile(sourceUrl, 'utf8');
  const derived = deriveAnalyzerSource(original);
  const module = await import(`data:text/javascript;base64,${Buffer.from(derived).toString('base64')}`);
  return { analyzeSeed: module.analyzeSeed, provenance: {
    sourcePath: 'scripts/ant-w1-analysis.js', sourceSha256: sha(Buffer.from(original)),
    derivedModuleSha256: sha(Buffer.from(derived)), measurementFunctionTextIdentical: true,
    changes: ['bind original model import to max-overlap shadow factory', 'resolve relative module imports', 'disable original CLI entry guard']
  } };
}

export function describeValues(values) {
  assert.ok(values.every(Number.isFinite), 'finite distribution inputs');
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = p => {
    if (!sorted.length) return null;
    const at = (sorted.length - 1) * p, lower = Math.floor(at), part = at - lower;
    return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * part;
  };
  return { count: sorted.length, min: sorted[0] ?? null, q1: quantile(.25), median: quantile(.5),
    q3: quantile(.75), max: sorted.at(-1) ?? null,
    mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null,
    valuesSorted: sorted };
}

export function summarizeCondition(result) {
  const frozen = result.episodes, pending = result.rightCensoredEpisodes, discarded = result.discardedEpisodes;
  const area = episode => episode.cellIndices.length;
  const dominant = [...pending].sort((a, b) => area(b) - area(a) || a.id - b.id)[0];
  const oneCell = frozen.filter(e => area(e) === 1).length;
  const reviewScale = frozen.filter(e => area(e) >= 18);
  return {
    closedCount: frozen.length, discardedCount: discarded.length, pendingCount: pending.length,
    oneCellCount: oneCell, oneCellFraction: frozen.length ? oneCell / frozen.length : null,
    frozenUnionCells: result.final.frozenMetrics.occupiedCellCount,
    pendingUnionCells: result.final.pendingMetrics.occupiedCellCount,
    totalFrozenEpisodeCells: result.final.totalEpisodeCells, reinscriptionFraction: result.final.reinscriptionFraction,
    frozenArea: describeValues(frozen.map(area)), frozenPersistence: describeValues(frozen.map(e => e.persistenceSeconds)),
    discardedArea: describeValues(discarded.map(area)), discardedPersistence: describeValues(discarded.map(e => e.persistenceSeconds)),
    pendingArea: describeValues(pending.map(area)), pendingDuration: describeValues(pending.map(e => e.observedDurationSeconds)),
    newAreaFraction: describeValues(frozen.map(e => e.newAreaFraction)), newCellsPerEpisode: describeValues(frozen.map(e => e.newCells)),
    reviewScaleReferenceCells: 18, reviewScaleEpisodeCount: reviewScale.length,
    reviewScaleNewAreaFraction: describeValues(reviewScale.map(e => e.newAreaFraction)),
    isolatedReviewScaleEpisodeCount: reviewScale.filter(e => e.metrics.isolatedSubstantialComponentCount > 0).length,
    episodeHoleCount: frozen.reduce((n, e) => n + e.metrics.holes.beta1, 0),
    episodeSubstantialHoleCount: frozen.reduce((n, e) => n + e.metrics.substantialHoleCount, 0),
    frozenMetrics: result.final.frozenMetrics, pendingMetrics: result.final.pendingMetrics,
    dominantPending: dominant ? { id: dominant.id, birthTimeSeconds: dominant.birthTimeSeconds,
      durationSeconds: dominant.observedDurationSeconds, cumulativeCells: area(dominant),
      ancestryCount: dominant.ancestryIds.length, splitProvenanceCount: dominant.splitProvenanceIds?.length ?? 0,
      unionShare: result.final.pendingMetrics.occupiedCellCount ? area(dominant) / result.final.pendingMetrics.occupiedCellCount : null,
      historicalComponents: dominant.metrics.foreground.componentCount, holes: dominant.metrics.holes.beta1,
      substantialHoles: dominant.metrics.substantialHoleCount } : null,
    lateClosedCount: result.final.lateClosedEpisodeCount, lateNewFrozenCells: result.final.lateNewFrozenCells,
    lateNewFrozenCellsPerSecond: result.final.lateNewFrozenCellsPerSecond,
    characterCoverage: result.characterStatus, character: result.character
  };
}

export function pooledCharacter(episodes) {
  const axes = Object.fromEntries(['consolidation', 'directionalOrder'].map(axis => {
    const values = episodes.map(e => e.character[axis]).filter(Number.isFinite);
    return [axis, { count: values.length, missingCount: episodes.length - values.length,
      ...(values.length ? summarizeValues(values) : {}), valuesSorted: [...values].sort((a, b) => a - b) }];
  }));
  const correlations = {};
  for (const [a, b] of [['consolidation', 'directionalOrder'], ...['consolidation', 'directionalOrder'].flatMap(axis =>
    ['occupiedCells', 'durationSeconds', 'newAreaFraction'].map(other => [axis, other]))]) {
    const value = (e, name) => e.character[name] ?? e[name];
    const pairs = episodes.map(e => [value(e, a), value(e, b)]).filter(row => row.every(Number.isFinite));
    correlations[`${a}:${b}`] = { count: pairs.length,
      pearson: pairs.length >= 2 ? pearsonCorrelation(pairs.map(p => p[0]), pairs.map(p => p[1])) : null,
      spearman: pairs.length >= 2 ? spearmanCorrelation(pairs.map(p => p[0]), pairs.map(p => p[1])) : null };
  }
  return { count: episodes.length, axes, correlations };
}

function finite(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), 'finite analysis values');
  else if (Array.isArray(value)) value.forEach(finite);
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
}

function csv(rows, columns) {
  const cell = value => {
    if (value === undefined || value === null) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[,"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [columns.join(','), ...rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\n') + '\n';
}

function lineageFrame(open, components, timeSeconds) {
  const dominant = [...open].sort((a, b) => b.cellIndices.length - a.cellIndices.length || a.id - b.id)[0];
  const pendingUnionCells = maskOf(open.flatMap(e => e.cellIndices)).reduce((a, b) => a + b, 0);
  const activeComponents = dominant ? components.filter(c => c.episodeId === dominant.id) : [];
  return { openEpisodes: open.length, pendingUnionCells,
    dominant: dominant ? { id: dominant.id, activeCells: activeComponents.reduce((n, c) => n + c.cellIndices.length, 0),
      activeComponents: activeComponents.length, cumulativeCells: dominant.cellIndices.length,
      ancestryCount: dominant.ancestryIds.length, splitProvenanceCount: dominant.splitProvenanceIds?.length ?? 0,
      durationSeconds: timeSeconds - dominant.birthTimeSeconds, birthTimeSeconds: dominant.birthTimeSeconds } : null };
}

export function splitFates(forks, absorptions, frozen, discarded, pending) {
  const redirects = new Map();
  for (const event of absorptions) {
    assert.ok(!redirects.has(event.sourceEpisodeId), 'identity absorbed once');
    redirects.set(event.sourceEpisodeId, event.targetEpisodeId);
  }
  const terminal = new Map([...frozen, ...discarded, ...pending].map(e => [e.id, e.status]));
  const rows = forks.map(fork => {
    let id = fork.episodeId;
    const visited = new Set();
    while (redirects.has(id)) {
      assert.ok(!visited.has(id), 'acyclic identity redirects'); visited.add(id); id = redirects.get(id);
    }
    const firstMerge = absorptions.find(e => e.sourceEpisodeId === fork.episodeId);
    assert.ok(terminal.has(id), 'fork reaches closed, discarded or pending terminal identity');
    return { ...fork, independentlyClosed: !firstMerge && terminal.get(id) === 'frozen',
      independentlyDiscarded: !firstMerge && terminal.get(id) === 'discarded', reabsorbed: Boolean(firstMerge),
      firstAbsorbedAtSeconds: firstMerge?.timeSeconds ?? null,
      secondsBeforeFirstAbsorption: firstMerge ? firstMerge.timeSeconds - fork.timeSeconds : null,
      terminalEpisodeId: id, terminalStatus: terminal.get(id) };
  });
  return { count: rows.length, independentlyFrozenCount: rows.filter(r => r.independentlyClosed).length,
    independentlyDiscardedCount: rows.filter(r => r.independentlyDiscarded).length,
    independentlyPendingCount: rows.filter(r => !r.reabsorbed && r.terminalStatus === 'right-censored').length,
    reabsorbedCount: rows.filter(r => r.reabsorbed).length,
    reabsorbedTerminalFrozen: rows.filter(r => r.reabsorbed && r.terminalStatus === 'frozen').length,
    reabsorbedTerminalDiscarded: rows.filter(r => r.reabsorbed && r.terminalStatus === 'discarded').length,
    reabsorbedTerminalPending: rows.filter(r => r.reabsorbed && r.terminalStatus === 'right-censored').length,
    timeToFirstAbsorption: describeValues(rows.filter(r => r.reabsorbed).map(r => r.secondsBeforeFirstAbsorption)), rows };
}

export function replayMatched(input, continuitySeed, candidateAnalysis) {
  const baseline = createW1Crystallizer({ width: WIDTH, height: HEIGHT });
  const candidate = createMaxOverlapCrystallizer({ width: WIDTH, height: HEIGHT });
  const frames = [], events = [], identityFrames = [], forks = [], absorptions = [];
  assert.equal(continuitySeed.frames.length, input.fieldMetadata.frames.length);
  for (const [frameIndex, frame] of input.fieldMetadata.frames.entries()) {
    const flags = input.flags.subarray(frameIndex * CELLS, (frameIndex + 1) * CELLS);
    baseline.advance({ timeSeconds: frame.timeSeconds, flags });
    candidate.advance({ timeSeconds: frame.timeSeconds, flags });
    const left = baseline.getSnapshot(), right = candidate.getSnapshot(), prior = continuitySeed.frames[frameIndex];
    assert.equal(left.timeSeconds, prior.timeSeconds);
    assert.deepEqual(right.activeMask, left.activeMask, `active mask frame ${frameIndex}`);
    assert.deepEqual(right.stateBounds, left.stateBounds, `EMA bounds frame ${frameIndex}`);
    assert.equal(right.activeComponentCount, left.activeComponentCount);
    assert.equal(prior.activeCellCount, left.activeCellCount);
    const baselineMask = maskOf(prior.components.flatMap(c => c.cellIndices));
    assert.deepEqual([...baselineMask], left.activeMask, 'committed continuity component mask');
    const diagnostics = candidate.getLastIdentityDiagnostics();
    assert.equal(new Set(diagnostics.components.map(c => c.episodeId)).size, diagnostics.components.length);
    assert.equal(diagnostics.activeEntityCount, candidate.getOpenEpisodes().length);
    assert.deepEqual([...maskOf(diagnostics.components.flatMap(c => c.cellIndices))], right.activeMask);
    const scalar = { timeSeconds: frame.timeSeconds, frameIndex, activeCells: left.activeCellCount,
      activeComponents: left.activeComponentCount, qCellCount: flags.reduce((n, f) => n + Number((f & 7) === 7), 0),
      baseline: lineageFrame(baseline.getOpenEpisodes(), prior.components, frame.timeSeconds),
      candidate: lineageFrame(candidate.getOpenEpisodes(), diagnostics.components, frame.timeSeconds) };
    frames.push(scalar);
    identityFrames.push(diagnostics);
    for (const component of diagnostics.components) {
      if (component.freshBirth) {
        const event = { type: component.forkSourceParentIds.length ? 'split-fork-birth' : 'birth',
          timeSeconds: frame.timeSeconds, frameIndex, episodeId: component.episodeId,
          componentLabel: component.componentLabel, sourceParentIds: component.forkSourceParentIds,
          cellCount: component.cellIndices.length };
        events.push(event);
        if (event.type === 'split-fork-birth') forks.push(event);
      }
      if (component.droppedEdges.length && component.winningParentComponentLabels.length)
        events.push({ type: 'nonwinning-provenance-with-other-route', timeSeconds: frame.timeSeconds, frameIndex,
          episodeId: component.episodeId, componentLabel: component.componentLabel, droppedEdges: component.droppedEdges });
    }
    for (const absorption of diagnostics.mergeAbsorptions) {
      absorptions.push(absorption); events.push({ type: 'merge-absorption', ...absorption });
    }
  }
  assert.deepEqual(candidate.getDiscardedEpisodes(), candidateAnalysis.discardedEpisodes, 'candidate discarded analysis parity');
  const raw = (episode, template) => Object.fromEntries(Object.keys(template).map(key => [key, episode[key]]));
  const closed = candidate.getClosedEpisodes();
  assert.deepEqual(closed, candidateAnalysis.episodes.map((episode, index) => raw(episode, closed[index])), 'candidate frozen geometry and ordering');
  const open = candidate.getOpenEpisodes();
  assert.deepEqual(open, candidateAnalysis.rightCensoredEpisodes.map((episode, index) => raw(episode, open[index])), 'candidate pending geometry');
  return { frames, events, identityFrames,
    splitChildren: splitFates(forks, absorptions, closed, candidate.getDiscardedEpisodes(), open),
    identityMergeCount: identityFrames.reduce((n, f) => n + f.components.filter(c => c.absorbedParentIds.length > 0).length, 0),
    absorbedIdentityCount: absorptions.length,
    geometricJoinCount: identityFrames.reduce((n, f) => n + f.components.filter(c => {
      return f.overlapEdges.filter(e => e.currentComponentLabel === c.componentLabel).length > 1;
    }).length, 0),
    nonwinningOverlapEdgeCount: identityFrames.reduce((n, f) => n + f.overlapEdges.filter(e => !e.winner).length, 0),
    otherParentWinningProvenanceCount: events.filter(e => e.type === 'nonwinning-provenance-with-other-route').length,
    parity: { observations: frames.length, activeMask: true, qInput: true, emaBounds: true, components: true,
      candidateAnalysisGeometry: true, oneCurrentComponentPerLiveIdentity: true } };
}

async function run() {
  const output = resolve(process.argv[2] ?? `${SPLIT_PACKAGE}/results`);
  for (const protectedRoot of [W1_PACKAGE, W1_CHARACTER_PACKAGE, 'docs/ant/evidence/2026-10-09-w1-continuity-diagnostic']) {
    const path = relative(resolve(protectedRoot), output);
    assert.ok(path.startsWith('..') && path !== '.', 'output remains outside preserved evidence');
  }
  const comparison = JSON.parse(gunzipSync(await readFile(`${W1_PACKAGE}/inputs/baselines/local-accretion-analysis.json.gz`)));
  const committed = JSON.parse(gunzipSync(await readFile(`${W1_CHARACTER_PACKAGE}/results/analysis.json.gz`)));
  const continuity = JSON.parse(gunzipSync(await readFile('docs/ant/evidence/2026-10-09-w1-continuity-diagnostic/results/analysis.json.gz')));
  const adapter = await loadCandidateAnalyzer(), seeds = [];
  const priorRandom = Math.random;
  Math.random = () => { throw new Error('max-overlap shadow must not consume RNG'); };
  try {
    for (const seed of SEEDS) {
      const input = await loadSeedInputs(seed, W1_PACKAGE), reference = comparison.seeds.find(s => s.seed === seed);
      const baseline = analyzeSeed(input, reference);
      assert.deepEqual(baseline, committed.seeds.find(s => s.seed === seed), 'entire committed baseline geometry/character');
      const candidate = adapter.analyzeSeed(input, reference);
      const matched = replayMatched(input, continuity.seeds.find(s => s.seed === seed), candidate);
      const summary = { baseline: summarizeCondition(baseline), candidate: summarizeCondition(candidate) };
      const row = { seed, baseline, candidate, matched, summary };
      finite(row);
      seeds.push(row);
      process.stdout.write(JSON.stringify({ seed, baselineClosed: baseline.episodes.length,
        candidateClosed: candidate.episodes.length, candidateFrozenCells: summary.candidate.frozenUnionCells,
        candidatePendingCells: summary.candidate.pendingUnionCells, splitFates: { ...matched.splitChildren, rows: undefined } }) + '\n');
    }
  } finally { Math.random = priorRandom; }
  const paths = ['scripts/ant-w1-crystallization.js', 'scripts/ant-w1-character.js', 'scripts/ant-w1-analysis.js',
    'scripts/ant-w1-inputs.js', 'scripts/ant-w1-max-overlap-crystallization.js', 'scripts/ant-w1-max-overlap-analysis.js'];
  const analysis = { schemaVersion: 1, family: 'W1 max-overlap split inheritance counterfactual',
    startingHead: STARTING_HEAD, seedOrder: SEEDS, adapter: adapter.provenance,
    sourceSha256: Object.fromEntries(await Promise.all(paths.map(async path => [path, sha(await readFile(path))]))),
    parameters: { recentSeconds: 20, establishedSeconds: 90, persistenceSeconds: 20, directionalWindowStartSeconds: 0 },
    seeds, pooledCharacter: Object.fromEntries(['baseline', 'candidate'].map(key => [key, pooledCharacter(seeds.flatMap(s => s[key].episodes))])) };
  finite(analysis);
  const episodeRows = seeds.flatMap(s => ['baseline', 'candidate'].flatMap(condition =>
    [...s[condition].episodes, ...s[condition].discardedEpisodes, ...s[condition].rightCensoredEpisodes].map(e => ({
      seed: s.seed, condition, ...e, occupiedCells: e.cellIndices.length,
      durationSeconds: e.persistenceSeconds ?? e.observedDurationSeconds, ancestryCount: e.ancestryIds.length,
      splitProvenanceCount: e.splitProvenanceIds?.length ?? 0, ...e.character,
      holes: e.metrics?.holes.beta1, substantialHoles: e.metrics?.substantialHoleCount,
      components: e.metrics?.foreground.componentCount, isolatedSubstantial: e.metrics?.isolatedSubstantialComponentCount }))));
  const outputs = {
    'analysis.json.gz': gzipSync(Buffer.from(JSON.stringify(analysis)), { level: 9, mtime: 0 }),
    'episodes.csv': Buffer.from(csv(episodeRows, ['seed', 'condition', 'id', 'status', 'birthTimeSeconds', 'lastActiveTimeSeconds',
      'closeTimeSeconds', 'durationSeconds', 'occupiedCells', 'newCells', 'newAreaFraction', 'priorUnionOverlapFraction',
      'ancestryCount', 'splitProvenanceCount', 'mergeCount', 'splitCount', 'consolidation', 'directionalOrder',
      'characterStatus', 'components', 'holes', 'substantialHoles', 'isolatedSubstantial'])),
    'split-child-fates.csv': Buffer.from(csv(seeds.flatMap(s => s.matched.splitChildren.rows.map(row => ({ seed: s.seed, ...row }))),
      ['seed', 'episodeId', 'timeSeconds', 'sourceParentIds', 'cellCount', 'independentlyClosed', 'independentlyDiscarded',
        'reabsorbed', 'firstAbsorbedAtSeconds', 'secondsBeforeFirstAbsorption', 'terminalEpisodeId', 'terminalStatus'])),
    'identity-events.csv': Buffer.from(csv(seeds.flatMap(s => s.matched.events.map(row => ({ seed: s.seed, ...row }))),
      ['seed', 'frameIndex', 'timeSeconds', 'type', 'episodeId', 'targetEpisodeId', 'sourceEpisodeId', 'componentLabel', 'sourceParentIds', 'cellCount', 'droppedEdges']))
  };
  await mkdir(output, { recursive: true });
  for (const [name, bytes] of Object.entries(outputs)) await writeFile(resolve(output, name), bytes);
  const summary = { status: 'complete', startingHead: STARTING_HEAD,
    sourceSha256: analysis.sourceSha256, adapter: adapter.provenance,
    outputSha256: Object.fromEntries(Object.entries(outputs).map(([name, bytes]) => [name, sha(bytes)])),
    seeds: seeds.map(s => ({ seed: s.seed, ...s.summary, parity: s.matched.parity,
      splitChildren: { ...s.matched.splitChildren, rows: undefined },
      identityMergeCount: s.matched.identityMergeCount, absorbedIdentityCount: s.matched.absorbedIdentityCount,
      geometricJoinCount: s.matched.geometricJoinCount, nonwinningOverlapEdgeCount: s.matched.nonwinningOverlapEdgeCount,
      otherParentWinningProvenanceCount: s.matched.otherParentWinningProvenanceCount })), pooledCharacter: analysis.pooledCharacter };
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();

export const _maxOverlapAnalysisTest = { csv, finite };
