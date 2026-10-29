import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = resolve(ROOT, 'docs/ant/evidence/2026-10-29-body-diverse-scope-atlas');
const INPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-29-stratigraphy-signal-audit/data/reconstructed-commit-context.json.gz');
const RAW = resolve(ROOT, 'docs/ant/evidence/2026-10-25-g-production-candidate-review/data/seed20261005-G-raw.json.gz');
const BODY = resolve(ROOT, 'docs/ant/evidence/2026-10-29-material-body-design-space/data/frozen-body-inputs.json.gz');
const N = 96, CELLS = N * N;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const cellXY = index => [index % N, Math.floor(index / N)];
const ordinal = id => Number(id.match(/(\d+)$/)?.[1]);

function graphMetrics(row) {
  const d = row.descriptor, nodes = d.centerline.map(n => n.index).sort((a, b) => a - b);
  assert.equal(new Set(nodes).size, nodes.length, `${row.id} duplicate I node`);
  const nodeSet = new Set(nodes), adjacency = new Map(nodes.map(i => [i, []])), degree = new Map(nodes.map(i => [i, 0]));
  const seenEdges = new Set();
  for (const [a, b] of d.edges) {
    assert(nodeSet.has(a) && nodeSet.has(b), `${row.id} edge leaves I`);
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    assert(!seenEdges.has(key), `${row.id} duplicate edge`); seenEdges.add(key);
    const [ax, ay] = cellXY(a), [bx, by] = cellXY(b);
    assert(Math.max(Math.abs(ax - bx), Math.abs(ay - by)) === 1, `${row.id} edge is not production 8-neighbor`);
    adjacency.get(a).push(b); adjacency.get(b).push(a); degree.set(a, degree.get(a) + 1); degree.set(b, degree.get(b) + 1);
  }
  let components = 0; const visited = new Set();
  for (const start of nodes) if (!visited.has(start)) {
    components++; const q = [start]; visited.add(start);
    for (let head = 0; head < q.length; head++) for (const next of adjacency.get(q[head])) if (!visited.has(next)) { visited.add(next); q.push(next); }
  }
  const xs = nodes.map(i => i % N), ys = nodes.map(i => Math.floor(i / N));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const boxWidth = maxX - minX + 1, boxHeight = maxY - minY + 1;
  const path = d.principalPath;
  assert(path.length > 1 && path.every(i => nodeSet.has(i)), `${row.id} principal path outside I`);
  assert.equal(path[0], d.source.index, `${row.id} principal-path source`);
  assert.equal(path.at(-1), d.target.index, `${row.id} principal-path target`);
  let pathLengthCells = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = cellXY(path[i - 1]), [bx, by] = cellXY(path[i]);
    assert(Math.max(Math.abs(ax - bx), Math.abs(ay - by)) === 1, `${row.id} non-adjacent principal-path step`);
    assert(seenEdges.has(`${Math.min(path[i - 1], path[i])}:${Math.max(path[i - 1], path[i])}`), `${row.id} principal path edge missing`);
    pathLengthCells += Math.hypot(bx - ax, by - ay);
  }
  const [sx, sy] = cellXY(path[0]), [tx, ty] = cellXY(path.at(-1));
  const endpointCells = Math.hypot(tx - sx, ty - sy), pathSet = new Set(path);
  const offPath = nodes.filter(i => !pathSet.has(i)), offSet = new Set(offPath), offVisited = new Set(), offComponents = [];
  for (const start of offPath) if (!offVisited.has(start)) {
    const q = [start]; offVisited.add(start);
    for (let head = 0; head < q.length; head++) for (const next of adjacency.get(q[head])) if (offSet.has(next) && !offVisited.has(next)) { offVisited.add(next); q.push(next); }
    offComponents.push(q.length);
  }
  offComponents.sort((a, b) => b - a);
  const [ox, oy] = [d.provenance.sourceAnnulus.origin.x, d.provenance.sourceAnnulus.origin.y];
  const sxWorld = sx / 95, syWorld = sy / 95, txWorld = tx / 95, tyWorld = ty / 95;
  return {
    id: row.id, ordinal: ordinal(row.id), commitSeconds: d.bornAtSimulationTimeMs / 1000,
    nodeCount: nodes.length, edgeCount: d.edges.length, componentCount: components,
    terminalCount: [...degree.values()].filter(v => v === 1).length,
    junctionCount: [...degree.values()].filter(v => v >= 3).length,
    cycleRank: d.edges.length - nodes.length + components,
    bbox: { minX, maxX, minY, maxY, widthCells: boxWidth, heightCells: boxHeight },
    bboxAspectRatio: Math.max(boxWidth, boxHeight) / Math.min(boxWidth, boxHeight),
    nodeDensityInBBox: nodes.length / (boxWidth * boxHeight),
    principalPathNodeCount: path.length, principalPathLengthWorld: pathLengthCells / 95,
    endpointDistanceWorld: endpointCells / 95,
    tortuosity: endpointCells ? pathLengthCells / endpointCells : null,
    offPrincipalNodeCount: offPath.length, offPrincipalFraction: offPath.length / nodes.length,
    offPrincipalComponentSizes: offComponents,
    sourceOriginDistance: Math.hypot(sxWorld - ox, syWorld - oy),
    targetEdgeDistance: Math.min(txWorld, 1 - txWorld, tyWorld, 1 - tyWorld),
    authoredObservationBoundaryDistance: d.provenance.observationBoundaryDistance,
    productionMaskCells: d.mask.reduce((sum, bit) => sum + bit, 0)
  };
}

function selection(inventory) {
  const candidates = inventory.filter(row => row.ordinal > 2), picked = new Set(), rows = [];
  const criteria = [
    ['smallest finite scope', (a, b) => a.nodeCount - b.nodeCount],
    ['largest finite scope', (a, b) => b.nodeCount - a.nodeCount],
    ['highest junction complexity', (a, b) => b.junctionCount - a.junctionCount || b.offPrincipalNodeCount - a.offPrincipalNodeCount],
    ['most tortuous principal path', (a, b) => (b.tortuosity ?? -Infinity) - (a.tortuosity ?? -Infinity)],
    ['most compact scope', (a, b) => a.bboxAspectRatio - b.bboxAspectRatio || b.nodeDensityInBBox - a.nodeDensityInBBox]
  ];
  for (const [reason, rank] of criteria) {
    const ranked = [...candidates].sort((a, b) => rank(a, b) || a.ordinal - b.ordinal);
    const winner = ranked.find(row => !picked.has(row.id));
    assert(winner, `no unselected event for ${reason}`); picked.add(winner.id);
    rows.push({ id: winner.id, ordinal: winner.ordinal, commitSeconds: winner.commitSeconds, criterion: reason,
      criterionRankAmongP3ToP36: ranked.findIndex(row => row.id === winner.id) + 1 });
  }
  return { excludedReferenceCommits: ['trail-plate-1', 'trail-plate-2'], rule: 'fixed lexicographic criterion order; next unselected ranked candidate; ordinal ascending for ties', selected: rows };
}

async function collect() {
  const [contextBytes, rawBytes, bodyBytes] = await Promise.all([readFile(INPUT), readFile(RAW), readFile(BODY)]);
  const context = JSON.parse(gunzipSync(contextBytes)), raw = JSON.parse(gunzipSync(rawBytes)), body = JSON.parse(gunzipSync(bodyBytes));
  assert.equal(context.commits.length, 36); assert.equal(raw.births.length, 36); assert.equal(body.events.length, 2);
  assert.equal(context.replay.sourceParity['src/lib/agents/ant/PheromoneField.js'].exactHashMatch, false);
  const inventory = context.commits.map((row, i) => {
    const actual = raw.births[i], descriptor = row.descriptor;
    assert.equal(row.id, actual.id); assert.equal(descriptor.id, actual.id);
    assert.equal(row.bornAtSimulationTimeMs, actual.bornAtSimulationTimeMs);
    assert.equal(sha(Buffer.from(descriptor.mask)), actual.maskSha256, `${row.id} frozen mask SHA`);
    return { ...graphMetrics(row), frozenMaskSha256: actual.maskSha256,
      reconstructedDescriptorSource: 'prior deterministic replay; all frozen birth mask digests match' };
  });
  for (let i = 0; i < 2; i++) {
    const a = context.commits[i].descriptor, b = body.events[i].plate;
    assert.deepEqual(a.centerline, b.centerline); assert.deepEqual(a.edges, b.edges);
    assert.deepEqual(a.principalPath, b.principalPath); assert.deepEqual(a.mask, b.mask);
  }
  const sourceParity = context.replay.sourceParity;
  const payload = {
    schema: 'ant-body-diverse-scope-structural-inventory-v1',
    baseline: { productionMain: context.baseline.productionMain, researchParent: context.baseline.researchParent,
      seed: context.baseline.seed, arm: context.baseline.arm, seconds: context.baseline.seconds,
      tickRate: context.baseline.tickRate, audio: context.baseline.audio, naturalReplaysThisPass: 0 },
    provenance: {
      reconstruction: 'existing prior-pass capture; this pass does not replay the simulation',
      frozenRawMaskHashesMatched: true, p1p2FullDescriptorsMatchedFrozenBodyPacket: true,
      pheromoneSourceHashMatchedFrozenRun: sourceParity['src/lib/agents/ant/PheromoneField.js'].exactHashMatch,
      frozenPheromoneSourceSha256: sourceParity['src/lib/agents/ant/PheromoneField.js'].frozenRunDeclaredSha256,
      reconstructedPheromoneSourceSha256: sourceParity['src/lib/agents/ant/PheromoneField.js'].currentMainWorkingTreeSha256,
      exactCommitTimeChemicalBMapsAvailableForP3ToP36: false,
      inputSha256: { reconstructedCommitContext: sha(contextBytes), frozenRaw600s: sha(rawBytes), frozenP1P2BodyInputs: sha(bodyBytes) }
    },
    sourceBias: {
      selector: 'current authored TrailPlateBirth source-annulus to observation-boundary selection',
      eventsWithSourceAnnulus: context.commits.filter(row => row.descriptor.provenance.sourceAnnulus).length,
      eventsWithDeclaredObservationBoundaryDistance: context.commits.filter(row => Number.isFinite(row.descriptor.provenance.observationBoundaryDistance)).length,
      observationBoundaryDistanceWorld: context.commits[0].descriptor.provenance.observationBoundaryDistance,
      targetEdgeDistanceWorld: inventory.map(({ id, targetEdgeDistance }) => ({ id, targetEdgeDistance }))
    },
    inventory
  };
  return { inventory: payload, selected: selection(inventory), sourceParity };
}

async function selfTest() {
  const fixture = {
    id: 'trail-plate-99', descriptor: {
      centerline: [4560, 4655, 4656, 4657, 4752].map(index => ({ index })),
      edges: [[4560, 4656], [4655, 4656], [4656, 4657], [4656, 4752], [4560, 4657]],
      principalPath: [4655, 4656, 4657], source: { index: 4655 }, target: { index: 4657 },
      provenance: { sourceAnnulus: { origin: { x: .5, y: .5 } }, observationBoundaryDistance: .05 },
      mask: Array.from({ length: CELLS }, (_, i) => +[4560, 4655, 4656, 4657, 4752].includes(i))
    }
  };
  const m = graphMetrics(fixture);
  assert.equal(m.nodeCount, 5); assert.equal(m.edgeCount, 5); assert.equal(m.componentCount, 1);
  assert.equal(m.junctionCount, 1); assert.equal(m.terminalCount, 2); assert.equal(m.cycleRank, 1);
  assert.equal(m.bboxAspectRatio, 1); assert.equal(m.tortuosity, 1); assert.deepEqual(m.offPrincipalComponentSizes, [1, 1]);
  console.log('PASS: 8-neighbor graph components, degree classes, cycle rank, path geometry, branch components');
}

const args = new Set(process.argv.slice(2));
if (args.has('--self-test')) await selfTest();
else {
  const { inventory, selected } = await collect();
  const outputs = [
    [resolve(BASE, 'structural-inventory.json'), json(inventory)],
    [resolve(BASE, 'selection-receipt.json'), json(selected)]
  ];
  if (args.has('--check')) {
    for (const [path, expected] of outputs) assert.equal(await readFile(path, 'utf8'), expected);
  } else {
    await mkdir(BASE, { recursive: true });
    for (const [path, content] of outputs) await writeFile(path, content, { flag: 'wx' });
  }
  console.log(JSON.stringify({ commits: inventory.inventory.length, selected: selected.selected, sourceBias: inventory.sourceBias,
    provenance: inventory.provenance }));
}
