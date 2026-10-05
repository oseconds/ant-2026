import test from 'node:test';
import assert from 'node:assert/strict';
import { AntEnvironmentAudioBridge } from '../src/lib/audio/AntEnvironmentAudioBridge.js';

test('ANT experiment selection retains volume and historical descriptors while releasing the old transport', async () => {
  const handles = [], calls = [];
  const audioEngine = { context: { currentTime: 0 }, init: async () => {},
    async createWorklet(...args) {
      calls.push(args[0]);
      const handle = { node: { port: { postMessage() {} } },
        gainNode: { gain: { value: args[5].gain, cancelScheduledValues() {}, setValueAtTime() {},
          linearRampToValueAtTime(value) { this.value = value; } } },
        disconnected: 0, disconnect() { this.disconnected++; } };
      handles.push(handle);
      return handle;
    } };
  const bridge = new AntEnvironmentAudioBridge({ audioEngine });
  assert.equal(bridge.mode, 'bornSurface');
  bridge.setVolume(0.35);
  assert.equal(calls.length, 0, 'volume changes do not initialize either transport');
  await bridge.setEnabled(true);
  assert.deepEqual(calls, ['surface-plate-processor']);
  assert.equal(bridge.surface.plates.size, 0, 'no universal born plate');
  bridge.setMode('legacy');
  assert.equal(handles[0].disconnected, 1);
  assert.equal(bridge.enabled, false, 'a mode change needs a fresh explicit Audio On');
  await bridge.setEnabled(true);
  assert.equal(calls[1], 'plate-processor');
  assert.equal(bridge.volume, 0.35);
  bridge.setMode('bornSurface');
  assert.equal(bridge.volume, 0.35);
  await bridge.destroy();
  assert.ok(handles.every(handle => handle.disconnected === 1));
  assert.equal(bridge.surface.audioEngine, audioEngine);
  assert.equal(bridge.legacy.audioEngine, audioEngine, 'both experiments use the same shared engine');
});
