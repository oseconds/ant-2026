import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreCohortHistoryObserver } from '../scripts/ant-pre-cohort-retained-history.js';
import { materialLocomotionMultiplier } from '../src/lib/agents/ant/AntController.js';

const DT = 1 / 60;
function fixture(layers) {
  const plates = layers.map((bornAtSimulationTimeMs, index) => ({
    id: `plate-${index + 1}`, bornAtSimulationTimeMs
  }));
  const snapshot = { width: 2, height: 2, plates, stratigraphy: {
    topLayerByCell: new Int32Array([plates.length - 1, -1, -1, -1]),
    layerCountByCell: new Uint16Array([plates.length, 0, 0, 0])
  } };
  const column = layers.map((bornAtSimulationTimeMs, index) => ({
    id: `plate-${index + 1}`, descriptor: plates[index]
  }));
  return { snapshot, stratigraphy: { getColumnAt: (x, y) => x === 0 && y === 0 ? column : [] } };
}
function ant(id, x = 0, y = 0) { return { id, x, y }; }
function observe(observer, time, agents, entries, material) {
  observer.observe({ simulationTimeMs: time, agents, entryTimeByAntId: entries,
    stratigraphy: material.stratigraphy, snapshot: material.snapshot });
}

test('pre-cohort classification uses strict birth-before-oldest-live-entry and bottom-to-top columns', () => {
  const observer = createPreCohortHistoryObserver({ dtSeconds: DT });
  const material = fixture([0, 500, 1500]);
  const early = ant('ant-early'), later = ant('ant-later');
  const entries = new Map([['ant-early', 1000], ['ant-later', 2000]]);
  observe(observer, 2000, [early, later], entries, material);
  observe(observer, 2000 + DT * 1000, [later], entries, material);
  observe(observer, 2000 + DT * 2000, [later], entries, material);
  observe(observer, 2000 + DT * 3000, [later], entries, fixture([0, 500, 1500]));
  observer.finish(2000 + DT * 4000);

  const result = observer.summarize();
  const first = result.ants.find(row => row.id === 'ant-early');
  const second = result.ants.find(row => row.id === 'ant-later');
  assert.equal(first.entryTimeSeconds, 1);
  assert.equal(first.activeTimeSeconds, DT);
  assert.equal(second.preCohortHistorySeconds, 4 * DT);
  assert.equal(second.preCohortEpisodes, 1);
  assert.equal(second.buriedOnlyPreCohortSeconds, DT);
  assert.equal(second.topPreCohortSeconds, 3 * DT);
  assert.equal(result.metrics.preCohortAntTicks, 5);
  assert.equal(result.metrics.antsWithPreCohortHistory, 2);
  assert.equal(result.metrics.buriedOnlyPreCohortAntTicks, 2);
  assert.equal(result.metrics.topPreCohortAntTicks, 3);
  assert.equal(result.metrics.allCurrentPopulationPreCohortTicks, 4);
  assert.equal(result.metrics.fractionOfPopulatedSamplesWithAllCurrentAntsOnPreCohortHistory, 1);
  assert.ok(result.metrics.deltaWhenPreCohortPresent.mean > 0);
  assert.equal(result.metrics.multiplierWithoutPreCohortLayers.count, 5);
  assert.equal(result.contributionEpisodes.length, 2);
  assert.equal(result.contributionEpisodes[1].durationSeconds, 4 * DT);
});

test('birth at the oldest live ant entry time is not pre-cohort; empty and out-of-domain cells have L=P=0', () => {
  const observer = createPreCohortHistoryObserver({ dtSeconds: DT });
  const material = fixture([0, 1000]);
  const onColumn = ant('ant-on-column'), offColumn = ant('ant-outside', -0.1, 0);
  const entries = new Map([['ant-on-column', 1000], ['ant-outside', 1000]]);
  observe(observer, 1000, [onColumn, offColumn], entries, material);
  observer.finish(1000 + DT * 1000);
  const result = observer.summarize();
  const on = result.ants.find(row => row.id === 'ant-on-column');
  const outside = result.ants.find(row => row.id === 'ant-outside');
  assert.equal(result.metrics.preCohortAntTicks, 1);
  assert.equal(on.preCohortHistorySeconds, DT);
  assert.equal(on.buriedOnlyPreCohortSeconds, DT);
  assert.equal(outside.preCohortHistorySeconds, 0);
  assert.equal(result.metrics.actualMultiplier.count, 2);
  assert.equal(result.metrics.multiplierWithoutPreCohortLayers.count, 1);
  assert.ok(Math.abs(result.metrics.deltaWhenPreCohortPresent.mean
    - (materialLocomotionMultiplier(1) - materialLocomotionMultiplier(2))) < 1e-12);
});

test('observer rejects missing entry provenance and nonconsecutive tick samples', () => {
  const observer = createPreCohortHistoryObserver({ dtSeconds: DT });
  const material = fixture([]);
  assert.throws(() => observe(observer, 0, [ant('missing')], new Map(), material), /entry time/);

  const next = createPreCohortHistoryObserver({ dtSeconds: DT });
  const entries = new Map([['ant-1', 0]]);
  observe(next, 0, [ant('ant-1')], entries, material);
  assert.throws(() => observe(next, 2 * DT * 1000, [ant('ant-1')], entries, material), /fixed ticks/);
});
