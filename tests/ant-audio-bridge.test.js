import test from 'node:test';
import assert from 'node:assert/strict';
import { AntAudioBridge } from '../src/lib/audio/AntAudioBridge.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function fakeEngine(create = async () => {}) {
  const engine = { calls: [], handles: [], createCount: 0, destroyCount: 0, context: { currentTime: 10 }, init: async () => {} };
  engine.createWorklet = async (...args) => {
    engine.createCount++;
    const pending = create(...args);
    const result = await pending;
    if (result) return result;
    const messages = [];
    const handle = {
      node: { port: { postMessage: (message) => messages.push(message), close() {}, onmessage: null }, disconnect() {} },
      gainNode: { gain: {
        value: args[5].gain, ramps: [],
        cancelScheduledValues(time) { this.cancelTime = time; },
        setValueAtTime(value, time) { this.value = value; this.startTime = time; },
        linearRampToValueAtTime(value, time) { this.value = value; this.ramps.push({ value, time }); }
      } },
      disconnectCount: 0,
      disconnect() { this.disconnectCount++; },
      failProcessor: () => args[4](new Error('simulated processor failure')),
      messages
    };
    engine.handles.push(handle);
    engine.calls.push({ args, messages, handle });
    return handle;
  };
  engine.destroy = async () => { engine.destroyCount++; };
  return engine;
}

const step = (x, y, strength = 0.035) => ({
  type: 'STEP', antId: 'ant-1', position: { x, y }, strength, simulationTimeMs: 123
});

test('volume uses the existing output gain, retains Off/On settings and leaves STEP excitation unchanged', async () => {
  const audio = fakeEngine();
  const bridge = new AntAudioBridge({ audioEngine: audio });
  assert.equal(bridge.volume, 1);
  assert.equal(bridge.setVolume(0.5), 0.5);
  assert.equal(audio.createCount, 0, 'moving the slider while Off never starts audio');
  await bridge.setEnabled(true);
  assert.equal(audio.calls[0].args[5].gain, 0.35);
  const gain = audio.handles[0].gainNode.gain;
  assert.equal(gain.value, 0.35);
  bridge.setVolume(0);
  assert.deepEqual(gain.ramps.at(-1), { value: 0, time: 10.02 });
  assert.equal(gain.cancelTime, 10);
  await bridge.handleStep(step(0.3, 0.6));
  const strike = audio.handles[0].messages.find((message) => message.type === 'strike');
  assert.equal(strike.payload.strength, 0.035, 'volume never scales the physical excitation');
  bridge.setVolume(0.25);
  await bridge.setEnabled(false);
  await bridge.setEnabled(true);
  assert.equal(bridge.volume, 0.25);
  assert.equal(audio.handles[1].gainNode.gain.value, 0.175);
  assert.equal(bridge.setVolume(2), 1);
  assert.equal(audio.handles[1].gainNode.gain.value, 0.7, '100% retains the original Plate output level');
  assert.equal(bridge.setVolume(-1), 0);
  assert.equal(bridge.setVolume(NaN), 0);
  assert.equal(bridge.setVolume(Infinity), 0);
  await bridge.destroy();
});

test('volume changes during pending initialization reach the ready output gain', async () => {
  const gate = deferred();
  const audio = fakeEngine(() => gate.promise);
  const bridge = new AntAudioBridge({ audioEngine: audio });
  const enabling = bridge.setEnabled(true);
  bridge.setVolume(0.2);
  gate.resolve();
  assert.equal(await enabling, true);
  assert.ok(Math.abs(audio.handles[0].gainNode.gain.value - 0.14) < 1e-12);
  await bridge.destroy();
});

test('bridge lazily creates the existing Plate and sends restrained spatial strikes', async () => {
  const audio = fakeEngine();
  const bridge = new AntAudioBridge({ audioEngine: audio, workletBaseUrl: '/audio/worklets/' });
  assert.equal(audio.createCount, 0);
  assert.equal(await bridge.handleStep(step(0.5, 0.5)), false);
  const enabling = bridge.setEnabled(true);
  assert.equal(bridge.loading, true);
  assert.equal(await enabling, true);
  assert.equal(bridge.enabled, true);
  assert.equal(audio.createCount, 1);
  assert.equal(audio.calls[0].args[0], 'plate-processor');
  assert.equal(audio.calls[0].args[1], '/audio/worklets/plate.worklet.js');
  assert.equal(audio.calls[0].args[5].channels, 2);
  assert.equal(audio.calls[0].args[5].gain, 0.7);
  assert.deepEqual(audio.calls[0].args[2].stereoPickups, [
    { x: -0.32, y: -0.18 }, { x: 0.32, y: -0.18 }
  ]);
  assert.equal(Object.hasOwn(bridge.plate.getState(), 'stereoPickups'), false, 'pickup experiment stays out of saved mono state');

  assert.equal(await bridge.handleStep(step(0, 0, 0.035)), true);
  assert.equal(await bridge.handleStep(step(1, 1, 0.9)), true);
  const strikes = audio.calls[0].messages.filter((message) => message.type === 'strike');
  assert.equal(strikes[0].payload.strength, 0.035);
  assert.ok(Math.abs(strikes[0].payload.position.x + 0.92 / Math.sqrt(2)) < 1e-12);
  assert.ok(Math.abs(strikes[0].payload.position.y + 0.92 / Math.sqrt(2)) < 1e-12);
  assert.equal(strikes[1].payload.strength, 0.05);
  assert.ok(Math.abs(strikes[1].payload.position.x - 0.92 / Math.sqrt(2)) < 1e-12);
  assert.ok(Math.abs(strikes[1].payload.position.y - 0.92 / Math.sqrt(2)) < 1e-12);
  await bridge.destroy();
  assert.equal(audio.destroyCount, 0, 'the shared AudioEngine remains owned by its caller');
  assert.equal(audio.handles[0].disconnectCount, 1);
});

test('one valid tripod centroid excites the existing Plate once and malformed or outside contacts are dropped', async () => {
  const audio = fakeEngine();
  const bridge = new AntAudioBridge({ audioEngine: audio });
  await bridge.setEnabled(true);
  const contacts = [
    { legId: 'FL', position: { x: 0.2, y: 0.3 } },
    { legId: 'MR', position: { x: 0.4, y: 0.5 } },
    { legId: 'RL', position: { x: 0.6, y: 0.7 } }
  ];
  const event = { type: 'FOOT_CONTACT', antId: 'ant-1', contactGroup: 'A', contacts,
    position: { x: 0.4, y: 0.5 }, strength: 0.035, simulationTimeMs: 123 };
  assert.equal(await bridge.handleFootContact(event), true);
  assert.equal(audio.calls[0].messages.filter(message => message.type === 'strike').length, 1);
  const strike = audio.calls[0].messages.find(message => message.type === 'strike');
  assert.ok(Math.abs(strike.payload.position.x - (-0.2 * 0.92 / Math.sqrt(2))) < 1e-12);
  assert.ok(Math.abs(strike.payload.position.y - (0.0 * 0.92 / Math.sqrt(2))) < 1e-12);
  assert.equal(strike.payload.strength, 0.035);

  const invalid = { ...event, contacts: [{ legId: 'FL', position: { x: -0.001, y: 0.5 } }],
    position: { x: -0.001, y: 0.5 } };
  assert.equal(await bridge.handleFootContact(invalid), false);
  assert.equal(await bridge.handleFootContact({ ...event, position: { x: 0.5, y: 0.5 } }), false,
    'event position must remain the actual contacts centroid');
  assert.equal(await bridge.handleFootContact({ ...event, contacts: [
    { legId: 'FR', position: { x: 0.4, y: 0.5 } }
  ] }), false, 'the contact leg must belong to the named tripod');
  assert.equal(audio.calls[0].messages.filter(message => message.type === 'strike').length, 1);
  await bridge.destroy();
});

test('steps are dropped while loading, and Off cancels pending initialization and disconnects late worklets', async () => {
  const gate = deferred();
  const audio = fakeEngine(() => gate.promise);
  const bridge = new AntAudioBridge({ audioEngine: audio });
  const enabling = bridge.setEnabled(true);
  assert.equal(bridge.loading, true);
  assert.equal(await bridge.handleStep(step(0.2, 0.7)), false);
  await bridge.setEnabled(false);
  assert.equal(bridge.enabled, false);
  gate.resolve();
  assert.equal(await enabling, false);
  assert.equal(bridge.error, null);
  assert.equal(audio.calls[0].messages.some((message) => message.type === 'strike'), false);
  assert.equal(audio.handles[0].disconnectCount, 1);
  await bridge.destroy();
});

test('Off destroys Plate resources and On creates a fresh Plate without destroying shared audio', async () => {
  const audio = fakeEngine();
  const bridge = new AntAudioBridge({ audioEngine: audio });
  assert.equal(await bridge.setEnabled(true), true);
  await bridge.handleStep(step(0.25, 0.5));
  await bridge.setEnabled(false);
  assert.equal(bridge.enabled, false);
  assert.ok(audio.calls[0].messages.some((message) => message.type === 'stop'));
  assert.equal(audio.handles[0].disconnectCount, 1);

  assert.equal(await bridge.setEnabled(true), true);
  assert.equal(audio.createCount, 2);
  await bridge.handleStep(step(0.75, 0.5));
  await bridge.destroy();
  assert.equal(audio.handles[1].disconnectCount, 1);
  assert.equal(audio.destroyCount, 0);
});

test('failed worklet initialization disables audio and exposes its error', async () => {
  const audio = fakeEngine(async () => { throw new Error('module unavailable'); });
  const bridge = new AntAudioBridge({ audioEngine: audio });
  assert.equal(await bridge.setEnabled(true), false);
  assert.equal(bridge.enabled, false);
  assert.equal(bridge.loading, false);
  assert.equal(bridge.error, 'module unavailable');
  await bridge.destroy();
  assert.equal(audio.destroyCount, 0);
});

test('bridge requires an injected shared engine', () => {
  assert.throws(() => new AntAudioBridge(), /requires the shared AudioEngine/);
});

test('simultaneous STEP events keep their distinct positions and natural call order', async () => {
  const audio = fakeEngine();
  const bridge = new AntAudioBridge({ audioEngine: audio });
  await bridge.setEnabled(true);
  const results = await Promise.all([
    bridge.handleStep(step(0.1, 0.2)),
    bridge.handleStep(step(0.5, 0.6)),
    bridge.handleStep(step(0.9, 0.8))
  ]);
  assert.deepEqual(results, [true, true, true]);
  const strikes = audio.calls[0].messages.filter((message) => message.type === 'strike');
  assert.equal(strikes.length, 3);
  const expectedPositions = [
    { x: -0.8 * 0.92 / Math.sqrt(2), y: -0.6 * 0.92 / Math.sqrt(2) },
    { x: 0, y: 0.2 * 0.92 / Math.sqrt(2) },
    { x: 0.8 * 0.92 / Math.sqrt(2), y: 0.6 * 0.92 / Math.sqrt(2) }
  ];
  strikes.forEach(({ payload }, index) => {
    assert.ok(Math.abs(payload.position.x - expectedPositions[index].x) < 1e-12);
    assert.ok(Math.abs(payload.position.y - expectedPositions[index].y) < 1e-12);
  });
  await bridge.destroy();
});

test('Off immediately after a STEP cancels its pending Plate strike', async () => {
  const audio = fakeEngine();
  const bridge = new AntAudioBridge({ audioEngine: audio });
  await bridge.setEnabled(true);
  const pendingStrike = bridge.handleStep(step(0.1, 0.2));
  const turningOff = bridge.setEnabled(false);
  assert.equal(bridge.enabled, false);
  assert.equal(await pendingStrike, false);
  await turningOff;
  assert.equal(audio.calls[0].messages.some((message) => message.type === 'strike'), false);
  assert.equal(audio.handles[0].disconnectCount, 1);
  await bridge.destroy();
});

test('processor errors expose the failure and immediately disable and disconnect the Plate', async () => {
  const audio = fakeEngine();
  const bridge = new AntAudioBridge({ audioEngine: audio });
  await bridge.setEnabled(true);
  audio.handles[0].failProcessor();
  assert.equal(bridge.enabled, false);
  assert.equal(bridge.loading, false);
  assert.equal(bridge.error, 'simulated processor failure');
  assert.equal(await bridge.handleStep(step(0.3, 0.7)), false);
  assert.equal(audio.handles[0].disconnectCount, 1);
  await bridge.destroy();
  assert.equal(audio.destroyCount, 0);
});

test('a rejected old strike after Off and On cannot disable or report error on the new Plate', async () => {
  const rejected = deferred();
  const audio = fakeEngine();
  const bridge = new AntAudioBridge({ audioEngine: audio });
  await bridge.setEnabled(true);
  const oldPlate = bridge.plate;
  oldPlate.strike = () => rejected.promise;
  const staleStrike = bridge.handleStep(step(0.2, 0.3));
  await bridge.setEnabled(false);
  await bridge.setEnabled(true);
  rejected.reject(new Error('stale strike failure'));
  assert.equal(await staleStrike, false);
  assert.equal(bridge.enabled, true);
  assert.equal(bridge.error, null);
  assert.notEqual(bridge.plate, oldPlate);
  await bridge.destroy();
});

test('rapid On-Off-On ignores the stale first initialization', async () => {
  const first = deferred();
  const second = deferred();
  let count = 0;
  const audio = fakeEngine(() => (++count === 1 ? first.promise : second.promise));
  const bridge = new AntAudioBridge({ audioEngine: audio });
  const firstEnable = bridge.setEnabled(true);
  await bridge.setEnabled(false);
  const secondEnable = bridge.setEnabled(true);
  first.resolve();
  assert.equal(await firstEnable, false);
  assert.equal(bridge.enabled, true);
  assert.equal(bridge.loading, true);
  second.resolve();
  assert.equal(await secondEnable, true);
  assert.equal(bridge.enabled, true);
  assert.equal(bridge.error, null);
  assert.equal(audio.handles[0].disconnectCount, 1);
  await bridge.destroy();
});
