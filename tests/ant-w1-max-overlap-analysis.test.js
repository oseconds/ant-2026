import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { deriveAnalyzerSource, loadCandidateAnalyzer, describeValues, splitFates, _maxOverlapAnalysisTest } from '../scripts/ant-w1-max-overlap-analysis.js';
import { analyzeSeed } from '../scripts/ant-w1-analysis.js';

test('shadow adapter preserves the complete old measurement function and rejects source drift', async () => {
  const source = await readFile(new URL('../scripts/ant-w1-analysis.js', import.meta.url), 'utf8');
  const derived = deriveAnalyzerSource(source);
  const body = text => text.slice(text.indexOf('export function analyzeSeed('), text.indexOf('function csv('));
  assert.equal(body(derived), body(source));
  assert.ok(derived.includes('createMaxOverlapCrystallizer as createW1Crystallizer'));
  assert.throws(() => deriveAnalyzerSource(source.replace("from './ant-w1-crystallization.js'", "from './unexpected.js'")), /one original model binding/);
});

test('shadow analysis preserves unsplit geometry, attribution windows and character values', async () => {
  const frames = Array.from({ length: 60 }, (_, timeSeconds) => ({ timeSeconds, tick: timeSeconds * 60 }));
  const flags = new Uint8Array(frames.length * 9216);
  for (let frame = 1; frame <= 5; frame++) flags[frame * 9216 + 4500] = 7;
  const feet = [{ timeSeconds: .5, antId: 'A', cellIndex: 4500, directionAvailable: true,
    nematicX: 1, nematicY: 0, segmentStartSeconds: .5 - 1 / 60, segmentEndSeconds: .5, travelDistance: 1 }];
  const input = { fieldMetadata: { frames }, metadata: { seed: 1, fieldIntervals: frames.length }, flags, feet, coverage: {} };
  const baseline = { seed: 1, milestones: [], history: frames.map(f => ({ ...f, production: { occupiedCells: 0 }, shadow: { occupiedCells: 0 } })) };
  const { analyzeSeed: candidate } = await loadCandidateAnalyzer();
  const reference = analyzeSeed(input, baseline), result = candidate(input, baseline);
  const removeProvenance = value => JSON.parse(JSON.stringify(value, (key, item) => key === 'splitProvenanceIds' ? undefined : item));
  assert.deepEqual(removeProvenance(result), reference);
  assert.equal(result.episodes[0].character.directionalOrder, 1);
  assert.equal(result.episodes[0].evidence.directionalWindowStartSeconds, 0);
});

test('analysis distributions, CSV and finite self-checks handle empty and exceptional values', () => {
  assert.equal(describeValues([]).median, null);
  assert.equal(describeValues([3, 1, 2, 4]).median, 2.5);
  assert.throws(() => describeValues([Infinity]));
  assert.equal(_maxOverlapAnalysisTest.csv([{ a: [1, 2], b: '"x"' }], ['a', 'b']), 'a,b\n"[1,2]","""x"""\n');
  assert.throws(() => _maxOverlapAnalysisTest.finite({ nested: [NaN] }));
});

test('split-child fates distinguish independent closure from later absorption and censoring', () => {
  const forks = [1, 2, 3, 4].map(episodeId => ({ episodeId, timeSeconds: 10 }));
  const absorptions = [{ sourceEpisodeId: 2, targetEpisodeId: 0, timeSeconds: 15 }];
  const fates = splitFates(forks, absorptions, [{ id: 1, status: 'frozen' }],
    [{ id: 3, status: 'discarded' }], [{ id: 0, status: 'right-censored' }, { id: 4, status: 'right-censored' }]);
  assert.equal(fates.independentlyFrozenCount, 1);
  assert.equal(fates.independentlyDiscardedCount, 1);
  assert.equal(fates.reabsorbedTerminalPending, 1);
  assert.equal(fates.independentlyPendingCount, 1);
  assert.equal(fates.timeToFirstAbsorption.median, 5);
  const chain = splitFates([{ episodeId: 7, timeSeconds: 10 }],
    [{ sourceEpisodeId: 7, targetEpisodeId: 5, timeSeconds: 19 }, { sourceEpisodeId: 5, targetEpisodeId: 0, timeSeconds: 50 }],
    [{ id: 0, status: 'frozen' }], [], []);
  assert.equal(chain.rows[0].terminalEpisodeId, 0);
  assert.equal(chain.reabsorbedTerminalFrozen, 1);
  assert.equal(chain.rows[0].secondsBeforeFirstAbsorption, 9);
  assert.throws(() => splitFates([{ episodeId: 2, timeSeconds: 10 }],
    [{ sourceEpisodeId: 2, targetEpisodeId: 0, timeSeconds: 15 }, { sourceEpisodeId: 0, targetEpisodeId: 2, timeSeconds: 16 }], [], [], []), /acyclic/);
});
