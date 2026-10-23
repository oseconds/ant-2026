import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { evaluateWide, loadRows, localStages, runAttribution } from '../scripts/ant-sensor-operator-isolation.js';

const INPUT = 'docs/ant/evidence/2026-10-24-ant-sensor-operator-isolation/inputs/station-raw.json.gz';
const SHAPES = ['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve'];
const PHASES = ['p00', 'p10', 'p01', 'p11'];
const OFFSETS = [-0.92, -0.47, 0, 0.47, 0.92];

test('frozen station rows retain exact query geometry and complete phase cohort', () => {
  const rows = loadRows(INPUT);
  assert.equal(rows.length, 6 * 4 * 231);
  assert.deepEqual([...new Set(rows.map(row => row.shape))].sort(), [...SHAPES].sort());
  assert.deepEqual([...new Set(rows.map(row => row.phase))].sort(), [...PHASES].sort());
  for (const row of rows) {
    assert.equal(row.localGeometry.length, 18);
    assert.equal(row.localDecomposition.length, 18);
    row.localGeometry.forEach((point, index) => {
      assert.deepEqual(point, row.localDecomposition[index].query);
    });
    assert.deepEqual(row.wideGeometry.map(candidate => candidate.offset), OFFSETS);
    assert.equal(row.wideGeometry.length, 5);
    assert.equal(row.wideDecomposition.length, 5);
    row.wideGeometry.forEach((candidate, candidateIndex) => {
      assert.equal(candidate.reads.length, 5);
      assert.equal(row.wideDecomposition[candidateIndex].length, 5);
      candidate.reads.forEach((point, sampleIndex) => {
        const query = row.wideDecomposition[candidateIndex][sampleIndex].query;
        assert.deepEqual({ x: point.x, y: point.y }, query);
      });
    });
  }
});

test('current production local and wide sensor methods reproduce all frozen raw rows without RNG', () => {
  const rows = loadRows(INPUT);
  let randomCalls = 0;
  const random = () => { randomCalls += 1; throw new Error('Sensor-only replay must not use RNG.'); };
  for (const row of rows) {
    for (const values of [row.localReferenceRaw, row.localProductionRaw]) {
      let cursor = 0;
      const context = {
        random,
        field: { sample: () => values[cursor++] }
      };
      const actual = AntController.prototype.senseLocalTrail.call(context,
        { x: 0.5, y: 0.5, heading: 0 });
      const expected = localStages(values);
      assert.equal(cursor, 18);
      for (const key of ['left', 'center', 'right', 'strength', 'coherence', 'balance', 'steering']) {
        const actualValue = key === 'balance'
          ? (actual.right - actual.left) / (actual.left + actual.center + actual.right + 1e-9)
          : actual[key];
        assert.equal(actualValue, expected[key], `${row.shape}/${row.phase}/${row.station} local ${key}`);
      }
    }
    for (const candidates of [row.wideReference, row.wideProduction]) {
      const expected = evaluateWide(candidates, row.wideGeometry);
      for (let candidateIndex = 0; candidateIndex < 5; candidateIndex += 1) {
        const candidate = candidates[candidateIndex];
        let cursor = 0;
        const context = {
          random,
          state: { behavior: { sensorDistance: 0.042, sensorWidth: 0.014 } },
          field: { sample: () => candidate.raw[cursor++] }
        };
        const actual = AntController.prototype.senseTrail.call(context,
          { x: 0.5, y: 0.5 }, candidate.offset);
        assert.equal(cursor, 5);
        assert.equal(actual, expected[candidateIndex].maximum,
          `${row.shape}/${row.phase}/${row.station} wide maximum ${candidateIndex}`);
      }
    }
  }
  assert.equal(randomCalls, 0);
});

test('stage replay is deterministic and preserves straight and mirror controls', () => {
  const rows = loadRows(INPUT);
  const first = runAttribution(rows, { mainSha: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2' });
  const second = runAttribution(rows, { mainSha: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2' });
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(digest(first), digest(second));
  assert.equal(first.local.exactProductionParity.mismatches, 0);
  assert.equal(first.wide.exactProductionParity.mismatches, 0);
  assert.equal(first.stageRows.local.length, 5544);
  assert.equal(first.stageRows.wide.length, 5544);
  assert.equal(first.local.signFailures.count, 549);
  assert.equal(first.local.signFailures.stableOppositeCount, 546);
  assert.equal(first.local.signFailures.productionNearZeroCount, 3);
  assert.equal(first.local.signFailures.firstDivergenceCounts.rawSampleSideMean, 549);
  assert.deepEqual(Object.fromEntries(['clear', 'weak'].map(cueClass => [cueClass,
    first.local.signFailures.rows.filter(row => row.cueClass === cueClass).length])), {
    clear: 314, weak: 235
  });
  assert.equal(first.wide.counts.strictUniqueAnalyticWinners, 5072);
  assert.equal(first.wide.counts.strictUniqueWinnerMismatches, 2378);
  assert.deepEqual(first.wide.firstRankOrderDivergenceForStrictUniqueWinnerMismatches, {
    rawTransverseOrder: 1931, weightedMaxOrder: 447, hillOrder: 0,
    confidenceDirectionalScore: 0, unclassified: 0
  });
  assert.deepEqual(first.wide.firstProductionWinnerDepartureFromAnalyticFinalWinner.counts, {
    rawMaximum: 1380, weightedMax: 998, hillResponse: 0,
    confidenceDirectionalScore: 0, unclassified: 0
  });
  assert.equal(first.stageRows.wide.find(row => row.shape === 'tight'
    && row.phase === 'p10' && row.station === 0.066).productionFirstWrongStage, 'weightedMax');
  assert.equal(first.stageRows.wide.find(row => row.shape === 'tight'
    && row.phase === 'p00' && row.station === 0.294).productionFirstWrongStage, 'rawMaximum');
  assert.ok(first.local.straight.referenceSteering.maxAbs < 1e-14);
  assert.ok(first.local.mirror.referenceMirrorSumError.maxAbs < 1e-12);
  assert.ok(first.local.mirror.productionMirrorSumError.maxAbs < 1e-12);
});
