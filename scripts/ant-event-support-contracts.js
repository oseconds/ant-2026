import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { MaterialStratigraphy } from '../src/lib/agents/ant/MaterialStratigraphy.js';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const prior = resolve(root, 'docs/ant/evidence/2026-10-28-plate-formation-gate/data');
const out = resolve(root, 'docs/ant/evidence/2026-10-28-event-scoped-material-support/data');
const sha = b => createHash('sha256').update(b).digest('hex');
const input = await readFile(resolve(prior, 'history-packet.json.gz'));
assert.equal(sha(input), JSON.parse(await readFile(resolve(prior, 'capture.json'), 'utf8')).packetSha256);
const packet = JSON.parse(gunzipSync(input));
const assocBytes = await readFile(resolve(out, 'association.json'));
assert.equal(sha(assocBytes), JSON.parse(await readFile(resolve(out, 'association-validation.json'), 'utf8')).resultSha256);
const association = JSON.parse(assocBytes);
function selectSupport(frames, increments, mode) {
  const closing = frames.at(-1), sets = frames.map(cells => new Set(cells));
  return closing.filter(c => increments[c] > 0 && (mode === 'closing' || sets.every(s => s.has(c)))).sort((a, b) => a - b);
}
assert.deepEqual(selectSupport([[0, 1], [0, 2]], [1, 0, 1], 'core'), [0]);
assert.deepEqual(selectSupport([[0, 1], [0, 2]], [1, 0, 1], 'closing'), [0, 2]);
assert.deepEqual(selectSupport([[0]], [0], 'core'), []);
function components(cells, size, diagonal = false) {
  const unseen = new Set(cells), result = [];
  while (unseen.size) {
    const first = unseen.values().next().value, queue = [first]; unseen.delete(first);
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head], x = c % size, y = Math.floor(c / size);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size && unseen.delete(yy * size + xx)) queue.push(yy * size + xx);
      }
    }
    result.push(queue.sort((a, b) => a - b));
  }
  return result.sort((a, b) => b.length - a.length || a[0] - b[0]);
}
const started = performance.now();
function run() {
  const before = sha(JSON.stringify(association));
  const cases = association.events.map((event, i) => {
    assert.ok(event.mechanical.validity.exact);
    const actual = packet.births[i].payload;
    return Object.fromEntries(['core', 'closing'].map(mode => {
      assert.ok(performance.now() - started < 30000, '30 s support-contract boundary');
      const frames = event.frames.map(f => f.H8), cells = selectSupport(frames, event.mechanical.retainedIncrementValues, mode);
      const mask = new Array(9216).fill(0); for (const c of cells) mask[c] = 1;
      const source4 = components(cells, 96), source8 = components(cells, 96, true);
      const coarse = [...new Set(cells.map(c => Math.floor(Math.floor(c / 96) / 3) * 32 + Math.floor(c % 96 / 3)))].sort((a, b) => a - b);
      const solverComponents = components(coarse, 32);
      const descriptor = { id: `event-support-${mode}-${i + 1}`, bornAtSimulationTimeMs: actual.bornAtSimulationTimeMs,
        grid: actual.grid, mask, edges: [], pickups: actual.pickups, material: actual.material, meanHalfWidth: actual.meanHalfWidth };
      let compiler;
      try {
        const t = compileSurfaceTopology({ plates: [descriptor] });
        assert.deepEqual(Array.from(t.nodeGridIndices), coarse);
        const pickupGridCells = Array.from(t.pickupNodeIndices, n => t.nodeGridIndices[n]);
        const pickedComponents = new Set(pickupGridCells.map(c => solverComponents.findIndex(a => a.includes(c))));
        compiler = { valid: true, nodes: t.nodeGridIndices.length, pickupGridCells,
          pickupComponents: [...pickedComponents], nodesOutsidePickupComponents: solverComponents.filter((a, j) => !pickedComponents.has(j)).reduce((n, a) => n + a.length, 0) };
      } catch (error) { compiler = { valid: false, error: error.message }; }
      return [mode, { cells, descriptor, source4ComponentSizes: source4.map(c => c.length), source8ComponentSizes: source8.map(c => c.length),
        projected32ComponentSizes: solverComponents.map(c => c.length),
        projectionSemantics: 'exact compiler OR-bin projection with edges=[]; not completed compilation if pickups fail', compiler }];
    }));
  });
  const reuse = Object.fromEntries(['core', 'closing'].map(mode => {
    const s = new MaterialStratigraphy(); for (const pair of cases) assert.ok(s.addPlate(pair[mode].descriptor));
    const first = new Set(cases[0][mode].cells), overlap = cases[1][mode].cells.filter(c => first.has(c)).length;
    const columnCounts = Array.from(s.layerCountByCell);
    assert.equal(columnCounts.filter(n => n === 2).length, overlap);
    return [mode, { layers: s.plates.length, firstCells: cases[0][mode].cells.length, secondCells: cases[1][mode].cells.length,
      overlap, union: columnCounts.filter(Boolean).length, maxColumnCount: Math.max(...columnCounts), noduleAdvancePerformed: false }];
  }));
  const counterexample = Object.fromEntries(['core', 'closing'].map(mode => {
    const committed = [], union = new Set(), increments = new Array(64).fill(1);
    const steps = [16, 32, 48, 64].map(count => {
      const region = Array.from({ length: count }, (_, c) => c), support = selectSupport([region, region, region], increments, mode);
      committed.push(Object.freeze([...support])); for (const c of support) union.add(c);
      assert.equal(support.length, count);
      return { allowedEvent: committed.length, qualifiedAndReinforcedCells: count, committedCells: support.length, cumulativeUnion: union.size };
    });
    assert.equal(committed[0].length, 16); assert.equal(union.size, 64);
    return [mode, { steps, finiteImmutableLayers: true, cumulativeUnionEqualsAvailableRegion: true,
      scope: 'logical input fixture; externally supplied events; not natural G or a 600 s prediction; WHERE alone does not reject this expanding persistent traffic' }];
  }));
  assert.equal(sha(JSON.stringify(association)), before);
  return { schema: 'ant-event-support-contracts-v1', packetSha256: sha(input), associationSha256: sha(assocBytes),
    cases, reuse, counterexample, sourceHashes: { compiler: shaSource.compiler, stratigraphy: shaSource.stratigraphy } };
}
const shaSource = { compiler: sha(await readFile(resolve(root, 'src/lib/audio/compileSurfaceTopology.js'))),
  stratigraphy: sha(await readFile(resolve(root, 'src/lib/agents/ant/MaterialStratigraphy.js'))) };
let first, second; const random = Math.random;
try { Math.random = () => { throw new Error('support-contract RNG use'); }; first = JSON.stringify(run()); second = JSON.stringify(run()); }
finally { Math.random = random; }
assert.equal(first, second);
const target = resolve(out, 'contracts.json');
if (process.argv.includes('--check')) assert.equal(await readFile(target, 'utf8'), first + '\n');
else {
  await assert.rejects(readFile(target), { code: 'ENOENT' }); await writeFile(target, first + '\n');
  await writeFile(resolve(out, 'contracts-validation.json'), JSON.stringify({ resultSha256: sha(first + '\n'), deterministicRerun: true, rngTripwire: true,
    runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))) }, null, 2) + '\n');
}
const result = JSON.parse(first);
console.log(JSON.stringify({ cases: result.cases.map(pair => Object.fromEntries(Object.entries(pair).map(([mode, c]) => [mode, {
  cells: c.cells.length, source4ComponentSizes: c.source4ComponentSizes, source8ComponentSizes: c.source8ComponentSizes,
  projected32ComponentSizes: c.projected32ComponentSizes, compiler: c.compiler }]))), reuse: result.reuse, counterexample: result.counterexample }, null, 2));
