import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const directory = 'docs/ant/evidence/2026-10-05-surface-plates';
const readJson = async (name) => JSON.parse(await readFile(`${directory}/${name}`, 'utf8'));
const source = await readFile('static/worklets/surface-plate.worklet.js', 'utf8');
let Processor;
vm.runInNewContext(source, {
  AudioWorkletProcessor: class { constructor() { this.port = { postMessage() {} }; } },
  registerProcessor(_name, constructor) { Processor = constructor; }, sampleRate: 48000
});
const longRun = await readJson('long-run-evidence.json');
const chrome = await readJson('bornsurface-600s-max-natural-layers.json');
const runs = longRun.scenarios.map((run) => ({ runtime: 'Node', seed: run.seed, plates: run.plates }));
runs.push({ runtime: 'Chrome', seed: 20261005, plates: chrome.stateAtStart.plates });
const report = {
  provenance: 'Compact index derived from preserved frozen birth descriptors. 96-grid overlap is exact mask intersection; 32-grid coupling is obtained by loading the same final processor, without excitation. No births or audio were fabricated.',
  runs: runs.map(({ runtime, seed, plates }) => {
    const processor = new Processor();
    const descriptors = [];
    for (let index = 0; index < plates.length; index += 1) {
      const plate = plates[index];
      processor.handleMessage({ type: 'birth', payload: { plate } });
      const overlaps = plates.slice(0, index).map((prior) => {
        let maskCells96 = 0;
        for (let cell = 0; cell < plate.mask.length; cell += 1) {
          if (plate.mask[cell] && prior.mask[cell]) maskCells96 += 1;
        }
        const coupling = processor.overlapCoupling.find((pair) => pair.plateIds.includes(plate.id)
          && pair.plateIds.includes(prior.id));
        return { priorPlateId: prior.id, maskCells96, coupledCells32: coupling?.overlapCells || 0,
          couplingCoefficient: coupling?.coefficient || 0 };
      });
      descriptors.push({ plateId: plate.id, birthSimulationTimeMs: plate.bornAtSimulationTimeMs,
        source: plate.source, target: plate.target, pathLength: plate.metrics.geodesicLength,
        centerlineNodeCount: plate.centerline.length, maskNodeCount: plate.mask.reduce((sum, cell) => sum + cell, 0),
        meanWidth: plate.meanHalfWidth * 2, maxWidth: plate.maxHalfWidth * 2,
        chemicalEvidence: plate.metrics.meanChemical, mechanicalEvidence: plate.metrics.meanSupport,
        persistenceSeconds: plate.provenance.stableSeconds, realFootContactEvidence: plate.provenance.footContacts,
        stiffness: plate.material.stiffness, density: plate.material.density, initialDamping: plate.material.damping,
        pickupLeft: plate.pickups[0], pickupRight: plate.pickups[1], overlaps });
    }
    return { runtime, seed, descriptors };
  })
};
await writeFile(`${directory}/plate-birth-descriptors.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.runs.map((run) => ({ runtime: run.runtime, seed: run.seed, births: run.descriptors.length }))));
