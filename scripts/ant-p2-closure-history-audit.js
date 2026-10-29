import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import {
  TRAIL_PLATE_GRID_SIZE,
  TRAIL_PLATE_CHEMICAL_THRESHOLD,
  TRAIL_PLATE_SUPPORT_THRESHOLD,
  TRAIL_PLATE_SUPPORT_RADIUS
} from '../src/lib/agents/ant/TrailPlateBirth.js';

const ROOT = process.cwd();
const BASE = resolve(ROOT, 'docs/ant/evidence/2026-10-29-p2-closure-history-audit');
const GRID = TRAIL_PLATE_GRID_SIZE;
const COUNT = GRID * GRID;
const FILES = {
  frozen: 'docs/ant/evidence/2026-10-29-materialization-scope-exploration/data/frozen-structures.json.gz',
  joint: 'docs/ant/evidence/2026-10-29-joint-scope-body-grammar/analysis.json',
  body: 'docs/ant/evidence/2026-10-29-material-body-design-space/data/frozen-body-inputs.json.gz',
  production: 'src/lib/agents/ant/TrailPlateBirth.js',
  extraction: 'scripts/ant-materialization-scope-exploration.js'
};
const EXPECTED = {
  main: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785',
  parent: 'a518a76bddd416a074cc3ee1d1d12c90d08bff15',
  rawHistory: '909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc',
  anchorsMs: [105016.66666667434, 106016.66666667463]
};
const sorted = values => [...values].sort((a, b) => a - b);
const key = (x, y) => y * GRID + x;
const xy = i => ({ x: i % GRID, y: Math.floor(i / GRID) });
const neighbors = (i, diagonal = true) => {
  const { x, y } = xy(i), result = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
    const xx = x + dx, yy = y + dy;
    if (xx >= 0 && xx < GRID && yy >= 0 && yy < GRID) result.push(key(xx, yy));
  }
  return result;
};
function assertCells(values, label) {
  assert(Array.isArray(values), label + ' must be an array');
  const seen = new Set();
  for (const i of values) {
    assert(Number.isInteger(i) && i >= 0 && i < COUNT, label + ' cell domain');
    assert(!seen.has(i), label + ' must not repeat a cell');
    seen.add(i);
  }
  return seen;
}
function components(values, diagonal = true) {
  const remaining = new Set(values), result = [];
  for (const first of sorted(remaining)) {
    if (!remaining.has(first)) continue;
    remaining.delete(first);
    const queue = [first], cells = [];
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      cells.push(current);
      for (const next of neighbors(current, diagonal)) if (remaining.delete(next)) queue.push(next);
    }
    result.push(sorted(cells));
  }
  return result.sort((a, b) => b.length - a.length || a[0] - b[0]);
}
function backgroundComponents(foreground, diagonal) {
  const occupied = new Set(foreground);
  const background = [];
  for (let i = 0; i < COUNT; i++) if (!occupied.has(i)) background.push(i);
  return components(background, diagonal);
}
function touchesGridEdge(cells) {
  return cells.some(i => {
    const { x, y } = xy(i);
    return x === 0 || x === GRID - 1 || y === 0 || y === GRID - 1;
  });
}
function faceBackground(foreground, face, diagonal) {
  const faceSet = new Set(face);
  return backgroundComponents(foreground, diagonal)
    .map(cells => ({ cells, faceCells: cells.filter(i => faceSet.has(i)) }))
    .filter(row => row.faceCells.length)
    .map(row => ({
      area: row.cells.length,
      faceCount: row.faceCells.length,
      faceIndices: row.faceCells,
      touchesGridEdge: touchesGridEdge(row.cells)
    }))
    .sort((a, b) => b.faceCount - a.faceCount || a.faceIndices[0] - b.faceIndices[0]);
}
function selectionBoundary(face, H) {
  const occupied = new Set(H), boundary = new Set();
  for (const i of face) for (const j of neighbors(i, true)) if (occupied.has(j)) boundary.add(j);
  return sorted(boundary);
}
function closedFaceResult(foreground, face, diagonal) {
  const mask = new Set(foreground);
  const residual = face.filter(i => !mask.has(i));
  const componentsAtFace = faceBackground(foreground, face, diagonal);
  const intersectCount = componentsAtFace.reduce((sum, part) => sum + part.faceCount, 0);
  assert.equal(intersectCount, residual.length);
  return {
    foregroundInsideFace: face.length - residual.length,
    residualFaceCells: residual.length,
    backgroundAdjacency: diagonal ? 8 : 4,
    parts: componentsAtFace.map(({ area, faceCount, touchesGridEdge, faceIndices }) =>
      ({ area, faceCount, touchesGridEdge, faceIndices })),
    allResidualFaceCellsEnclosed: residual.length > 0 && componentsAtFace.every(part => !part.touchesGridEdge)
  };
}
function componentTransition(beforeValues, afterValues, focusValues) {
  const before = components(beforeValues, true), after = components(afterValues, true);
  const beforeLabel = new Map(), afterLabel = new Map();
  before.forEach((cells, id) => cells.forEach(i => beforeLabel.set(i, id)));
  after.forEach((cells, id) => cells.forEach(i => afterLabel.set(i, id)));
  const beforeToAfter = before.map(() => new Set()), afterToBefore = after.map(() => new Set());
  for (const i of beforeValues) {
    const oldId = beforeLabel.get(i), newId = afterLabel.get(i);
    if (newId !== undefined) { beforeToAfter[oldId].add(newId); afterToBefore[newId].add(oldId); }
  }
  const focus = new Set(focusValues);
  const oldFocusIds = new Set(beforeValues.filter(i => focus.has(i)).map(i => beforeLabel.get(i)));
  const newFocusIds = new Set(afterValues.filter(i => focus.has(i)).map(i => afterLabel.get(i)));
  const focusBeforeId = beforeLabel.get(focusValues.find(i => beforeLabel.has(i)));
  const focusAfterId = afterLabel.get(focusValues.find(i => afterLabel.has(i)));
  return {
    before8: { componentCount: before.length, largestSizes: before.slice(0, 10).map(c => c.length) },
    after8: { componentCount: after.length, largestSizes: after.slice(0, 10).map(c => c.length) },
    oldComponentsMerging: afterToBefore.map((ids, newId) => ({ newId, oldIds: sorted(ids) }))
      .filter(row => row.oldIds.length > 1),
    oldComponentsSplitting: beforeToAfter.map((ids, oldId) => ({ oldId, newIds: sorted(ids) }))
      .filter(row => row.newIds.length > 1),
    faceBoundaryComponent: {
      beforeSize: focusBeforeId === undefined ? 0 : before[focusBeforeId].length,
      afterSize: focusAfterId === undefined ? 0 : after[focusAfterId].length,
      oldComponentsContributingToAfter: focusAfterId === undefined ? [] : sorted(afterToBefore[focusAfterId]),
      newComponentsDescendedFromBefore: focusBeforeId === undefined ? [] : sorted(beforeToAfter[focusBeforeId]),
      focusComponentCountBefore: oldFocusIds.size,
      focusComponentCountAfter: newFocusIds.size
    }
  };
}
function faceNeighbourhood(face, boundary) {
  const cells = new Set([...face, ...boundary]);
  for (const i of [...cells]) for (const j of neighbors(i, true)) cells.add(j);
  return cells;
}
function diff(before, after) {
  const a = new Set(before), b = new Set(after);
  return { added: sorted([...b].filter(i => !a.has(i))), removed: sorted([...a].filter(i => !b.has(i))) };
}
function indexRows(cells) {
  return cells.map(index => ({ index, ...xy(index) }));
}
function summarizeMask(frame, field, face, boundary) {
  const cells = frame[field];
  const occupied = assertCells(cells, field + ' at ' + frame.timeMs);
  const faceSet = new Set(face), boundarySet = new Set(boundary);
  const onFace = face.filter(i => occupied.has(i));
  const onBoundary = boundary.filter(i => occupied.has(i));
  return {
    cells: cells.length,
    faceCellsPresent: onFace.length,
    boundaryCellsPresent: onBoundary.length,
    boundaryConnected8: components(onBoundary, true).map(c => c.length),
    boundaryConnected4: components(onBoundary, false).map(c => c.length),
    faceBackground4: closedFaceResult(cells, face, false),
    faceBackground8: closedFaceResult(cells, face, true),
    fullForeground8: { componentCount: components(cells, true).length, largestSizes: components(cells, true).slice(0, 10).map(c => c.length) },
    fullForeground4: { componentCount: components(cells, false).length, largestSizes: components(cells, false).slice(0, 10).map(c => c.length) },
    facePresentIndices: sorted(onFace),
    boundaryPresentIndices: sorted(onBoundary),
    faceMembershipCount: faceSet.size,
    boundaryMembershipCount: boundarySet.size
  };
}
async function bytesFor(path) {
  const bytes = await readFile(resolve(ROOT, path));
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}
function canonicalText(bytes) {
  return Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
}
async function run() {
  const [frozenFile, jointFile, bodyFile, sourceFile, extractorFile] = await Promise.all([
    bytesFor(FILES.frozen), bytesFor(FILES.joint), bytesFor(FILES.body), bytesFor(FILES.production), bytesFor(FILES.extraction)
  ]);
  const frozen = JSON.parse(gunzipSync(frozenFile.bytes));
  const joint = JSON.parse(jointFile.bytes);
  const body = JSON.parse(gunzipSync(bodyFile.bytes));
  const event = frozen.events.find(row => row.id === 'trail-plate-2');
  const reference = joint.events.find(row => row.id === 'trail-plate-2');
  const plate = body.events.find(row => row.id === 'trail-plate-2')?.plate;
  assert(event && reference?.closure && plate);
  assert.equal(frozen.schema, 'ant-frozen-scope-structures-v1');
  assert.equal(frozen.grid, GRID);
  assert.equal(frozen.productionMain, EXPECTED.main);
  assert.equal(frozen.seed, 20261005);
  assert.equal(frozen.hz, 60);
  assert.equal(frozen.heading, 'H0');
  assert.equal(frozen.audio, 'Off');
  assert.equal(frozen.naturalReplays, 0);
  assert.equal(TRAIL_PLATE_GRID_SIZE, GRID);
  assert.equal(TRAIL_PLATE_CHEMICAL_THRESHOLD, 0.30);
  assert.equal(TRAIL_PLATE_SUPPORT_THRESHOLD, 0.015);
  assert.equal(TRAIL_PLATE_SUPPORT_RADIUS, 0.025);
  const rawHistory = frozen.inputs.find(input => input.path.endsWith('plate-formation-gate/data/history-packet.json.gz'));
  assert.equal(rawHistory.sha256, EXPECTED.rawHistory);
  assert(Math.abs(plate.bornAtSimulationTimeMs - EXPECTED.anchorsMs[1]) < 1e-8);
  const frames = EXPECTED.anchorsMs.map(timeMs => {
    const frame = event.frames.find(row => row.timeMs === timeMs);
    assert(frame, 'exact frozen anchor missing: ' + timeMs);
    for (const field of ['E', 'H', 'I']) assertCells(frame[field], field + ' frame');
    return frame;
  });

  const face = assertCells(reference.closure.hole, 'frozen P2 face');
  const boundary = assertCells(reference.closure.boundary, 'frozen P2 boundary');
  assert.equal(face.size, 80);
  assert.equal(boundary.size, 80);
  const commitH = assertCells(frames[1].H, 'P2 COMMIT H');
  const h8 = backgroundComponents(frames[1].H, true)
    .filter(cells => !touchesGridEdge(cells));
  const selectedFace = h8[0];
  assert.deepEqual(selectedFace, reference.closure.hole, 'frozen parent face selection');
  assert.deepEqual(selectionBoundary(selectedFace, frames[1].H), reference.closure.boundary, 'frozen parent boundary selection');
  assert(selectedFace.every(i => !commitH.has(i)));

  const focus = faceNeighbourhood([...face], [...boundary]);
  const record = frames.map(frame => {
    const E = summarizeMask(frame, 'E', [...face], [...boundary]);
    const H = summarizeMask(frame, 'H', [...face], [...boundary]);
    const I = assertCells(frame.I, 'I frame');
    return {
      timeMs: frame.timeMs,
      seconds: frame.timeMs / 1000,
      candidateStableSeconds: frame.candidate.stableSeconds,
      E, H,
      selectedI: {
        cells: frame.I.length,
        faceCellsPresent: [...face].filter(i => I.has(i)).length,
        boundaryCellsPresent: [...boundary].filter(i => I.has(i)).length
      }
    };
  });
  const EDiff = diff(frames[0].E, frames[1].E);
  const HDiff = diff(frames[0].H, frames[1].H);
  const faceBoundarySet = new Set([...face, ...boundary]);
  const ELocalDiff = {
    added: EDiff.added.filter(i => focus.has(i)),
    removed: EDiff.removed.filter(i => focus.has(i)),
    addedInFaceOrBoundary: EDiff.added.filter(i => faceBoundarySet.has(i)),
    removedInFaceOrBoundary: EDiff.removed.filter(i => faceBoundarySet.has(i))
  };
  const HLocalDiff = {
    added: HDiff.added.filter(i => focus.has(i)),
    removed: HDiff.removed.filter(i => focus.has(i)),
    addedOnBoundary: HDiff.added.filter(i => boundary.has(i)),
    removedOnBoundary: HDiff.removed.filter(i => boundary.has(i))
  };
  const ringSupportEqual = JSON.stringify(record[0].E.boundaryPresentIndices) === JSON.stringify(record[1].E.boundaryPresentIndices);
  const faceSupportEqual = JSON.stringify(record[0].E.facePresentIndices) === JSON.stringify(record[1].E.facePresentIndices);
  assert.equal(record[0].E.boundaryCellsPresent, 80);
  assert.equal(record[1].E.boundaryCellsPresent, 80);
  assert.equal(record[0].E.faceCellsPresent, 47);
  assert.equal(record[1].E.faceCellsPresent, 47);
  assert(ringSupportEqual && faceSupportEqual);
  assert.deepEqual(ELocalDiff.addedInFaceOrBoundary, []);
  assert.deepEqual(ELocalDiff.removedInFaceOrBoundary, []);
  assert.deepEqual(HLocalDiff.addedOnBoundary, [3498]);
  assert.deepEqual(HLocalDiff.removedOnBoundary, []);
  assert(record[0].E.faceBackground4.allResidualFaceCellsEnclosed);
  assert(record[0].E.faceBackground8.allResidualFaceCellsEnclosed);
  assert(record[1].E.faceBackground4.allResidualFaceCellsEnclosed);
  assert(record[1].E.faceBackground8.allResidualFaceCellsEnclosed);
  assert(!record[0].H.faceBackground8.allResidualFaceCellsEnclosed);
  assert(record[1].H.faceBackground8.allResidualFaceCellsEnclosed);
  assert(record[0].H.faceBackground4.allResidualFaceCellsEnclosed);
  assert(record[1].H.faceBackground4.allResidualFaceCellsEnclosed);
  const supportRelationStable = ringSupportEqual && faceSupportEqual
    && record[0].E.faceBackground4.allResidualFaceCellsEnclosed
    && record[0].E.faceBackground8.allResidualFaceCellsEnclosed
    && record[1].E.faceBackground4.allResidualFaceCellsEnclosed
    && record[1].E.faceBackground8.allResidualFaceCellsEnclosed;
  const HBackground8Transition = !record[0].H.faceBackground8.allResidualFaceCellsEnclosed
    && record[1].H.faceBackground8.allResidualFaceCellsEnclosed;
  const classification = supportRelationStable && HBackground8Transition
    ? 'REPRESENTATION-LEVEL CLOSURE ONLY'
    : (!record[0].E.faceBackground4.allResidualFaceCellsEnclosed
      && record[1].E.faceBackground4.allResidualFaceCellsEnclosed
      ? 'SUPPORTED — QUALIFIED-SUPPORT CLOSURE TRANSITION OBSERVED'
      : 'INSUFFICIENT / REPRESENTATION-AMBIGUOUS');

  const transition = {
    E: { ...EDiff, addedRows: indexRows(EDiff.added), removedRows: indexRows(EDiff.removed) },
    H: { ...HDiff, addedRows: indexRows(HDiff.added), removedRows: indexRows(HDiff.removed) },
    faceBoundaryE: {
      added: ELocalDiff.addedInFaceOrBoundary,
      removed: ELocalDiff.removedInFaceOrBoundary,
      membershipEqualAtBothAnchors: ringSupportEqual && faceSupportEqual,
      faceCellsAddedAndRemoved: ELocalDiff
    },
    faceBoundaryH: {
      added: HLocalDiff.addedOnBoundary,
      removed: HLocalDiff.removedOnBoundary,
      addedRows: indexRows(HLocalDiff.addedOnBoundary),
      missingAtEarlierAnchorAndQualifiedInE: HLocalDiff.addedOnBoundary.map(i => ({
        index: i, ...xy(i), E105: new Set(frames[0].E).has(i), E106: new Set(frames[1].E).has(i)
      })),
      localAddedRows: indexRows(HLocalDiff.added),
      localRemovedRows: indexRows(HLocalDiff.removed)
    }
  };
  const supportTransition = componentTransition(frames[0].E, frames[1].E, [...faceBoundarySet]);
  assert.deepEqual(supportTransition.oldComponentsMerging, []);
  assert.equal(supportTransition.faceBoundaryComponent.focusComponentCountBefore, 1);
  assert.equal(supportTransition.faceBoundaryComponent.focusComponentCountAfter, 1);
  assert.equal(supportTransition.faceBoundaryComponent.oldComponentsContributingToAfter.length, 1);
  assert.equal(supportTransition.faceBoundaryComponent.newComponentsDescendedFromBefore.length, 1);
  const descriptorNodes = plate.centerline.map(node => node.index).sort((a, b) => a - b);
  assert.deepEqual(descriptorNodes, frames[1].I);
  const descriptorEdges = plate.edges;
  const descriptorGraph = new Map(descriptorNodes.map(i => [i, []]));
  for (const [a, b] of descriptorEdges) { assert(descriptorGraph.has(a) && descriptorGraph.has(b)); descriptorGraph.get(a).push(b); descriptorGraph.get(b).push(a); }
  let visited = new Set(), graphComponents = 0;
  for (const node of descriptorNodes) if (!visited.has(node)) {
    graphComponents++;
    const queue = [node]; visited.add(node);
    for (let h = 0; h < queue.length; h++) for (const next of descriptorGraph.get(queue[h])) if (!visited.has(next)) { visited.add(next); queue.push(next); }
  }
  assert.equal(graphComponents, 1);
  const descriptor = {
    nodes: descriptorNodes.length,
    inducedEdges: descriptorEdges.length,
    graphComponents,
    cycleRank: descriptorEdges.length - descriptorNodes.length + graphComponents,
    frozenFaceCellsPresent: [...face].filter(i => descriptorGraph.has(i)).length,
    frozenBoundaryCellsPresent: [...boundary].filter(i => descriptorGraph.has(i)).length,
    role: 'later induced descriptor adjacency; not qualified-support closure evidence'
  };
  assert.equal(descriptor.cycleRank, 31);
  assert.equal(descriptor.frozenFaceCellsPresent, 0);
  const frameMasks = frames.flatMap((frame, i) => [
    { label: i === 0 ? 'E | 105.016667 s' : 'E | 106.016667 s', kind: 'E', timeMs: frame.timeMs, cells: sorted(frame.E) },
    { label: i === 0 ? 'H | 105.016667 s' : 'H | 106.016667 s', kind: 'H', timeMs: frame.timeMs, cells: sorted(frame.H) }
  ]);
  const faceRows = indexRows([...face]), boundaryRows = indexRows([...boundary]);
  const unionRows = [...face, ...boundary].map(i => xy(i));
  const minX = Math.min(...unionRows.map(p => p.x)), maxX = Math.max(...unionRows.map(p => p.x));
  const minY = Math.min(...unionRows.map(p => p.y)), maxY = Math.max(...unionRows.map(p => p.y));
  const margin = 4;
  const crop = {
    x0: Math.max(0, minX - margin), y0: Math.max(0, minY - margin),
    x1: Math.min(GRID - 1, maxX + margin), y1: Math.min(GRID - 1, maxY + margin),
    marginCells: margin
  };
  const result = {
    schema: 'ant-p2-closure-history-audit-v1',
    baseline: {
      main: EXPECTED.main, researchParent: EXPECTED.parent,
      branch: 'codex/ant-p2-closure-history-audit-20261029',
      seed: 20261005, hz: 60, heading: 'H0', audio: 'Off', naturalReplays: 0,
      event: 'trail-plate-2', commitMs: plate.bornAtSimulationTimeMs,
      exactAnchorMs: frames.map(frame => frame.timeMs)
    },
    provenance: {
      frozenStructures: { path: FILES.frozen, bytes: frozenFile.bytes.length, sha256: frozenFile.sha256 },
      upstreamQualifiedHistory: { commit: '0d5096a920e1ebb2086fa1dae782c5d4e871b590', path: rawHistory.path, sha256: rawHistory.sha256 },
      parentJointAnalysis: { path: FILES.joint, sha256: createHash('sha256').update(canonicalText(jointFile.bytes)).digest('hex') },
      frozenBodyInput: { path: FILES.body, bytes: bodyFile.bytes.length, sha256: bodyFile.sha256 },
      productionSource: { path: FILES.production, sha256LF: createHash('sha256').update(canonicalText(sourceFile.bytes)).digest('hex') },
      frozenExtractionSource: { path: FILES.extraction, sha256LF: createHash('sha256').update(canonicalText(extractorFile.bytes)).digest('hex') },
      parentJointRunner: {
        path: 'scripts/ant-joint-scope-body-grammar.js',
        sha256LF: createHash('sha256').update(canonicalText(await readFile(resolve(ROOT, 'scripts/ant-joint-scope-body-grammar.js')))).digest('hex')
      }
    },
    representation: {
      E: 'saved E_qualified cell membership; production source thresholds are chemical >= 0.30 and sampled support >= 0.015 on the 96 grid',
      supportConnectivity: '8-neighbor is the current production foreground relation; 4-neighbor foreground is reported as sensitivity',
      H: 'saved H_boundary_length_eligible membership after the existing thinning/eligibility representation',
      background: '4- and 8-neighbor complement components are reported separately; no single background component is used alone as closure proof',
      I: 'saved selected retained network; actual P2 descriptor stores induced eight-neighbor adjacency',
      body: 'not generated or analyzed'
    },
    frozenFace: {
      selectionRule: 'exact parent joint-scope P2 face: largest non-edge eight-neighbor background component in COMMIT H; cell-order tie; never reselected',
      faceCells: faceRows,
      boundaryRule: 'exact parent boundary array: adjacent COMMIT H cells under eight-neighbor relation',
      boundaryCells: boundaryRows,
      crop
    },
    snapshots: record,
    transitionCells: transition,
    supportComponentTransition: supportTransition,
    laterRepresentations: {
      descriptor,
      descriptorAdjacencyCommitMaskHoles8: backgroundComponents(descriptorNodes, true)
        .filter(cells => !touchesGridEdge(cells)).map(cells => cells.length)
    },
    classification,
    interpretation: 'The fixed face and boundary qualified-support relation is already present at 105.016666667 s. At 106.016666667 s, the frozen H boundary gains one previously qualified cell and the exact face first becomes a single eight-background H component. The saved anchors support a representation-level change, not a new qualified-support closure transition.',
    limits: [
      'Only the exact adjacent saved approximately-one-second analysis anchors are compared; subsecond changes between them are unobserved.',
      'E/H are exact binary membership arrays, not the continuous chemical or support amplitudes.',
      'A COMMIT-snapshot operation on current selected topology remains a separate authored interpretation.'
    ]
  };
  const atlasData = {
    schema: 'ant-p2-closure-history-atlas-data-v1',
    grid: GRID,
    crop,
    panels: frameMasks,
    faceCells: faceRows,
    boundaryCells: boundaryRows,
    EAdded: indexRows(EDiff.added),
    ERemoved: indexRows(EDiff.removed),
    HAdded: indexRows(HDiff.added),
    HRemoved: indexRows(HDiff.removed),
    EAddedLocal: indexRows(ELocalDiff.added),
    ERemovedLocal: indexRows(ELocalDiff.removed),
    HAddedLocal: indexRows(HLocalDiff.added),
    HRemovedLocal: indexRows(HLocalDiff.removed),
    criticalBoundaryCell: 3498,
    criticalBoundaryCellXY: xy(3498)
  };
  const artifacts = [
    ['analysis.json', JSON.stringify(result) + '\n'],
    ['transition-cells.json', JSON.stringify({ face: faceRows, boundary: boundaryRows, transition }) + '\n'],
    ['atlas-data.json', JSON.stringify(atlasData) + '\n']
  ];
  await mkdir(BASE, { recursive: true });
  if (process.argv.includes('--check')) {
    for (const [name, text] of artifacts) assert.equal((await readFile(resolve(BASE, name), 'utf8')).replace(/\r\n/g, '\n'), text, name + ' differs');
  } else {
    for (const [name, text] of artifacts) await writeFile(resolve(BASE, name), text);
  }
  console.log(JSON.stringify({
    anchors: record.map(row => ({
      seconds: row.seconds, E: row.E.cells, H: row.H.cells, I: row.selectedI.cells,
      EBoundary: row.E.boundaryCellsPresent, HBoundary: row.H.boundaryCellsPresent,
      EFace: row.E.faceCellsPresent, EResidual4: row.E.faceBackground4.parts.map(p => p.faceCount),
      EResidual8: row.E.faceBackground8.parts.map(p => p.faceCount),
      HResidual4: row.H.faceBackground4.parts.map(p => p.faceCount),
      HResidual8: row.H.faceBackground8.parts.map(p => p.faceCount)
    })),
    transition: {
      EAdded: EDiff.added.length, ERemoved: EDiff.removed.length,
      ELocalAdded: indexRows(ELocalDiff.added), HAdded: HDiff.added.length, HRemoved: HDiff.removed.length,
      HBoundaryAdded: indexRows(HLocalDiff.addedOnBoundary), supportFaceBoundarySame: ringSupportEqual && faceSupportEqual
    },
    descriptor, classification: result.classification
  }));
}
function selfTest() {
  const shell = [97, 98, 99, 193, 195, 289, 290, 291];
  assert.deepEqual(backgroundComponents(shell, true).filter(c => !touchesGridEdge(c)).map(c => c.length), [1]);
  assert.deepEqual(backgroundComponents(shell, false).filter(c => !touchesGridEdge(c)).map(c => c.length), [1]);
  assert.deepEqual(components([0, 97], true).map(c => c.length), [2]);
  assert.deepEqual(components([0, 97], false).map(c => c.length), [1, 1]);
  assert.deepEqual(components([95, 96], true).map(c => c.length), [1, 1]);
  const open = shell.filter(i => i !== 193);
  assert.equal(backgroundComponents(open, true).filter(c => c.includes(194)).some(touchesGridEdge), true);
  assert.deepEqual(sorted(neighbors(97, false)), [1, 96, 98, 193]);
  assert.throws(() => assertCells([COUNT], 'out-of-range'), /domain/);
  console.log('PASS: adjacency bounds, diagonal sensitivity, edge wrap, closed/open shell, face membership domain');
}
const originalRandom = Math.random;
Math.random = () => { throw new Error('Frozen audit must not consume RNG'); };
try {
  if (process.argv.includes('--self-test')) selfTest();
  else await run();
} finally {
  Math.random = originalRandom;
}
