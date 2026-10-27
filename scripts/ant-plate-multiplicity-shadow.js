import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMultiplicitySelectors } from './lib/antGeodesicMultiplicity.js';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = resolve(root, 'docs/ant/evidence/2026-10-28-plate-formation-gate/data');
const sha = value => createHash('sha256').update(value).digest('hex');
const bytes = await readFile(resolve(base, 'history-packet.json.gz'));
const receipt = JSON.parse(await readFile(resolve(base, 'capture.json'), 'utf8'));
assert.equal(sha(bytes), receipt.packetSha256);
const packet = JSON.parse(gunzipSync(bytes));
const source = await readFile(resolve(root, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
assert.equal(sha(source), receipt.sourceHashes['src/lib/agents/ant/TrailPlateBirth.js']);
const modes = await loadMultiplicitySelectors(source);
const count = mask => mask.reduce((n, value) => n + Boolean(value), 0);
const indices = mask => Array.from(mask.keys()).filter(i => mask[i]);
const overlap = (a, b) => a.reduce((n, value, i) => n + Boolean(value && b[i]), 0);
const toMask = cells => { const a = new Uint8Array(96 * 96); for (const c of cells) a[c] = 1; return a; };
const geometryKeys = ['mask', 'centerline', 'edges', 'principalPath', 'widths', 'pickups', 'source', 'target', 'material', 'metrics'];

function compilerStats(descriptor, omitted) {
  const topology = compileSurfaceTopology({ plates: [descriptor] });
  const grid = topology.nodeGridIndices, seen = new Set(), components = [], componentByNode = [];
  for (let start = 0; start < grid.length; start++) if (!seen.has(start)) {
    const queue = [start], id = components.length; seen.add(start);
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head]; componentByNode[node] = id;
      for (let d = 0; d < 4; d++) {
        const next = topology.neighborIndices[node * 4 + d];
        if (next >= 0 && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    components.push(queue.length);
  }
  const solverSet = new Set(grid);
  return { nodes: grid.length, componentSizes: components.sort((a, b) => b - a),
    pickupNodes: Array.from(topology.pickupNodeIndices),
    pickupsSameComponent: componentByNode[topology.pickupNodeIndices[0]] === componentByNode[topology.pickupNodeIndices[1]],
    solverGridIndices: Array.from(grid),
    omittedCellsInOccupiedSolverBin: omitted.filter(c => solverSet.has(Math.floor(c / 96 / 3) * 32 + Math.floor((c % 96) / 3))).length };
}

const started = performance.now();
function run() {
  const rows = [], lockedBirths = [];
  for (const frame of packet.analyses) {
    assert.ok(performance.now() - started < 60000, '60 s frozen shadow boundary');
    const args = [Uint8Array.from(frame.maps.E_qualified), Float32Array.from(frame.maps.D_support), Float32Array.from(frame.maps.B_memory)];
    const before = sha(JSON.stringify(args.map(a => Array.from(a))));
    const candidates = Object.fromEntries(Object.entries(modes).map(([name, mode]) => [name, mode.selectCandidate(...args)]));
    assert.equal(sha(JSON.stringify(args.map(a => Array.from(a)))), before, 'selectors mutate no input');
    const production = candidates.production;
    assert.equal(Boolean(production), Boolean(frame.candidate));
    if (!production) { rows.push({ tick: frame.tick, time: frame.simulationTimeMs, candidates: null }); continue; }
    assert.deepEqual(production.path, frame.principalPath);
    assert.deepEqual(indices(production.component), indices(frame.maps.I_retained_network));
    assert.deepEqual(Array.from(production.mask), frame.maps.J_candidate_ribbon);
    assert.equal(production.meanChemical, frame.candidate.meanChemical);
    assert.equal(production.meanSupport, frame.candidate.meanSupport);
    const O = toMask(indices(frame.maps.H_boundary_length_eligible).filter(c => !production.component[c]));
    const output = {};
    for (const [name, candidate] of Object.entries(candidates)) {
      assert.deepEqual(candidate.source, production.source);
      assert.deepEqual(candidate.target, production.target);
      assert.ok(Math.abs(candidate.geodesicLength - production.geodesicLength) <= 1e-12);
      assert.deepEqual(candidate.supportedMask, production.supportedMask);
      assert.equal(candidate.meanChemical, production.meanChemical);
      assert.equal(candidate.meanSupport, production.meanSupport);
      if (name === 'allShortest') {
        assert.deepEqual(candidate.path, production.path);
        assert.equal(overlap(production.component, candidate.component), count(production.component));
        assert.equal(overlap(production.mask, candidate.mask), count(production.mask));
      }
      const network = indices(candidate.component), ribbon = indices(candidate.mask);
      output[name] = { network, ribbon, principalPath: candidate.path, networkCells: network.length,
        ribbonCells: ribbon.length, omittedNetworkRecovery: overlap(O, candidate.component),
        omittedRibbonCoverage: overlap(O, candidate.mask),
        networkSymmetricDifference: count(candidate.component) + count(production.component) - 2 * overlap(candidate.component, production.component),
        ribbonSymmetricDifference: count(candidate.mask) + count(production.mask) - 2 * overlap(candidate.mask, production.mask) };
    }
    rows.push({ tick: frame.tick, time: frame.simulationTimeMs, omitted: count(O), candidates: output });
    if (!frame.birthsThisTick) continue;
    const actual = packet.births.find(b => b.payload.bornAtSimulationTimeMs === frame.simulationTimeMs).payload;
    const compiled = {};
    for (const [name, mode] of Object.entries(modes)) {
      const birth = new mode.TrailPlateBirth();
      const descriptor = birth.createDescriptor({ ...candidates[name], stableSeconds: frame.candidate.stableSeconds,
        similarity: actual.provenance.corridorSimilarity }, frame.simulationTimeMs);
      descriptor.id = actual.id;
      if (name === 'production') for (const key of geometryKeys) assert.deepEqual(descriptor[key], actual[key], `birth geometry ${key}`);
      const laterFeet = packet.contacts.filter(e => e.simulationTimeMs > frame.simulationTimeMs).flatMap(e => e.contacts)
        .filter(c => c.position.x >= 0 && c.position.x <= 1 && c.position.y >= 0 && c.position.y <= 1);
      const contactCells = laterFeet.map(c => Math.round(c.position.y * 95) * 96 + Math.round(c.position.x * 95));
      compiled[name] = { ...compilerStats(descriptor, indices(O)),
        futureOriginalFootPositionsInsideMask: contactCells.filter(c => descriptor.mask[c]).length,
        futureOriginalFootPositions: contactCells.length,
        futureOriginalFeetInAddedMask: contactCells.filter(c => descriptor.mask[c] && !production.mask[c]).length,
        descriptor };
    }
    lockedBirths.push({ tick: frame.tick, time: frame.simulationTimeMs, id: actual.id, modes: compiled });
  }
  return { schema: 'ant-shortest-route-multiplicity-v1', packetSha256: sha(bytes),
    sourceHash: sha(source), transforms: Object.fromEntries(Object.entries(modes).map(([n, m]) => [n, m.transformedHash])),
    validity: { analyses: rows.length, productionCandidateParity: true, sourceTargetAndSupportedMaskFixed: true,
      allShortestSuperset: true, inputsUnchanged: true, lockedActualBirthTimesOnly: true }, rows, lockedBirths };
}

let first, second; const random = Math.random;
try { Math.random = () => { throw new Error('selector RNG use'); }; first = JSON.stringify(run()); second = JSON.stringify(run()); }
finally { Math.random = random; }
assert.equal(first, second);
const target = resolve(base, 'multiplicity.json');
if (process.argv.includes('--check')) assert.equal(await readFile(target, 'utf8'), first + '\n');
else {
  await assert.rejects(readFile(target), { code: 'ENOENT' });
  await writeFile(target, first + '\n');
  await writeFile(resolve(base, 'multiplicity-validation.json'), JSON.stringify({ resultSha256: sha(first + '\n'),
    deterministicRerun: true, rngTripwire: true, sourceHash: sha(source),
    helperSha256: sha(await readFile(resolve(root, 'scripts/lib/antGeodesicMultiplicity.js'))),
    runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))) }, null, 2) + '\n');
}
const result = JSON.parse(first);
console.log(JSON.stringify({ validity: result.validity, lockedBirths: result.lockedBirths.map(b => ({ ...b,
  modes: Object.fromEntries(Object.entries(b.modes).map(([name, m]) => { const { descriptor, solverGridIndices, ...brief } = m; return [name, { ...brief,
    ...result.rows.find(r => r.tick === b.tick).candidates[name], network: undefined, ribbon: undefined, principalPath: undefined }]; })) })) }, null, 2));
