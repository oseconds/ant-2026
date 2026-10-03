import { BaseModel } from './BaseModel.js';

/** Shared lazy worklet setup, message lifecycle and pending-strike cancellation. */
export class WorkletModel extends BaseModel {
  constructor(defaultState, options) {
    super(defaultState, options);
    this.processorName = options.processorName;
    this.output = options.output;
    this.workletUrl = `${(options.workletBaseUrl || '/worklets/').replace(/\/?$/, '/')}${options.workletFile}`;
    this.worklet = null;
    this.initializing = null;
  }

  processorConfig() { throw new Error('Implement processorConfig() in each worklet model.'); }
  post(type, payload = {}) { this.worklet?.node.port.postMessage({ type, payload }); }
  onConfigure() { this.post('configure', this.processorConfig()); }

  ensureAudio() {
    this.assertAlive();
    if (this.worklet) return super.ensureAudio();
    if (this.initializing) return this.initializing;
    this.status = 'loading';
    this.error = null;
    const pending = this.audio.createWorklet(this.processorName, this.workletUrl, this.processorConfig(),
      (message) => { if (!this.destroyed) this.handleMessage(message); },
      (error) => {
        if (this.destroyed) return;
        this.worklet?.disconnect();
        this.worklet = null;
        this.error = error.message;
        this.status = 'error';
        this.emit('error', { message: error.message });
        this.emit('update');
      }, this.output).then((worklet) => {
        if (this.destroyed) { worklet.disconnect(); return; }
        this.worklet = worklet;
        this.post('configure', this.processorConfig());
        this.status = 'idle';
      }).catch((error) => {
        if (!this.destroyed) {
          this.error = error.message;
          this.status = 'error';
          this.emit('error', { message: error.message });
        }
        throw error;
      }).finally(() => {
        if (this.initializing === pending) this.initializing = null;
        this.emit('update');
      });
    this.initializing = pending;
    this.emit('update');
    return pending;
  }

  async strike({ position = this.state.excitation.position, strength = this.state.excitation.strength } = {}) {
    this.assertAlive();
    this.configure({ excitation: { position, strength } });
    const excitation = this.getState().excitation;
    if (excitation.strength === 0) return false;
    const operation = this.operationVersion;
    try { await this.ensureAudio(); }
    catch (error) {
      if (this.destroyed || operation !== this.operationVersion) return false;
      throw error;
    }
    if (this.destroyed || operation !== this.operationVersion) return false;
    this.configure({ excitation });
    this.post('strike', excitation);
    this.status = 'active';
    this.emit('update');
    return true;
  }

  handleMessage({ type, payload }) {
    if (type === 'activity') this.status = payload.active ? 'active' : 'idle';
    if (type === 'frame') this.frame = payload;
    if (type === 'model' || type === 'grid') this.analysis = { ...this.analysis, ...payload };
    this.emit('update');
  }

  stop() {
    this.post('stop');
    this.frame = null;
    super.stop();
  }

  async destroy() {
    if (this.destroyed) return;
    this.stop();
    this.worklet?.disconnect();
    this.worklet = null;
    await super.destroy();
  }
}
