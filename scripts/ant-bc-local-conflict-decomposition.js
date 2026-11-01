import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-bc-commit-slot-ambiguity-audit');
const OUT = resolve(ROOT, 'docs/ant/evidence/2026-11-01-bc-local-conflict-decomposition');
const SEEDS = ['20261005', '20261006', '20261007'];
const GRID = 96, ENTRY = { x: .5, y: .72 }, PLATE_REFERENCE = 256;
const PRODUCTION = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const SLOT_AUDIT = 'e960d135afec30e7c9f35722359e15f0f2d39ce3';
const DUAL = '248da39a4d7d342022a27a5b9ec183cad9b160e2';
const PROTOTYPE = 'a80a613be68ede94fce89008a076fbe582178f41';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const maskKey = option => JSON.stringify(option.xCells);
const edgeKey = (a, b) => JSON.stringify(a < b ? [a, b] : [b, a]);
const cellPoint = cell => ({ x: (cell % GRID) / (GRID - 1), y: Math.floor(cell / GRID) / (GRID - 1) });
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const readGzip = async path => JSON.parse(gunzipSync(await readFile(path)));
const writeJson = async (path, value) => writeFile(path, bytes(value));
const writeGzip = async (path, value) => writeFile(path, gzipSync(Buffer.from(JSON.stringify(value) + '\n'), { level: 9, mtime: 0 }));

async function listFiles(dir, root = dir) {
  const rows = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, item.name);
    if (item.isDirectory()) rows.push(...await listFiles(path, root));
    else if (item.isFile()) {
      const data = await readFile(path);
      rows.push({ file: path.slice(root.length + 1).replaceAll('\\', '/'), bytes: data.length, sha256: sha(data) });
    } else assert.fail(`unexpected package entry ${path}`);
  }
  return rows;
}

function dist(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const q = p => sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
  return { count: sorted.length, min: sorted[0] ?? null, q25: q(.25), median: q(.5), q75: q(.75), q90: q(.9),
    max: sorted.at(-1) ?? null, mean: sorted.length ? sorted.reduce((sum, x) => sum + x, 0) / sorted.length : null };
}

async function loadFrozen() {
  const manifestBytes = await readFile(resolve(SOURCE, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.productionAuthority, PRODUCTION);
  assert.equal(manifest.temporalReferenceMs, 10_000);
  assert.equal(manifest.maturation.persistenceMs, 20_000);
  assert.equal(manifest.maturation.xSimilarity, .60);
  assert.equal(manifest.dualHistoryCommit, DUAL);
  assert.equal(manifest.priorProvenancePrototypeCommit, PROTOTYPE);
  const sums = (await readFile(resolve(SOURCE, 'SHA256SUMS.txt'), 'utf8')).trim().split(/\r?\n/)
    .map(line => { const [digest, file] = line.split(/\s{2}/, 2); return { digest, file }; });
  assert.equal(sums.length, 27);
  const registered = new Map(manifest.files.map(row => [row.file, row.sha256]));
  for (const row of sums) {
    const data = await readFile(resolve(SOURCE, row.file));
    assert.equal(sha(data), row.digest, `frozen commit-slot package ${row.file}`);
    if (row.file !== 'manifest.json') assert.equal(registered.get(row.file), row.digest, `package manifest ${row.file}`);
  }
  assert.equal(sha(manifestBytes), sums.find(row => row.file === 'manifest.json')?.digest);
  const previousSummary = await readJson(resolve(SOURCE, 'analysis/summary.json'));
  const previousValidation = await readJson(resolve(SOURCE, 'analysis/validation.json'));
  assert.equal(previousSummary.totalEvents, 2089);
  assert.equal(previousSummary.totalSlots, 163);
  assert.equal(previousValidation.productionAuthority, PRODUCTION);
  assert.equal(previousValidation.exactFrozenEventsReused, true);
  assert.equal(previousValidation.observerRngCalls, 0);
  const seeds = [];
  for (const seed of SEEDS) {
    const file = `analysis/commit-slots-${seed}.json.gz`, data = await readFile(resolve(SOURCE, file));
    assert.equal(sha(data), registered.get(file), `exact registered slot packet ${seed}`);
    const packet = JSON.parse(gunzipSync(data));
    assert.equal(packet.schema, 'ant-bc-commit-slot-receipts-v1');
    assert.equal(packet.seed, seed);
    assert.equal(packet.slotGapMs, 10_000);
    assert.equal(packet.slots.length, previousSummary.seeds.find(row => row.seed === seed).earliestTemporalCommitMoments);
    let lastTime = -Infinity;
    for (const slot of packet.slots) {
      assert.ok(slot.timeMs > lastTime);
      lastTime = slot.timeMs;
      assert.equal(slot.options.length, slot.uniqueSpatialOptionCount);
      const seen = new Set();
      for (const option of slot.options) {
        assert.ok(option.xCells.length > 0);
        assert.equal(new Set(option.xCells).size, option.xCells.length);
        assert.deepEqual(option.xCells, [...option.xCells].sort((a, b) => a - b));
        assert.ok(option.xCells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < GRID * GRID));
        assert.equal(option.xSha256, sha(Buffer.from(JSON.stringify(option.xCells))));
        assert.deepEqual(option.channels, [...new Set(option.candidates.map(row => row.channel))].sort());
        assert.deepEqual(option.components, [...new Set(option.candidates.map(row => row.component))].sort((a, b) => a - b));
        const key = maskKey(option);
        assert.ok(!seen.has(key), 'same X is collapsed upstream with B/C provenance retained');
        seen.add(key);
      }
    }
    seeds.push({ seed, slots: packet.slots, sourceHash: sha(data),
      actualProductionPlateBirths: previousSummary.seeds.find(row => row.seed === seed).actualProductionPlateBirths });
  }
  assert.equal(seeds.reduce((sum, row) => sum + row.slots.length, 0), 163);
  return { seeds, manifestSha256: sha(manifestBytes),
    validationSha256: sha(await readFile(resolve(SOURCE, 'analysis/validation.json'))),
    summarySha256: sha(await readFile(resolve(SOURCE, 'analysis/summary.json'))) };
}

function overlap(left, right) {
  const cells = new Set(right.xCells), shared = [];
  for (const cell of left.xCells) if (cells.has(cell)) shared.push(cell);
  return shared;
}

function bfsComponents(nodes, adjacency) {
  const visited = new Set(), groups = [];
  for (let start = 0; start < nodes.length; start++) {
    if (visited.has(start)) continue;
    const queue = [start], group = [];
    visited.add(start);
    while (queue.length) {
      const i = queue.shift(); group.push(i);
      for (const j of adjacency[i]) if (!visited.has(j)) { visited.add(j); queue.push(j); }
    }
    group.sort((a, b) => nodes[a].xSha256.localeCompare(nodes[b].xSha256));
    groups.push(group);
  }
  return groups.sort((a, b) => nodes[a[0]].xSha256.localeCompare(nodes[b[0]].xSha256));
}

function unionFindComponents(options) {
  const parent = options.map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a, b) => { const x = find(a), y = find(b); if (x !== y) parent[y] = x; };
  const edges = [];
  for (let i = 0; i < options.length; i++) for (let j = i + 1; j < options.length; j++) {
    const a = options[i].xCells, b = options[j].xCells;
    let p = 0, q = 0, shared = 0;
    while (p < a.length && q < b.length) {
      if (a[p] === b[q]) { shared++; p++; q++; }
      else if (a[p] < b[q]) p++;
      else q++;
    }
    if (shared) { join(i, j); edges.push(edgeKey(maskKey(options[i]), maskKey(options[j]))); }
  }
  const groups = new Map();
  for (let i = 0; i < options.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(maskKey(options[i]));
  }
  return { partitions: [...groups.values()].map(row => row.sort()).sort((a, b) => a[0].localeCompare(b[0])), edges: edges.sort() };
}

function crossProvenance(a, b) { return a.channels.some(left => b.channels.some(right => left !== right)); }

function componentMetrics(slot, members, pairRecords, index) {
  const options = members.map(i => slot.options[i]);
  const union = [...new Set(options.flatMap(option => option.xCells))].sort((a, b) => a - b);
  const points = union.map(cell => ({ x: (cell % GRID) / (GRID - 1), y: Math.floor(cell / GRID) / (GRID - 1) }));
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const centroid = { x: xs.reduce((s, x) => s + x, 0) / points.length,
    y: ys.reduce((s, y) => s + y, 0) / points.length };
  const fComponents = [...new Set(options.flatMap(option => option.components))].sort((a, b) => a - b);
  const internalPairs = pairRecords.filter(pair => options.some(option => option.optionId === pair.leftOptionId)
    && options.some(option => option.optionId === pair.rightOptionId));
  const overlapPairs = internalPairs.filter(pair => pair.intersectionCellCount > 0);
  const crossEdges = overlapPairs.filter(pair => crossProvenance(
    options.find(option => option.optionId === pair.leftOptionId), options.find(option => option.optionId === pair.rightOptionId)));
  const tags = [];
  if (options.every(o => o.channels.length === 1 && o.channels[0] === 'B')) tags.push('B-only');
  if (options.every(o => o.channels.length === 1 && o.channels[0] === 'C')) tags.push('C-only');
  if (options.some(o => o.channels.length === 2)) tags.push('contains-{B,C}-node');
  if (crossEdges.length) tags.push('mixed-B/C-conflict');
  return { componentId: `CC${String(index + 1).padStart(3, '0')}`,
    memberOptionIds: options.map(o => o.optionId), memberXHashes: options.map(o => o.xSha256),
    memberXCount: options.length, candidateCount: options.reduce((sum, o) => sum + o.candidates.length, 0),
    BOnlyNodes: options.filter(o => o.channels.length === 1 && o.channels[0] === 'B').length,
    COnlyNodes: options.filter(o => o.channels.length === 1 && o.channels[0] === 'C').length,
    dualProvenanceNodes: options.filter(o => o.channels.length === 2).length,
    provenanceTags: tags, channels: [...new Set(options.flatMap(o => o.channels))].sort(),
    unionCellCount: union.length, unionCellIds: union,
    boundingBox: { grid: { minCol: Math.min(...union.map(c => c % GRID)), maxCol: Math.max(...union.map(c => c % GRID)),
      minRow: Math.min(...union.map(c => Math.floor(c / GRID))), maxRow: Math.max(...union.map(c => Math.floor(c / GRID))) },
      world: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) } },
    centroid, centroidDistanceFromEntry: Math.hypot(centroid.x - ENTRY.x, centroid.y - ENTRY.y),
    distinctFComponentCount: fComponents.length, fComponents,
    pairwiseOverlap: { pairCount: internalPairs.length, overlapEdgeCount: overlapPairs.length,
      disjointPairCount: internalPairs.filter(row => row.intersectionCellCount === 0).length,
      crossProvenanceOverlapEdgeCount: crossEdges.length,
      pairs: internalPairs.map(row => ({ leftOptionId: row.leftOptionId, rightOptionId: row.rightOptionId,
        relation: row.intersectionCellCount ? 'overlap' : 'disjoint', intersectionCellCount: row.intersectionCellCount,
        unionCellCount: row.unionCellCount, jaccard: row.jaccard, sharedCellIds: row.sharedCellIds })) } };
}

function analyzeSlot(seed, slot, slotIndex) {
  const options = slot.options, adjacency = options.map(() => []), pairRecords = [], edges = [];
  const seen = new Set();
  for (let i = 0; i < options.length; i++) {
    const key = maskKey(options[i]);
    assert.ok(!seen.has(key), 'one graph node per exact X mask'); seen.add(key);
    for (let j = i + 1; j < options.length; j++) {
      const shared = overlap(options[i], options[j]), unionCount = options[i].xCells.length + options[j].xCells.length - shared.length;
      const row = { leftOptionId: options[i].optionId, rightOptionId: options[j].optionId,
        leftXHash: options[i].xSha256, rightXHash: options[j].xSha256,
        leftXKey: maskKey(options[i]), rightXKey: maskKey(options[j]),
        relation: shared.length ? 'overlap' : 'disjoint', intersectionCellCount: shared.length,
        unionCellCount: unionCount, jaccard: unionCount ? shared.length / unionCount : 1,
        maskCentroidDistance: (() => {
          const a = options[i].xCells, b = options[j].xCells;
          const ax = a.reduce((sum, cell) => sum + (cell % GRID) / (GRID - 1), 0) / a.length;
          const ay = a.reduce((sum, cell) => sum + Math.floor(cell / GRID) / (GRID - 1), 0) / a.length;
          const bx = b.reduce((sum, cell) => sum + (cell % GRID) / (GRID - 1), 0) / b.length;
          const by = b.reduce((sum, cell) => sum + Math.floor(cell / GRID) / (GRID - 1), 0) / b.length;
          return Math.hypot(ax - bx, ay - by);
        })(),
        sharedCellIds: shared, sharedFComponents: options[i].components.filter(x => options[j].components.includes(x)),
        crossProvenance: crossProvenance(options[i], options[j]) };
      pairRecords.push(row);
      if (shared.length) { adjacency[i].push(j); adjacency[j].push(i); edges.push(row); }
    }
  }
  const groups = bfsComponents(options, adjacency);
  const components = groups.map((members, i) => componentMetrics(slot, members, pairRecords, i));
  assert.equal(components.reduce((sum, component) => sum + component.memberXCount, 0), options.length,
    `${seed}/${slot.anchorIndex}: every X option belongs to exactly one component`);
  const independent = unionFindComponents(options);
  const primaryPartition = groups.map(group => group.map(i => maskKey(options[i])).sort()).sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(primaryPartition, independent.partitions, `${seed}/${slot.anchorIndex}: independent components`);
  assert.deepEqual(edges.map(row => edgeKey(row.leftXKey, row.rightXKey)).sort(), independent.edges,
    `${seed}/${slot.anchorIndex}: independent exact overlap edges`);

  const fAdj = options.map(() => []), fEdges = [];
  for (let i = 0; i < options.length; i++) for (let j = i + 1; j < options.length; j++) {
    const sharedF = options[i].components.filter(x => options[j].components.includes(x));
    if (sharedF.length) { fAdj[i].push(j); fAdj[j].push(i); fEdges.push({ i, j, sharedF }); }
  }
  const fGroups = bfsComponents(options, fAdj);
  const fOnlyPairs = pairRecords.filter(row => row.intersectionCellCount === 0 && row.sharedFComponents.length > 0);
  const bOnly = components.filter(row => row.provenanceTags.includes('B-only'));
  const cOnly = components.filter(row => row.provenanceTags.includes('C-only'));
  const singletonCount = components.filter(row => row.memberXCount === 1).length;
  const contestedCount = components.filter(row => row.memberXCount > 1).length;
  const contestedOptions = components.filter(row => row.memberXCount > 1).reduce((sum, row) => sum + row.memberXCount, 0);
  const receipt = { seed, slotIndex, anchorIndex: slot.anchorIndex, timeMs: slot.timeMs,
    matureCandidateCounts: slot.matureCandidateCounts, uniqueSpatialOptionCount: options.length,
    nodes: options, pairwiseRelations: pairRecords, overlapEdges: edges, components,
    overlapComponentCount: components.length, singletonComponentCount: singletonCount,
    contestedComponentCount: contestedCount, largestComponentSize: Math.max(0, ...components.map(row => row.memberXCount)),
    singletonOptionCount: singletonCount, contestedOptionCount: contestedOptions,
    singletonOptionFraction: singletonCount / options.length, contestedOptionFraction: contestedOptions / options.length,
    provenance: { BOnlyNodes: options.filter(o => o.composition === 'B-only').length,
      COnlyNodes: options.filter(o => o.composition === 'C-only').length,
      dualProvenanceNodes: options.filter(o => o.composition === '{B,C}').length,
      mixedBConflictEdges: edges.filter(row => row.crossProvenance).length,
      BOnlyComponents: bOnly.length, COnlyComponents: cOnly.length,
      componentsContainingDualNode: components.filter(row => row.provenanceTags.includes('contains-{B,C}-node')).length,
      componentsWithMixedBCConflict: components.filter(row => row.provenanceTags.includes('mixed-B/C-conflict')).length,
      dualProvenanceSeparateComponents: bOnly.length > 0 && cOnly.length > 0,
      separatePureBCComponentPairs: bOnly.length * cOnly.length },
    fSensitivity: { fComponentRelationEdgeCount: fEdges.length, disjointXPairsSharingF: fOnlyPairs.length,
      xOverlapComponentCount: components.length, fRelationComponentCount: fGroups.length,
      componentCountDifferenceXMinusFRelation: components.length - fGroups.length,
      overlapEdgesMissingSharedFComponent: edges.filter(row => row.sharedFComponents.length === 0).length,
      fRelationComponents: fGroups.map((group, groupIndex) => ({ relationComponentId: `F${String(groupIndex + 1).padStart(3, '0')}`,
        memberOptionIds: group.map(i => options[i].optionId), memberXHashes: group.map(i => options[i].xSha256) })),
      fRelationEdges: fEdges.map(({ i, j, sharedF }) => ({ leftOptionId: options[i].optionId,
        rightOptionId: options[j].optionId, sharedFComponents: sharedF })) },
    independentValidation: { edgeCount: independent.edges.length, componentCount: independent.partitions.length,
      exactPartitions: true, exactEdges: true } };
  return { receipt, internal: { options,
    groups: components.map((component, index) => ({ ...component, memberKeys: groups[index].map(i => maskKey(options[i])) })),
    overlapEdges: edges.map(row => edgeKey(row.leftXKey, row.rightXKey)) } };
}

function summarizeSlots(rows) {
  const receipts = rows.map(row => row.receipt), components = receipts.flatMap(row => row.components);
  const totalOptions = receipts.reduce((sum, row) => sum + row.uniqueSpatialOptionCount, 0);
  const singletonOptions = receipts.reduce((sum, row) => sum + row.singletonOptionCount, 0);
  const contestedOptions = receipts.reduce((sum, row) => sum + row.contestedOptionCount, 0);
  return { slots: rows.length, totalOptions, totalComponents: components.length,
    optionsPerSlot: dist(receipts.map(row => row.uniqueSpatialOptionCount)),
    componentsPerSlot: dist(receipts.map(row => row.overlapComponentCount)),
    singletonComponentsPerSlot: dist(receipts.map(row => row.singletonComponentCount)),
    contestedComponentsPerSlot: dist(receipts.map(row => row.contestedComponentCount)),
    largestComponentPerSlot: dist(receipts.map(row => row.largestComponentSize)),
    singletonOptions, contestedOptions, singletonOptionShare: singletonOptions / totalOptions,
    contestedOptionShare: contestedOptions / totalOptions,
    slotsAllSingleton: receipts.filter(row => row.contestedComponentCount === 0).length,
    componentSizeDistribution: dist(components.map(row => row.memberXCount)),
    contestedComponentSizeDistribution: dist(components.filter(row => row.memberXCount > 1).map(row => row.memberXCount)),
    componentProvenance: { BOnly: components.filter(row => row.provenanceTags.includes('B-only')).length,
      COnly: components.filter(row => row.provenanceTags.includes('C-only')).length,
      containsDualNode: components.filter(row => row.provenanceTags.includes('contains-{B,C}-node')).length,
      mixedBCConflict: components.filter(row => row.provenanceTags.includes('mixed-B/C-conflict')).length },
    slotsWithSeparatePureBC: receipts.filter(row => row.provenance.dualProvenanceSeparateComponents).length,
    overlapEdges: receipts.reduce((sum, row) => sum + row.overlapEdges.length, 0),
    pairwiseRelations: receipts.reduce((sum, row) => sum + row.pairwiseRelations.length, 0),
    disjointXPairsSharingF: receipts.reduce((sum, row) => sum + row.fSensitivity.disjointXPairsSharingF, 0),
    pairwisePairsSharingF: receipts.reduce((sum, row) => sum + row.pairwiseRelations.filter(pair => pair.sharedFComponents.length).length, 0),
    pairwisePairsDifferentF: receipts.reduce((sum, row) => sum + row.pairwiseRelations.filter(pair => !pair.sharedFComponents.length).length, 0),
    xMinusFRelationComponentCountDifference: receipts.reduce((sum, row) => sum + row.fSensitivity.componentCountDifferenceXMinusFRelation, 0) };
}

function windowSummary(seed, rows, index) {
  const contested = rows.flatMap(row => row.receipt.components.filter(c => c.memberXCount > 1).map(c => c.memberXCount));
  return { seed, window: `${index * 60}–${(index + 1) * 60}`, startMs: index * 60_000, endMs: (index + 1) * 60_000,
    slots: rows.length, medianOptions: dist(rows.map(row => row.receipt.uniqueSpatialOptionCount)).median,
    medianComponents: dist(rows.map(row => row.receipt.overlapComponentCount)).median,
    medianSingletonComponents: dist(rows.map(row => row.receipt.singletonComponentCount)).median,
    medianContestedComponentSize: dist(contested).median,
    maxContestedComponentSize: contested.length ? Math.max(...contested) : 0,
    onePerComponent: rows.reduce((sum, row) => sum + row.receipt.overlapComponentCount, 0) };
}

function windows(seedRows) {
  const perSeed = seedRows.flatMap(seed => Array.from({ length: 10 }, (_, i) => windowSummary(seed.seed,
    seed.rows.filter(row => row.receipt.timeMs >= i * 60_000 && row.receipt.timeMs < (i + 1) * 60_000), i)));
  const combined = Array.from({ length: 10 }, (_, i) => {
    const rows = seedRows.flatMap(seed => seed.rows).filter(row => row.receipt.timeMs >= i * 60_000 && row.receipt.timeMs < (i + 1) * 60_000);
    return windowSummary('ALL', rows, i);
  });
  return { perSeed, combined };
}

function intersectsSorted(a, b) {
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) return true;
    if (a[i] < b[j]) i++; else j++;
  }
  return false;
}

function persistence(seed, rows) {
  const transitions = [], contestedTracks = [], singletonTracks = [];
  let activeContested = new Map(), activeSingleton = new Map(), trackNumber = 1;
  for (let i = 0; i < rows.length; i++) {
    const current = rows[i], comps = current.internal.groups.filter(c => c.memberXCount > 1);
    const singles = current.internal.groups.filter(c => c.memberXCount === 1);
    if (i === 0) {
      for (const comp of comps) {
        const track = { trackId: `R${String(trackNumber++).padStart(4, '0')}`, seed, observations: [] };
        contestedTracks.push(track); activeContested.set(comp.componentId, track);
      }
      for (const comp of singles) {
        const track = { seed, xSha256: comp.memberXHashes[0], observations: [] };
        singletonTracks.push(track); activeSingleton.set(comp.memberXHashes[0], track);
      }
    } else {
      const previous = rows[i - 1], prevComps = previous.internal.groups.filter(c => c.memberXCount > 1);
      const prevOpts = new Map(previous.internal.options.map(o => [maskKey(o), o]));
      const currOpts = new Map(current.internal.options.map(o => [maskKey(o), o]));
      const sharedKeys = [...prevOpts.keys()].filter(key => currOpts.has(key));
      const repeatedContested = sharedKeys.filter(key => prevComps.some(c => c.memberKeys.includes(key))
        && comps.some(c => c.memberKeys.includes(key)));
      const newEdges = current.internal.overlapEdges.filter(key => !previous.internal.overlapEdges.includes(key));
      const lostEdges = previous.internal.overlapEdges.filter(key => !current.internal.overlapEdges.includes(key));
      const currentAllCells = new Set(current.internal.options.flatMap(option => option.xCells));
      const previousOptions = new Map(previous.internal.options.map(option => [option.optionId, option]));
      const currentOptions = new Map(current.internal.options.map(option => [option.optionId, option]));
      const candidateTracks = (component, optionsById) => new Set(component.memberOptionIds.flatMap(id =>
        (optionsById.get(id)?.candidates ?? []).map(candidate => candidate.trackId)));
      const related = (left, right) => intersectsSorted(left.unionCellIds, right.unionCellIds);
      const p2c = prevComps.map(p => comps.filter(c => related(p, c)));
      const c2p = comps.map(c => prevComps.filter(p => related(p, c)));
      let oneToOne = 0, ambiguous = 0, dissolved = 0, expired = 0;
      let componentsWithNewMaskWhileExactMemberRemains = 0, newMasksInContinuedComponents = 0;
      let componentsWithNewTrackWhilePriorTrackRemains = 0, newCandidateTracksInContinuedComponents = 0;
      const nextContested = new Map();
      for (let ci = 0; ci < comps.length; ci++) {
        const comp = comps[ci], parents = c2p[ci];
        const pi = parents.length === 1 ? prevComps.indexOf(parents[0]) : -1;
        const continues = pi >= 0 && p2c[pi].length === 1;
        let track = continues ? activeContested.get(parents[0].componentId) : null;
        if (track) {
          oneToOne++;
          const previousKeys = new Set(parents[0].memberKeys);
          const exactRetained = comp.memberKeys.filter(key => previousKeys.has(key)).length;
          const newMasks = comp.memberKeys.length - exactRetained;
          if (exactRetained && newMasks) {
            componentsWithNewMaskWhileExactMemberRemains++;
            newMasksInContinuedComponents += newMasks;
          }
          const priorTracks = candidateTracks(parents[0], previousOptions);
          const currentTracks = candidateTracks(comp, currentOptions);
          const retainedTracks = [...currentTracks].filter(id => priorTracks.has(id)).length;
          const joinedTracks = [...currentTracks].filter(id => !priorTracks.has(id)).length;
          if (retainedTracks && joinedTracks) {
            componentsWithNewTrackWhilePriorTrackRemains++;
            newCandidateTracksInContinuedComponents += joinedTracks;
          }
        }
        else {
          if (parents.length || p2c.some(children => children.length > 1)) ambiguous++;
          track = { trackId: `R${String(trackNumber++).padStart(4, '0')}`, seed, observations: [] };
          contestedTracks.push(track);
        }
        nextContested.set(comp.componentId, track);
      }
      for (let pi = 0; pi < prevComps.length; pi++) if (!p2c[pi].length) {
        if (prevComps[pi].unionCellIds.some(cell => currentAllCells.has(cell))) dissolved++;
        else expired++;
      } else if (p2c[pi].length > 1) ambiguous++;
      const newComponents = comps.filter((_, index) => !c2p[index].length).length;
      let repeatedSingleton = 0;
      const nextSingleton = new Map();
      for (const comp of singles) {
        const hash = comp.memberXHashes[0];
        const priorSingle = previous.internal.groups.find(g => g.memberXHashes.length === 1 && g.memberXHashes[0] === hash);
        let track = priorSingle ? activeSingleton.get(hash) : null;
        if (track) repeatedSingleton++;
        else { track = { seed, xSha256: hash, observations: [] }; singletonTracks.push(track); }
        nextSingleton.set(hash, track);
      }
      transitions.push({ seed, fromSlotIndex: i - 1, toSlotIndex: i,
        fromAnchorIndex: previous.receipt.anchorIndex, toAnchorIndex: current.receipt.anchorIndex,
        fromTimeMs: previous.receipt.timeMs, toTimeMs: current.receipt.timeMs,
        priorContestedComponents: prevComps.length, currentContestedComponents: comps.length,
        repeatedExactXInContestedComponents: repeatedContested.length,
        repeatedExactXHashesInContestedComponents: repeatedContested.map(key => sha(Buffer.from(key))),
        oneToOneContestedContinuations: oneToOne, ambiguousSplitMergeCorrespondences: ambiguous,
        componentsWithNewMaskWhileExactMemberRemains, newMasksInContinuedComponents,
        componentsWithNewTrackWhilePriorTrackRemains, newCandidateTracksInContinuedComponents,
        priorContestedDissolvedToSingletonMembers: dissolved, priorContestedWithNoMembersNextSlot: expired,
        newContestedComponentsWithoutPriorContestedMembers: newComponents,
        newlyCoPresentOverlapEdges: newEdges.length, lostCoPresentOverlapEdges: lostEdges.length,
        repeatedExactSingletons: repeatedSingleton, newOverlapEdgeKeys: newEdges, lostOverlapEdgeKeys: lostEdges });
      activeContested = nextContested; activeSingleton = nextSingleton;
    }
    const receipt = current.receipt;
    for (const comp of comps) activeContested.get(comp.componentId).observations.push({ slotIndex: i,
      anchorIndex: receipt.anchorIndex, timeMs: receipt.timeMs, componentId: comp.componentId,
      memberOptionIds: comp.memberOptionIds, memberXHashes: comp.memberXHashes, memberXCount: comp.memberXCount,
      unionCellCount: comp.unionCellCount });
    for (const comp of singles) activeSingleton.get(comp.memberXHashes[0]).observations.push({ slotIndex: i,
      anchorIndex: receipt.anchorIndex, timeMs: receipt.timeMs, componentId: comp.componentId,
      optionId: comp.memberOptionIds[0] });
  }
  const longest = rows => [...rows].sort((a, b) => b.observations.length - a.observations.length
    || (b.observations.at(-1).timeMs - b.observations[0].timeMs) - (a.observations.at(-1).timeMs - a.observations[0].timeMs)
    || a.observations[0].timeMs - b.observations[0].timeMs
    || String(a.trackId ?? a.xSha256).localeCompare(String(b.trackId ?? b.xSha256)))[0] ?? null;
  return { seed, transitions, contestedTracks, singletonTracks,
    contestedTrackSlotCount: dist(contestedTracks.map(row => row.observations.length)),
    singletonTrackSlotCount: dist(singletonTracks.map(row => row.observations.length)),
    repeatedExactXInContestedComponents: transitions.reduce((sum, row) => sum + row.repeatedExactXInContestedComponents, 0),
    newContestedComponentsWithoutPriorContestedMembers: transitions.reduce((sum, row) => sum + row.newContestedComponentsWithoutPriorContestedMembers, 0),
    oneToOneContestedContinuations: transitions.reduce((sum, row) => sum + row.oneToOneContestedContinuations, 0),
    ambiguousSplitMergeCorrespondences: transitions.reduce((sum, row) => sum + row.ambiguousSplitMergeCorrespondences, 0),
    componentsWithNewMaskWhileExactMemberRemains: transitions.reduce((sum, row) => sum + row.componentsWithNewMaskWhileExactMemberRemains, 0),
    newMasksInContinuedComponents: transitions.reduce((sum, row) => sum + row.newMasksInContinuedComponents, 0),
    componentsWithNewTrackWhilePriorTrackRemains: transitions.reduce((sum, row) => sum + row.componentsWithNewTrackWhilePriorTrackRemains, 0),
    newCandidateTracksInContinuedComponents: transitions.reduce((sum, row) => sum + row.newCandidateTracksInContinuedComponents, 0),
    newlyCoPresentOverlapEdges: transitions.reduce((sum, row) => sum + row.newlyCoPresentOverlapEdges, 0),
    lostCoPresentOverlapEdges: transitions.reduce((sum, row) => sum + row.lostCoPresentOverlapEdges, 0),
    priorContestedDissolvedToSingletonMembers: transitions.reduce((sum, row) => sum + row.priorContestedDissolvedToSingletonMembers, 0),
    priorContestedWithNoMembersNextSlot: transitions.reduce((sum, row) => sum + row.priorContestedWithNoMembersNextSlot, 0),
    longestContested: longest(contestedTracks), longestSingleton: longest(singletonTracks) };
}

function capacity(rows, actualBirths) {
  let cumulative = 0, firstAtOrAbove256 = null, firstAbove256 = null;
  const perSlot = rows.map(row => {
    cumulative += row.receipt.overlapComponentCount;
    const ref = { anchorIndex: row.receipt.anchorIndex, timeMs: row.receipt.timeMs, cumulative };
    if (!firstAtOrAbove256 && cumulative >= PLATE_REFERENCE) firstAtOrAbove256 = ref;
    if (!firstAbove256 && cumulative > PLATE_REFERENCE) firstAbove256 = ref;
    return { slotIndex: row.receipt.slotIndex, anchorIndex: row.receipt.anchorIndex, timeMs: row.receipt.timeMs,
      hypotheticalLocalEvents: row.receipt.overlapComponentCount, cumulative };
  });
  return { cumulativeTotal: cumulative, firstAtOrAbove256, firstAbove256, actualProductionPlateBirths: actualBirths, perSlot };
}

function persistenceSummary(row) {
  const trackSummary = track => track ? { id: track.trackId ?? track.xSha256,
    slots: track.observations.length, startTimeMs: track.observations[0].timeMs,
    endTimeMs: track.observations.at(-1).timeMs,
    elapsedMs: track.observations.at(-1).timeMs - track.observations[0].timeMs,
    startAnchorIndex: track.observations[0].anchorIndex,
    endAnchorIndex: track.observations.at(-1).anchorIndex } : null;
  return { contestedTrackSlotCount: row.contestedTrackSlotCount, singletonTrackSlotCount: row.singletonTrackSlotCount,
    repeatedExactXInContestedComponents: row.repeatedExactXInContestedComponents,
    newContestedComponentsWithoutPriorContestedMembers: row.newContestedComponentsWithoutPriorContestedMembers,
    oneToOneContestedContinuations: row.oneToOneContestedContinuations,
    ambiguousSplitMergeCorrespondences: row.ambiguousSplitMergeCorrespondences,
    componentsWithNewMaskWhileExactMemberRemains: row.componentsWithNewMaskWhileExactMemberRemains,
    newMasksInContinuedComponents: row.newMasksInContinuedComponents,
    componentsWithNewTrackWhilePriorTrackRemains: row.componentsWithNewTrackWhilePriorTrackRemains,
    newCandidateTracksInContinuedComponents: row.newCandidateTracksInContinuedComponents,
    newlyCoPresentOverlapEdges: row.newlyCoPresentOverlapEdges, lostCoPresentOverlapEdges: row.lostCoPresentOverlapEdges,
    priorContestedDissolvedToSingletonMembers: row.priorContestedDissolvedToSingletonMembers,
    priorContestedWithNoMembersNextSlot: row.priorContestedWithNoMembersNextSlot,
    longestContested: trackSummary(row.longestContested), longestSingleton: trackSummary(row.longestSingleton) };
}

function objectiveCases(seedRows, persistenceRows) {
  const all = seedRows.flatMap(row => row.rows.map(item => item.receipt));
  const earliest = (a, b) => a.seed.localeCompare(b.seed) || a.timeMs - b.timeMs || a.anchorIndex - b.anchorIndex;
  const pick = (id, criterion, rows, compare, detail = row => ({})) => {
    const ordered = [...rows].sort((a, b) => compare(b, a) || earliest(a.slot, b.slot)
      || String(a.optionId ?? '').localeCompare(String(b.optionId ?? '')));
    if (!ordered.length) return { id, criterion, status: 'none', selected: null };
    const row = ordered[0], slot = row.slot;
    return { id, criterion, status: 'selected', selected: { seed: slot.seed, slotIndex: slot.slotIndex,
      anchorIndex: slot.anchorIndex, timeMs: slot.timeMs, uniqueSpatialOptionCount: slot.uniqueSpatialOptionCount,
      overlapComponentCount: slot.overlapComponentCount, singletonComponentCount: slot.singletonComponentCount,
      contestedComponentCount: slot.contestedComponentCount, largestComponentSize: slot.largestComponentSize,
      detail: detail(row) } };
  };
  const largest = all.flatMap(slot => slot.components.filter(row => row.memberXCount > 1).map(component => ({ slot, component })));
  const mixed = all.flatMap(slot => slot.overlapEdges.filter(edge => {
    const a = slot.nodes.find(option => option.optionId === edge.leftOptionId);
    const b = slot.nodes.find(option => option.optionId === edge.rightOptionId);
    return a.channels.length === 2 || b.channels.length === 2;
  }).map(edge => ({ slot, edge })));
  const sameFDisjoint = all.flatMap(slot => {
    const pairs = [];
    for (let i = 0; i < slot.nodes.length; i++) for (let j = i + 1; j < slot.nodes.length; j++) {
      const a = slot.nodes[i], b = slot.nodes[j];
      if (a.channels.length !== 1 || b.channels.length !== 1 || a.channels[0] === b.channels[0]) continue;
      const sharedF = a.components.filter(value => b.components.includes(value));
      if (sharedF.length && overlap(a, b).length === 0) pairs.push({ slot, a, b, sharedF });
    }
    return pairs;
  });
  const contestedTracks = persistenceRows.flatMap(row => row.contestedTracks.filter(track => track.observations.length > 1)
    .map(track => ({ track, slot: seedRows.find(seed => seed.seed === row.seed).rows[track.observations.at(-1).slotIndex].receipt })));
  const singletonTracks = persistenceRows.flatMap(row => row.singletonTracks.filter(track => track.observations.length > 1)
    .map(track => ({ track, slot: seedRows.find(seed => seed.seed === row.seed).rows[track.observations.at(-1).slotIndex].receipt })));
  return { selectionRules: { tieBreak: 'seed ascending, actual time ascending, anchor ascending, then stable IDs',
    localConflictContinuity: 'exact member X hashes, mutual one-to-one contested-component correspondence only',
    manyOptionsSmallConflicts: 'maximize global option count, minimize largest component, maximize singleton components, then earliest',
    sameFDisjoint: 'pure B and pure C options; zero shared X cells; at least one same frozen F component' },
    cases: [
      pick('maximum-singleton-components', 'Max singleton component count, then more global options, then earliest.',
        all.map(slot => ({ slot })), (a, b) => a.slot.singletonComponentCount - b.slot.singletonComponentCount
          || a.slot.uniqueSpatialOptionCount - b.slot.uniqueSpatialOptionCount,
        row => ({ singletonComponents: row.slot.singletonComponentCount })),
      pick('largest-contested-component', 'Largest connected overlap component by member X count, then union-cell count, then earliest.',
        largest, (a, b) => a.component.memberXCount - b.component.memberXCount
          || a.component.unionCellCount - b.component.unionCellCount,
        row => ({ componentId: row.component.componentId, memberXCount: row.component.memberXCount,
          unionCellCount: row.component.unionCellCount, memberOptionIds: row.component.memberOptionIds })),
      pick('many-options-small-local-conflicts', 'Max options, then min largest component, then max singleton count, then earliest.',
        all.map(slot => ({ slot })), (a, b) => a.slot.uniqueSpatialOptionCount - b.slot.uniqueSpatialOptionCount
          || b.slot.largestComponentSize - a.slot.largestComponentSize
          || a.slot.singletonComponentCount - b.slot.singletonComponentCount,
        row => ({ globalOptions: row.slot.uniqueSpatialOptionCount, largestComponent: row.slot.largestComponentSize,
          singletonComponents: row.slot.singletonComponentCount })),
      pick('dual-provenance-option-overlap', 'Earliest {B,C} node with an overlap edge to another unique X.', mixed, () => 0,
        row => ({ leftOptionId: row.edge.leftOptionId, rightOptionId: row.edge.rightOptionId,
          intersectionCellCount: row.edge.intersectionCellCount, jaccard: row.edge.jaccard,
          sharedFComponents: row.edge.sharedFComponents, crossProvenance: row.edge.crossProvenance })),
      pick('same-F-component-disjoint-B-C-options', 'Earliest pure B/C pair sharing an F component but no X cells.',
        sameFDisjoint, () => 0, row => ({ BOptionId: row.a.channels[0] === 'B' ? row.a.optionId : row.b.optionId,
          COptionId: row.a.channels[0] === 'C' ? row.a.optionId : row.b.optionId, sharedFComponents: row.sharedF })),
      pick('longest-lived-contested-local-region', 'Longest unambiguous contested component chain; use its final observation.',
        contestedTracks, (a, b) => a.track.observations.length - b.track.observations.length
          || (a.track.observations.at(-1).timeMs - a.track.observations[0].timeMs)
            - (b.track.observations.at(-1).timeMs - b.track.observations[0].timeMs),
        row => ({ trackId: row.track.trackId, durationSlots: row.track.observations.length,
          startTimeMs: row.track.observations[0].timeMs, endTimeMs: row.track.observations.at(-1).timeMs,
          componentId: row.track.observations.at(-1).componentId,
          memberOptionIds: row.track.observations.at(-1).memberOptionIds })),
      pick('longest-lived-singleton-option', 'Longest exact X mask run that remains singleton at adjacent slots; use its final observation.',
        singletonTracks, (a, b) => a.track.observations.length - b.track.observations.length
          || (a.track.observations.at(-1).timeMs - a.track.observations[0].timeMs)
            - (b.track.observations.at(-1).timeMs - b.track.observations[0].timeMs),
        row => ({ xSha256: row.track.xSha256, durationSlots: row.track.observations.length,
          startTimeMs: row.track.observations[0].timeMs, endTimeMs: row.track.observations.at(-1).timeMs,
          optionId: row.track.observations.at(-1).optionId }))
    ] };
}

async function analyze() {
  const source = await loadFrozen(), seedRows = [];
  for (const seedData of source.seeds) {
    const rows = seedData.slots.map((slot, i) => analyzeSlot(seedData.seed, slot, i));
    const temporal = persistence(seedData.seed, rows), summary = summarizeSlots(rows);
    const hypothetical = capacity(rows, seedData.actualProductionPlateBirths);
    const seed = seedData.seed;
    await writeGzip(resolve(OUT, `analysis/conflict-slots-${seed}.json.gz`), {
      schema: 'ant-bc-x-overlap-conflict-slots-v1', seed, sourceCommitSlotAuditCommit: SLOT_AUDIT,
      sourceSlotFileSha256: seedData.sourceHash,
      relation: 'edge iff the two exact sorted X masks share at least one grid cell', slots: rows.map(row => row.receipt) });
    await writeGzip(resolve(OUT, `analysis/persistent-conflicts-${seed}.json.gz`), {
      schema: 'ant-bc-conflict-continuity-v1', ...temporal });
    await writeJson(resolve(OUT, `analysis/capacity-${seed}.json`), hypothetical);
    seedRows.push({ seed, rows, summary, persistence: temporal, capacity: hypothetical });
    console.log(JSON.stringify({ seed, slots: rows.length, options: summary.totalOptions,
      components: summary.totalComponents, overlapEdges: summary.overlapEdges,
      onePerComponent: hypothetical.cumulativeTotal, firstAbove256: hypothetical.firstAbove256 }));
  }
  const all = seedRows.flatMap(row => row.rows), totalOptions = seedRows.reduce((sum, row) => sum + row.summary.totalOptions, 0);
  const singletonOptions = seedRows.reduce((sum, row) => sum + row.summary.singletonOptions, 0);
  const allComponents = all.flatMap(row => row.receipt.components);
  const aggregate = { schema: 'ant-bc-local-conflict-decomposition-summary-v1', productionAuthority: PRODUCTION,
    sourceCommitSlotAuditCommit: SLOT_AUDIT, sourceManifestSha256: source.manifestSha256,
    sourceSlotHashes: Object.fromEntries(source.seeds.map(row => [row.seed, row.sourceHash])),
    sourceValidationSha256: source.validationSha256, sourceSummarySha256: source.summarySha256,
    totalSlots: all.length, totalOptions,
    singletonOptions, contestedOptions: totalOptions - singletonOptions,
    singletonOptionShare: singletonOptions / totalOptions,
    totalSingletonComponents: all.reduce((sum, row) => sum + row.receipt.singletonComponentCount, 0),
    slotsWithAnyContestedComponent: all.filter(row => row.receipt.contestedComponentCount > 0).length,
    componentsPerSlot: dist(all.map(row => row.receipt.overlapComponentCount)),
    largestComponentPerSlot: dist(all.map(row => row.receipt.largestComponentSize)),
    allComponentSizeDistribution: dist(allComponents.map(row => row.memberXCount)),
    contestedComponentSizeDistribution: dist(allComponents.filter(row => row.memberXCount > 1).map(row => row.memberXCount)),
    totalComponents: seedRows.reduce((sum, row) => sum + row.summary.totalComponents, 0),
    contestedComponents: seedRows.reduce((sum, row) => sum + row.summary.contestedComponentSizeDistribution.count, 0),
    totalOverlapEdges: seedRows.reduce((sum, row) => sum + row.summary.overlapEdges, 0),
    totalPairwiseRelations: seedRows.reduce((sum, row) => sum + row.summary.pairwiseRelations, 0),
    disjointXPairsSharingF: seedRows.reduce((sum, row) => sum + row.summary.disjointXPairsSharingF, 0),
    pairwisePairsSharingF: seedRows.reduce((sum, row) => sum + row.summary.pairwisePairsSharingF, 0),
    pairwisePairsDifferentF: seedRows.reduce((sum, row) => sum + row.summary.pairwisePairsDifferentF, 0),
    xMinusFRelationComponentCountDifference: seedRows.reduce((sum, row) => sum + row.summary.xMinusFRelationComponentCountDifference, 0),
    totalFRelationComponents: seedRows.reduce((sum, row) => sum + row.rows.reduce((n, slot) => n + slot.receipt.fSensitivity.fRelationComponentCount, 0), 0),
    componentsBOnly: seedRows.reduce((sum, row) => sum + row.summary.componentProvenance.BOnly, 0),
    componentsCOnly: seedRows.reduce((sum, row) => sum + row.summary.componentProvenance.COnly, 0),
    componentsWithDualNode: seedRows.reduce((sum, row) => sum + row.summary.componentProvenance.containsDualNode, 0),
    componentsMixedConflict: seedRows.reduce((sum, row) => sum + row.summary.componentProvenance.mixedBCConflict, 0),
    slotsWithSeparatePureBC: seedRows.reduce((sum, row) => sum + row.summary.slotsWithSeparatePureBC, 0),
    capacityTotal: seedRows.reduce((sum, row) => sum + row.capacity.cumulativeTotal, 0),
    seeds: seedRows.map(row => ({ seed: row.seed, ...row.summary,
      onePerComponentCumulative: row.capacity.cumulativeTotal, firstAtOrAbove256: row.capacity.firstAtOrAbove256,
      firstAbove256: row.capacity.firstAbove256, actualProductionPlateBirths: row.capacity.actualProductionPlateBirths,
      persistence: persistenceSummary(row.persistence) })),
    windows: windows(seedRows), classification: 'LOCAL CONFLICT DECOMPOSES BUT REMAINS OVERPROLIFIC',
    classificationRationale: 'Most X options are singleton components and the typical contested component is small; the full distributions are retained without a numeric morphology cutoff. The one-per-component diagnostic exceeds the supplied 256 reference in each seed.',
    nextQuestion: 'Which separate authored world-level capacity responsibility, if any, should bound independent local material events after local X conflicts are resolved?' };
  const objective = objectiveCases(seedRows, seedRows.map(row => row.persistence));
  await writeJson(resolve(OUT, 'analysis/summary.json'), aggregate);
  await writeJson(resolve(OUT, 'analysis/objective-cases.json'), objective);
  await writeJson(resolve(OUT, 'analysis/validation.json'), { schema: 'ant-bc-local-conflict-decomposition-validation-v1',
    productionAuthority: PRODUCTION, sourceCommitSlotAuditCommit: SLOT_AUDIT,
    sourceManifestSha256: source.manifestSha256, sourceValidationSha256: source.validationSha256,
    sourceSummarySha256: source.summarySha256, sourceSlotHashes: aggregate.sourceSlotHashes,
    totalSlots: all.length, totalOptions, totalOverlapComponents: aggregate.totalComponents,
    exact163SlotReceiptsReused: all.length === 163, exactXCellSetsReused: true, exactSavedTimesReused: true,
    observerRngCalls: 0, noNaturalSimulation: true, productionSourceChanges: 'none',
    independentOverlapReconstruction: 'exact edge sets matched: Set-intersection pair build vs sorted-mask two-pointer union-find',
    connectedComponentReconstruction: 'exact partitions matched: BFS vs independent union-find',
    deterministicOnePerComponentCount: true,
    seeds: seedRows.map(row => ({ seed: row.seed, slots: row.rows.length,
      options: row.summary.totalOptions, components: row.summary.totalComponents,
      edges: row.summary.overlapEdges, independentChecks: row.rows.length,
      exactTimestampCount: row.rows.length, onePerComponentCount: row.capacity.cumulativeTotal })) });
  console.log(JSON.stringify({ complete: true, slots: aggregate.totalSlots, options: aggregate.totalOptions,
    components: aggregate.totalComponents, contestedComponents: aggregate.contestedComponents,
    classification: aggregate.classification, cases: objective.cases.map(row => ({ id: row.id, status: row.status })) }));
}

async function finalize() {
  const files = (await listFiles(OUT)).filter(row => !['manifest.json', 'SHA256SUMS.txt'].includes(row.file))
    .sort((a, b) => a.file.localeCompare(b.file));
  const tools = {};
  for (const file of ['scripts/ant-bc-local-conflict-decomposition.js', 'scripts/render-ant-bc-local-conflict-atlas.js'])
    tools[file] = sha(await readFile(resolve(ROOT, file)));
  const manifest = { schema: 'ant-bc-local-conflict-decomposition-manifest-v1',
    branch: 'codex/ant-bc-local-conflict-decomposition-20261101', startingCommit: SLOT_AUDIT,
    productionAuthority: PRODUCTION, sourceCommitSlotAuditCommit: SLOT_AUDIT,
    dualHistoryCommit: DUAL, provenancePrototypeCommit: PROTOTYPE, gridSize: GRID,
    entry: ENTRY, safetyReferencePlateCount: PLATE_REFERENCE,
    primaryRelation: 'exact X cell-set intersection is non-empty', tools, files };
  await writeJson(resolve(OUT, 'manifest.json'), manifest);
  const sums = [...files.map(row => [row.file, row.sha256]), ['manifest.json', sha(await readFile(resolve(OUT, 'manifest.json')))] ]
    .sort((a, b) => a[0].localeCompare(b[0]));
  await writeFile(resolve(OUT, 'SHA256SUMS.txt'), sums.map(([file, hash]) => `${hash}  ${file}`).join('\n') + '\n');
  return { files: files.length, manifestSha256: sha(await readFile(resolve(OUT, 'manifest.json'))), checksumRows: sums.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await mkdir(resolve(OUT, 'analysis'), { recursive: true });
  if (process.argv.includes('--finalize')) console.log(JSON.stringify(await finalize()));
  else await analyze();
}
