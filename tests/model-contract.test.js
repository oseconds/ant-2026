import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { StringModel } from '../src/lib/models/string/StringModel.js';
import { PlateModel } from '../src/lib/models/plate/PlateModel.js';
import { SphereModel } from '../src/lib/models/sphere/SphereModel.js';

const models = [StringModel, PlateModel, SphereModel];

test('fresh SSR import succeeds when browser-only globals throw on access', () => {
  const sourceDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/models');
  const moduleUrls = [
    pathToFileURL(path.join(sourceDirectory, 'string/StringModel.js')).href,
    pathToFileURL(path.join(sourceDirectory, 'plate/PlateModel.js')).href,
    pathToFileURL(path.join(sourceDirectory, 'sphere/SphereModel.js')).href
  ];
  const script = `
    for (const name of ['window', 'document', 'AudioContext', 'AudioWorkletNode', 'performance', 'requestAnimationFrame']) {
      Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error(name + ' accessed during import'); } });
    }
    const modules = await Promise.all(${JSON.stringify(moduleUrls)}.map(url => import(url)));
    for (const Model of modules.map(module => module.default)) {
      const model = new Model();
      await model.init();
      await model.destroy();
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('model modules and construction are safe without browser globals', async () => {
  const names = ['window', 'document', 'AudioContext', 'AudioWorkletNode'];
  const descriptors = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) {
    Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error(`${name} accessed eagerly`); } });
  }
  try {
    for (const Model of models) {
      const model = new Model();
      assert.equal(model.audio.context, null);
      await model.init();
      await model.destroy();
    }
  } finally {
    for (const name of names) {
      delete globalThis[name];
      const descriptor = descriptors.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    }
  }
});

test('model settings are JSON-safe copies and partial configuration preserves unrelated values', () => {
  for (const Model of models) {
    const model = new Model();
    const before = model.getState();
    const modelName = before.model;
    const state = model.getState();
    state.physical.changedExternally = true;
    assert.equal(model.getState().physical.changedExternally, undefined);
    assert.doesNotThrow(() => JSON.stringify(model.getState()));
    const patch = Model === StringModel ? { physical: { frequency: 220 } }
      : Model === PlateModel ? { physical: { stiffness: 1.01 } }
        : { physical: { diameter: 3 } };
    model.configure(patch);
    const after = model.getState();
    assert.equal(after.model, modelName);
    if (Model === StringModel) assert.equal(after.physical.frequency, 220);
    if (Model === PlateModel) assert.equal(after.physical.stiffness, 1.01);
    if (Model === SphereModel) assert.equal(after.physical.diameter, 3);
    assert.equal(after.excitation.strength, before.excitation.strength);
    assert.deepEqual(after.pickup.position, before.pickup.position);
    void model.destroy();
  }
});

test('zero-valued damping and pickup coordinates are retained by model state', () => {
  const plate = new PlateModel();
  plate.configure({ damping: 0 });
  plate.setPickup({ x: 0, y: 0 });
  assert.equal(plate.getState().damping, 0);
  assert.deepEqual(plate.getState().pickup.position, { x: 0, y: 0 });

  const sphere = new SphereModel();
  sphere.configure({ damping: 0 });
  sphere.setPickup({ x: 0, y: 0, z: 1 });
  assert.equal(sphere.getState().damping, 0);
  assert.deepEqual(sphere.getState().pickup.position, { x: 0, y: 0, z: 1 });
  void plate.destroy();
  void sphere.destroy();
});

test('string inspector stepping preserves a stable delay line and produces finite samples', async () => {
  const string = new StringModel();
  await string.init();
  const initial = string.resetInspector();
  assert.ok(initial.values.length > 1);
  const stepped = string.step(17);
  assert.equal(stepped.steps, 17);
  assert.equal(stepped.cursor, 17 % stepped.values.length);
  assert.ok(stepped.values.every(Number.isFinite));
  const pattern = string.generatePattern();
  assert.equal(pattern.length, 8);
  await string.destroy();
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fakeWorkletEngine(createWorklet) {
  return { createWorklet, destroy: async () => {} };
}

test('worklet model uses message envelopes and cleans a worklet created after destroy', async () => {
  const gate = deferred();
  const sent = [];
  let disconnects = 0;
  const engine = fakeWorkletEngine(() => gate.promise);
  const model = new PlateModel({ audioEngine: engine });
  const messages = [];
  const unsubscribe = model.subscribe(message => messages.push(message));
  const strike = model.strike({ position: { x: .3, y: -.2 }, strength: .8 });
  await Promise.resolve();
  await model.destroy();
  gate.resolve({
    node: { port: { postMessage: message => sent.push(message) } },
    disconnect: () => { disconnects += 1; }
  });
  assert.equal(await strike, false);
  assert.equal(disconnects, 1);
  assert.equal(sent.some(message => message.type === 'strike'), false);
  assert.ok(messages.every(message => typeof message.type === 'string' && 'payload' in message));
  unsubscribe();
});

test('worklet model posts normalized strike payloads and removes its subscriptions on destroy', async () => {
  const sent = [];
  const engine = fakeWorkletEngine(async (_name, _url, _options, onMessage) => ({
    node: { port: { postMessage: message => sent.push(message) } },
    disconnect: () => {},
    onMessage
  }));
  const model = new PlateModel({ audioEngine: engine });
  let updates = 0;
  const unsubscribe = model.subscribe(() => { updates += 1; });
  assert.equal(await model.strike({ position: { x: .2, y: .1 }, strength: .5 }), true);
  const strike = sent.find(message => message.type === 'strike');
  assert.deepEqual(strike, { type: 'strike', payload: { strength: .5, position: { x: .2, y: .1 } } });
  const priorUpdates = updates;
  unsubscribe();
  await model.destroy();
  assert.equal(updates, priorUpdates);
});
