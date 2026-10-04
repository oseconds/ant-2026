import test from 'node:test';
import assert from 'node:assert/strict';
import { Lab } from '../src/lib/lab/Lab.js';
import { modelRegistry } from '../src/lib/lab/modelRegistry.js';
import { AudioEngine } from '../src/lib/audio/AudioEngine.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('Lab switches built-in models with one shared lazy AudioEngine', async () => {
  let contextCreations = 0;
  const audio = new AudioEngine({ contextFactory: () => { contextCreations += 1; return {}; } });
  const lab = new Lab({ audioEngine: audio });
  const sphere = await lab.setModel('sphere', { physical: { diameter: 2.5 } });
  assert.equal(sphere.audio, audio);
  assert.equal(lab.getState().model, 'sphere');
  assert.equal(lab.getState().physical.diameter, 2.5);
  const plate = await lab.setModel('plate');
  assert.equal(plate.audio, audio);
  assert.equal(sphere.destroyed, true);
  assert.equal(lab.getState().model, 'plate');
  assert.equal(contextCreations, 0);
  await lab.destroy();
  assert.equal(audio.destroyed, false, 'Lab does not destroy an injected shared engine');
  await audio.destroy();
});

test('Lab latest request wins a pending init and destroys the stale candidate', async () => {
  const initGate = deferred();
  const slowStarted = deferred();
  let audioDestroyCount = 0;
  const audio = { destroy: async () => { audioDestroyCount += 1; } };
  const instances = [];
  function makeModel(name, options) {
    const model = {
      name, options, state: { model: name, marker: null }, listeners: new Set(),
      stopped: 0, destroyed: false,
      async init() {
        if (name === 'slow') { slowStarted.resolve(); await initGate.promise; }
        return this;
      },
      getState() { return structuredClone(this.state); },
      getSnapshot() { return { state: this.getState() }; },
      configure(patch) { this.state = { ...this.state, ...patch }; return this.getState(); },
      setPickup(position) { this.pickup = position; },
      async strike() { return !this.destroyed; },
      subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); },
      fire() { for (const listener of [...this.listeners]) listener({ type: 'update', payload: { source: name } }); },
      stop() { this.stopped += 1; this.fire(); },
      async destroy() { this.destroyed = true; this.listeners.clear(); }
    };
    instances.push(model);
    if (options.state) model.state = { ...model.state, ...options.state };
    return model;
  }
  const registry = {
    slow: options => makeModel('slow', options),
    fast: options => makeModel('fast', options),
    last: options => makeModel('last', options)
  };
  const lab = new Lab({ registry, audioEngine: audio });
  const slowPromise = lab.setModel('slow');
  await slowStarted.promise;
  const staleModel = instances[0];
  const fastPromise = lab.setModel('fast', { marker: 'latest' });
  assert.equal(await lab.strike(), false, 'strikes are blocked during a switch');
  initGate.resolve();
  assert.equal(await slowPromise, null);
  const fast = await fastPromise;
  assert.equal(fast.name, 'fast');
  assert.equal(fast.state.marker, 'latest');
  assert.equal(staleModel.destroyed, true);

  const forwarded = [];
  lab.subscribe(event => forwarded.push(event));
  await lab.setModel('last');
  const forwardedAfterSwitch = forwarded.length;
  fast.fire();
  assert.equal(forwarded.length, forwardedAfterSwitch, 'old model events are unsubscribed');
  assert.equal(fast.stopped, 1, 'a switch stops the current model immediately');
  await lab.destroy();
  assert.equal(audioDestroyCount, 0, 'injected shared audio stays owned by its caller');
});

test('default registry covers the physical models and visual ANT experiment', () => {
  assert.deepEqual(Object.keys(modelRegistry).sort(), ['ant', 'plate', 'sphere', 'string']);
});

test('Lab can switch through ANT without giving it audio resources', async () => {
  let contextCreations = 0;
  const audio = new AudioEngine({ contextFactory: () => { contextCreations += 1; return {}; } });
  const lab = new Lab({ audioEngine: audio });
  const ant = await lab.setModel('ant');
  ant.update(0);
  ant.update(100);
  assert.equal(lab.getState().model, 'ant');
  assert.equal(lab.getSnapshot().agents.length, 64);
  assert.equal(ant.audio, undefined);
  assert.equal(contextCreations, 0);
  await lab.setModel('string');
  assert.equal(ant.destroyed, true);
  assert.equal(contextCreations, 0);
  await lab.destroy();
  await audio.destroy();
});

test('destroying a Lab during model init disposes the late candidate', async () => {
  const gate = deferred();
  const started = deferred();
  let candidate;
  const audio = { destroy: async () => {} };
  const registry = {
    pending: options => {
      candidate = {
        destroyed: false,
        async init() { started.resolve(); await gate.promise; return this; },
        subscribe() { return () => {}; },
        stop() {},
        async destroy() { this.destroyed = true; }
      };
      return candidate;
    }
  };
  const lab = new Lab({ registry, audioEngine: audio });
  const selection = lab.setModel('pending');
  await started.promise;
  const destroying = lab.destroy();
  gate.resolve();
  assert.equal(await selection, null);
  await destroying;
  assert.equal(candidate.destroyed, true);
  assert.equal(lab.model, null);
});
