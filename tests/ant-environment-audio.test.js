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


test('optional base substrate adds a quiet legacy Plate before born material without changing the surface transport', async () => {
  const handles = [], calls = [];
  const audioEngine = { context: { currentTime: 0 }, init: async () => {},
    async createWorklet(...args) {
      calls.push({ name: args[0], output: args[5] });
      const handle = { sent: [], node: { port: { postMessage(message) { handle.sent.push(message); } } },
        gainNode: { gain: { value: args[5].gain, cancelScheduledValues() {},
          setValueAtTime(value) { this.value = value; },
          linearRampToValueAtTime(value) { this.value = value; } } },
        disconnected: 0, disconnect() { this.disconnected++; } };
      handles.push(handle);
      return handle;
    } };
  const bridge = new AntEnvironmentAudioBridge({ audioEngine });
  bridge.setVolume(0.5);
  assert.equal(bridge.baseSubstrateEnabled, false,
    'bridge construction preserves the historical born-surface-only baseline');
  await bridge.setBaseSubstrateEnabled(true);
  await bridge.setEnabled(true);
  assert.deepEqual(calls.map(call => call.name), ['surface-plate-processor', 'plate-processor']);
  const baseIndex = calls.findIndex(call => call.name === 'plate-processor');
  assert.ok(Math.abs(calls[baseIndex].output.gain - 0.7 * 0.5 * 0.22) < 1e-12,
    'base substrate is a fixed quiet fraction of the ANT master volume');

  const event = { type: 'FOOT_CONTACT', contactGroup: 'A', strength: 0.04,
    position: { x: 0.5, y: 0.5 },
    contacts: [
      { legId: 'FL', position: { x: 0.49, y: 0.5 } },
      { legId: 'MR', position: { x: 0.50, y: 0.5 } },
      { legId: 'RL', position: { x: 0.51, y: 0.5 } }
    ] };
  assert.equal(await bridge.handleFootContact(event, { responses: [] }), true,
    'base substrate can sound before any born material route exists');
  assert.ok(handles[baseIndex].sent.some(message => message.type === 'strike'));
  const diagnostics = bridge.getDiagnostics();
  assert.equal(diagnostics.baseSubstrate.inputGroups, 1);
  assert.equal(diagnostics.baseSubstrate.deliveredGroups, 1);

  await bridge.setBaseSubstrateEnabled(false);
  assert.equal(handles[baseIndex].disconnected, 1);
  assert.equal(await bridge.handleFootContact(event, { responses: [] }), false,
    'surface-only A/B remains silent when no born Plate supports the feet');
  await bridge.destroy();
});
