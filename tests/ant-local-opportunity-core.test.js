import assert from 'node:assert/strict';
import test from 'node:test';
import { CELL_COUNT, captureKey, compareCaptureSets, descriptiveSpacing, enumeratePlateauMaxima,
  componentOverlapRelations, findLagAnchor, overlappingComponentPairs, reciprocalNearest, xCapture } from '../scripts/ant-local-opportunity-core.js';

const cells = () => new Uint8Array(CELL_COUNT);
const values = () => new Float64Array(CELL_COUNT);
const packed = array => ({ type: array.constructor.name, length: array.length,
  data: Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString('base64') });

const cases = [
  ['exact equal plateaus retain all cells; higher neighbors reject; zero maxima stay context-only', () => {
    const S = cells(), V = values();
    for (const index of [100, 101, 196, 197, 300, 301, 500, 501]) S[index] = 1;
    V[100] = V[101] = V[196] = 2; V[197] = 1;
    V[300] = 1; V[301] = 2; V[500] = V[501] = 0;
    const result = enumeratePlateauMaxima({ S, values: V });
    assert.deepEqual(result.peaks, [{ index: 100, value: 2, cells: [100, 101, 196] }, { index: 301, value: 2, cells: [301] }]);
    assert.equal(result.zeroMaxContextCount, 1);
  }],
  ['greedy groups keep nearby peaks in separate current components', () => {
    const labels = new Int32Array(CELL_COUNT); labels.fill(-1); labels[200] = 0; labels[201] = 1;
    const result = descriptiveSpacing([{ index: 200, value: 4 }, { index: 201, value: 3 }], labels, 1 / 95);
    assert.deepEqual(result.representatives.map(row => row.index), [200, 201]);
  }],
  ['strongest-first grouping is deliberately nontransitive', () => {
    const labels = new Int32Array(CELL_COUNT); labels.fill(-1); labels[10] = labels[11] = labels[12] = 0;
    const result = descriptiveSpacing([{ index: 10, value: 3 }, { index: 11, value: 2 }, { index: 12, value: 1 }], labels, 1 / 95);
    assert.deepEqual(result.representatives.map(row => row.index), [10, 12]);
    assert.deepEqual(result.assignments.map(row => row.representativeIndex), [10, 10, 12]);
  }],
  ['reciprocal nearest breaks equal-distance ties toward the lower index', () => {
    assert.deepEqual(reciprocalNearest([{ index: 20 }], [{ index: 21 }, { index: 19 }], 1 / 95), {
      pairs: [{ previousIndex: 20, currentIndex: 19, distance: 1 / 95 }], unmatchedPrevious: [], unmatchedCurrent: [21]
    });
  }],
  ['component ordinals can change when shared F cells preserve continuity', () => {
    const before = new Int32Array(CELL_COUNT); before.fill(-1); before[100] = 0; before[101] = 0;
    const after = new Int32Array(CELL_COUNT); after.fill(-1); after[100] = 1; after[101] = 1;
    const overlap = overlappingComponentPairs(before, after);
    assert.ok(overlap.has('0:1'));
    assert.equal(reciprocalNearest([{ index: 100, component: 0 }], [{ index: 100, component: 1 }], 0,
      (a, b) => overlap.has(`${a.component}:${b.component}`)).pairs.length, 1);
    after.fill(-1); after[102] = 0;
    const noOverlap = overlappingComponentPairs(before, after);
    assert.equal(noOverlap.has('0:0'), false);
    assert.equal(reciprocalNearest([{ index: 100, component: 0 }], [{ index: 102, component: 0 }], .025,
      (a, b) => noOverlap.has(`${a.component}:${b.component}`)).pairs.length, 0);
  }],
  ['adjacent component overlap reports descriptive split and merge degrees', () => {
    const before = new Int32Array(CELL_COUNT); before.fill(-1);
    const after = new Int32Array(CELL_COUNT); after.fill(-1);
    before[10] = before[11] = 0; before[12] = 1; before[13] = 2;
    after[10] = 0; after[11] = 1; after[12] = after[13] = 2;
    const result = componentOverlapRelations(before, after);
    assert.equal(result.splitCount, 1); assert.deepEqual(result.splitComponentIds, [0]);
    assert.equal(result.mergeCount, 1); assert.deepEqual(result.mergeComponentIds, [2]);
    assert.deepEqual(result.relations, [
      { previousComponent: 0, currentComponent: 0, sharedFCells: 1 },
      { previousComponent: 0, currentComponent: 1, sharedFCells: 1 },
      { previousComponent: 1, currentComponent: 2, sharedFCells: 1 },
      { previousComponent: 2, currentComponent: 2, sharedFCells: 1 }
    ]);
  }],
  ['lag boundaries use nearest strictly prior anchor, ties older, and no interpolation', () => {
    const anchors = [{ timeMs: 10000 }, { timeMs: 20000 }, { timeMs: 30000 }];
    assert.equal(findLagAnchor(anchors, 0, 1), null);
    assert.deepEqual(findLagAnchor(anchors, 1, 5), { priorIndex: 0, priorTimeMs: 10000, targetTimeMs: 15000, elapsedSeconds: 10 });
    assert.deepEqual(findLagAnchor(anchors, 2, 15), { priorIndex: 0, priorTimeMs: 10000, targetTimeMs: 15000, elapsedSeconds: 20 });
  }],
  ['X keys deduplicate exact sets and relations retain disjoint and nested cases', () => {
    const F = cells(); F[100] = F[101] = F[800] = 1;
    const X = xCapture(F, 100);
    assert.deepEqual(X.cells, [100, 101]);
    assert.equal(X.connected, true); assert.equal(X.radiusValid, true);
    assert.equal(captureKey([100, 101]), captureKey([100, 101]));
    assert.deepEqual(compareCaptureSets([100, 101], [200]), {
      intersection: 0, jaccard: 0, overlapOfSmaller: 0, identical: false, disjoint: true, nested: false
    });
    assert.deepEqual(compareCaptureSets([100, 101], [101]), {
      intersection: 1, jaccard: .5, overlapOfSmaller: 1, identical: false, disjoint: false, nested: true
    });
  }],
  ['signal analysis preserves full signed lag maps and component-gated grouped tracks', async () => {
    const { analyzeSignals } = await import('../scripts/ant-local-opportunity-analyze.js');
    const F = cells(); for (const index of [100, 101, 196, 197]) F[index] = 1;
    const E = F.slice(), layers = new Uint16Array(CELL_COUNT), zero = new Float32Array(CELL_COUNT);
    const anchors = [
      { timeMs: 10000, peak: [4, 4, 1, 0] },
      { timeMs: 20000, peak: [4, 5, 1, 0] },
      { timeMs: 30000, peak: [4, 3, 2, 0] }
    ].map(({ timeMs, peak }, index) => {
      const D = zero.slice(); [100, 101, 196, 197].forEach((cell, i) => { D[cell] = peak[i]; });
      const foot = new Uint32Array(CELL_COUNT), travel = zero.slice();
      if (index === 0) foot[100] = 1;
      const window = () => ({ count: packed(foot), groups: packed(new Uint16Array(CELL_COUNT)),
        ants: packed(new Uint16Array(CELL_COUNT)), ageSeconds: packed(new Float32Array(CELL_COUNT)) });
      const traffic = () => ({ travel: packed(travel), ants: packed(new Uint16Array(CELL_COUNT)),
        occupancySeconds: packed(zero), segments: packed(new Uint16Array(CELL_COUNT)) });
      return { index, tick: index * 600, timeMs, E: packed(E), F: packed(F), B: packed(D), C: packed(D), D: packed(D),
        material: { layers: packed(layers), top: packed(layers), lastBirthMs: packed(new Float64Array(CELL_COUNT)) },
        feet: { '1': window(), '5': window(), '20': window() },
        traffic: { '1': traffic(), '5': traffic(), '20': traffic() }, birthIds: [], diagnostics: { observerRandomCalls: 0 } };
    });
    const result = analyzeSignals({ schema: 'ant-local-opportunity-capture-v1', authority: 'a'.repeat(40), seed: '20261005',
      hz: 60, seconds: 30, sourceHashes: {}, validation: { parity: { equalEveryTick: true }, observerRandomCalls: 0 }, births: [], anchors, captures: [] });
    assert.equal(result.channels.length, 18);
    assert.equal(result.anchors[0].delta.deltaD1, null);
    assert.equal(result.anchors[0].channels.deltaD1, null);
    assert.equal(result.anchors[1].deltaLags['1'].priorIndex, 0);
    assert.equal(result.anchors[1].delta.deltaD1.type, 'Float64Array');
    assert.equal(result.anchors[1].delta.deltaD1.length, CELL_COUNT);
    const track = result.tracks.find(row => row.channel === 'D' && row.representation === 'g15' && row.cutoff === .025);
    assert.equal(track.observations.length, 3);
    assert.equal(track.observations[1].displacementFromPrevious, 1 / 95);
    assert.equal(track.observations[1].xJaccard, 1);
    assert.equal(track.leftCensored, true); assert.equal(track.rightCensored, true);
    assert.deepEqual(track.startObservation, { anchorIndex: 0, timeMs: 10000, previousAnchorIndex: null,
      reason: 'left-censored-at-source-boundary' });
    assert.deepEqual(track.endObservation, { anchorIndex: 2, timeMs: 30000, nextAnchorIndex: null, nextTimeMs: null,
      reason: 'right-censored-at-source-boundary', biologicalTerminationInferred: false });
    const footTrack = result.tracks.find(row => row.channel === 'feet1' && row.representation === 'raw' && row.cutoff === .025);
    assert.equal(footTrack.observations.length, 1);
    assert.equal(footTrack.leftCensored, true); assert.equal(footTrack.rightCensored, false);
    assert.deepEqual(footTrack.startObservation, { anchorIndex: 0, timeMs: 10000, previousAnchorIndex: null,
      reason: 'left-censored-at-source-boundary' });
    assert.deepEqual(footTrack.endObservation, { anchorIndex: 0, timeMs: 10000, nextAnchorIndex: 1, nextTimeMs: 20000,
      reason: 'no-adjacent-reciprocal-match-at-next-anchor', biologicalTerminationInferred: false });
    for (const row of result.tracks) {
      const first = row.observations[0], last = row.observations.at(-1);
      assert.equal(row.startObservation.anchorIndex, first.anchorIndex);
      assert.equal(row.startObservation.timeMs, first.timeMs);
      assert.equal(row.startObservation.previousAnchorIndex, first.anchorIndex === 0 ? null : first.anchorIndex - 1);
      assert.equal(row.endObservation.anchorIndex, last.anchorIndex);
      assert.equal(row.endObservation.timeMs, last.timeMs);
      assert.equal(row.endObservation.nextAnchorIndex, last.anchorIndex === 2 ? null : last.anchorIndex + 1);
      assert.equal(row.endObservation.nextTimeMs, last.anchorIndex === 2 ? null : anchors[last.anchorIndex + 1].timeMs);
      assert.equal(row.leftCensored, first.anchorIndex === 0);
      assert.equal(row.rightCensored, last.anchorIndex === 2);
      assert.equal(row.endObservation.biologicalTerminationInferred, false);
    }
    assert.ok(result.anchors.every(anchor => anchor.captures.length === 1));
    assert.equal(result.anchors[0].componentRelationFromPrevious, null);
    assert.equal(result.anchors[1].componentRelationFromPrevious.relations.length, 1);
    assert.equal(new Set(result.anchors[0].captures[0].centers.map(row => `${row.channel}:${row.representation}:${row.index}`)).size,
      result.anchors[0].captures[0].centers.length);
  }, false]
];

export async function runSelfcheck() { for (const [, check, selfcheck = true] of cases) if (selfcheck) await check(); }
if (!process.argv.includes('--selfcheck')) for (const [name, check] of cases) test(name, check);
