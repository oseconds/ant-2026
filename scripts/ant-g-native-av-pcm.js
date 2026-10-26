export function dataUrlPayload(dataUrl) {
  const marker = ';base64,';
  const index = String(dataUrl).indexOf(marker);
  if (index < 0) throw new TypeError('Expected a base64 data URL.');
  return String(dataUrl).slice(index + marker.length);
}

export const PCM_TAP_SOURCE = String.raw`
class AntNativePcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.frames = 0;
    this.blocks = 0;
    this.gapFrames = 0;
    this.nonStereoBlocks = 0;
    this.firstFrame = null;
    this.endFrame = null;
    this.capacity = sampleRate;
    this.left = new Float32Array(this.capacity);
    this.right = new Float32Array(this.capacity);
    this.used = 0;
    this.chunkStart = null;
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'start') {
        this.recording = true;
        this.frames = this.blocks = this.gapFrames = this.nonStereoBlocks = 0;
        this.firstFrame = this.endFrame = null;
        this.used = 0;
        this.chunkStart = null;
        this.port.postMessage({ type: 'pcm-start', sampleRate, currentFrame });
      } else if (data?.type === 'stop') {
        if (this.recording) {
          this.flush(true);
          this.recording = false;
        }
        this.port.postMessage({ type: 'pcm-stop', frames: this.frames, blocks: this.blocks,
          firstFrame: this.firstFrame, endFrame: this.endFrame, gapFrames: this.gapFrames,
          nonStereoBlocks: this.nonStereoBlocks });
      }
    };
  }
  flush(partial = false) {
    if (!this.used) return;
    const left = partial ? this.left.slice(0, this.used) : this.left;
    const right = partial ? this.right.slice(0, this.used) : this.right;
    this.port.postMessage({ type: 'pcm-chunk', left, right, startFrame: this.chunkStart,
      endFrame: this.chunkStart + this.used }, [left.buffer, right.buffer]);
    this.blocks++;
    this.used = 0;
    this.chunkStart = null;
    if (!partial) {
      this.left = new Float32Array(this.capacity);
      this.right = new Float32Array(this.capacity);
    }
  }
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    if (!this.recording) return true;
    const input = inputs[0] || [];
    const left = input[0], right = input[1];
    const frameCount = Math.max(left?.length || 0, right?.length || 0, outputs[0]?.[0]?.length || 0);
    if (input.length !== 2 || !left || !right || left.length !== right.length) this.nonStereoBlocks++;
    if (frameCount && this.firstFrame === null) this.firstFrame = currentFrame;
    for (let i = 0; i < frameCount; i++) {
      const frame = currentFrame + i;
      if (this.chunkStart === null) this.chunkStart = frame;
      const hasLeft = i < (left?.length || 0), hasRight = i < (right?.length || 0);
      this.left[this.used] = hasLeft ? left[i] : 0;
      this.right[this.used] = hasRight ? right[i] : 0;
      if (!hasLeft || !hasRight) this.gapFrames++;
      this.used++;
      this.frames++;
      this.endFrame = frame + 1;
      if (this.used === this.capacity) this.flush();
    }
    return true;
  }
}
registerProcessor('ant-native-pcm-tap', AntNativePcmTap);
`;

export function encodeStereoFloatWav(chunks, sampleRate) {
  if (!Array.isArray(chunks)) throw new TypeError('PCM chunks must be an array.');
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0 || sampleRate > Math.floor(0xffffffff / 8))
    throw new RangeError('sampleRate must fit the stereo float WAV header.');
  let frames = 0, expectedFrame = null;
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    if (!(chunk?.left instanceof Float32Array) || !(chunk?.right instanceof Float32Array)
      || chunk.left.length !== chunk.right.length || chunk.left.length === 0)
      throw new TypeError(`chunks[${index}] must contain equal non-empty Float32Array channels.`);
    if (!Number.isSafeInteger(chunk.startFrame) || !Number.isSafeInteger(chunk.endFrame)
      || chunk.endFrame - chunk.startFrame !== chunk.left.length
      || (expectedFrame !== null && chunk.startFrame !== expectedFrame))
      throw new RangeError(`chunks[${index}] has invalid or discontinuous frame counters.`);
    expectedFrame = chunk.endFrame;
    frames += chunk.left.length;
  }
  if (frames > Math.floor((0xffffffff - 36) / 8)) throw new RangeError('PCM is too large for a RIFF WAV file.');
  const dataBytes = frames * 8, bytes = Buffer.alloc(44 + dataBytes);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + dataBytes, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(3, 20); bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 8, 28);
  bytes.writeUInt16LE(8, 32); bytes.writeUInt16LE(32, 34); bytes.write('data', 36); bytes.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (const chunk of chunks) for (let i = 0; i < chunk.left.length; i++, offset += 8) {
    bytes.writeFloatLE(chunk.left[i], offset); bytes.writeFloatLE(chunk.right[i], offset + 4);
  }
  return bytes;
}
