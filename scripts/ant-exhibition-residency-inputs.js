import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { deserialize, serialize } from 'node:v8';
import { gunzipSync, gzipSync } from 'node:zlib';
import { compileSurfaceTopology, NO_NODE } from '../src/lib/audio/compileSurfaceTopology.js';

// Project packed mechanics, retaining diagonal-edge solver nodes exactly.
export function projectAcousticSuffix(t, count) {
  assert.ok(Number.isSafeInteger(count) && count > 0 && count <= 256);
  const first = Math.max(0, t.layerIds.length - count), start = t.nodeOffsets[first];
  const columns = (offsets, layers, nodes) => {
    const outOffsets = new offsets.constructor(offsets.length), keptLayers = [], keptNodes = [];
    for (let cell = 0; cell < offsets.length - 1; cell++) {
      for (let q = offsets[cell]; q < offsets[cell + 1]; q++) if (layers[q] >= first) {
        keptLayers.push(layers[q] - first);
        if (nodes) keptNodes.push(nodes[q] - start);
      }
      outOffsets[cell + 1] = keptLayers.length;
    }
    return { offsets: outOffsets, layers: new layers.constructor(keptLayers),
      nodes: nodes ? new nodes.constructor(keptNodes) : null };
  };
  const source = columns(t.sourceColumnOffsets, t.sourceColumnLayerIndices);
  const solver = columns(t.columnOffsets, t.columnLayerIndices, t.columnNodeIndices);
  const adjacentLinkOffsets = new t.adjacentLinkOffsets.constructor(t.adjacentLinkOffsets.length);
  const pairs = [], weights = [];
  for (let cell = 0; cell < adjacentLinkOffsets.length - 1; cell++) {
    for (let q = t.adjacentLinkOffsets[cell]; q < t.adjacentLinkOffsets[cell + 1]; q++) {
      const a = t.adjacentLinkNodes[q * 2], b = t.adjacentLinkNodes[q * 2 + 1];
      if (a >= start && b >= start) { pairs.push(a - start, b - start); weights.push(t.adjacentLinkCoefficients[q]); }
    }
    adjacentLinkOffsets[cell + 1] = weights.length;
  }
  const retainedNodules = t.noduleIds.map((_, i) => i).filter(i =>
    t.noduleFoundationLayerIndices[i] >= first && t.noduleCouplingNodeIndices[i] !== NO_NODE
      && t.noduleCouplingNodeIndices[i] >= start);
  const select = (array, width = 1) => new array.constructor(retainedNodules.flatMap(i => Array.from(array.slice(i * width, (i + 1) * width))));
  return { ...t, layerIds: t.layerIds.slice(first),
    nodeOffsets: Int32Array.from(t.nodeOffsets.slice(first), value => value - start),
    nodeGridIndices: t.nodeGridIndices.slice(start),
    neighborIndices: Int32Array.from(t.neighborIndices.slice(start * 4), value => value < 0 ? -1 : value - start),
    pickupNodeIndices: Uint32Array.from(t.pickupNodeIndices.slice(first * 2), value => value === NO_NODE ? value : value - start),
    materialCoefficients: t.materialCoefficients.slice(first * 4),
    routingTopLayerByCell96: Int16Array.from(t.routingTopLayerByCell96, value => value >= first ? value - first : -1),
    sourceColumnOffsets: source.offsets, sourceColumnLayerIndices: source.layers,
    sourceLayerCountByCell96: new t.sourceLayerCountByCell96.constructor(Array.from(source.offsets.slice(1), (value, i) => value - source.offsets[i])),
    columnOffsets: solver.offsets, columnLayerIndices: solver.layers, columnNodeIndices: solver.nodes,
    adjacentLinkOffsets, adjacentLinkNodes: new Uint32Array(pairs), adjacentLinkCoefficients: new Float32Array(weights),
    noduleIds: retainedNodules.map(i => t.noduleIds[i]), nodules: retainedNodules.map(i => t.nodules[i]),
    noduleFoundationLayerIndices: Int16Array.from(select(t.noduleFoundationLayerIndices), value => value - first),
    noduleCouplingNodeIndices: Uint32Array.from(select(t.noduleCouplingNodeIndices), value => value - start),
    nodulePositionsXY: select(t.nodulePositionsXY, 2), nodulePhysicalRadiiMeters: select(t.nodulePhysicalRadiiMeters),
    noduleMaterials: select(t.noduleMaterials, 3), noduleCouplingWeights: select(t.noduleCouplingWeights) };
}

function selfCheck() {
  const plate = (id, left, right) => {
    const mask = new Array(96 ** 2).fill(0);
    for (let y = 40; y <= 46; y++) for (let x = left; x <= right; x++) mask[y * 96 + x] = 1;
    return { id, grid: { width: 96, height: 96 }, mask,
      edges: [[40 * 96 + right - 1, 41 * 96 + right]],
      pickups: [{ x: left / 95, y: 43 / 95 }, { x: right / 95, y: 43 / 95 }],
      material: { stiffness: 0.9, density: 1.1, damping: 0.35 } };
  };
  const plates = [plate('old', 0, 35), plate('middle', 32, 60), plate('new', 58, 85)];
  const nodules = [0, 1, 2].map(i => ({ id: `n${i}`, position: { x: [10, 45, 75][i] / 95, y: 43 / 95 },
    physicalRadiusMeters: 0.02, material: { density: 2000, youngModulus: 800000, poisson: 0.3, damping: 0.35 },
    coupling: { plateId: plates[i].id, position: { x: [10, 45, 75][i] / 95, y: 43 / 95 }, weight: 0.2 } }));
  const full = compileSurfaceTopology({ plates, nodules });
  for (const count of [1, 2, 3]) {
    const expected = compileSurfaceTopology({ plates: plates.slice(-count), nodules: nodules.slice(-count) });
    assert.deepEqual(projectAcousticSuffix(full, count), expected, `packed/compiler suffix parity ${count}`);
  }
  assert.throws(() => projectAcousticSuffix(full, 0));
  console.log('resident suffix packed/compiler parity self-check passed (diagonal nodes and Sphere foundations)');
}

async function main() {
  if (process.argv.includes('--self-check')) { selfCheck(); return; }
  selfCheck();
  const input = 'docs/ant/evidence/2026-10-21-exhibition-audio-runtime/capture-inputs.v8.gz';
  const out = 'docs/ant/evidence/2026-10-21-long-run-exhibition/audio';
  const bytes = await readFile(input), base = deserialize(gunzipSync(bytes));
  const hash = data => createHash('sha256').update(data).digest('hex');
  await mkdir(out, { recursive: true });
  const receipts = [];
  for (const count of [1, 2]) {
    const cases = base.cases.map(item => {
      const topology = projectAcousticSuffix(item.topology, count), ids = new Set(topology.layerIds);
      const events = item.events.filter(event => event.message.type !== 'strike' || ids.has(event.message.payload.layerId));
      assert.ok(events.every(event => event.message.type !== 'strike' || topology.layerIds.includes(event.message.payload.plateId)));
      return { ...item, topology, events, residency: { limit: count, historicalPlates: item.plateCount,
        residents: topology.layerIds, originalStrikes: item.events.filter(event => event.message.type === 'strike').length,
        retainedStrikes: events.filter(event => event.message.type === 'strike').length,
        omittedNonresidentStrikes: item.events.length - events.length,
        originalNodules: item.topology.noduleIds.length, residentNodules: topology.noduleIds.length,
        policy: 'global birth-order suffix; original already-normalized strike payloads unchanged; original within-suffix Z and foundation Sphere only' } };
    });
    const packed = gzipSync(serialize({ ...base, cases }), { level: 9 });
    const name = `resident-${count}-inputs.v8.gz`;
    await writeFile(`${out}/${name}`, packed);
    receipts.push({ artifact: name, sha256: hash(packed), parentArtifact: input, parentSha256: hash(bytes),
      cases: cases.map(item => ({ ...item.residency, nodes: item.topology.nodeGridIndices.length, zLinks: item.topology.adjacentLinkCoefficients.length })) });
  }
  await writeFile(`${out}/input-receipts.json`, JSON.stringify({ schemaVersion: 1, receipts }, null, 2) + '\n');
  console.log(JSON.stringify(receipts.map(row => ({ artifact: row.artifact, cases: row.cases })), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
