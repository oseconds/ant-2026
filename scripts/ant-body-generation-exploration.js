import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRAIL_PLATE_HALF_WIDTH_RANGE } from '../src/lib/agents/ant/TrailPlateBirth.js';
import { atlasHtml } from './lib/antBodyAtlasHtml.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASE = resolve(ROOT, 'docs/ant/evidence/2026-10-28-plate-body-generation-exploration');
const PRIOR = resolve(ROOT, 'docs/ant/evidence/2026-10-28-space-time-attachment-support');
const N = 96, CELLS = N * N;
const [R0, R1] = TRAIL_PLATE_HALF_WIDTH_RANGE;
const sha = b => createHash('sha256').update(b).digest('hex');
const count = mask => mask.reduce((a, b) => a + b, 0);
const json = x => JSON.stringify(x) + '\n';
const defs = [
  { id: 'P', title: 'Actual reference', family: 'Reference', scaffold: 'selected', input: 'actual descriptor',
    formula: 'unchanged frozen production mask and material', historyRole: 'current authored law', limitations: 'not a new body family' },
  { id: 'K', title: 'Constant sleeve', family: 'Scaffold control', scaffold: 'selected', input: 'none for geometry',
    formula: 'd(x,I) <= .012', historyRole: 'history is withheld from cross-section', limitations: 'existing lower width bound; diagnostic control only' },
  { id: 'S', title: 'Selected / chemical contour', family: 'History-shaped sleeve', scaffold: 'selected', input: 'chemical B',
    formula: 'd(x,I) <= .012 + .018*B(x)', historyRole: 'chemical memory sets transverse contour', limitations: 'authored linear map, not measured material spreading' },
  { id: 'R', title: 'Alternatives / chemical contour', family: 'Redundant-connection body', scaffold: 'terminal', input: 'chemical B',
    formula: 'd(x,T) <= .012 + .018*B(x)', historyRole: 'retain supported alternative connections; chemistry sets contour', limitations: 'terminal hull is an explanatory graph, not proven independent load paths' },
  { id: 'M', title: 'Alternatives / mechanical contour', family: 'History-shaped sleeve', scaffold: 'terminal', input: 'raw SurfaceField C',
    formula: 'd(x,T) <= .012 + .018*C(x)', historyRole: 'local contact compaction shapes transverse contour', limitations: 'no levee assumption; fixed raw0–1 scale may have little geometric effect' },
  { id: 'L', title: 'Reconnection pockets', family: 'Interstitial lamina', scaffold: 'terminal', input: 'chemical B at sleeve',
    formula: 'R union bounded4-complement pockets of T', historyRole: 'chemistry shapes web; closed connection pockets span an interior', limitations: 'spanning is a new authored interpretation; compare8-complement before treating faces as physical' },
  { id: 'Q', title: 'Character-only comparator', family: 'Whole-body character', scaffold: 'selected', input: 'mean B and production support D',
    formula: 'K mask; existing coefficient mapping over K', historyRole: 'history changes whole-Plate coefficients, not membership or width', limitations: 'no local thickness/stiffness map; no sound or perceptual result' },
  { id: 'T', title: 'Alternatives / constant sleeve', family: 'Scaffold control', scaffold: 'terminal', input: 'none for geometry',
    formula: 'd(x,T) <= .012', historyRole: 'withhold history to test how much dense scaffold already fills', limitations: 'diagnostic floor-dominance control, not a new body family' },
  { id: 'W', title: 'Constructive chemical sections', family: 'History-shaped sleeve', scaffold: 'selected', input: 'chemical B at scaffold nodes',
    formula: 'union discs centered at i in I, radius .012+.018*B(i)', historyRole: 'each structural sample carries its local chemical cross-section', limitations: 'authored bounded radial growth; no measured material transport or physical field law' },
  { id: 'U', title: 'Uniform mean sections', family: 'History-location control', scaffold: 'selected', input: 'mean chemical B over I',
    formula: 'same W scaffold; every radius = .012+.018*mean_I(B)', historyRole: 'retain mean widening while removing local radius variation', limitations: 'preserves mean radius, not exact raster area or edge curvature; diagnostic only' }
].map(d => ({ ...d, finiteOrganization: d.scaffold === 'terminal' ? 'finite actual terminal-path hull' : 'finite actual selected network' }));

export function maskFromCells(cells) {
  const m = Array(CELLS).fill(0);
  for (const i of cells) { assert.ok(Number.isInteger(i) && i >= 0 && i < CELLS); m[i] = 1; }
  return m;
}

export function components(mask, diagonal = false) {
  const seen = new Uint8Array(CELLS), parts = [];
  for (let start = 0; start < CELLS; start++) if (mask[start] && !seen[start]) {
    const q = [start]; seen[start] = 1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % N, y = Math.floor(i / N);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
        const xx = x + dx, yy = y + dy, j = yy * N + xx;
        if (xx >= 0 && xx < N && yy >= 0 && yy < N && mask[j] && !seen[j]) { seen[j] = 1; q.push(j); }
      }
    }
    parts.push(q);
  }
  return parts.sort((a, b) => b.length - a.length || a[0] - b[0]);
}

export function distances(scaffold) {
  assert.ok(scaffold.length);
  const d = new Float64Array(CELLS).fill(Infinity), extent = Math.ceil(R1 * 95);
  for (const i of scaffold) {
    const x = i % N, y = Math.floor(i / N);
    for (let dy = -extent; dy <= extent; dy++) for (let dx = -extent; dx <= extent; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < N && yy >= 0 && yy < N) {
        const j = yy * N + xx; d[j] = Math.min(d[j], Math.hypot(dx, dy) / 95);
      }
    }
  }
  return d;
}

export function sleeve(d, field = null) {
  if (field) assert.ok(field.length === CELLS && field.every(x => Number.isFinite(x) && x >= 0 && x <= 1));
  return Array.from(d, (distance, i) => +(distance <= R0 + (R1 - R0) * (field?.[i] ?? 0)));
}

export function sweptSections(scaffold, field) {
  assert.ok(field.length === CELLS && field.every(x => Number.isFinite(x) && x >= 0 && x <= 1));
  const mask = Array(CELLS).fill(0);
  for (const i of scaffold) {
    const radius = R0 + (R1 - R0) * field[i], extent = Math.ceil(radius * 95);
    const x = i % N, y = Math.floor(i / N);
    for (let dy = -extent; dy <= extent; dy++) for (let dx = -extent; dx <= extent; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < N && yy >= 0 && yy < N && Math.hypot(dx, dy) / 95 <= radius) mask[yy * N + xx] = 1;
    }
  }
  return mask;
}

export function pockets(scaffold, diagonal) {
  const graph = maskFromCells(scaffold), inverse = graph.map(x => 1 - x);
  const bounded = components(inverse, diagonal).filter(part => !part.some(i => i % N === 0 || i % N === N - 1 || i < N || i >= CELLS - N));
  return { mask: maskFromCells(bounded.flat()), sizes: bounded.map(p => p.length) };
}

export function materialFor(mask, B, D) {
  const meanB = meanOn(mask, B), meanD = meanOn(mask, D);
  return { stiffness: Math.min(1.15, Math.max(.65, .65 + .5 * meanB)),
    density: 1 + .2 * Math.min(1, Math.max(0, meanD / .08)),
    damping: Math.min(.45, Math.max(.25, .25 + .2 * meanB)) };
}

function compare(a, b) {
  let intersection = 0, union = 0;
  for (let i = 0; i < CELLS; i++) { intersection += +(a[i] && b[i]); union += +(a[i] || b[i]); }
  return { intersection, union, jaccard: union ? intersection / union : null };
}
function meanOn(mask, field) { return mask.reduce((s, x, i) => s + x * field[i], 0) / count(mask); }
function stats(a) {
  const s = [...a].sort((a, b) => a - b);
  return { min: s[0], median: s[Math.floor((s.length - 1) / 2)], max: s.at(-1), mean: s.reduce((x, y) => x + y, 0) / s.length };
}

async function extract() {
  const spec = { commit: '0d5096a920e1ebb2086fa1dae782c5d4e871b590',
    path: 'docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz',
    sha256: '909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc' };
  const bytes = execFileSync('git', ['show', `${spec.commit}:${spec.path}`], { maxBuffer: 64 * 1024 ** 2 });
  assert.equal(sha(bytes), spec.sha256);
  const history = JSON.parse(gunzipSync(bytes));
  const sources = [spec], load = async name => {
    const path = resolve(PRIOR, `data/${name}`), b = await readFile(path);
    sources.push({ commit: '54346c0a3018a75ea3fdd94df74f41d1412b9578', path: path.slice(ROOT.length + 1).replaceAll('\\', '/'), sha256: sha(b) });
    return JSON.parse(gunzipSync(b));
  };
  const atlas = await load('inputs/event-support-atlas.json.gz');
  const ownership = await load('inputs/ownership-arrays.json.gz');
  const previous = await load('c1-masks.json.gz');
  const events = history.births.map(({ payload: plate }, ordinal) => {
    const frame = history.analyses.find(a => Math.abs(a.simulationTimeMs - plate.bornAtSimulationTimeMs) < 1e-6);
    assert.ok(frame);
    const a = atlas.atlases[ordinal], own = ownership.plates.find(p => p.id === plate.id), prev = previous.events.find(e => e.id === plate.id);
    const terminal = a.cells.filter(c => Object.values(c.classification.atBirth).some(Boolean)
      && !c.classification.atBirth.pendant).map(c => c.cell).sort((x, y) => x - y);
    const selected = plate.centerline.map(n => n.index).sort((x, y) => x - y);
    assert.ok(selected.every(i => terminal.includes(i)));
    assert.deepEqual(maskFromCells(selected), frame.maps.I_retained_network);
    return { id: plate.id, timeSeconds: plate.bornAtSimulationTimeMs / 1000, plate,
      event: a.event, fields: { chemical: frame.maps.B_memory, surface: frame.maps.C_surface,
        support: frame.maps.D_support, newChemical: own.chemical.postAnchorEffect, newSurface: own.surface.conditionalEndpointDifference },
      scaffolds: { selected, terminal }, H: frame.maps.H_boundary_length_eligible,
      E: frame.maps.E_qualified, production: plate.mask, c0: maskFromCells(prev.masks.C0), c1: maskFromCells(prev.masks.C1_8),
      ownership: { chemicalCarried: own.chemical.carriedInAtCommit, surfaceCarried: own.surface.noNewContactBaseline,
        feetCarried: own.feet.carriedIn, feetNew: own.feet.ownedNew } };
  });
  assert.equal(events.length, 2);
  assert.equal(events[0].scaffolds.terminal.length, 510);
  const packet = { schema: 'ant-body-generation-inputs-v1', grid: N,
    scope: { main: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785', parent: '54346c0a3018a75ea3fdd94df74f41d1412b9578',
      seed: history.seed, hz: 60, audio: 'Off', heading: 'production H0', naturalRuns: 0, cases: 'actual first two commits, not selected by appearance' },
    sourceArtifacts: sources, events };
  const target = resolve(BASE, 'data/inputs.json.gz');
  await assert.rejects(readFile(target), { code: 'ENOENT' });
  await writeFile(target, gzipSync(json(packet), { level: 9 }));
}

function generate(packet) {
  const events = packet.events.map(e => {
    const { chemical: B, surface: C, support: D } = e.fields;
    const di = distances(e.scaffolds.selected), dt = distances(e.scaffolds.terminal);
    const p4 = pockets(e.scaffolds.terminal, false), p8 = pockets(e.scaffolds.terminal, true);
    const masks = { P: e.production.slice(), K: sleeve(di), S: sleeve(di, B), R: sleeve(dt, B), M: sleeve(dt, C) };
    masks.L = masks.R.map((v, i) => +(v || p4.mask[i])); masks.Q = masks.K.slice();
    masks.T = sleeve(dt); masks.W = sweptSections(e.scaffolds.selected, B);
    const meanScaffoldB = e.scaffolds.selected.reduce((s, i) => s + B[i], 0) / e.scaffolds.selected.length;
    masks.U = sweptSections(e.scaffolds.selected, Array(CELLS).fill(meanScaffoldB));
    const cases = defs.map(def => {
      const mask = masks[def.id], scaffold = e.scaffolds[def.scaffold];
      const field = def.id === 'M' ? C : B;
      const radii = scaffold.map(i => R0 + (R1 - R0) * (def.id === 'U' ? meanScaffoldB : field[i]));
      const components4 = components(mask).map(p => p.length), components8 = components(mask, true).map(p => p.length);
      return { id: def.id, mask, scaffold, inputField: ['K', 'T'].includes(def.id) ? 'none' : def.id === 'M' ? 'surface' : 'chemical',
        material: def.id === 'Q' ? materialFor(mask, B, D) : e.plate.material,
        metrics: { cells: count(mask), components4, components8,
          productionJaccard: compare(mask, e.production).jaccard, c0Jaccard: compare(mask, e.c0).jaccard,
          scaffoldCells: scaffold.length, meanB: meanOn(mask, B), meanC: meanOn(mask, C), meanSupport: meanOn(mask, D),
          zeroOwnedFeetCells: mask.reduce((n, v, i) => n + +(v && e.ownership.feetNew[i] === 0), 0),
          outsideECells: mask.reduce((n, v, i) => n + +(v && !e.E[i]), 0),
          prototypeScaffoldRadius: ['S', 'R', 'M', 'L', 'W', 'U'].includes(def.id) ? stats(radii) : null,
          observedBorderCells: mask.reduce((n, v, i) => n + +(v && (i < N || i >= CELLS - N || i % N === 0 || i % N === N - 1)), 0) } };
    });
    return { ...e, cases, pockets: { complement4: p4.sizes, complement8: p8.sizes,
      maskJaccard: compare(p4.mask, p8.mask).jaccard,
      lamina8: masks.R.map((v, i) => +(v || p8.mask[i])),
      addedBeyondSleeve: masks.L.reduce((n, v, i) => n + +(v && !masks.R[i]), 0) },
      maskComparisons: [['K', 'S'], ['S', 'R'], ['R', 'M'], ['R', 'L'], ['K', 'Q'], ['T', 'R'], ['T', 'M'], ['S', 'W'], ['K', 'W'], ['W', 'U']].map(([a, b]) => ({ a, b, ...compare(masks[a], masks[b]) })) };
  });
  const paired = defs.map(d => ({ id: d.id, ...compare(events[0].cases.find(c => c.id === d.id).mask, events[1].cases.find(c => c.id === d.id).mask) }));
  return { schema: 'ant-body-generation-atlas-v1', grid: N, scope: packet.scope, definitions: defs, events, paired };
}

async function main() {
  await mkdir(resolve(BASE, 'data'), { recursive: true });
  if (process.argv.includes('--extract')) { await extract(); console.log('Extracted frozen P1/P2 inputs; no nature.'); return; }
  if (process.argv.includes('--technical')) { await technical(); return; }
  const input = await readFile(resolve(BASE, 'data/inputs.json.gz')), packet = JSON.parse(gunzipSync(input));
  const before = sha(json(packet)), savedRandom = Math.random;
  let first, second;
  try { Math.random = () => { throw Error('Body generation must consume no RNG'); };
    first = json(generate(packet)); second = json(generate(packet));
  } finally { Math.random = savedRandom; }
  assert.equal(first, second); assert.equal(sha(json(packet)), before);
  const atlas = JSON.parse(first), html = atlasHtml(atlas);
  try {
    const initial = JSON.parse(await readFile(resolve(BASE, 'data/iteration1-results.json')));
    for (const e of initial.events) for (const c of e.cases) {
      const actual = atlas.events.find(x => x.id === e.id).cases.find(x => x.id === c.id);
      assert.equal(sha(json(actual.mask)), c.maskSha256, `initial ${e.id}/${c.id} body unchanged`);
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const results = json({ scope: packet.scope, events: atlas.events.map(e => ({ id: e.id,
    cases: e.cases.map(({ mask, scaffold, ...c }) => ({ ...c, maskSha256: sha(json(mask)) })),
    pockets: { ...e.pockets, lamina8: undefined }, comparisons: e.maskComparisons })), paired: atlas.paired });
  const outputs = { 'data/atlas.json': first, 'data/results.json': results, 'atlas.html': html };
  for (const [p, bytes] of Object.entries(outputs)) {
    const target = resolve(BASE, p);
    if (process.argv.includes('--check')) assert.equal(sha(await readFile(target)), sha(bytes), p);
    else { await assert.rejects(readFile(target), { code: 'ENOENT' }); await writeFile(target, bytes); }
  }
  console.log(results);
}

async function technical() {
  const { compileSurfaceTopology } = await import('../src/lib/audio/compileSurfaceTopology.js');
  const { MaterialStratigraphy } = await import('../src/lib/agents/ant/MaterialStratigraphy.js');
  const atlasBytes = await readFile(resolve(BASE, 'data/atlas.json')), atlas = JSON.parse(atlasBytes);
  const before = sha(atlasBytes), ids = ['P', 'K', 'W', 'U', 'Q'];
  const descriptor = (event, id) => {
    const c = event.cases.find(c => c.id === id);
    return { id: event.id, bornAtSimulationTimeMs: event.plate.bornAtSimulationTimeMs,
      grid: { width: N, height: N }, mask: c.mask.slice(), pickups: structuredClone(event.plate.pickups),
      material: { ...c.material }, meanHalfWidth: event.plate.meanHalfWidth,
      centerline: [], principalPath: [], edges: [],
      provenance: { researchGeometryOnly: true, candidate: id, originalFootCountsNotReattributed: true } };
  };
  const topology = t => {
    const seen = new Uint8Array(t.nodeGridIndices.length), components = [], owner = new Int32Array(t.nodeGridIndices.length).fill(-1);
    for (let i = 0; i < seen.length; i++) if (!seen[i]) {
      const q = [i]; seen[i] = 1;
      for (let h = 0; h < q.length; h++) for (let k = 0; k < 4; k++) {
        const j = t.neighborIndices[q[h] * 4 + k];
        if (j >= 0 && !seen[j]) { seen[j] = 1; q.push(j); }
      }
      q.forEach(j => { owner[j] = components.length; }); components.push(q.length);
    }
    const pickups = Array.from(t.pickupNodeIndices);
    return { nodes: seen.length, components, gridIndices: Array.from(t.nodeGridIndices), pickups,
      pickupComponents: pickups.map(i => owner[i]), pickupsValid: pickups.every(i => i < seen.length),
      materialCoefficients: Array.from(t.materialCoefficients) };
  };
  const single = [];
  for (const event of atlas.events) for (const id of ids) {
    try { const plate = descriptor(event, id), t = compileSurfaceTopology({ plates: [plate] });
      single.push({ event: event.id, id, ok: true, meanHalfWidthHeld: plate.meanHalfWidth,
        ...topology(t), sourceBorderCells: event.cases.find(c => c.id === id).metrics.observedBorderCells });
    } catch (error) { single.push({ event: event.id, id, ok: false, error: error.message }); }
  }
  const stacked = ids.map(id => {
    const material = new MaterialStratigraphy(), plates = atlas.events.map(e => descriptor(e, id));
    const originalHash = sha(json(plates));
    try {
      plates.forEach(p => material.addPlate(p));
      const state = material.getAudioState(), t = compileSurfaceTopology(state);
      assert.equal(sha(json(plates)), originalHash, 'stratigraphy must not mutate fixtures');
      const counts = material.layerCountByCell;
      return { id, ok: true, layers: t.layerIds.length, nodes: t.nodeGridIndices.length,
        overlapCells: Array.from(counts).filter(x => x === 2).length,
        unionCells: Array.from(counts).filter(x => x > 0).length,
        frozenFixtureInputsUnchanged: true, zLinks: t.adjacentLinkNodes.length,
        wholePlateThicknessMeters: material.plateThicknessMeters.slice() };
    } catch (error) { return { id, ok: false, error: error.message }; }
  });
  const projectionComparisons = atlas.events.map(e => {
    const a = single.find(x => x.event === e.id && x.id === 'W'), b = single.find(x => x.event === e.id && x.id === 'U');
    if (!a.ok || !b.ok) return { event: e.id, unavailable: true };
    const A = new Set(a.gridIndices), B = new Set(b.gridIndices), intersection = [...A].filter(i => B.has(i)).length;
    return { event: e.id, Wnodes: A.size, Unodes: B.size, intersection, union: A.size + B.size - intersection,
      sourceMaskDifferent: true, sameSolverOccupancy: A.size === B.size && intersection === A.size,
      caution: 'Matching32 occupancy would not equate96 routing/stratigraphy or listening.' };
  });
  const actualReference = atlas.events.map(e => ({ event: e.id, ...topology(compileSurfaceTopology({ plates: [e.plate] })) }));
  const boundaryChecks = atlas.events.flatMap(e => ['W', 'U'].map(id => {
    const scaffold = e.scaffolds.selected, B = e.fields.chemical;
    const meanB = scaffold.reduce((s, i) => s + B[i], 0) / scaffold.length;
    const overshoots = scaffold.map(i => {
      const radius = R0 + (R1 - R0) * (id === 'U' ? meanB : B[i]);
      const x = i % N / 95, y = Math.floor(i / N) / 95;
      return Math.max(0, radius - Math.min(x, 1 - x, y, 1 - y));
    });
    return { event: e.id, id, sectionSamplesExtendingOutsideFrame: overshoots.filter(x => x > 0).length,
      maxOvershootWorldUnits: Math.max(...overshoots),
      note: 'Finite mathematical disc construction; observed descriptor is clipped and does not establish natural body closure outside the window.' };
  }));
  assert.equal(sha(await readFile(resolve(BASE, 'data/atlas.json'))), before);
  const output = json({ scope: 'Predeclared survivors/references only; no audio/nature', ids, single, stacked, projectionComparisons, actualReference, boundaryChecks,
    atlasSha256: before, inputUnchanged: true });
  const target = resolve(BASE, 'data/technical.json');
  if (process.argv.includes('--check')) assert.equal(sha(await readFile(target)), sha(output));
  else { await assert.rejects(readFile(target), { code: 'ENOENT' }); await writeFile(target, output); }
  console.log(output);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
