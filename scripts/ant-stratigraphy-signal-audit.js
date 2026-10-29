import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { MaterialStratigraphy } from '../src/lib/agents/ant/MaterialStratigraphy.js';
import { TRAIL_PLATE_SUPPORT_RADIUS } from '../src/lib/agents/ant/TrailPlateBirth.js';
import { executeScenario } from './ant-g-production-candidate-natural.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTPUT = 'docs/ant/evidence/2026-10-29-stratigraphy-signal-audit';
const INPUT = 'docs/ant/evidence/2026-10-25-g-production-candidate-review';
const SEED = 20261005;
const SECONDS = 600;
const WIDTH = 96;
const HEIGHT = 96;
const CELL_COUNT = WIDTH * HEIGHT;
const MAIN_SHA = '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785';
const PARENT_SHA = '66a1c16adbc308fdc424307202c61e985b1189c5';
const CHECKPOINTS = [30, 60, 120, 300, 600];
const SOURCE_FILES = [
  'scripts/ant-g-production-candidate-natural.js',
  'scripts/ant-stratigraphy-signal-audit.js'
];
const args = new Set(process.argv.slice(2));

const sha256 = value => createHash('sha256').update(value).digest('hex');
const readGzipJson = async path => JSON.parse(gunzipSync(await readFile(resolve(ROOT, path))));
const writeJson = async (path, value) => writeFile(resolve(ROOT, path), JSON.stringify(value, null, 2) + '\n');
const writeGzipJson = async (path, value) => writeFile(resolve(ROOT, path), gzipSync(JSON.stringify(value), { level: 6, mtime: 0 }));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sourceSha256 = async path => sha256(await readFile(resolve(ROOT, path)));
const normalizedTextSha256 = bytes => sha256(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));

function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }

function countHistogram(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => Number(a[0]) - Number(b[0])));
}

function numericSummary(values) {
  if (!values.length) return { count: 0, min: null, q25: null, median: null, q75: null, q90: null, max: null, mean: null };
  const sorted = [...values].sort((a, b) => a - b);
  const q = p => {
    const position = (sorted.length - 1) * p;
    const lower = Math.floor(position), upper = Math.ceil(position);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return { count: sorted.length, min: sorted[0], q25: q(0.25), median: q(0.5), q75: q(0.75),
    q90: q(0.9), max: sorted.at(-1), mean: values.reduce((sum, value) => sum + value, 0) / values.length };
}

function ranks(values) {
  const ordered = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  const result = new Array(values.length);
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].value === ordered[start].value) end += 1;
    const rank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) result[ordered[index].index] = rank;
    start = end;
  }
  return result;
}

function pearson(a, b) {
  if (a.length !== b.length || a.length < 2) return null;
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let covariance = 0, varianceA = 0, varianceB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const da = a[index] - meanA, db = b[index] - meanB;
    covariance += da * db; varianceA += da * da; varianceB += db * db;
  }
  return varianceA && varianceB ? covariance / Math.sqrt(varianceA * varianceB) : null;
}

function correlation(a, b) {
  return { pearson: pearson(a, b), spearman: pearson(ranks(a), ranks(b)) };
}

function cellFromLive(stratigraphy, controller, descriptor, index) {
  const row = Math.floor(index / WIDTH), column = index % WIDTH;
  const x = column / (WIDTH - 1), y = row / (HEIGHT - 1);
  const stack = stratigraphy.columns[index] || [];
  const topIndex = stratigraphy.topLayerByCell[index];
  return {
    index,
    layerCount: stratigraphy.layerCountByCell[index],
    buriedDepthMeters: stratigraphy.totalDepthByCellMeters[index],
    topPlateId: topIndex < 0 ? null : stratigraphy.plates[topIndex].id,
    stackIds: stack.map(plateIndex => stratigraphy.plates[plateIndex].id),
    footLoad: stratigraphy.footLoadByCell[index],
    pheromone: controller.field.sample(x, y),
    chemicalMemory: controller.trailPlateBirth.chemicalMemory[index],
    surfaceValue: controller.surfaceField.values[index],
    surfaceSupport: controller.surfaceField.sampleSupport(x, y, TRAIL_PLATE_SUPPORT_RADIUS)
  };
}

function observeMaterialCommits(controller, rows) {
  const stratigraphy = controller.materialStratigraphy;
  const addPlate = stratigraphy.addPlate.bind(stratigraphy);
  stratigraphy.addPlate = descriptor => {
    const mask = descriptor.mask;
    assert(Array.isArray(mask) && mask.length === CELL_COUNT);
    const indices = [];
    for (let index = 0; index < mask.length; index += 1) if (mask[index] === 1) indices.push(index);
    const priorDescriptors = stratigraphy.plates.slice();
    const descriptorCopy = cloneJson(descriptor);
    const maskSha256 = sha256(Buffer.from(mask));
    const cells = indices.map(index => cellFromLive(stratigraphy, controller, descriptor, index));
    const frozenPriorHashes = priorDescriptors.map(plate => sha256(Buffer.from(plate.mask)));
    const result = addPlate(descriptor);
    assert.equal(result.id, descriptor.id);
    assert.equal(stratigraphy.plates.length, priorDescriptors.length + 1);
    for (let index = 0; index < priorDescriptors.length; index += 1) {
      assert.strictEqual(stratigraphy.plates[index], priorDescriptors[index]);
      assert.equal(sha256(Buffer.from(stratigraphy.plates[index].mask)), frozenPriorHashes[index]);
    }
    const postCells = indices.map(index => {
      const post = cellFromMaterial(stratigraphy, index);
      const before = cells[indices.indexOf(index)];
      assert.equal(post.layerCount, before.layerCount + 1);
      assert.equal(post.topPlateId, descriptor.id);
      assert.deepEqual(post.stackIds, [...before.stackIds, descriptor.id]);
      return post;
    });
    rows.push({
      id: descriptor.id,
      bornAtSimulationTimeMs: descriptor.bornAtSimulationTimeMs,
      descriptor: descriptorCopy,
      descriptorSha256: sha256(Buffer.from(JSON.stringify(descriptorCopy))),
      maskSha256,
      bodyCellCount: indices.length,
      cells,
      postCells,
      thicknessMeters: stratigraphy.plateThicknessMeters.at(-1),
      postPlateHistory: stratigraphy.getSnapshot().stratigraphy.plateHistory.at(-1),
      priorDescriptorsUnchanged: true
    });
    return result;
  };
}

function cellFromMaterial(stratigraphy, index) {
  const stack = stratigraphy.columns[index] || [];
  const topIndex = stratigraphy.topLayerByCell[index];
  return {
    index,
    layerCount: stratigraphy.layerCountByCell[index],
    buriedDepthMeters: stratigraphy.totalDepthByCellMeters[index],
    topPlateId: topIndex < 0 ? null : stratigraphy.plates[topIndex].id,
    stackIds: stack.map(plateIndex => stratigraphy.plates[plateIndex].id)
  };
}

async function frozenInputs() {
  const base = `${INPUT}/data`;
  const rawPath = `${base}/seed20261005-G-raw.json.gz`;
  const rawBytes = await readFile(resolve(ROOT, rawPath));
  const summaryBytes = await readFile(resolve(ROOT, `${base}/SUMMARY.json`));
  const sourceProvenanceBytes = await readFile(resolve(ROOT, `${base}/PROVENANCE.json`));
  const conformanceBytes = await readFile(resolve(ROOT, `${INPUT}/NATURAL-CONFORMANCE.json`));
  const sumsBytes = await readFile(resolve(ROOT, `${base}/SHA256SUMS.json`));
  const raw = JSON.parse(gunzipSync(rawBytes));
  const summary = JSON.parse(summaryBytes);
  const sourceProvenance = JSON.parse(sourceProvenanceBytes);
  const conformance = JSON.parse(conformanceBytes);
  const sums = JSON.parse(sumsBytes);
  const mapBuffers = new Map(await Promise.all(CHECKPOINTS.map(async checkpoint => {
    const name = `seed${SEED}-G-${checkpoint}s.json.gz`;
    const bytes = await readFile(resolve(ROOT, `${base}/${name}`));
    assert.equal(sums[name], sha256(bytes), `${name} frozen hash`);
    return [checkpoint, bytes];
  })));
  const maps = new Map([...mapBuffers].map(([checkpoint, bytes]) => [checkpoint,
    JSON.parse(gunzipSync(bytes))]));
  const seedReceipt = conformance.seeds.find(row => row.seed === SEED);
  const arm = summary.scenarios.find(row => row.seed === SEED)?.arms.find(row => row.arm === 'G');
  assert(seedReceipt && arm);
  assert.equal(raw.seed, SEED);
  assert.equal(raw.positions.length, SECONDS);
  assert.equal(raw.births.length, 36);
  assert.equal(sums['seed20261005-G-raw.json.gz'], sha256(rawBytes));
  assert.equal(sums['SUMMARY.json'], normalizedTextSha256(summaryBytes));
  assert.equal(sums['PROVENANCE.json'], normalizedTextSha256(sourceProvenanceBytes));
  assert.equal(seedReceipt.currentRawSha256, sha256(rawBytes));
  assert.equal(seedReceipt.plates, raw.births.length);
  assert.equal(arm.events.plateBirths, raw.births.length);
  assert.equal(sourceProvenance.seconds, SECONDS);
  assert.deepEqual(sourceProvenance.seeds, [SEED, 20261006, 20261007]);
  const inputSha256 = {
    [`${base}/seed20261005-G-raw.json.gz`]: sha256(rawBytes),
    [`${base}/SUMMARY.json`]: normalizedTextSha256(summaryBytes),
    [`${base}/PROVENANCE.json`]: normalizedTextSha256(sourceProvenanceBytes),
    [`${base}/SHA256SUMS.json`]: sha256(sumsBytes),
    [`${INPUT}/NATURAL-CONFORMANCE.json`]: sha256(conformanceBytes),
    ...Object.fromEntries([...mapBuffers].map(([checkpoint, bytes]) =>
      [`${base}/seed${SEED}-G-${checkpoint}s.json.gz`, sha256(bytes)]))
  };
  return { rawBytes, raw, arm, sourceProvenance, seedReceipt, rawPath, maps, inputSha256 };
}

async function currentSourceHashes(paths = SOURCE_FILES) {
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, await sourceSha256(path)])));
}

function fieldAndEventParity(result, replayRaw, baseline, replayMaps) {
  const { wallSeconds, ...replaySummary } = result;
  const checks = {
    summary: same(replaySummary, baseline.arm),
    rawPositions: same(replayRaw.positions, baseline.raw.positions),
    contactBuckets: same(replayRaw.contactsBySecond, baseline.raw.contactsBySecond),
    plateBirths: same(replayRaw.births, baseline.raw.births),
    nodules: same(replayRaw.nodules, baseline.raw.nodules),
    eventHashes: same(replayRaw.events, baseline.raw.events)
  };
  for (const checkpoint of CHECKPOINTS) {
    const saved = replayMaps.get(checkpoint);
    checks[`pheromone-${checkpoint}s`] = same(saved.pheromone, baseline.maps.get(checkpoint).pheromone);
    checks[`surface-${checkpoint}s`] = same(saved.surface, baseline.maps.get(checkpoint).surface);
    checks[`occupancy-${checkpoint}s`] = same(saved.occupancy.cumulativeAntSeconds,
      baseline.maps.get(checkpoint).occupancy.cumulativeAntSeconds);
  }
  assert(Object.values(checks).every(Boolean), JSON.stringify(checks));
  return checks;
}

async function runReplay({ writeCapture = false } = {}) {
  const baseline = await frozenInputs();
  const tempOutput = await mkdtemp(join(tmpdir(), 'ant-stratigraphy-replay-'));
  const liveRows = [];
  try {
    const result = await executeScenario(SEED, 'G', SECONDS, tempOutput, null,
      controller => observeMaterialCommits(controller, liveRows));
    const replayRaw = JSON.parse(gunzipSync(await readFile(join(tempOutput, result.timelineFile))));
    const replayMaps = new Map();
    for (const checkpoint of CHECKPOINTS) {
      const filename = `seed${SEED}-G-${checkpoint}s.json.gz`;
      replayMaps.set(checkpoint, JSON.parse(gunzipSync(await readFile(join(tempOutput, filename)))));
    }
    const replaySummary = { ...result };
    delete replaySummary.wallSeconds;
    assert.equal(JSON.stringify(replaySummary), JSON.stringify(baseline.arm));
    const checks = fieldAndEventParity(result, replayRaw, baseline, replayMaps);
    assert.equal(liveRows.length, baseline.raw.births.length);
    for (let index = 0; index < liveRows.length; index += 1) {
      assert.equal(liveRows[index].id, baseline.raw.births[index].id);
      assert.equal(liveRows[index].bornAtSimulationTimeMs, baseline.raw.births[index].bornAtSimulationTimeMs);
      assert.equal(liveRows[index].maskSha256, baseline.raw.births[index].maskSha256);
      assert.equal(liveRows[index].bodyCellCount, baseline.raw.births[index].bodyCellCount ??
        liveRows[index].descriptor.mask.reduce((sum, value) => sum + value, 0));
    }
    const sourceHashes = await currentSourceHashes([
      ...Object.keys(baseline.sourceProvenance.sourceHashes), ...SOURCE_FILES
    ]);
    const sourceParity = Object.fromEntries(Object.keys(baseline.sourceProvenance.sourceHashes).map(path => [path, {
      currentMainWorkingTreeSha256: sourceHashes[path],
      frozenRunDeclaredSha256: baseline.sourceProvenance.sourceHashes[path],
      exactHashMatch: sourceHashes[path] === baseline.sourceProvenance.sourceHashes[path]
    }]));
    const capture = {
      schema: 'ant-stratigraphy-signal-audit-capture-v1',
      baseline: { productionMain: MAIN_SHA, researchParent: PARENT_SHA, seed: SEED,
        arm: 'G', seconds: SECONDS, tickRate: 60, audio: 'Off', rawPath: baseline.rawPath,
        inputSha256: baseline.inputSha256,
        rawBytes: baseline.rawBytes.length, rawSha256: sha256(baseline.rawBytes),
        eventContactGroups: baseline.raw.contactsBySecond.reduce((sum, row) => sum + row.groups, 0),
        actualCommitCount: baseline.raw.births.length },
      replay: { sourceHashes, summaryMatched: true, finalRng: result.finalRng, parityChecks: checks,
        sourceParity, liveMaterialCommitCount: liveRows.length,
        sourceHashMismatches: Object.keys(sourceParity).filter(path => !sourceParity[path].exactHashMatch) },
      materialGrid: { width: WIDTH, height: HEIGHT, cellCount: CELL_COUNT,
        supportRadius: TRAIL_PLATE_SUPPORT_RADIUS },
      commits: liveRows
    };
    if (writeCapture) return capture;
    return { capture, baseline };
  } finally {
    await rm(tempOutput, { recursive: true, force: true });
  }
}

function reconstruct(capture) {
  assert.equal(capture.schema, 'ant-stratigraphy-signal-audit-capture-v1');
  assert.equal(capture.commits.length, 36);
  const material = new MaterialStratigraphy({ width: WIDTH, height: HEIGHT });
  const commits = [];
  let previousTime = -Infinity;
  for (const [order, input] of capture.commits.entries()) {
    const descriptor = input.descriptor;
    assert.equal(descriptor.id, input.id);
    assert.equal(descriptor.bornAtSimulationTimeMs, input.bornAtSimulationTimeMs);
    assert(descriptor.bornAtSimulationTimeMs > previousTime);
    previousTime = descriptor.bornAtSimulationTimeMs;
    assert.equal(sha256(Buffer.from(descriptor.mask)), input.maskSha256);
    assert.equal(descriptor.mask.reduce((sum, value) => sum + value, 0), input.bodyCellCount);
    const expectedIndices = [];
    for (let index = 0; index < descriptor.mask.length; index += 1) if (descriptor.mask[index] === 1) expectedIndices.push(index);
    assert.deepEqual(input.cells.map(cell => cell.index), expectedIndices);
    assert.deepEqual(input.postCells.map(cell => cell.index), expectedIndices);
    const cellRows = [];
    for (const live of input.cells) {
      const rebuilt = cellFromMaterial(material, live.index);
      assert.deepEqual(rebuilt, {
        index: live.index,
        layerCount: live.layerCount,
        buriedDepthMeters: live.buriedDepthMeters,
        topPlateId: live.topPlateId,
        stackIds: live.stackIds
      }, `${input.id} pre-commit cell ${live.index}`);
      cellRows.push({ ...live, overlap: live.layerCount > 0,
        stackSignature: live.stackIds.join('>') });
    }
    const globalCounts = countHistogram(Array.from(material.layerCountByCell));
    const previousCount = material.plates.length;
    const added = material.addPlate(descriptor);
    assert(added && added.id === input.id);
    assert.equal(material.plates.length, previousCount + 1);
    assert.equal(material.plateThicknessMeters.at(-1), input.thicknessMeters);
    for (let index = 0; index < input.postCells.length; index += 1) {
      const observed = input.postCells[index];
      const rebuilt = cellFromMaterial(material, observed.index);
      assert.deepEqual(rebuilt, observed, `${input.id} post-commit cell ${observed.index}`);
    }
    const postPlateHistory = material.getSnapshot().stratigraphy.plateHistory.at(-1);
    assert.deepEqual(postPlateHistory, input.postPlateHistory);
    const layerCounts = cellRows.map(cell => cell.layerCount);
    const depths = cellRows.map(cell => cell.buriedDepthMeters);
    const overlapCells = cellRows.filter(cell => cell.overlap);
    const stacks = new Set(cellRows.map(cell => cell.stackSignature));
    const countDepthOrders = new Map();
    for (const cell of cellRows) {
      const key = JSON.stringify([cell.layerCount, cell.buriedDepthMeters]);
      const orders = countDepthOrders.get(key) || new Set();
      orders.add(cell.stackSignature);
      countDepthOrders.set(key, orders);
    }
    const layerCountDistribution = countHistogram(layerCounts);
    commits.push({
      order: order + 1,
      id: input.id,
      bornAtSimulationTimeMs: input.bornAtSimulationTimeMs,
      maskSha256: input.maskSha256,
      bodyCellCount: input.bodyCellCount,
      thicknessMeters: input.thicknessMeters,
      preCommitLayerCountDistribution: layerCountDistribution,
      preCommitGlobalLayerCountDistribution: globalCounts,
      virginCells: layerCounts.filter(value => value === 0).length,
      singleLayerCells: layerCounts.filter(value => value === 1).length,
      multiLayerCells: layerCounts.filter(value => value >= 2).length,
      priorOverlapFraction: overlapCells.length / cellRows.length,
      preCommitDepthMeters: numericSummary(depths),
      existingSubstrateDepthMeters: numericSummary(overlapCells.map(cell => cell.buriedDepthMeters)),
      distinctTopPlateIds: new Set(overlapCells.map(cell => cell.topPlateId)).size,
      topPlateIdDistribution: countHistogram(overlapCells.map(cell => cell.topPlateId)),
      distinctUnderlyingPlateIds: new Set(overlapCells.flatMap(cell => cell.stackIds)).size,
      distinctOrderedStacks: stacks.size,
      exactCountDepthGroupsWithDifferentOrder: [...countDepthOrders.values()].filter(set => set.size > 1).length,
      afterAppendPlateHistory: postPlateHistory,
      fieldsByLayerCount: summarizeByLayerCount(cellRows),
      cells: cellRows
    });
  }
  assert.equal(material.plates.length, 36);
  return { commits, finalGlobalLayerCountDistribution: countHistogram(Array.from(material.layerCountByCell)),
    finalPlateHistory: material.getSnapshot().stratigraphy.plateHistory };
}

function summarizeByLayerCount(cells) {
  const groups = new Map();
  for (const cell of cells) {
    const group = groups.get(cell.layerCount) || [];
    group.push(cell);
    groups.set(cell.layerCount, group);
  }
  return Object.fromEntries([...groups.entries()].sort((a, b) => a[0] - b[0]).map(([layerCount, group]) => [layerCount, {
    cells: group.length,
    buriedDepthMeters: numericSummary(group.map(cell => cell.buriedDepthMeters)),
    chemicalMemory: numericSummary(group.map(cell => cell.chemicalMemory)),
    pheromone: numericSummary(group.map(cell => cell.pheromone)),
    surfaceValue: numericSummary(group.map(cell => cell.surfaceValue)),
    surfaceSupport: numericSummary(group.map(cell => cell.surfaceSupport)),
    retainedFootLoad: numericSummary(group.map(cell => cell.footLoad))
  }]));
}

function totalVariation(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const totalA = Object.values(a).reduce((sum, value) => sum + value, 0);
  const totalB = Object.values(b).reduce((sum, value) => sum + value, 0);
  return [...keys].reduce((sum, key) => sum + Math.abs((a[key] || 0) / totalA - (b[key] || 0) / totalB), 0) / 2;
}

function selectedOverlapPair(commits) {
  const eligible = commits.filter(commit => commit.priorOverlapFraction > 0);
  const pairs = [];
  for (let a = 0; a < eligible.length; a += 1) for (let b = a + 1; b < eligible.length; b += 1) {
    const first = eligible[a], second = eligible[b];
    pairs.push({ first, second,
      overlapDifference: Math.abs(first.priorOverlapFraction - second.priorOverlapFraction),
      layerCountDistributionDistance: totalVariation(first.preCommitLayerCountDistribution,
        second.preCommitLayerCountDistribution) });
  }
  pairs.sort((a, b) => a.overlapDifference - b.overlapDifference
    || a.first.order - b.first.order || a.second.order - b.second.order);
  if (!pairs.length) return null;
  const pair = pairs[0];
  return { selectionRule: 'Among all commit pairs with nonzero prior overlap, minimize absolute overlap-fraction difference; ties resolve by commit order.',
    first: { id: pair.first.id, overlapFraction: pair.first.priorOverlapFraction,
      layerCountDistribution: pair.first.preCommitLayerCountDistribution },
    second: { id: pair.second.id, overlapFraction: pair.second.priorOverlapFraction,
      layerCountDistribution: pair.second.preCommitLayerCountDistribution },
    absoluteOverlapDifference: pair.overlapDifference,
    layerCountDistributionTotalVariation: pair.layerCountDistributionDistance };
}

function currentMaskLayerRelationship(commits) {
  const pairs = [];
  for (let a = 0; a < commits.length; a += 1) for (let b = a + 1; b < commits.length; b += 1) {
    const first = commits[a], second = commits[b];
    const firstCells = new Set(first.cells.map(cell => cell.index));
    const secondCells = new Set(second.cells.map(cell => cell.index));
    let intersection = 0;
    for (const cell of firstCells) if (secondCells.has(cell)) intersection += 1;
    const union = firstCells.size + secondCells.size - intersection;
    pairs.push({ first, second, maskJaccard: intersection / union,
      layerCountDistributionDistance: totalVariation(first.preCommitLayerCountDistribution,
        second.preCommitLayerCountDistribution) });
  }
  const mostSimilar = [...pairs].sort((a, b) => b.maskJaccard - a.maskJaccard
    || a.first.order - b.first.order || a.second.order - b.second.order)[0];
  return { definition: 'Jaccard overlap between actual new Plate binary masks, paired with total-variation distance between their pre-commit exact layer-count distributions; all commit pairs included.',
    pairCount: pairs.length,
    maskJaccard: numericSummary(pairs.map(pair => pair.maskJaccard)),
    layerCountDistributionTotalVariation: numericSummary(pairs.map(pair => pair.layerCountDistributionDistance)),
    maskJaccardVsLayerCountDistance: correlation(pairs.map(pair => pair.maskJaccard),
      pairs.map(pair => pair.layerCountDistributionDistance)),
    maximumMaskJaccardPair: { selectionRule: 'Maximum binary-mask Jaccard across all unordered commit pairs; ties resolve by commit order.',
      first: mostSimilar.first.id, second: mostSimilar.second.id,
      maskJaccard: mostSimilar.maskJaccard,
      layerCountDistributionTotalVariation: mostSimilar.layerCountDistributionDistance }
  };
}

function exactCurrentContextMatches(commits) {
  const groups = new Map();
  for (const commit of commits) for (const cell of commit.cells) {
    if (!cell.overlap) continue;
    const key = JSON.stringify([cell.index, cell.pheromone, cell.chemicalMemory, cell.surfaceValue,
      cell.surfaceSupport, cell.footLoad, cell.overlap]);
    const group = groups.get(key) || [];
    group.push({ commit: commit.id, timeMs: commit.bornAtSimulationTimeMs,
      index: cell.index, layerCount: cell.layerCount, buriedDepthMeters: cell.buriedDepthMeters,
      stackIds: cell.stackIds });
    groups.set(key, group);
  }
  const matched = [...groups.values()].filter(group => group.length > 1);
  const different = matched.filter(group => new Set(group.map(row => JSON.stringify(row.stackIds))).size > 1);
  return { definition: 'Exact same 96-grid cell, raw pheromone sample, Plate chemical memory, SurfaceField scalar, support sample, retained local foot load, and prior-overlap=true.',
    exactMatchedGroups: matched.length,
    exactMatchedCellObservationPairs: matched.reduce((sum, group) => sum + group.length * (group.length - 1) / 2, 0),
    groupsWithDifferentOrderedStack: different.length,
    groupsWithDifferentLayerCount: different.filter(group => new Set(group.map(row => row.layerCount)).size > 1).length,
    firstDeterministicDifferentStackExample: different[0] || null };
}

function temporalTransitions(commits) {
  const byCell = new Map();
  for (const commit of commits) for (const cell of commit.cells) {
    const rows = byCell.get(cell.index) || [];
    rows.push({ commit: commit.id, timeMs: commit.bornAtSimulationTimeMs, ...cell });
    byCell.set(cell.index, rows);
  }
  let pairs = 0, layerCountNeverDecreased = true, layerDeepened = 0;
  let chemicalDeclined = 0, surfaceDeclined = 0, supportDeclined = 0, footLoadIncreased = 0;
  const example = [];
  for (const [index, rows] of byCell) for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1], b = rows[i];
    pairs += 1;
    if (b.layerCount < a.layerCount) layerCountNeverDecreased = false;
    if (b.layerCount > a.layerCount) layerDeepened += 1;
    if (b.chemicalMemory < a.chemicalMemory) chemicalDeclined += 1;
    if (b.surfaceValue < a.surfaceValue) surfaceDeclined += 1;
    if (b.surfaceSupport < a.surfaceSupport) supportDeclined += 1;
    if (b.footLoad > a.footLoad) footLoadIncreased += 1;
    if (example.length < 4 && b.layerCount > a.layerCount
      && (b.chemicalMemory < a.chemicalMemory || b.surfaceValue < a.surfaceValue)) {
      example.push({ cellIndex: index, before: { commit: a.commit, timeMs: a.timeMs,
        layerCount: a.layerCount, buriedDepthMeters: a.buriedDepthMeters,
        chemicalMemory: a.chemicalMemory, surfaceValue: a.surfaceValue, surfaceSupport: a.surfaceSupport,
        footLoad: a.footLoad, stackIds: a.stackIds },
      after: { commit: b.commit, timeMs: b.timeMs, layerCount: b.layerCount,
        buriedDepthMeters: b.buriedDepthMeters, chemicalMemory: b.chemicalMemory,
        surfaceValue: b.surfaceValue, surfaceSupport: b.surfaceSupport, footLoad: b.footLoad,
        stackIds: b.stackIds } });
    }
  }
  return { sameCellAdjacentVisitPairs: pairs, layerCountNeverDecreasedAtRepeatVisits: layerCountNeverDecreased,
    layerCountIncreased: layerDeepened, chemicalMemoryDecreased: chemicalDeclined,
    surfaceFieldDecreased: surfaceDeclined, supportDecreased: supportDeclined,
    retainedFootLoadIncreased: footLoadIncreased,
    deterministicFirstExamples: example };
}

function analyze(capture, reconstruction) {
  const commits = reconstruction.commits;
  const allCells = commits.flatMap(commit => commit.cells.map(cell => ({ ...cell,
    commit: commit.id, timeMs: commit.bornAtSimulationTimeMs })));
  const overlap = allCells.filter(cell => cell.overlap);
  const correlations = rows => {
    const descriptors = [
      ['layerCount', 'buriedDepthMeters'], ['layerCount', 'chemicalMemory'], ['layerCount', 'pheromone'],
      ['layerCount', 'surfaceValue'], ['layerCount', 'surfaceSupport'], ['layerCount', 'footLoad'],
      ['buriedDepthMeters', 'chemicalMemory'], ['buriedDepthMeters', 'pheromone'],
      ['buriedDepthMeters', 'surfaceValue'], ['buriedDepthMeters', 'surfaceSupport'], ['buriedDepthMeters', 'footLoad']
    ];
    return Object.fromEntries(descriptors.map(([a, b]) => [`${a}Vs${b}`, correlation(rows.map(row => row[a]), rows.map(row => row[b]))]));
  };
  const exactCountDepthOrders = new Map();
  for (const cell of allCells) {
    const key = JSON.stringify([cell.layerCount, cell.buriedDepthMeters]);
    const orders = exactCountDepthOrders.get(key) || new Set();
    orders.add(cell.stackSignature); exactCountDepthOrders.set(key, orders);
  }
  const wholeLayerCounts = allCells.map(cell => cell.layerCount);
  const wholeDepths = allCells.map(cell => cell.buriedDepthMeters);
  const layerCountsUnderOverlap = overlap.map(cell => cell.layerCount);
  const depthByLayerCount = summarizeByLayerCount(allCells);
  const transition = temporalTransitions(commits);
  return {
    schema: 'ant-stratigraphy-signal-audit-analysis-v1',
    baseline: capture.baseline,
    replayParity: capture.replay,
    commitCount: commits.length,
    sequence: { firstCommit: commits[0].id, firstCommitMs: commits[0].bornAtSimulationTimeMs,
      lastCommit: commits.at(-1).id, lastCommitMs: commits.at(-1).bornAtSimulationTimeMs,
      intervalsSeconds: commits.slice(1).map((commit, index) =>
        (commit.bornAtSimulationTimeMs - commits[index].bornAtSimulationTimeMs) / 1000) },
    totalBodyCellObservations: allCells.length,
    uniqueBodyGridCells: new Set(allCells.map(cell => cell.index)).size,
    preCommitSubstrate: {
      bodyCellObservationsByExactLayerCount: countHistogram(wholeLayerCounts),
      binaryOverlapCells: overlap.length,
      virginCells: wholeLayerCounts.filter(value => value === 0).length,
      singleLayerCells: wholeLayerCounts.filter(value => value === 1).length,
      multiLayerCells: wholeLayerCounts.filter(value => value >= 2).length,
      bodyCellBuriedDepthMeters: numericSummary(wholeDepths),
      existingSubstrateBuriedDepthMeters: numericSummary(overlap.map(cell => cell.buriedDepthMeters)),
      exactOverlapLayerCountDistribution: countHistogram(layerCountsUnderOverlap),
      distinctOrderedPreCommitStacks: new Set(allCells.map(cell => cell.stackSignature)).size,
      distinctUnderlyingPlateIds: new Set(allCells.flatMap(cell => cell.stackIds)).size,
      sameExactLayerCountAndDepthWithDifferentOrderedStacks:
        [...exactCountDepthOrders.values()].filter(set => set.size > 1).length,
      perExactLayerCountFieldSummaries: depthByLayerCount
    },
    commitSummaries: commits.map(({ cells, ...summary }) => summary),
    binaryOverlapPair: selectedOverlapPair(commits),
    currentMaskLayerRelationship: currentMaskLayerRelationship(commits),
    currentStateRelationships: {
      allBodyCellObservations: correlations(allCells),
      overlapOnly: correlations(overlap),
      exactCurrentContextMatches: exactCurrentContextMatches(commits),
      commitMeans: commits.map(commit => ({ id: commit.id, priorOverlapFraction: commit.priorOverlapFraction,
        layerCountDistribution: commit.preCommitLayerCountDistribution,
        chemicalMemory: numericSummary(commit.cells.map(cell => cell.chemicalMemory)),
        pheromone: numericSummary(commit.cells.map(cell => cell.pheromone)),
        surfaceValue: numericSummary(commit.cells.map(cell => cell.surfaceValue)),
        surfaceSupport: numericSummary(commit.cells.map(cell => cell.surfaceSupport)),
        retainedFootLoad: numericSummary(commit.cells.map(cell => cell.footLoad)) }))
    },
    temporalMemory: transition,
    postCommitConsequence: {
      finalGlobalLayerCountDistribution: reconstruction.finalGlobalLayerCountDistribution,
      finalPlateHistory: reconstruction.finalPlateHistory
    },
    interpretationBoundary: {
      decisionLabel: 'INDEPENDENT STRATIGRAPHIC CONTEXT OBSERVED',
      qualifier: 'Observed as separately retained event-specific stack history beyond binary overlap in this deterministic 36-commit run. Current scalar and whole-mask geometry independence is not established; no Plate body/material law is validated.',
      bodyGeometryOrMaterialMappingValidated: false
    }
  };
}

function atlasHtml(capture, analysis) {
  const atlas = {
    width: WIDTH, height: HEIGHT,
    commits: capture.commits.map(commit => ({ id: commit.id,
      timeMs: commit.bornAtSimulationTimeMs, maskSha256: commit.maskSha256,
      cells: commit.cells.map(cell => ({ index: cell.index, layerCount: cell.layerCount,
        overlap: cell.layerCount > 0, buriedDepthMeters: cell.buriedDepthMeters,
        topPlateId: cell.topPlateId, stackIds: cell.stackIds,
        footLoad: cell.footLoad, pheromone: cell.pheromone, chemicalMemory: cell.chemicalMemory,
        surfaceValue: cell.surfaceValue, surfaceSupport: cell.surfaceSupport })) }))
  };
  const data = JSON.stringify(atlas).replaceAll('<', '\\u003c');
  const depthMax = Math.max(0, ...capture.commits.flatMap(commit => commit.cells.map(cell => cell.buriedDepthMeters)));
  const loadMax = Math.max(0, ...capture.commits.flatMap(commit => commit.cells.map(cell => cell.footLoad)));
  const pheromoneMax = Math.max(0, ...capture.commits.flatMap(commit => commit.cells.map(cell => cell.pheromone)));
  const layerMax = Math.max(0, ...capture.commits.flatMap(commit => commit.cells.map(cell => cell.layerCount)));
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANT pre-commit stratigraphic context atlas</title>
<style>
body{font:14px/1.45 system-ui,sans-serif;margin:18px;color:#202124;background:#f7f7f4}h1{font-size:21px;margin:0 0 4px}.note{color:#50565c;margin:0 0 14px}.controls{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:12px 0}.controls label{display:grid;gap:4px;font-weight:600}select{font:inherit;padding:6px;max-width:100%}.layout{display:grid;grid-template-columns:minmax(360px,768px) minmax(280px,1fr);gap:16px;align-items:start}.map{width:min(100%,768px);aspect-ratio:1;background:#fff;border:1px solid #888;image-rendering:pixelated}.card{background:#fff;border:1px solid #d6d6d0;padding:12px;overflow-wrap:anywhere}.legend{height:14px;margin:8px 0 3px;background:linear-gradient(90deg,#352a87,#1465a8,#22a884,#fde725)}.range{display:flex;justify-content:space-between;font-variant-numeric:tabular-nums;font-size:12px}.swatches{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.swatch{display:inline-flex;gap:4px;align-items:center}.chip{width:12px;height:12px;border:1px solid #555;display:inline-block}pre{white-space:pre-wrap;font:12px/1.4 ui-monospace,monospace;margin:8px 0}.status{min-height:2em;margin:6px 0;font-variant-numeric:tabular-nums}.table{width:100%;border-collapse:collapse;font-size:12px}.table th,.table td{border-bottom:1px solid #ddd;padding:4px;text-align:right}.table th:first-child,.table td:first-child{text-align:left}@media(max-width:800px){.layout{grid-template-columns:1fr}}
</style>
<h1>Pre-commit stratigraphic context</h1>
<p class="note">Frozen Candidate G · seed 20261005 · 60 Hz · Audio Off · 36 actual commits. Cells show the substrate immediately before the selected Plate is appended. No smoothing or event-wise normalization.</p>
<div class="controls"><label>Actual commit<select id="commit"></select></label><label>Pre-commit value<select id="metric">
<option value="layerCount">Exact prior layer count</option><option value="buriedDepthMeters">Buried depth above foundation (m)</option>
<option value="topPlateId">Top existing Plate ID</option><option value="overlap">Prior material exists (binary)</option>
<option value="chemicalMemory">TrailPlate chemical memory</option><option value="pheromone">Raw pheromone sample</option>
<option value="surfaceValue">SurfaceField cell value</option><option value="surfaceSupport">SurfaceField support sample</option>
<option value="footLoad">Retained local foot-contact count</option></select></label></div>
<div class="layout"><div><canvas class="map" id="map" width="768" height="768"></canvas><div id="legend"></div><div class="status" id="hover">Move over a body cell to inspect exact values and bottom-to-top Plate IDs.</div></div>
<section class="card"><div id="summary"></div><h3>Selected commit body cells</h3><table class="table"><thead><tr><th>Pre-commit layer count</th><th>Cells</th><th>Share</th></tr></thead><tbody id="counts"></tbody></table><pre id="detail"></pre></section></div>
<script>
const DATA=${data};
const ANALYSIS=${JSON.stringify({ depthMax, loadMax, pheromoneMax, layerMax }).replaceAll('<','\\u003c')};
const commitSelect=document.querySelector('#commit'),metricSelect=document.querySelector('#metric'),canvas=document.querySelector('#map'),ctx=canvas.getContext('2d');
for(const c of DATA.commits){const o=document.createElement('option');o.value=c.id;o.textContent=c.id+' · '+(c.timeMs/1000).toFixed(3)+' s';commitSelect.append(o)}
function color(value,key){if(key==='topPlateId'){if(!value)return '#e4e5e1';const n=Number(value.split('-').at(-1));return 'hsl('+((n*47)%360)+' 58% 54%)'}if(key==='overlap')return value?'#d95f02':'#efefeb';let max=key==='layerCount'?ANALYSIS.layerMax:key==='buriedDepthMeters'?ANALYSIS.depthMax:key==='footLoad'?ANALYSIS.loadMax:key==='pheromone'?ANALYSIS.pheromoneMax:1;let t=max>0?Math.max(0,Math.min(1,value/max)):0;return 'hsl('+(245-220*t)+' 68% '+(91-49*t)+'%)'}
function range(key){if(key==='layerCount')return 'exact counts 0–'+ANALYSIS.layerMax;if(key==='topPlateId')return 'chronological Plate IDs';if(key==='overlap')return 'no prior material / prior material';let max=key==='buriedDepthMeters'?ANALYSIS.depthMax:key==='footLoad'?ANALYSIS.loadMax:key==='pheromone'?ANALYSIS.pheromoneMax:1;return '0 to '+Number(max).toPrecision(5)+' · common scale across all commits'}
function render(){const c=DATA.commits.find(row=>row.id===commitSelect.value),key=metricSelect.value,byIndex=new Map(c.cells.map(cell=>[cell.index,cell]));ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f0f0ec';ctx.fillRect(0,0,canvas.width,canvas.height);const cellSize=canvas.width/DATA.width;for(const cell of c.cells){ctx.fillStyle=color(cell[key],key);const x=cell.index%DATA.width,y=Math.floor(cell.index/DATA.width);ctx.fillRect(x*cellSize,y*cellSize,cellSize,cellSize)}
document.querySelector('#legend').innerHTML='<b>'+document.querySelector('#metric option:checked').textContent+'</b><div class="legend"></div><div class="range"><span>'+range(key)+'</span><span>cell values remain raw in hover details</span></div>';
document.querySelector('#summary').innerHTML='<b>'+c.id+'</b> · '+(c.timeMs/1000).toFixed(6)+' s<br>'+c.cells.length+' mask cells · '+c.maskSha256+'<br>'+ANALYSIS.layerMax+' max pre-commit layer count across sequence';
const hist={};for(const cell of c.cells)hist[cell.layerCount]=(hist[cell.layerCount]||0)+1;document.querySelector('#counts').innerHTML=Object.entries(hist).sort((a,b)=>Number(a[0])-Number(b[0])).map(([n,v])=>'<tr><td>'+n+'</td><td>'+v+'</td><td>'+((100*v/c.cells.length).toFixed(2))+'%</td></tr>').join('');
document.querySelector('#detail').textContent='Prior overlap: '+c.cells.filter(x=>x.layerCount>0).length+' / '+c.cells.length+'\nUnique ordered stacks in current mask: '+new Set(c.cells.map(x=>x.stackIds.join('>'))).size+'\nValues are pre-commit; the selected Plate is not included in its own substrate.';canvas.dataset.byIndex=JSON.stringify([...byIndex.keys()]);}
commitSelect.addEventListener('change',render);metricSelect.addEventListener('change',render);canvas.addEventListener('mousemove',event=>{const rect=canvas.getBoundingClientRect(),x=Math.floor((event.clientX-rect.left)/rect.width*DATA.width),y=Math.floor((event.clientY-rect.top)/rect.height*DATA.height),index=y*DATA.width+x,c=DATA.commits.find(row=>row.id===commitSelect.value),cell=c.cells.find(row=>row.index===index);document.querySelector('#hover').textContent=cell?JSON.stringify({commit:c.id,timeMs:c.timeMs,cell:index,layerCount:cell.layerCount,buriedDepthMeters:cell.buriedDepthMeters,topPlateId:cell.topPlateId,bottomToTopPlateIds:cell.stackIds,footLoad:cell.footLoad,pheromone:cell.pheromone,chemicalMemory:cell.chemicalMemory,surfaceValue:cell.surfaceValue,surfaceSupport:cell.surfaceSupport}):'Outside the new Plate mask.'});render();
</script></html>`;
}

async function writeProducts(capture) {
  const rebuilt = reconstruct(capture);
  const result = analyze(capture, rebuilt);
  const html = atlasHtml(capture, result);
  await mkdir(resolve(ROOT, `${OUTPUT}/data`), { recursive: true });
  await writeGzipJson(`${OUTPUT}/data/reconstructed-commit-context.json.gz`, capture);
  await writeJson(`${OUTPUT}/analysis.json`, result);
  await writeFile(resolve(ROOT, `${OUTPUT}/atlas.html`), html);
  return { rebuilt, result, html };
}

async function captureMode() {
  const capture = await runReplay({ writeCapture: true });
  const { result, html } = await writeProducts(capture);
  console.log(JSON.stringify({ mode: 'capture', commits: capture.commits.length,
    bodyCellObservations: result.totalBodyCellObservations,
    decision: result.interpretationBoundary.decisionLabel,
    outputs: [`${OUTPUT}/data/reconstructed-commit-context.json.gz`, `${OUTPUT}/analysis.json`, `${OUTPUT}/atlas.html`] }, null, 2));
}

async function checkMode() {
  const capture = await readGzipJson(`${OUTPUT}/data/reconstructed-commit-context.json.gz`);
  const { result, html } = writeProductsToMemory(capture);
  const savedAnalysis = await readFile(resolve(ROOT, `${OUTPUT}/analysis.json`), 'utf8');
  const savedAtlas = await readFile(resolve(ROOT, `${OUTPUT}/atlas.html`), 'utf8');
  assert.equal(JSON.stringify(result, null, 2) + '\n', savedAnalysis);
  assert.equal(html, savedAtlas);
  const embedded = html.match(/const DATA=(.*);\nconst ANALYSIS=/s)?.[1];
  assert(embedded);
  assert.deepEqual(JSON.parse(embedded), {
    width: WIDTH, height: HEIGHT,
    commits: capture.commits.map(commit => ({ id: commit.id, timeMs: commit.bornAtSimulationTimeMs,
      maskSha256: commit.maskSha256, cells: commit.cells.map(cell => ({ index: cell.index,
        layerCount: cell.layerCount, overlap: cell.layerCount > 0,
        buriedDepthMeters: cell.buriedDepthMeters,
        topPlateId: cell.topPlateId, stackIds: cell.stackIds, footLoad: cell.footLoad,
        pheromone: cell.pheromone, chemicalMemory: cell.chemicalMemory,
        surfaceValue: cell.surfaceValue, surfaceSupport: cell.surfaceSupport })) }))
  });
  console.log(JSON.stringify({ mode: 'check', commits: capture.commits.length,
    analysisExact: true, atlasExact: true, embeddedAtlasDataConsistent: true,
    bodyCellObservations: result.totalBodyCellObservations }, null, 2));
}

function writeProductsToMemory(capture) {
  const rebuilt = reconstruct(capture);
  const result = analyze(capture, rebuilt);
  return { result, html: atlasHtml(capture, result) };
}

async function replayCheckMode() {
  const expectedBytes = await readFile(resolve(ROOT, `${OUTPUT}/data/reconstructed-commit-context.json.gz`));
  const expected = JSON.parse(gunzipSync(expectedBytes));
  const replay = await runReplay({ writeCapture: true });
  assert.equal(JSON.stringify(replay), JSON.stringify(expected));
  console.log(JSON.stringify({ mode: 'replay-check', replayExact: true,
    captureSha256: sha256(gzipSync(JSON.stringify(replay), { level: 6, mtime: 0 })),
    commits: replay.commits.length }, null, 2));
}

if (args.has('--capture')) await captureMode();
else if (args.has('--check')) await checkMode();
else if (args.has('--replay-check')) await replayCheckMode();
else {
  console.log('Usage: node scripts/ant-stratigraphy-signal-audit.js --capture | --check | --replay-check');
}
