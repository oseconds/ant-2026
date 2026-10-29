import test from 'node:test';
import assert from 'node:assert/strict';
import { attachAttenuation } from '../scripts/ant-material-pheromone-attenuation-screen.js';
import { GasterDeposition } from '../src/lib/agents/ant/GasterDeposition.js';

const p = layers => 1 - 0.50 * (1 - Math.exp(-layers / 4));
const cell = (x, y) => Math.round(y * 95) * 96 + Math.round(x * 95);

test('end-of-run dose audit survives native controller teardown without inventing a flush', () => {
  const controller = { agents: [{ id: 1, x: .5, y: .5 }], materialStratigraphy: {
    getSnapshot: () => ({ width: 96, height: 96, stratigraphy: { layerCountByCell: new Uint16Array(96 * 96) } }) },
    tick() { this.gasterDeposition.advance(1, .002, { x: .5, y: .5 }, { x: .502, y: .5 }, 10); },
    gasterDeposition: new GasterDeposition({ mode: 'dab', spacing: .006 }) };
  const observed = attachAttenuation(controller);
  controller.tick(1 / 60); controller.gasterDeposition.reset();
  const audit = observed.finish();
  assert.equal(audit.pendingFinalDose, .02); assert.equal(audit.emittedDose, 0);
  assert.equal(audit.retireEmittedDose, 0); assert.equal(audit.doseConservationResidual, 0);
});

test('attenuation is exact at L0 and bounded, monotone toward one half', () => {
  assert.equal(p(0), 1);
  let previous = 1;
  for (let layers = 1; layers <= 100; layers += 1) {
    const value = p(layers);
    assert(value >= 0.5 && value <= previous);
    previous = value;
  }
});

test('mixed tick-entry L scales only rate; native dab schedule and positions follow fixed travel', () => {
  const counts = new Uint8Array(96 * 96);
  counts[cell(.25, .25)] = 4;
  counts[cell(.75, .25)] = 8;
  const agents = [{ id: 1, x: .25, y: .25 }, { id: 2, x: .75, y: .25 }];
  let step = 0;
  const emissions = { 1: [], 2: [] };
  const controller = { agents, random() { throw new Error('attenuation observer must not use RNG'); },
    materialStratigraphy: { getSnapshot: () => ({ width: 96, height: 96,
      stratigraphy: { layerCountByCell: counts } }) }, tick() {
      for (const ant of agents) {
        const from = { x: ant.x + step * .004, y: ant.y };
        const to = { x: ant.x + (step + 1) * .004, y: ant.y };
        emissions[ant.id].push(...this.gasterDeposition.advance(ant.id, .004, from, to, 10)
          .map(item => ({ ...item, position: item.position && { ...item.position } })));
      }
      step += 1;
    },
    gasterDeposition: new GasterDeposition({ mode: 'dab', spacing: .006 }) };
  const chunks = [];
  attachAttenuation(controller, { chunks });
  for (let i = 0; i < 8; i += 1) controller.tick(1 / 60);
  const a = chunks.filter(x => x.id === 1), b = chunks.filter(x => x.id === 2);
  assert(a.every(x => x.layers === 4 && x.effectiveRate === 10 * p(4)));
  assert(b.every(x => x.layers === 8 && x.effectiveRate === 10 * p(8)));
  assert.deepEqual(a.map(x => x.emittedCount), b.map(x => x.emittedCount));
  assert.deepEqual(a.map(x => x.types), b.map(x => x.types));
  assert.deepEqual(emissions[1].map(x => [x.type, x.position.x - .25, x.position.y - .25]),
    emissions[2].map(x => [x.type, x.position.x - .75, x.position.y - .25]));
  assert.equal(controller.gasterDeposition.ants.get(1).distance, controller.gasterDeposition.ants.get(2).distance);
});

test('tick-entry scalar snapshot ignores destination L and same-tick material mutation', () => {
  const counts = new Uint8Array(96 * 96);
  counts[cell(.5, .5)] = 0;
  counts[cell(.75, .5)] = 9;
  const controller = { agents: [{ id: 7, x: .5, y: .5 }], materialStratigraphy: {
    getSnapshot: () => ({ width: 96, height: 96, stratigraphy: { layerCountByCell: counts } }) },
  tick() { counts[cell(.5, .5)] = 9;
    this.gasterDeposition.advance(7, .01, { x: .5, y: .5 }, { x: .75, y: .5 }, 3); },
  gasterDeposition: new GasterDeposition({ mode: 'continuous' }) };
  const chunks = [];
  attachAttenuation(controller, { chunks });
  controller.tick(1 / 60);
  assert.equal(chunks[0].layers, 0);
  assert.equal(chunks[0].effectiveRate, 3);
});

test('one ant crosses L4 to L8 between chunks; dab position and accumulated dose follow native distance', () => {
  const counts = new Uint8Array(96 * 96); counts[cell(.25, .25)] = 4;
  let step = 0, emission;
  const controller = { agents: [{ id: 3, x: .25, y: .25 }], materialStratigraphy: {
    getSnapshot: () => ({ width: 96, height: 96, stratigraphy: { layerCountByCell: counts } }) },
  tick() {
    const from = { x: .25 + step * .004, y: .25 }, to = { x: .25 + (step + 1) * .004, y: .25 };
    const out = this.gasterDeposition.advance(3, .004, from, to, 10);
    if (out.length) emission = out[0];
    step += 1;
  }, gasterDeposition: new GasterDeposition({ mode: 'dab', spacing: .006 }) };
  const chunks = []; attachAttenuation(controller, { chunks });
  controller.tick(1 / 60); counts[cell(.25, .25)] = 8; controller.tick(2 / 60);
  assert.deepEqual(chunks.map(row => row.layers), [4, 8]);
  assert.equal(emission.position.x, .256);
  assert.equal(emission.amount, .004 * 10 * p(4) + .002 * 10 * p(8));
  assert.equal(controller.gasterDeposition.ants.get(3).distance, .002);
  assert.equal(controller.gasterDeposition.ants.get(3).amount, .002 * 10 * p(8));
  counts[cell(.25, .25)] = 0;
  const flush = controller.gasterDeposition.retire(3, { x: .258, y: .25 });
  assert.equal(flush[0].amount, .002 * 10 * p(8));
});

test('retirement flushes accumulated dose through the native path without attenuation', () => {
  const counts = new Uint8Array(96 * 96); counts[cell(.5, .5)] = 4;
  const controller = { agents: [{ id: 1, x: .5, y: .5 }], materialStratigraphy: {
    getSnapshot: () => ({ width: 96, height: 96, stratigraphy: { layerCountByCell: counts } }) }, tick() {},
    tick() { this.gasterDeposition.advance(1, .01, { x: .5, y: .5 }, { x: .51, y: .5 }, 10); },
  gasterDeposition: new GasterDeposition({ mode: 'dab', spacing: .1 }) };
  const chunks = []; attachAttenuation(controller, { chunks }); controller.tick(1 / 60);
  const expectedPending = .01 * 10 * p(4);
  const flush = controller.gasterDeposition.retire(1, { x: .51, y: .5 });
  assert.equal(flush.length, 1); assert.equal(flush[0].amount, expectedPending);
  assert.equal(chunks[0].pendingAfter, expectedPending);
});

test('the complete wrapper is exact at L0', () => {
  const controller = { agents: [{ id: 8, x: .5, y: .5 }], materialStratigraphy: {
    getSnapshot: () => ({ width: 96, height: 96, stratigraphy: { layerCountByCell: new Uint8Array(96 * 96) } }) },
  tick() { this.gasterDeposition.advance(8, .01, { x: .5, y: .5 }, { x: .51, y: .5 }, 6.25); },
  gasterDeposition: new GasterDeposition({ mode: 'continuous' }) };
  const chunks = []; attachAttenuation(controller, { chunks }); controller.tick(1 / 60);
  assert.equal(chunks[0].layers, 0); assert.equal(chunks[0].effectiveRate, 6.25);
  assert.equal(chunks[0].effectiveDose, chunks[0].authoredDose);
});
