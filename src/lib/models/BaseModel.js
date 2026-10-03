import { AudioEngine } from '../audio/AudioEngine.js';
import { cloneState, mergeState } from '../utils/state.js';

/** Common settings/events contract; contains no UI or visualization dependency. */
export class BaseModel {
  constructor(defaultState, options = {}) {
    this.state = cloneState(this.validateState(mergeState(defaultState, options.state || {})));
    this.audio = options.audioEngine || new AudioEngine();
    this.ownsAudio = !options.audioEngine;
    this.status = 'idle';
    this.analysis = {};
    this.frame = null;
    this.error = null;
    this.destroyed = false;
    this.listeners = new Set();
    this.operationVersion = 0;
  }

  validateState(state) { return state; }
  assertAlive() { if (this.destroyed) throw new Error('Model has been destroyed.'); }
  async init() { this.assertAlive(); return this; }
  async ensureAudio() { this.assertAlive(); await this.audio.init(); this.assertAlive(); }
  getState() { return cloneState(this.state); }
  getSnapshot() { return { state: this.getState(), status: this.status, analysis: { ...this.analysis }, frame: this.frame, error: this.error }; }

  configure(patch) {
    this.assertAlive();
    const previous = this.state;
    this.state = cloneState(this.validateState(mergeState(previous, patch)));
    this.onConfigure(previous);
    this.emit('update');
    return this.getState();
  }

  onConfigure() {}
  setPickup(position) { return this.configure({ pickup: { position } }); }
  subscribe(listener) {
    this.assertAlive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(type, payload = {}) {
    if (this.destroyed) return;
    for (const listener of [...this.listeners]) listener({ type, payload });
  }
  stop() { this.operationVersion++; this.status = 'idle'; this.emit('update'); }
  async destroy() {
    if (this.destroyed) return;
    this.stop();
    this.destroyed = true;
    this.listeners.clear();
    if (this.ownsAudio) await this.audio.destroy();
  }
}
