/** Browser resources are created only by init(), normally inside a user gesture. */
export class AudioEngine {
  constructor({ contextFactory, workletNodeFactory, moduleTimeout = 6000 } = {}) {
    this.contextFactory = contextFactory;
    this.workletNodeFactory = workletNodeFactory;
    this.moduleTimeout = moduleTimeout;
    this.context = null;
    this.destroyed = false;
    this.connections = new Set();
    this.worklets = new Set();
    this.modules = new Map();
    this.initializing = null;
  }

  init() {
    if (this.destroyed) return Promise.reject(new Error('AudioEngine has been destroyed.'));
    if (this.initializing) return this.initializing;
    try {
      if (!this.context) {
        const Constructor = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!this.contextFactory && !Constructor) throw new Error('이 브라우저는 Web Audio를 지원하지 않습니다.');
        this.context = this.contextFactory ? this.contextFactory() : new Constructor({ latencyHint: 'interactive' });
      }
      const context = this.context;
      // Call resume immediately so the first gesture grants audio activation.
      const resume = context.state === 'running' ? Promise.resolve() : context.resume();
      const pending = Promise.resolve(resume).then(() => {
        if (this.destroyed) throw new Error('AudioEngine has been destroyed.');
        return context;
      }).catch(async (error) => {
        if (!this.destroyed && this.context === context) {
          this.context = null;
          this.modules.clear();
          if (context.state !== 'closed') await context.close().catch(() => {});
        }
        throw error;
      }).finally(() => {
        if (this.initializing === pending) this.initializing = null;
      });
      this.initializing = pending;
      return pending;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async loadModule(url) {
    const context = await this.init();
    if (!context.audioWorklet) throw new Error('AudioWorklet에는 localhost 또는 HTTPS와 지원 브라우저가 필요합니다.');
    if (!this.modules.has(url)) {
      let timeout;
      const loading = Promise.race([
        context.audioWorklet.addModule(url),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`AudioWorklet 로드 시간 초과: ${url}`)), this.moduleTimeout); })
      ]).finally(() => clearTimeout(timeout));
      this.modules.set(url, loading);
      loading.catch(() => { if (this.modules.get(url) === loading) this.modules.delete(url); });
    }
    await this.modules.get(url);
    if (this.destroyed) throw new Error('AudioEngine has been destroyed.');
    return context;
  }

  connect(source, { gain = 1, highpass = 0, lowpass = 0, compressor = false } = {}) {
    if (this.destroyed || !this.context) throw new Error('Initialize the audio engine before connecting nodes.');
    const context = this.context;
    const nodes = [source];
    const append = (node) => { nodes.at(-1).connect(node); nodes.push(node); };
    for (const [type, frequency] of [['highpass', highpass], ['lowpass', lowpass]]) {
      if (frequency > 0) {
        const filter = context.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        append(filter);
      }
    }
    const gainNode = context.createGain();
    gainNode.gain.value = gain;
    append(gainNode);
    if (compressor) {
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 12;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.18;
      append(limiter);
    }
    nodes.at(-1).connect(context.destination);
    const handle = { gainNode, disconnect: () => {
      if (!this.connections.delete(handle)) return;
      for (const node of nodes) node.disconnect();
    } };
    this.connections.add(handle);
    return handle;
  }

  async createWorklet(name, url, processorOptions, onMessage, onError, output = {}) {
    const context = await this.loadModule(url);
    const options = { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions };
    const Constructor = globalThis.AudioWorkletNode;
    if (!this.workletNodeFactory && !Constructor) throw new Error('AudioWorkletNode is unavailable.');
    const node = this.workletNodeFactory ? this.workletNodeFactory(context, name, options) : new Constructor(context, name, options);
    node.port.onmessage = (event) => onMessage?.(event.data);
    const errorListener = () => onError?.(new Error(`${name}: 오디오 처리 오류`));
    node.addEventListener('processorerror', errorListener);
    let connection;
    try { connection = this.connect(node, output); }
    catch (error) {
      node.removeEventListener('processorerror', errorListener);
      node.port.onmessage = null;
      node.port.close();
      node.disconnect();
      throw error;
    }
    let disposed = false;
    const handle = { node, gainNode: connection.gainNode, disconnect: () => {
      if (disposed) return;
      disposed = true;
      this.worklets.delete(handle);
      node.port.postMessage({ type: 'destroy', payload: {} });
      node.port.onmessage = null;
      node.removeEventListener('processorerror', errorListener);
      node.port.close();
      connection.disconnect();
    } };
    this.worklets.add(handle);
    return handle;
  }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const worklet of [...this.worklets]) worklet.disconnect();
    for (const connection of [...this.connections]) connection.disconnect();
    this.modules.clear();
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') await context.close();
  }
}
