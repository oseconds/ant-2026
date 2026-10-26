import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { PCM_TAP_SOURCE, encodeStereoFloatWav, dataUrlPayload } from '../scripts/ant-g-native-av-pcm.js';

test('data URL export preserves WebM bytes when codec MIME contains a comma', () => {
  const header = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  const url = `data:video/webm;codecs=vp8,opus;base64,${header.toString('base64')}`;
  assert.deepEqual(Buffer.from(dataUrlPayload(url), 'base64'), header);
  assert.throws(() => dataUrlPayload('not a data URL'), /base64/);
});

function makeTap(rate = 4) {
  let Processor;
  const messages = [];
  class AudioWorkletProcessorStub {
    constructor() { this.port = { onmessage: null, postMessage: (data, transfer) => messages.push({ data, transfer }) }; }
  }
  const context = { AudioWorkletProcessor: AudioWorkletProcessorStub, Float32Array,
    sampleRate: rate, currentFrame: 10,
    registerProcessor(name, constructor) { assert.equal(name, 'ant-native-pcm-tap'); Processor = constructor; } };
  vm.runInNewContext(PCM_TAP_SOURCE, context);
  return { processor: new Processor(), messages, context };
}

test('PCM tap preserves exact stereo samples, frame counters, silence output and float WAV bytes', () => {
  const { processor, messages, context } = makeTap();
  processor.port.onmessage({ data: { type: 'start' } });
  const start = messages.shift().data;
  assert.equal(start.type, 'pcm-start');
  assert.equal(start.sampleRate, 4);
  assert.equal(start.currentFrame, 10);
  const output = [new Float32Array(2), new Float32Array(2)];
  processor.process([[Float32Array.from([.125, -.75]), Float32Array.from([-.25, .875])]], [output]);
  assert.deepEqual([...output[0], ...output[1]], [0, 0, 0, 0]);
  context.currentFrame = 12;
  processor.process([[Float32Array.from([1.25, -2]), Float32Array.from([.5, -1.5])]], [[new Float32Array(2), new Float32Array(2)]]);
  const full = messages.shift().data;
  assert.equal(full.type, 'pcm-chunk');
  assert.equal(full.startFrame, 10);
  assert.equal(full.endFrame, 14);
  assert.deepEqual([...full.left], [.125, -.75, 1.25, -2]);
  assert.deepEqual([...full.right], [-.25, .875, .5, -1.5]);
  assert.equal(messages.length, 0);
  assert.equal(full.left.length, 4);
  assert.equal(full.right.length, 4);

  const partialOut = [new Float32Array(1), new Float32Array(1)];
  context.currentFrame = 14;
  processor.process([[Float32Array.from([.333]), Float32Array.from([-.666])]], [partialOut]);
  assert.deepEqual([...partialOut[0], ...partialOut[1]], [0, 0]);
  processor.port.onmessage({ data: { type: 'stop' } });
  const partial = messages.shift().data;
  assert.deepEqual([...partial.left], [...Float32Array.from([.333])]);
  assert.deepEqual([...partial.right], [...Float32Array.from([-.666])]);
  assert.equal(partial.startFrame, 14);
  assert.equal(partial.endFrame, 15);
  const stop = messages.shift().data;
  assert.deepEqual([stop.type, stop.frames, stop.blocks, stop.firstFrame, stop.endFrame, stop.gapFrames, stop.nonStereoBlocks],
    ['pcm-stop', 5, 2, 10, 15, 0, 0]);

  const wav = encodeStereoFloatWav([full, partial], 4);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt16LE(20), 3);
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(40), 40);
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => wav.readFloatLE(44 + i * 4)),
    [...Float32Array.from([.125, -.25, -.75, .875, 1.25, .5, -2, -1.5, .333, -.666])]);
});

test('PCM tap accounts for a missing channel as zero and reports a gap/non-stereo block', () => {
  const { processor, messages, context } = makeTap();
  processor.port.onmessage({ data: { type: 'start' } });
  messages.length = 0;
  const output = [new Float32Array(2), new Float32Array(2)];
  processor.process([[Float32Array.from([.2, .4])]], [output]);
  assert.deepEqual([...output[0], ...output[1]], [0, 0, 0, 0]);
  context.currentFrame = 12;
  processor.port.onmessage({ data: { type: 'stop' } });
  const chunk = messages.shift().data;
  assert.deepEqual([...chunk.left], [...Float32Array.from([.2, .4])]);
  assert.deepEqual([...chunk.right], [0, 0]);
  const stop = messages.shift().data;
  assert.deepEqual([stop.type, stop.frames, stop.blocks, stop.firstFrame, stop.endFrame, stop.gapFrames, stop.nonStereoBlocks],
    ['pcm-stop', 2, 1, 10, 12, 2, 1]);
});

test('float WAV encoder rejects discontinuous frame counters and accepts silence-only capture', () => {
  assert.throws(() => encodeStereoFloatWav([
    { left: new Float32Array(1), right: new Float32Array(1), startFrame: 1, endFrame: 2 },
    { left: new Float32Array(1), right: new Float32Array(1), startFrame: 3, endFrame: 4 }
  ], 48_000), /discontinuous/);
  const empty = encodeStereoFloatWav([], 48_000);
  assert.equal(empty.length, 44);
  assert.equal(empty.readUInt32LE(40), 0);
});

test('a skipped worklet quantum is detectable by the full frame-range invariant even inside a chunk', () => {
  const { processor, messages, context } = makeTap(16);
  processor.port.onmessage({ data: { type: 'start' } });
  const stereo = () => [[new Float32Array(2), new Float32Array(2)]];
  processor.process(stereo(), stereo());
  context.currentFrame = 14; // 12..13 were skipped; the channel-gap counter alone cannot detect this.
  processor.process(stereo(), stereo());
  processor.port.onmessage({ data: { type: 'stop' } });
  const stop = messages.at(-1).data;
  assert.equal(stop.gapFrames, 0);
  assert.notEqual(stop.endFrame - stop.firstFrame, stop.frames);
});
