import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = resolve(ROOT, 'docs/ant/evidence/2026-10-29-body-diverse-scope-atlas');
const CONTEXT = resolve(ROOT, 'docs/ant/evidence/2026-10-29-stratigraphy-signal-audit/data/reconstructed-commit-context.json.gz');
const PRIOR = resolve(ROOT, 'docs/ant/evidence/2026-10-29-material-body-design-space/analysis.json');
const N = 96, CELLS = N * N, R0 = .012, R1 = .030;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const maskHash = mask => sha(Buffer.from(JSON.stringify(mask) + '\n'));
const xy = i => [i % N, Math.floor(i / N)];
const count = mask => mask.reduce((sum, value) => sum + value, 0);

function distances(nodes) {
  assert(nodes.length);
  const result = new Float64Array(CELLS).fill(Infinity), extent = Math.ceil(R1 * 95);
  for (const index of nodes) {
    const [x, y] = xy(index);
    for (let dy = -extent; dy <= extent; dy++) for (let dx = -extent; dx <= extent; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < N && yy >= 0 && yy < N) {
        const i = yy * N + xx;
        result[i] = Math.min(result[i], Math.hypot(dx, dy) / 95);
      }
    }
  }
  return result;
}

function sleeve(distance) { return Array.from(distance, value => +(value <= R0)); }

function convexLamina(mask) {
  const points = mask.flatMap((value, i) => value ? [[i % N, Math.floor(i / N)]] : [])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  assert(points.length >= 3);
  const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const half = list => {
    const hull = [];
    for (const point of list) {
      while (hull.length >= 2 && cross(hull.at(-2), hull.at(-1), point) <= 0) hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  const hull = half(points).concat(half([...points].reverse()));
  assert(hull.length >= 3);
  return Array.from({ length: CELLS }, (_, i) => +hull.every((point, j) =>
    cross(point, hull[(j + 1) % hull.length], [i % N, Math.floor(i / N)]) >= 0));
}

function components4(mask) {
  const seen = new Uint8Array(CELLS), sizes = [];
  for (let start = 0; start < CELLS; start++) if (mask[start] && !seen[start]) {
    const q = [start]; seen[start] = 1;
    for (let head = 0; head < q.length; head++) {
      const i = q[head], x = i % N, y = Math.floor(i / N);
      for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (xx >= 0 && xx < N && yy >= 0 && yy < N) {
          const j = yy * N + xx;
          if (mask[j] && !seen[j]) { seen[j] = 1; q.push(j); }
        }
      }
    }
    sizes.push(q.length);
  }
  return sizes.sort((a, b) => b - a);
}

function compare(a, b) {
  let shared = 0, union = 0, xor = 0;
  for (let i = 0; i < CELLS; i++) { shared += +(a[i] && b[i]); union += +(a[i] || b[i]); xor += +(a[i] !== b[i]); }
  return { shared, union, xor, jaccard: union ? shared / union : 1 };
}

function candidateData(context, inventory, selection, priorText) {
  const chosen = new Map(selection.selected.map(row => [row.id, row]));
  assert.equal(chosen.size, 5);
  const events = selection.selected.map(selected => {
    const row = context.commits.find(value => value.id === selected.id), descriptor = row.descriptor;
    const nodes = descriptor.centerline.map(node => node.index);
    const P = descriptor.mask.slice(), K = sleeve(distances(nodes)), H = convexLamina(K);
    const cases = [P, K, H].map((mask, index) => ({ id: ['P', 'K', 'H'][index], mask,
      cells: count(mask), components4: components4(mask), maskSha256: maskHash(mask) }));
    const P1P2 = ['trail-plate-1', 'trail-plate-2'].includes(row.id);
    assert(!P1P2);
    return { id: row.id, commitSeconds: row.bornAtSimulationTimeMs / 1000,
      selectedFor: selected.criterion, scopeNodes: nodes, scopeEdges: descriptor.edges,
      metrics: inventory.inventory.find(value => value.id === row.id), cases };
  });
  const old = JSON.parse(priorText);
  for (let i = 0; i < 2; i++) {
    const prior = old.events[i];
    for (const code of ['P', 'K', 'H']) {
      const regenerated = code === 'P' ? context.commits[i].descriptor.mask
        : code === 'K' ? sleeve(distances(context.commits[i].descriptor.centerline.map(node => node.index)))
          : convexLamina(sleeve(distances(context.commits[i].descriptor.centerline.map(node => node.index))));
      assert.deepEqual(regenerated, prior.cases.find(item => item.id === code).mask, `prior ${prior.id}/${code} exact definition`);
    }
  }
  return {
    schema: 'ant-body-diverse-scope-atlas-data-v1',
    display: { sourceGrid: [N, N], panelPixels: [320, 320], mapping: '96x96 source-cell nearest-neighbor to 320x320; same world frame; y down',
      candidateMaskFills: { P: '#667085', K: '#8fc3ff', H: '#f3c6a5' }, scopeOverlay: '#102a43' },
    selection: selection.selected,
    inputBoundary: { productionMask: 'frozen digest verified for all 36', scopeGraph: 'existing replay reconstruction; see structural-inventory provenance',
      UWSOmitted: 'exact commit-time chemical B rasters are absent for these later events; no approximation' },
    events
  };
}

async function loadData() {
  const [contextBytes, inventoryText, selectionText, priorText] = await Promise.all([
    readFile(CONTEXT), readFile(resolve(BASE, 'structural-inventory.json'), 'utf8'),
    readFile(resolve(BASE, 'selection-receipt.json'), 'utf8'), readFile(PRIOR, 'utf8')
  ]);
  const context = JSON.parse(gunzipSync(contextBytes)), inventory = JSON.parse(inventoryText), selection = JSON.parse(selectionText);
  const result = candidateData(context, inventory, selection, priorText);
  return { result, contextBytes, inventoryText, selectionText, priorText };
}

const args = new Set(process.argv.slice(2));
if (args.has('--self-test')) {
  const mask = Array(CELLS).fill(0); [0, 2, 192, 194].forEach(i => { mask[i] = 1; });
  const filled = convexLamina(mask);
  assert.equal(count(filled), 9); assert(filled[97]); assert.equal(filled[3], 0);
  assert.equal(sleeve(Float64Array.from([0, .012, .01201])).join(''), '110');
  assert.deepEqual(compare(mask, mask), { shared: 4, union: 4, xor: 0, jaccard: 1 });
  console.log('PASS: fixed-radius boundary, convex lattice fill, exact mask comparison');
} else {
  const { result } = await loadData();
  const input = json(result), targetData = resolve(BASE, 'atlas-data.json');
  const targetAnalysis = resolve(BASE, 'analysis.json');
  const analysis = {
    schema: 'ant-body-diverse-scope-result-v1',
    selection: result.selection,
    events: result.events.map(event => ({ id: event.id, commitSeconds: event.commitSeconds, selectedFor: event.selectedFor,
      structural: { nodeCount: event.metrics.nodeCount, edgeCount: event.metrics.edgeCount, junctionCount: event.metrics.junctionCount,
        terminalCount: event.metrics.terminalCount, bbox: event.metrics.bbox, bboxAspectRatio: event.metrics.bboxAspectRatio,
        tortuosity: event.metrics.tortuosity, cycleRank: event.metrics.cycleRank },
      cases: event.cases.map(({ id, cells, components4, maskSha256 }) => ({ id, cells, components4, maskSha256 })),
      comparisons: [
        { a: 'P', b: 'K', ...compare(event.cases[0].mask, event.cases[1].mask) },
        { a: 'K', b: 'H', ...compare(event.cases[1].mask, event.cases[2].mask) },
        { a: 'P', b: 'H', ...compare(event.cases[0].mask, event.cases[2].mask) }
      ],
      localHistoryCandidates: { K: 'rendered exactly', U: 'omitted: exact commit-time B raster unavailable',
        W: 'omitted: exact commit-time B raster unavailable', S: 'omitted: exact commit-time B raster unavailable' }
    }))
  };
  const expected = [[targetData, input], [targetAnalysis, json(analysis)]];
  if (args.has('--check')) for (const [path, value] of expected) assert.equal(await readFile(path, 'utf8'), value);
  else {
    await mkdir(BASE, { recursive: true });
    for (const [path, value] of expected) await writeFile(path, value, { flag: 'wx' });
  }
  console.log(JSON.stringify({ events: analysis.events.map(event => ({ id: event.id,
    areas: Object.fromEntries(event.cases.map(item => [item.id, item.cells])), comparisons: event.comparisons })) }));
}
