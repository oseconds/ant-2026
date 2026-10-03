import test from 'node:test';
import assert from 'node:assert/strict';
import { StringModel } from '../src/lib/models/string/StringModel.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fakeAudioEngine(init = async () => {}) {
  const engine = {
    context: null,
    sources: [],
    connections: [],
    init: async () => {
      await init();
      engine.context ||= {
        sampleRate: 48000,
        currentTime: 3,
        createBuffer(_channels, length) {
          const samples = new Float32Array(length);
          return { samples, getChannelData: () => samples };
        },
        createBufferSource() {
          const source = {
            buffer: null, onended: null, startTime: null, stopTime: null,
            start(time) { this.startTime = time; },
            stop(time) { this.stopTime = time ?? engine.context.currentTime; }
          };
          engine.sources.push(source);
          return source;
        }
      };
    },
    connect(source, options) {
      const events = [];
      const gain = {
        value: options.gain,
        cancelScheduledValues(time) { events.push(['cancel', time]); },
        setValueAtTime(value, time) { events.push(['set', value, time]); this.value = value; },
        exponentialRampToValueAtTime(value, time) { events.push(['ramp', value, time]); }
      };
      let disconnected = false;
      const connection = {
        gainNode: { gain }, events,
        disconnect() { disconnected = true; },
        get disconnected() { return disconnected; }
      };
      engine.connections.push(connection);
      return connection;
    },
    destroy: async () => {}
  };
  return engine;
}

test('pending note initialization is cancelled by stop or destroy without creating a source', async () => {
  for (const cancel of ['stop', 'destroy']) {
    const gate = deferred();
    const engine = fakeAudioEngine(() => gate.promise);
    const model = new StringModel({ audioEngine: engine });
    const pending = model.strike();
    await Promise.resolve();
    if (cancel === 'stop') model.stop();
    else await model.destroy();
    gate.resolve();
    assert.equal(await pending, false);
    assert.equal(engine.sources.length, 0);
    if (cancel === 'stop') await model.destroy();
  }
});

test('pending pattern initialization is cancelled by stop or destroy', async () => {
  for (const cancel of ['stop', 'destroy']) {
    const gate = deferred();
    const engine = fakeAudioEngine(() => gate.promise);
    const model = new StringModel({ audioEngine: engine });
    const pending = model.playPattern();
    await Promise.resolve();
    if (cancel === 'stop') model.stop();
    else await model.destroy();
    gate.resolve();
    assert.equal(await pending, false);
    assert.equal(engine.sources.length, 0);
    assert.equal(model.getSnapshot().patternIsPlaying, false);
    if (cancel === 'stop') await model.destroy();
  }
});

test('strike reuses inspector noise and validates input before opening audio', async () => {
  const engine = fakeAudioEngine();
  const model = new StringModel({ audioEngine: engine });
  await model.init();
  assert.equal(await model.playNote(110, { strength: 0 }), false);
  assert.equal(engine.context, null);
  await model.strike({ strength: Number.NaN });
  const snapshot = model.getSnapshot();
  assert.equal(snapshot.state.excitation.strength, .7);
  assert.ok(Math.abs(engine.sources[0].buffer.samples[0] - snapshot.inspector.values[0] * .75) < 1e-7);
  await assert.rejects(model.playNote(Infinity), /frequency must be between 55 and 880/);
  await assert.rejects(model.playNote(110, { duration: -1 }), /duration must be between/);
  await model.destroy();
});

test('three-voice cap fades distinct oldest voices and source cleanup disconnects nodes', async () => {
  const engine = fakeAudioEngine();
  const model = new StringModel({ audioEngine: engine });
  for (let i = 0; i < 5; i++) await model.strike();
  assert.equal(engine.sources.length, 5);
  assert.equal(engine.sources[0].stopTime, 3.075);
  assert.equal(engine.sources[1].stopTime, 3.075);
  assert.ok(engine.connections[0].events.some(event => event[0] === 'ramp'));
  assert.ok(engine.connections[1].events.some(event => event[0] === 'ramp'));
  const ended = engine.sources[2];
  ended.onended();
  assert.equal(engine.connections[2].disconnected, true);
  await model.destroy();
  assert.ok(engine.connections.every(connection => connection.disconnected));
});

test('pattern stop detaches callbacks and immediately disconnects scheduled voices', async () => {
  const engine = fakeAudioEngine();
  const model = new StringModel({ audioEngine: engine });
  await model.playPattern();
  assert.ok(engine.sources.length > 0);
  const sources = [...engine.sources];
  model.stop();
  assert.ok(sources.every(source => source.onended === null));
  assert.ok(engine.connections.every(connection => connection.disconnected));
  await model.destroy();
});
