import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { evaluateWide } from '../scripts/ant-field-writer-reader-failure-attribution.js';
import {
  OFFSETS, PACKAGE, STAGES, classifyOutcome, firstRankDivergence, firstTargetDeparture, runAttribution,
  rowKey, stageTrace
} from '../scripts/ant-cic-wide-stage-attribution.js';

const weights = [0.55, 0.775, 1, 0.775, 0.55];
const geometries = OFFSETS.map(offset => ({
  offset,
  reads: weights.map(weight => ({ weight }))
}));

test('reuses the helper pipeline and preserves its deterministic exact-tie order', () => {
  const wide = evaluateWide(OFFSETS.map(offset => ({ offset, raw: [0, 0, 0, 0, 0] })), geometries);
  const trace = stageTrace(wide, OFFSETS[0]);
  assert.deepEqual(trace.map(stage => stage.id), STAGES.map(stage => stage.id));
  assert.deepEqual(trace.map(stage => stage.order), Array.from({ length: STAGES.length }, () => [0, 1, 2, 3, 4]));
  assert(trace.every(stage => stage.exactTopTie && stage.targetTop && stage.margin === 0));
  assert.equal(firstTargetDeparture(trace), null);
});

test('finds the first stage-order divergence without replacing earlier matched order', () => {
  const make = weighted => STAGES.map((stage, index) => ({
    id: stage.id,
    order: index < weighted ? [0, 1, 2, 3, 4] : [1, 0, 2, 3, 4]
  }));
  const analytic = make(STAGES.length + 1);
  assert.equal(firstRankDivergence(analytic, make(1)), 'weightedMaximum');
  assert.equal(firstRankDivergence(analytic, make(STAGES.length + 1)), null);
});

test('classifies recovered/new-error memberships and preserves frozen row keys', () => {
  assert.equal(classifyOutcome(0, 1, 0), 'recovered');
  assert.equal(classifyOutcome(0, 0, 1), 'new-error');
  assert.equal(classifyOutcome(0, 1, 2), 'both-wrong');
  assert.equal(classifyOutcome(0, 0, 0), 'both-correct');
  assert.equal(rowKey({ shape: 'tightMirror', phase: 'p11', station: -0.014 }), 'tightMirror|p11|-0.014');
});

test('replays the full frozen census, subgroup/tie accounting, and deterministic outputs', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'ant-cic-wide-stage-'));
  const evidenceRoot = resolve(PACKAGE);
  const firstDir = join(tempRoot, 'first');
  const secondDir = join(tempRoot, 'second');
  assert(!tempRoot.startsWith(evidenceRoot + sep), 'test output must not overlap committed evidence');
  try {
    const first = runAttribution(firstDir);
    const second = runAttribution(secondDir);
    assert.deepEqual(first.manifest, second.manifest);
    for (const name of [...Object.keys(first.manifest.files), 'manifest.json']) {
      assert.deepEqual(readFileSync(join(firstDir, name)), readFileSync(join(secondDir, name)), `${name} repeatability`);
    }

    const { global, subgroups, sCurveAnalyticZeroControl, parity } = first.summary;
    assert.equal(parity.allRows, 5544);
    assert.equal(global.analyticUniqueRows, 5072);
    assert.equal(global.productionErrors, 2378);
    assert.equal(global.cicErrors, 2378);
    assert.equal(global.recovered, 92);
    assert.equal(global.newErrors, 92);
    assert.equal(global.analyticTieAccounting.exactTies, 472);
    assert.equal(global.analyticTieAccounting.savedFlagDisagreements, 0);
    assert.equal(global.exactFinalScoreTies.production, 0);
    assert.equal(global.exactFinalScoreTies.cic, 0);
    assert.equal(subgroups.routesAndPhases.tight.recovered, 44);
    assert.equal(subgroups.routesAndPhases.tight.newErrors, 46);
    assert.equal(subgroups.routesAndPhases.tightMirror.recovered, 44);
    assert.equal(subgroups.routesAndPhases.tightMirror.newErrors, 46);
    assert.equal(subgroups.routesAndPhases.p01.recovered, 27);
    assert.equal(subgroups.routesAndPhases.p01.newErrors, 28);
    assert.equal(subgroups.routesAndPhases.p11.recovered, 17);
    assert.equal(subgroups.routesAndPhases.p11.newErrors, 28);
    assert.equal(sCurveAnalyticZeroControl.count, 392);
    assert.equal(sCurveAnalyticZeroControl.baseline.falseNonzero, 364);
    assert.equal(sCurveAnalyticZeroControl.cic.falseNonzero, 377);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
