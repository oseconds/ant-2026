import test from 'node:test';
import assert from 'node:assert/strict';
import { censusNoduleOpportunity, installNoduleOpportunityObserver, stableStateHash } from '../scripts/ant-natural-nodule-opportunity.js';
import { MaterialStratigraphy } from '../src/lib/agents/ant/MaterialStratigraphy.js';

test('Q/A census preserves cell identity and uses the exact strict production proximity predicate', () => {
  const material = {
    width: 2, height: 2, cellCount: 4,
    columns: [[0, 1, 2, 3], [0, 1, 2, 3], [], []],
    candidateSinceMs: Float64Array.from([100, 200, -1, -1]),
    nodules: [
      { id: 'center', position: { x: 1, y: 0 }, radius: 0.028 },
      { id: 'strict-boundary', position: { x: 0.056, y: 0 }, radius: 0.028 }
    ],
    _localFootLoad() { return 200; },
    _nearExistingNodule(x, y, radius) {
      return this.nodules.some(nodule =>
        Math.hypot(nodule.position.x - x, nodule.position.y - y) < nodule.radius + radius);
    }
  };
  const surface = { sample: () => 0.6 };
  const priorTimers = [...material.candidateSinceMs];
  const priorNodules = [...material.nodules];

  const census = censusNoduleOpportunity(material, surface);

  assert.deepEqual(census.qCellIds, [0, 1]);
  assert.deepEqual(census.aCellIds, [0]);
  assert.deepEqual(census.blockedCellIds, [1]);
  assert.equal(census.predicateComparedQualifiedCells, 2);
  assert.equal(census.predicateMismatches, 0);
  assert.deepEqual([...material.candidateSinceMs], priorTimers);
  assert.deepEqual(material.nodules, priorNodules);
});

test('post-cap observer records current Q/A after production clears timers and adds no timer census', () => {
  const material = new MaterialStratigraphy({ width: 2, height: 2 });
  material.nodules.push(...Array.from({ length: material.maxNodules }, (_, index) => ({
    id: 'nodule-' + index, position: { x: 0.5, y: 0.5 }, radius: 0.028
  })));
  material.candidateSinceMs[0] = 100;
  material.lastAdvanceTimeMs = 0;
  material.lastNoduleEvaluationTimeMs = 0;
  const controller = { materialStratigraphy: material, surfaceField: { sample: () => 0.6 } };
  const observer = installNoduleOpportunityObserver(controller);

  try {
    const births = material.advance({ surface: controller.surfaceField, simulationTimeMs: 1000 });
    const row = observer.rows[0];

    assert.deepEqual(births, []);
    assert.equal(material.candidateSinceMs[0], -1);
    assert.equal(row.mode, 'post-cap-census-only');
    assert.equal(row.capReached, true);
    assert.equal(row.productionCapEarlyReturn.actual, true);
    assert.equal(row.productionCapEarlyReturn.clearedTimerCount, 1);
    assert.equal(Object.hasOwn(row, 'activeTimers'), false);
    assert.equal(Object.hasOwn(row, 'timerEvents'), false);
    assert.equal(row.predicateMismatches, 0);
  } finally {
    observer.restore();
  }
});

test('production state fingerprint ignores object key order and preserves map iteration order', () => {
  assert.equal(stableStateHash({ alpha: 1, beta: 2 }), stableStateHash({ beta: 2, alpha: 1 }));
  assert.notEqual(stableStateHash(new Map([['a', 1], ['b', 2]])),
    stableStateHash(new Map([['b', 2], ['a', 1]])));
});
