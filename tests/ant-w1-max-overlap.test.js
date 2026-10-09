import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createW1Crystallizer } from '../scripts/ant-w1-crystallization.js';
import { createMaxOverlapCrystallizer as createW1MaxOverlapCrystallizer, routeMaximumOverlaps } from '../scripts/ant-w1-max-overlap-crystallization.js';

const flags = (...cells) => Uint8Array.from(cells);
const originalSource = readFileSync(new URL('../scripts/ant-w1-crystallization.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const candidateSource = readFileSync(new URL('../scripts/ant-w1-max-overlap-crystallization.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function functionText(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0, quote = null, lineComment = false, blockComment = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index], next = source[index + 1];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === '\'' || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`unclosed function ${name}`);
}

function sourceSpan(source, startText, endText) {
  const start = source.indexOf(startText), end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, `missing source span ${startText}`);
  return source.slice(start, end);
}

function assertFiniteNumbers(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  else if (Array.isArray(value)) value.forEach(assertFiniteNumbers);
  else if (value && typeof value === 'object') Object.values(value).forEach(assertFiniteNumbers);
}

function findSplit(machine, width, keep) {
  let timeSeconds = machine.getSnapshot().timeSeconds + 1;
  for (let frame = 0; frame < 100; frame += 1) {
    const values = new Uint8Array(width);
    for (const cell of keep) values[cell] = 7;
    machine.advance({ timeSeconds, flags: values });
    if (machine.getSnapshot().activeComponentCount > 1) return machine.getLastIdentityDiagnostics();
    timeSeconds += 1;
  }
  assert.fail('expected active components to split');
}

test('larger exact overlap inherits; losing child gets a fresh fork with no copied state', () => {
  const machine = createW1MaxOverlapCrystallizer({ width: 5, height: 1 });
  for (let frame = 0; frame < 30; frame += 1) machine.advance({ timeSeconds: frame, flags: flags(7, 7, 7, 7, 7) });
  const split = findSplit(machine, 5, [0, 1, 2, 4]);
  const left = split.components.find(component => component.componentLabel === 0);
  const right = split.components.find(component => component.componentLabel === 1);
  assert.deepEqual(left.winningParentComponentLabels, [0]);
  assert.equal(left.episodeId, 0);
  assert.equal(right.freshBirth, true);
  assert.deepEqual(right.forkSourceParentIds, [0]);
  assert.deepEqual(split.splitForkIds, [right.episodeId]);
  const episodes = machine.getOpenEpisodes();
  const fork = episodes.find(episode => episode.id === right.episodeId);
  assert.equal(fork.birthTimeSeconds, split.timeSeconds);
  assert.equal(fork.birthFrameIndex, split.frameIndex);
  assert.deepEqual(fork.cellIndices, right.cellIndices);
  assert.deepEqual(fork.parentIds, []);
  assert.deepEqual(fork.ancestryIds, [fork.id]);
  assert.deepEqual(fork.splitProvenanceIds, [0]);
});

test('equal overlap tie routes to lower deterministic current component label', () => {
  const machine = createW1MaxOverlapCrystallizer({ width: 3, height: 1 });
  for (let frame = 0; frame < 30; frame += 1) machine.advance({ timeSeconds: frame, flags: flags(7, 7, 7) });
  const split = findSplit(machine, 3, [0, 2]);
  assert.equal(split.components[0].episodeId, 0);
  assert.deepEqual(split.components[0].winningParentComponentLabels, [0]);
  assert.deepEqual(split.components[1].forkSourceParentIds, [0]);
});

test('crossing overlaps route each parent once and leave losing edges as provenance only', () => {
  const overlaps = [new Map([[0, 2], [1, 1]]), new Map([[0, 1], [1, 2]])];
  const { winnerByPrevious, routedByCurrent } = routeMaximumOverlaps(overlaps, 2);
  assert.deepEqual(winnerByPrevious, [0, 1]);
  assert.deepEqual(routedByCurrent, [[0], [1]]);
  const droppedByCurrent = overlaps.flatMap((counts, previousLabel) => [...counts]
    .filter(([currentLabel]) => winnerByPrevious[previousLabel] !== currentLabel)
    .map(([currentLabel]) => ({ previousLabel, currentLabel })));
  assert.deepEqual(droppedByCurrent, [{ previousLabel: 0, currentLabel: 1 }, { previousLabel: 1, currentLabel: 0 }]);
  assert.equal(routedByCurrent.some(labels => labels.length === 0), false);
  assert.equal(routedByCurrent.some(labels => labels.length > 1), false);
});

test('crossing split routes each child to one parent and records the other edge as provenance', () => {
  const width = 9, height = 5, cellCount = width * height, splitAt = 50;
  const parentLeft = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const parentRight = [35, 36, 37, 38, 39, 40, 41, 42, 43, 44];
  const childLeft = [0, 9, 18, 27, 36];
  const childRight = [8, 17, 26, 35, 44];
  const p = new Set([...parentLeft, ...parentRight]), c = new Set([...childLeft, ...childRight]);
  const machine = createW1MaxOverlapCrystallizer({ width, height });
  for (let frame = 0; frame <= splitAt + 1; frame += 1) {
    const input = Uint8Array.from({ length: cellCount }, (_, cell) => {
      const inParent = p.has(cell), inChild = c.has(cell);
      return (inParent && inChild) || (inParent && frame < splitAt - 21) || (inChild && frame >= splitAt) ? 7 : 0;
    });
    machine.advance({ timeSeconds: frame, flags: input });
  }
  const diagnostics = machine.getLastIdentityDiagnostics();
  assert.deepEqual(diagnostics.overlapEdges.map(edge => [edge.preFrameParentId, edge.currentComponentLabel, edge.overlapCount, edge.winner]), [
    [0, 0, 2, true], [0, 1, 1, false], [1, 0, 1, false], [1, 1, 2, true]
  ]);
  assert.deepEqual(diagnostics.components.map(component => [component.episodeId, component.sourceParentIds, component.freshBirth]), [
    [0, [0], false], [1, [1], false]
  ]);
  assert.deepEqual(diagnostics.mergeAbsorptions, []);
  const episodes = machine.getOpenEpisodes();
  assert.deepEqual(episodes.map(episode => [episode.id, episode.parentIds, episode.ancestryIds, episode.splitProvenanceIds, episode.mergeCount]), [
    [0, [], [0], [1], 0], [1, [], [1], [0], 0]
  ]);
});

test('split fork closes independently while inherited child remains active', () => {
  const machine = createW1MaxOverlapCrystallizer({ width: 3, height: 1 });
  for (let frame = 0; frame < 30; frame += 1) machine.advance({ timeSeconds: frame, flags: flags(7, 7, 7) });
  const split = findSplit(machine, 3, [0, 2]);
  const forkId = split.splitForkIds[0];
  let forkClosed = [];
  for (let frame = split.frameIndex + 1; frame < split.frameIndex + 400; frame += 1) {
    const result = machine.advance({ timeSeconds: frame, flags: flags(7, 0, 0) });
    forkClosed.push(...result.closedEpisodes, ...result.discardedEpisodes);
    if (forkClosed.some(episode => episode.id === forkId)) break;
  }
  assert.ok(forkClosed.some(episode => episode.id === forkId));
  assert.ok(machine.getOpenEpisodes().some(episode => episode.id === 0));
  assert.equal(machine.getLastIdentityDiagnostics().activeEntityCount, 1);
});

test('pure merge retains original canonical identity and admitted union', () => {
  const candidate = createW1MaxOverlapCrystallizer({ width: 3, height: 1 });
  const original = createW1Crystallizer({ width: 3, height: 1 });
  for (let frame = 0; frame < 80; frame += 1) {
    const input = frame < 30 ? flags(7, 0, frame >= 10 ? 7 : 0) : flags(7, 7, 7);
    candidate.advance({ timeSeconds: frame, flags: input });
    original.advance({ timeSeconds: frame, flags: input });
  }
  const episode = candidate.getOpenEpisodes()[0];
  assert.equal(episode.id, 0);
  assert.deepEqual(episode.parentIds, [1]);
  assert.deepEqual(episode.ancestryIds, [0, 1]);
  assert.deepEqual(episode.cellIndices, [0, 1, 2]);
  assert.deepEqual(episode.cellIndices, original.getOpenEpisodes()[0].cellIndices);
  assert.equal(episode.birthTimeSeconds, original.getOpenEpisodes()[0].birthTimeSeconds);
  assert.equal(episode.firstAdmissionTimeSecondsByCell[2], original.getOpenEpisodes()[0].firstAdmissionTimeSecondsByCell[2]);
  assert.ok(episode.birthTimeSeconds < episode.firstAdmissionTimeSecondsByCell[2]);
});

test('later merge uses only routed parents and preserves prior split provenance', () => {
  const machine = createW1MaxOverlapCrystallizer({ width: 9, height: 1 });
  for (let frame = 0; frame < 100; frame += 1) {
    const values = new Uint8Array(9);
    const cells = frame < 30 ? [0, 1, 2, 6, 7, 8]
      : frame < 80 ? [0, 2, 6, 8]
        : [0, 1, 2, 3, 4, 5, 6, 8];
    for (const cell of cells) values[cell] = 7;
    machine.advance({ timeSeconds: frame, flags: values });
    const diag = machine.getLastIdentityDiagnostics();
    if (diag.components.some(component => component.absorbedParentIds.length)) {
      const merged = diag.components.find(component => component.absorbedParentIds.length);
      assert.deepEqual(merged.sourceParentIds, [1, 2]);
      assert.deepEqual(merged.absorbedParentIds, [2]);
      assert.deepEqual(merged.droppedEdges, []);
      assert.deepEqual(machine.getOpenEpisodes().map(episode => episode.id), [0, 1, 3]);
      assert.deepEqual(machine.getOpenEpisodes().find(episode => episode.id === 1).splitProvenanceIds, [0]);
      assert.equal(diag.activeEntityCount, 3);
      return;
    }
  }
  assert.fail('expected simultaneous split and merge event');
});

test('no-split replay preserves original active masks, EMA bounds and episode recurrence', () => {
  const candidate = createW1MaxOverlapCrystallizer({ width: 2, height: 1 });
  const original = createW1Crystallizer({ width: 2, height: 1 });
  for (let frame = 0; frame < 80; frame += 1) {
    const input = flags(frame < 50 ? 7 : 0, frame < 50 ? 7 : 0);
    const left = candidate.advance({ timeSeconds: frame, flags: input });
    const right = original.advance({ timeSeconds: frame, flags: input });
    assert.deepEqual(candidate.getSnapshot().activeMask, original.getSnapshot().activeMask);
    assert.deepEqual(left.stateBounds, right.stateBounds);
    assert.equal(left.activeComponentCount, right.activeComponentCount);
    const project = episodes => episodes.map(({ splitProvenanceIds, ...episode }) => episode);
    assert.deepEqual(project(candidate.getOpenEpisodes()), original.getOpenEpisodes());
    assert.deepEqual(left.closedEpisodes.map(({ splitProvenanceIds, ...episode }) => episode), right.closedEpisodes);
  }
});

test('invalid and future frames are atomic and candidate consumes no RNG', () => {
  const candidate = createW1MaxOverlapCrystallizer({ width: 2, height: 1 });
  candidate.advance({ timeSeconds: 0, flags: flags(7, 0) });
  const before = candidate.getSnapshot();
  assert.throws(() => candidate.advance({ timeSeconds: 1, flags: flags(7, 8) }), /integers from 0 through 7/);
  assert.throws(() => candidate.advance({ timeSeconds: 1, flags: flags(7) }), /flags length/);
  assert.deepEqual(candidate.getSnapshot(), before);
  const future = createW1MaxOverlapCrystallizer({ width: 2, height: 1 });
  const reference = createW1MaxOverlapCrystallizer({ width: 2, height: 1 });
  const futurePrefix = [], referencePrefix = [];
  for (let frame = 0; frame < 10; frame += 1) {
    future.advance({ timeSeconds: frame, flags: frame < 5 ? flags(7, 0) : flags(0, 7) });
    reference.advance({ timeSeconds: frame, flags: flags(7, 0) });
    if (frame < 5) {
      futurePrefix.push(future.getSnapshot(), future.getLastIdentityDiagnostics());
      referencePrefix.push(reference.getSnapshot(), reference.getLastIdentityDiagnostics());
    }
  }
  assert.deepEqual(futurePrefix, referencePrefix);
  assert.doesNotMatch(candidateSource, /\bMath\.random\s*\(|\bcrypto\.(?:getRandomValues|randomUUID)\s*\(/);
});

test('replay is deterministic and all emitted numeric state is finite', () => {
  const run = () => {
    const machine = createW1MaxOverlapCrystallizer({ width: 5, height: 1 }), trace = [];
    for (let frame = 0; frame < 90; frame += 1) {
      const cells = frame < 30 ? [0, 1, 2, 3, 4] : frame < 60 ? [0, 1, 2, 4] : [0, 1, 2];
      const input = new Uint8Array(5);
      for (const cell of cells) input[cell] = 7;
      const result = machine.advance({ timeSeconds: frame, flags: input });
      trace.push(result, machine.getSnapshot(), machine.getLastIdentityDiagnostics(), machine.getOpenEpisodes());
    }
    return trace;
  };
  const first = run(), second = run();
  assert.deepEqual(first, second);
  assertFiniteNumbers(first);
});

test('only split routing and provenance metadata differ from original implementation', () => {
  assert.equal(
    sourceSpan(originalSource, '    const dt =', '    const found = components8(active, width, height);'),
    sourceSpan(candidateSource, '    const dt =', '    const found = components8(active, width, height);')
  );
  for (const name of ['validateFrame', 'components8', 'admit', 'geometry', 'stateBounds']) {
    assert.equal(functionText(candidateSource, name), functionText(originalSource, name), `${name} changed`);
  }
  const provenanceMergeLine = '    target.splitProvenanceIds = new Set([...target.splitProvenanceIds, ...source.splitProvenanceIds]);\n';
  assert.equal(functionText(candidateSource, 'mergeInto').replace(provenanceMergeLine, ''), functionText(originalSource, 'mergeInto'));
  const provenanceOutputLine = '      splitProvenanceIds: Object.freeze([...episode.splitProvenanceIds].sort((a, b) => a - b)),\n';
  assert.equal(functionText(candidateSource, 'finishEpisode').replace(provenanceOutputLine, ''), functionText(originalSource, 'finishEpisode'));
  assert.equal(functionText(candidateSource, 'getOpenEpisodes').replace(provenanceOutputLine, ''), functionText(originalSource, 'getOpenEpisodes'));
  assert.equal(
    sourceSpan(originalSource, '    const activeEpisodes =', '    const currentLabels ='),
    sourceSpan(candidateSource, '    const activeEpisodes =', '    const currentLabels =')
  );
});
