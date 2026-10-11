import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaterialExperienceObserver } from '../scripts/ant-material-experience-shadow.js';

const DT = 1 / 60;
const width = 2;
const height = 2;
const noPlate = { width, height, plates: [], stratigraphy: {
  topLayerByCell: new Int32Array([-1, -1, -1, -1]),
  layerCountByCell: new Uint16Array(4)
} };

function snapshot(topByCell, layersByCell, plates) {
  return { width, height, plates, stratigraphy: {
    topLayerByCell: new Int32Array(topByCell),
    layerCountByCell: new Uint16Array(layersByCell)
  } };
}

function sample(observer, simulationTimeMs, agents, material) {
  observer.observe({ simulationTimeMs, agents, stratigraphySnapshot: material });
}

test('read-only material observer counts repeated episodes, top identities, pre-entry exposure and layer states', () => {
  const observer = createMaterialExperienceObserver({ dtSeconds: DT });
  const p1 = { id: 'plate-1', bornAtSimulationTimeMs: 0 };
  const p2 = { id: 'plate-2', bornAtSimulationTimeMs: 0 };
  const ant = { id: 'ant-1', x: 0, y: 0 };
  const before = JSON.stringify(ant);

  sample(observer, 0, [], noPlate);
  sample(observer, DT * 1000, [ant], snapshot([0, -1, -1, -1], [1, 0, 0, 0], [p1]));
  sample(observer, DT * 2000, [ant], noPlate);
  sample(observer, DT * 3000, [ant], snapshot([0, -1, -1, -1], [1, 0, 0, 0], [p1]));
  sample(observer, DT * 4000, [ant], snapshot([1, -1, -1, -1], [2, 0, 0, 0], [p1, p2]));
  sample(observer, DT * 5000, [ant], snapshot([1, -1, -1, -1], [2, 0, 0, 0], [p1, p2]));
  observer.finish(DT * 6000);

  const result = observer.summarize();
  const measured = result.ants.find(item => item.id === 'ant-1');
  assert.equal(JSON.stringify(ant), before, 'observer leaves the agent untouched');
  assert.equal(measured.firstObservedTimeSeconds, DT);
  assert.equal(measured.activeTimeSeconds, 5 * DT);
  assert.equal(measured.exposureSeconds, 4 * DT);
  assert.equal(measured.exposureFraction, 0.8);
  assert.equal(measured.episodeCount, 2);
  assert.deepEqual(measured.episodes.map(item => item.durationSeconds), [DT, 3 * DT]);
  assert.equal(measured.distinctTopPlateCount, 2);
  assert.equal(measured.repeatTopPlateBouts, 1);
  assert.equal(measured.preEntryExposureSeconds, 4 * DT);
  assert.deepEqual(measured.layerCountTicks, { '1': 2, '2': 2 });
  assert.equal(result.episodeDurationDistribution.count, 2);
  assert.equal(result.layerCountDistribution['1'].ticks, 2);
  assert.equal(result.layerCountDistribution['2'].ticks, 2);
  assert.equal(result.populationTimeline[0].meanOnPlateFraction, 0.8);
});

test('material lookup ignores ants outside the stratigraphy domain', () => {
  const observer = createMaterialExperienceObserver({ dtSeconds: DT });
  const ant = { id: 'edge-ant', x: -0.1, y: 0 };
  const plate = { id: 'edge-plate', bornAtSimulationTimeMs: 0 };
  sample(observer, 0, [ant], snapshot([0, -1, -1, -1], [1, 0, 0, 0], [plate]));
  observer.finish(DT * 1000);
  assert.equal(observer.summarize().ants[0].exposureSeconds, 0);
});
