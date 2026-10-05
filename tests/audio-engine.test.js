import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/lib/audio/AudioEngine.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function makeContext(addModule = async () => {}) {
  const connections = [];
  const context = {
    state: 'suspended', sampleRate: 48000, currentTime: 0, destination: {},
    audioWorklet: { addModule },
    resumeCount: 0, closeCount: 0,
    async resume() { this.resumeCount += 1; this.state = 'running'; },
    async close() { this.closeCount += 1; this.state = 'closed'; },
    createGain() {
      const node = { gain: { value: 1 }, connect: target => connections.push(target), disconnect() {} };
      return node;
    },
    createBiquadFilter() {
      return { type: '', frequency: { value: 0 }, connect: target => connections.push(target), disconnect() {} };
    },
    createDynamicsCompressor() {
      return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect: target => connections.push(target), disconnect() {} };
    }
  };
  return { context, connections };
}

function makeWorkletNode() {
  const listeners = new Map();
  const messages = [];
  return {
    messages, disconnectCount: 0,
    port: { onmessage: null, closeCount: 0, postMessage: message => messages.push(message), close() { this.closeCount += 1; } },
    connect() {}, disconnect() { this.disconnectCount += 1; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); }
  };
}

test('AudioEngine creates browser resources lazily and shares module loading', async () => {
  let contextCreations = 0;
  let moduleLoads = 0;
  const { context } = makeContext(async () => { moduleLoads += 1; });
  const nodes = [];
  const engine = new AudioEngine({
    contextFactory: () => { contextCreations += 1; return context; },
    workletNodeFactory: () => { const node = makeWorkletNode(); nodes.push(node); return node; }
  });
  assert.equal(contextCreations, 0);
  assert.equal(moduleLoads, 0);
  await engine.init();
  assert.equal(contextCreations, 1);
  assert.equal(context.resumeCount, 1);
  const worklets = await Promise.all([
    engine.createWorklet('plate-processor', '/worklets/plate.worklet.js', {}, () => {}, () => {}),
    engine.createWorklet('plate-processor', '/worklets/plate.worklet.js', {}, () => {}, () => {})
  ]);
  assert.equal(moduleLoads, 1);
  assert.equal(nodes.length, 2);
  assert.equal(typeof nodes[0].port.onmessage, 'function');
  worklets.forEach(worklet => worklet.disconnect());
  await engine.destroy();
  assert.equal(context.closeCount, 1);
  assert.ok(nodes.every(node => node.port.closeCount === 1 && node.messages.some(m => m.type === 'destroy')));
});

test('AudioEngine keeps mono as the default and allows a stereo worklet output', async () => {
  const { context } = makeContext();
  const workletOptions = [];
  const engine = new AudioEngine({
    contextFactory: () => context,
    workletNodeFactory: (_context, _name, options) => {
      workletOptions.push(options);
      return makeWorkletNode();
    }
  });
  const mono = await engine.createWorklet('string-processor', '/worklets/string.worklet.js', {}, () => {}, () => {});
  const stereo = await engine.createWorklet('plate-processor', '/worklets/plate.worklet.js', {}, () => {}, () => {}, {
    gain: 0.7, channels: 2
  });
  assert.deepEqual(workletOptions.map(({ numberOfOutputs, outputChannelCount }) => ({ numberOfOutputs, outputChannelCount })), [
    { numberOfOutputs: 1, outputChannelCount: [1] },
    { numberOfOutputs: 1, outputChannelCount: [2] }
  ]);
  mono.disconnect();
  stereo.disconnect();
  await engine.destroy();
});

test('AudioEngine rejects unsupported channel counts before loading a worklet', async () => {
  let moduleLoads = 0;
  const { context } = makeContext(async () => { moduleLoads++; });
  const engine = new AudioEngine({ contextFactory: () => context, workletNodeFactory: makeWorkletNode });
  await assert.rejects(engine.createWorklet('plate-processor', '/worklets/plate.worklet.js', {}, () => {}, () => {}, {
    channels: 3
  }), /channels must be 1 or 2/);
  assert.equal(moduleLoads, 0);
  await engine.destroy();
});

test('AudioEngine rejects a pending module after destroy and closes the context', async () => {
  const gate = deferred();
  const { context } = makeContext(() => gate.promise);
  const engine = new AudioEngine({ contextFactory: () => context, workletNodeFactory: makeWorkletNode });
  const loading = engine.createWorklet('sphere-processor', '/worklets/sphere.worklet.js', {}, () => {}, () => {});
  await Promise.resolve();
  await engine.destroy();
  gate.resolve();
  await assert.rejects(loading, /destroyed/i);
  assert.equal(context.closeCount, 1);
});
