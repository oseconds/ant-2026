import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(root, 'docs/ant/evidence/2026-10-28-space-time-attachment-support');
const inputs = resolve(out, 'data/inputs');
const grid = 96, cells = grid ** 2;
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const readGzipJson = async path => JSON.parse(gunzipSync(await readFile(path)));
const count = mask => mask.reduce((sum, value) => sum + value, 0);
const indices = mask => Array.from(mask, (value, cell) => value ? cell : -1).filter(cell => cell >= 0);

function maskFromCells(list) {
  const mask = new Uint8Array(cells);
  for (const cell of list) {
    assert.ok(Number.isInteger(cell) && cell >= 0 && cell < cells);
    mask[cell] = 1;
  }
  return mask;
}

function components(mask, diagonal = true) {
  const seen = new Uint8Array(cells), result = [];
  for (let first = 0; first < cells; first += 1) if (mask[first] && !seen[first]) {
    const queue = [first]; seen[first] = 1;
    for (let head = 0; head < queue.length; head += 1) {
      const cell = queue[head], x = cell % grid, y = Math.floor(cell / grid);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || xx >= grid || yy < 0 || yy >= grid) continue;
        const next = yy * grid + xx;
        if (mask[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
    result.push(queue.sort((a, b) => a - b));
  }
  return result.sort((a, b) => b.length - a.length || a[0] - b[0]);
}

function associatedDomain(E, H) {
  const mask = new Uint8Array(cells), selected = [];
  for (const part of components(E, true)) if (part.some(cell => H[cell])) {
    selected.push(part.length);
    for (const cell of part) mask[cell] = 1;
  }
  return { mask, selectedComponentSizes8: selected };
}

function expand(previous, diagonal) {
  const grown = new Uint8Array(cells);
  for (let cell = 0; cell < cells; cell += 1) if (previous[cell]) {
    const x = cell % grid, y = Math.floor(cell / grid);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (!diagonal && dx && dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < grid && yy >= 0 && yy < grid) grown[yy * grid + xx] = 1;
    }
  }
  return grown;
}

function deriveAncestry(domains, diagonal) {
  const ancestry = [domains[0].slice()], edges = [];
  for (let t = 1; t < domains.length; t += 1) {
    const grown = expand(ancestry[t - 1], diagonal);
    ancestry.push(Uint8Array.from(domains[t], (value, cell) => value && grown[cell] ? 1 : 0));
    let allDomain = 0, ancestryCarrying = 0;
    for (let cell = 0; cell < cells; cell += 1) if (domains[t][cell]) {
      const x = cell % grid, y = Math.floor(cell / grid);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (!diagonal && dx && dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || xx >= grid || yy < 0 || yy >= grid) continue;
        const prior = yy * grid + xx;
        if (domains[t - 1][prior]) {
          allDomain += 1;
          if (ancestry[t - 1][prior] && ancestry[t][cell]) ancestryCarrying += 1;
        }
      }
    }
    edges.push({ fromAnchor: t - 1, toAnchor: t, allDomainEdges: allDomain,
      ancestryCarryingEdges: ancestryCarrying });
  }
  return { masks: ancestry, temporalEdges: edges };
}

function reverseBreaks(domains, ancestry, times, diagonal) {
  const breaks = [];
  for (let cell = 0; cell < cells; cell += 1) if (domains.at(-1)[cell] && !ancestry.at(-1)[cell]) {
    let frontier = new Uint8Array(cells); frontier[cell] = 1;
    let loss = null;
    for (let t = domains.length - 2; t >= 0; t -= 1) {
      const previous = new Uint8Array(cells);
      for (let next = 0; next < cells; next += 1) if (frontier[next]) {
        const x = next % grid, y = Math.floor(next / grid);
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          if (!diagonal && dx && dy) continue;
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || xx >= grid || yy < 0 || yy >= grid) continue;
          const prior = yy * grid + xx;
          if (domains[t][prior]) previous[prior] = 1;
        }
      }
      if (!count(previous)) {
        loss = { previousAnchor: t, nextAnchor: t + 1,
          previousMs: times[t], nextMs: times[t + 1] };
        break;
      }
      frontier = previous;
    }
    assert.ok(loss, `rejected cell ${cell} must have a backward-chain break`);
    breaks.push({ cell, x: cell % grid, y: Math.floor(cell / grid), ...loss });
  }
  return breaks;
}

function compareMasks(a, b) {
  let intersection = 0, onlyA = 0, onlyB = 0;
  for (let cell = 0; cell < cells; cell += 1) {
    if (a[cell] && b[cell]) intersection += 1;
    else if (a[cell]) onlyA += 1;
    else if (b[cell]) onlyB += 1;
  }
  const union = intersection + onlyA + onlyB;
  return { intersection, onlyA, onlyB, union, jaccard: union ? intersection / union : null };
}

function fieldStats(mask, values) {
  const selected = [];
  for (let cell = 0; cell < cells; cell += 1) if (mask[cell]) selected.push(values[cell]);
  selected.sort((a, b) => a - b);
  const q = p => selected[Math.floor((selected.length - 1) * p)];
  return { n: selected.length, min: selected[0], p25: q(0.25), median: q(0.5),
    p75: q(0.75), p90: q(0.9), max: selected.at(-1), exactZero: selected.filter(value => value === 0).length };
}

function topologyStats(mask) {
  const eight = components(mask, true), four = components(mask, false);
  return { eightNeighbor: { componentCount: eight.length, sizes: eight.map(part => part.length) },
    fourNeighbor: { componentCount: four.length, sizes: four.map(part => part.length) } };
}

function solverStats(plate, mask) {
  const descriptor = { id: plate.id, bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs,
    grid: { width: grid, height: grid }, mask: Array.from(mask), source: plate.source,
    target: plate.target, pickups: plate.pickups, material: plate.material,
    meanHalfWidth: plate.meanHalfWidth, edges: [] };
  const before = sha(JSON.stringify(descriptor));
  try {
    const topology = compileSurfaceTopology({ plates: [descriptor], nodules: [], generation: 0 });
    assert.equal(sha(JSON.stringify(descriptor)), before, 'compiler must not mutate the research descriptor');
    const start = topology.nodeOffsets[0], end = topology.nodeOffsets[1];
    const seen = new Uint8Array(end - start), componentOf = new Int32Array(end - start).fill(-1), sizes = [];
    let isolates = 0;
    for (let node = start; node < end; node += 1) if (!seen[node - start]) {
      const queue = [node]; seen[node - start] = 1; let size = 0;
      for (let head = 0; head < queue.length; head += 1) {
        const current = queue[head]; size += 1; let degree = 0;
        for (let direction = 0; direction < 4; direction += 1) {
          const next = topology.neighborIndices[current * 4 + direction];
          if (next < start || next >= end) continue;
          degree += 1;
          if (!seen[next - start]) { seen[next - start] = 1; queue.push(next); }
        }
        if (!degree) isolates += 1;
      }
      const id = sizes.length; sizes.push(size);
      for (const current of queue) componentOf[current - start] = id;
    }
    const pickupNodes = [topology.pickupNodeIndices[0], topology.pickupNodeIndices[1]];
    const pickupComponents = pickupNodes.map(node => node === 0xffffffff ? null : componentOf[node - start]);
    return { accepted: true, nodeCount: end - start, componentSizes: sizes.sort((a, b) => b - a), isolates,
      pickupNodes, pickupCells: pickupNodes.map(node => node === 0xffffffff ? null : topology.nodeGridIndices[node]),
      pickupComponents, pickupsValid: pickupComponents.every(id => id !== null && id >= 0),
      pickupsShareComponent: pickupComponents[0] !== null && pickupComponents[0] === pickupComponents[1] };
  } catch (error) {
    assert.equal(sha(JSON.stringify(descriptor)), before, 'rejected compiler input must remain unchanged');
    return { accepted: false, error: error.message };
  }
}

async function loadInputs() {
  const provenancePath = resolve(inputs, 'provenance.json');
  const provenance = await readJson(provenancePath);
  const atlasBytes = await readFile(resolve(inputs, 'event-support-atlas.json.gz'));
  const ownershipBytes = await readFile(resolve(inputs, 'ownership-arrays.json.gz'));
  const eventInputBytes = await readFile(resolve(inputs, 'stage1-event-inputs.json.gz'));
  assert.equal(sha(atlasBytes), provenance.sourceArtifacts.eventSupportAtlas.sha256);
  assert.equal(sha(ownershipBytes), provenance.sourceArtifacts.ownershipArrays.sha256);
  assert.equal(sha(eventInputBytes), provenance.sourceArtifacts.stage1EventInputs.sha256);
  const atlas = JSON.parse(gunzipSync(atlasBytes));
  const ownershipArrays = JSON.parse(gunzipSync(ownershipBytes));
  const eventInput = JSON.parse(gunzipSync(eventInputBytes));
  assert.equal(atlas.packetSha256, provenance.sourceArtifacts.historyPacket.sha256);
  assert.equal(eventInput.historyPacketSha256, provenance.sourceArtifacts.historyPacket.sha256);
  assert.equal(eventInput.seed, 20261005); assert.equal(eventInput.seconds, 120);
  assert.equal(eventInput.tickRate, 60); assert.equal(eventInput.audio, 'Off');
  assert.equal(eventInput.grid, grid); assert.equal(eventInput.events.length, 2);
  assert.equal(atlas.atlases.length, 2); assert.equal(ownershipArrays.plates.length, 2);
  for (const [path, expected] of Object.entries(provenance.sourceHashes)) {
    assert.equal(sha(await readFile(resolve(root, path))), expected, `current source ${path}`);
  }
  const rawBytes = await readFile(resolve(root, provenance.sourceArtifacts.productionRawBirthReceipts.path));
  assert.equal(sha(rawBytes), provenance.sourceArtifacts.productionRawBirthReceipts.sha256);
  const raw = JSON.parse(gunzipSync(rawBytes));
  assert.equal(raw.seed, eventInput.seed); assert.equal(raw.arm, 'G');
  return { provenance, atlas, ownershipArrays, eventInput, raw };
}

function eventFrames(atlasEvent) {
  const frames = Array.from({ length: atlasEvent.event.anchors }, () => ({ E: new Uint8Array(cells), H: new Uint8Array(cells) }));
  const seen = new Set();
  for (const row of atlasEvent.cells) {
    assert.ok(Number.isInteger(row.cell) && row.cell >= 0 && row.cell < cells);
    assert.ok(!seen.has(row.cell), `duplicate atlas cell ${row.cell}`); seen.add(row.cell);
    for (const [name, target] of [['E', 'E'], ['H', 'H']]) {
      const bits = row.orbitBits?.[name];
      assert.equal(bits?.length, frames.length, `atlas ${name} bit length`);
      for (let t = 0; t < frames.length; t += 1) {
        assert.ok(bits[t] === '0' || bits[t] === '1');
        frames[t][target][row.cell] = Number(bits[t]);
      }
    }
  }
  return frames;
}

function analyzeEvent(event, atlasEvent, ownerArrays, rawBirth, priorC0Hash) {
  assert.equal(event.id, event.plate.id); assert.equal(event.id, ownerArrays.id);
  assert.equal(event.id, rawBirth.id);
  assert.equal(event.ownership.priorMatchId, null);
  assert.equal(event.ownership.anchorKind, 'current-lineage-start');
  assert.equal(event.event.startMs, event.ownership.anchorMs);
  assert.equal(event.event.endAnalysisTimeMs, event.ownership.commitMs);
  assert.deepEqual(event.event, atlasEvent.event, 'saved event interval must match the atlas');
  assert.equal(event.plate.maskSha256, rawBirth.maskSha256, 'saved production birth mask receipt');
  assert.equal(sha(Buffer.from(maskFromCells(event.plate.maskCells))), event.plate.maskSha256);
  assert.equal(ownerArrays.id, event.id);
  for (const channel of ['chemical', 'surface', 'feet']) {
    for (const values of Object.values(ownerArrays[channel])) assert.equal(values.length, cells);
  }

  const frames = eventFrames(atlasEvent);
  const domains = frames.map(frame => associatedDomain(frame.E, frame.H));
  const C0 = domains.at(-1).mask;
  assert.equal(sha(Buffer.from(C0)), priorC0Hash, 'same-commit C0 must match the prior frozen result');
  const eight = deriveAncestry(domains.map(row => row.mask), true);
  const four = deriveAncestry(domains.map(row => row.mask), false);
  const C1 = eight.masks.at(-1), C14 = four.masks.at(-1);
  const times = event.anchorTimesMs;
  assert.equal(times.length, event.event.anchors);
  assert.equal(times[0], event.event.startAnalysisTimeMs);
  assert.equal(times.at(-1), event.event.endAnalysisTimeMs);
  assert.equal(times.at(-1), event.event.endAnalysisTimeMs);
  const production = maskFromCells(event.plate.maskCells);
  const H = maskFromCells(event.commitMaps.HCells), I = maskFromCells(event.commitMaps.ICells);
  const principalPath = maskFromCells(event.commitMaps.principalPathCells);
  const owned = {
    carriedChemical: ownerArrays.chemical.carriedInAtCommit,
    postAnchorChemical: ownerArrays.chemical.postAnchorEffect,
    carriedSurface: ownerArrays.surface.anchor,
    postAnchorSurface: ownerArrays.surface.conditionalEndpointDifference,
    carriedFeet: ownerArrays.feet.carriedIn,
    commitOwnedFeet: ownerArrays.feet.ownedNew
  };
  const perAnchor = domains.map((row, index) => ({ anchorIndex: index, simulationTimeMs: times[index],
    associatedCells: count(row.mask), associatedComponents8: row.selectedComponentSizes8.length,
    activeC1Ancestry8Cells: count(eight.masks[index]), activeC1Ancestry4Cells: count(four.masks[index]),
    associatedComponentSizes8: row.selectedComponentSizes8,
    c1Ancestry8Topology: topologyStats(eight.masks[index]),
    c1Ancestry4Topology: topologyStats(four.masks[index]) }));
  const edgeSummary = value => ({ totalDomainEdges: value.reduce((sum, row) => sum + row.allDomainEdges, 0),
    totalAncestryCarryingEdges: value.reduce((sum, row) => sum + row.ancestryCarryingEdges, 0), intervals: value });
  return {
    id: event.id,
    interval: { startMs: event.ownership.anchorMs, endMs: event.ownership.commitMs,
      anchorCount: event.event.anchors, anchorRule: event.ownership.anchorKind,
      matchedPrior: event.ownership.priorMatchId, priorMatchDiagnostics: event.ownership.priorMatchDiagnostics },
    areas: { C0: count(C0), C1_8: count(C1), C1_4: count(C14),
      C0RejectedByC1_8: count(Uint8Array.from(C0, (value, cell) => value && !C1[cell] ? 1 : 0)),
      C0RejectedByC1_4: count(Uint8Array.from(C0, (value, cell) => value && !C14[cell] ? 1 : 0)) },
    masks: { C0Sha256: sha(Buffer.from(C0)), C1_8Sha256: sha(Buffer.from(C1)), C1_4Sha256: sha(Buffer.from(C14)) },
    perAnchor,
    temporalEdges: { eightNeighbor: edgeSummary(eight.temporalEdges), fourNeighbor: edgeSummary(four.temporalEdges) },
    rejectedC0FirstBackwardBreak8: reverseBreaks(domains.map(row => row.mask), eight.masks, times, true),
    spatial: {
      C1_8: topologyStats(C1), C1_4: topologyStats(C14),
      C1_8vsC1_4: compareMasks(C1, C14),
      C1_8vsC0: compareMasks(C1, C0),
      C1_8vsProduction: compareMasks(C1, production),
      sourceInC1_8: Boolean(C1[event.plate.source.index]),
      targetInC1_8: Boolean(C1[event.plate.target.index]),
      H: { cells: count(H), insideC1: compareMasks(C1, H).intersection },
      I: { cells: count(I), insideC1: compareMasks(C1, I).intersection },
      principalPath: { cells: count(principalPath), insideC1: compareMasks(C1, principalPath).intersection }
    },
    ownershipOverlayC1_8: Object.fromEntries(Object.entries(owned).map(([name, values]) =>
      [name, fieldStats(C1, values)])),
    compilerInputs: { grid: { width: grid, height: grid }, maskSha256: sha(Buffer.from(C1)),
      pickups: event.plate.pickups, material: event.plate.material, meanHalfWidth: event.plate.meanHalfWidth, edges: [] },
    compiler: { C1_8: solverStats(event.plate, C1), C1_4: solverStats(event.plate, C14) },
    exactMasks: { C0: indices(C0), C1_8: indices(C1), C1_4: indices(C14) }
  };
}

async function calculate() {
  const { provenance, atlas, ownershipArrays, eventInput, raw } = await loadInputs();
  const events = eventInput.events.map((event, index) => {
    const rawBirth = raw.births.find(row => row.id === event.id);
    assert.ok(rawBirth, `raw birth receipt ${event.id}`);
    assert.equal(rawBirth.bornAtSimulationTimeMs, event.plate.bornAtSimulationTimeMs);
    assert.deepEqual(rawBirth.source, event.plate.source); assert.deepEqual(rawBirth.target, event.plate.target);
    return analyzeEvent(event, atlas.atlases[index], ownershipArrays.plates[index], rawBirth,
      provenance.priorC0.stage1MaskSha256[event.id]);
  });
  const pair = name => compareMasks(maskFromCells(events[0].exactMasks[name]), maskFromCells(events[1].exactMasks[name]));
  return {
    schema: 'ant-space-time-attachment-stage1-v1',
    baseline: { originMain: provenance.baselineMain, seed: eventInput.seed, arm: 'G', audio: 'Off',
      tickRate: eventInput.tickRate, packetSeconds: eventInput.seconds,
      historyPacketSha256: eventInput.historyPacketSha256,
      atlasSha256: provenance.sourceArtifacts.eventSupportAtlas.sha256,
      ownershipArraysSha256: provenance.sourceArtifacts.ownershipArrays.sha256,
      currentSourceHashesVerified: Object.keys(provenance.sourceHashes).length },
    contract: 'A_t is the union of complete 8-connected E_qualified components intersecting H_boundary_length_eligible at the same saved analysis. From the ownership anchor, a node inherits C1 ancestry only from a same-or-neighbor node at the immediately previous saved anchor. No within-anchor propagation, threshold, history weight, or repair is used.',
    events,
    pair: { C0: pair('C0'), C1_8: pair('C1_8'), C1_4: pair('C1_4') },
    verdict: 'BOUNDED NEGATIVE — temporal attachment adds no useful selectivity',
    interpretation: 'C1-8 retains 869/901 P1 cells and 1169/1172 P2 cells, so the evolving sampled ancestry reproduces nearly all of C0 at both commits. The 4-neighbor sensitivity changes P1 compiler acceptance and leaves an isolated solver node for P2. Neither result advances the registered Stage-1 gate.',
    stage2: { ran: false, reason: 'Stage 1 bounded negative; the conditional 600 s gate was not opened.' }
  };
}

function maskPacket(result) {
  return { schema: 'ant-space-time-attachment-mask-set-v1', grid,
    encoding: 'sorted row-major occupied cell indices', events: result.events.map(event => ({ id: event.id,
      commitMs: event.interval.endMs, masks: event.exactMasks, sha256: event.masks })) };
}

function runSelfChecks() {
  const E = new Uint8Array(cells), H = new Uint8Array(cells);
  E[0] = E[1] = E[97] = 1; H[0] = 1;
  const A0 = associatedDomain(E, H).mask;
  assert.deepEqual(indices(A0), [0, 1, 97], 'same-anchor component association uses 8-connectivity');
  const next = new Uint8Array(cells); next[97] = 1; next[194] = 1;
  assert.deepEqual(indices(deriveAncestry([A0, next], true).masks.at(-1)), [97, 194],
    'each next-anchor node needs a previous same-or-neighbor ancestor');
  assert.deepEqual(indices(deriveAncestry([A0, next], false).masks.at(-1)), [97],
    '4-neighbor sensitivity excludes diagonal-only temporal links');
  const remote = new Uint8Array(cells); remote[9215] = 1;
  assert.deepEqual(indices(deriveAncestry([A0, remote], true).masks.at(-1)), [],
    'same-anchor connectivity never propagates through the previous layer');
}

async function verifyPackageManifest() {
  const manifest = await readJson(resolve(out, 'data/package-sha256.json'));
  assert.equal(manifest.schema, 'ant-space-time-attachment-package-sha256-v1');
  for (const [path, expected] of Object.entries(manifest.files)) {
    const absolute = resolve(root, path), rel = relative(root, absolute);
    assert.ok(!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`), 'package path must stay in repository');
    assert.equal(sha(await readFile(absolute)), expected, `package SHA-256 ${path}`);
  }
  return Object.keys(manifest.files).length;
}

async function main() {
  runSelfChecks();
  const result = await calculate();
  const stage1Path = resolve(out, 'data/stage1.json'), masksPath = resolve(out, 'data/c1-masks.json.gz');
  const validationPath = resolve(out, 'data/validation.json');
  if (process.argv.includes('--check')) {
    assert.deepEqual(await readJson(stage1Path), result, 'frozen Stage-1 reconstruction');
    const savedMasks = await readGzipJson(masksPath);
    assert.deepEqual(savedMasks, maskPacket(result), 'exact C0/C1-8/C1-4 masks');
    const validation = await readJson(validationPath);
    assert.equal(validation.runnerSha256, sha(await readFile(fileURLToPath(import.meta.url))));
    assert.equal(validation.stage2RunCount, 0);
    assert.equal(validation.stage1Events, 2);
    assert.equal(validation.exactC0PriorMasks, true);
    for (const path of ['data/stage1.json', 'data/c1-masks.json.gz']) {
      assert.equal(validation.outputHashes[path], sha(await readFile(resolve(out, path))));
    }
    const packageFiles = await verifyPackageManifest();
    console.log(JSON.stringify({ status: 'valid', mode: 'check-frozen-inputs-no-stage2',
      events: result.events.length, verdict: result.verdict, packageFiles, evidence: out }, null, 2));
    return;
  }
  await mkdir(resolve(out, 'data'), { recursive: true });
  for (const path of [stage1Path, masksPath, validationPath])
    await assert.rejects(readFile(path), { code: 'ENOENT' }, 'research outputs are not overwritten');
  const masks = gzipSync(Buffer.from(json(maskPacket(result))), { level: 9, mtime: 0 });
  await writeFile(stage1Path, json(result)); await writeFile(masksPath, masks);
  const validation = { schema: 'ant-space-time-attachment-validation-v1',
    runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))),
    inputProvenanceSha256: sha(await readFile(resolve(inputs, 'provenance.json'))),
    stage1EventInputsSha256: sha(await readFile(resolve(inputs, 'stage1-event-inputs.json.gz'))),
    stage1Events: result.events.length, exactC0PriorMasks: true, stage2RunCount: 0,
    outputs: { C1_8CompilerAccepted: result.events.every(event => event.compiler.C1_8.accepted),
      C1_4P1CompilerAccepted: result.events[0].compiler.C1_4.accepted,
      C1_4P2Isolates: result.events[1].compiler.C1_4.isolates },
    outputHashes: { 'data/stage1.json': sha(await readFile(stage1Path)),
      'data/c1-masks.json.gz': sha(await readFile(masksPath)) } };
  await writeFile(validationPath, json(validation));
  console.log(JSON.stringify({ status: 'recorded', verdict: result.verdict,
    stage2: 'not run; Stage 1 gate failed', evidence: out }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
