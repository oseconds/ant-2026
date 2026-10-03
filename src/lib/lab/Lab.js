import { AudioEngine } from '../audio/AudioEngine.js';
import { modelRegistry } from './modelRegistry.js';

/** Framework-independent model selection. Render/event lifetimes belong to adapters. */
export class Lab {
  constructor({ registry = modelRegistry, audioEngine, workletBaseUrl = '/worklets/' } = {}) {
    this.registry = registry;
    this.audio = audioEngine || new AudioEngine();
    this.ownsAudio = !audioEngine;
    this.workletBaseUrl = workletBaseUrl;
    this.model = null;
    this.modelName = null;
    this.destroyed = false;
    this.switching = false;
    this.listeners = new Set();
    this.unsubscribeModel = null;
    this.version = 0;
    this.transition = Promise.resolve();
  }

  subscribe(listener) {
    if (this.destroyed) throw new Error('Lab has been destroyed.');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(type, payload = {}) {
    if (this.destroyed) return;
    for (const listener of [...this.listeners]) listener({ type, payload });
  }
  getState() { return this.model?.getState() ?? null; }
  getSnapshot() { return this.model?.getSnapshot() ?? null; }

  setModel(name, state) {
    if (this.destroyed) return Promise.reject(new Error('Lab has been destroyed.'));
    if (!Object.hasOwn(this.registry, name)) return Promise.reject(new Error(`Unknown model: ${name}`));
    const request = ++this.version;
    this.switching = true;
    // Cancel queued strikes as soon as a new selection is requested.
    this.model?.stop();
    this.emit('switching', { name });
    const switchModel = async () => {
      if (request !== this.version || this.destroyed) return null;
      this.unsubscribeModel?.();
      this.unsubscribeModel = null;
      const previous = this.model;
      this.model = null;
      this.modelName = null;
      await previous?.destroy();
      if (request !== this.version || this.destroyed) return null;
      let candidate;
      try {
        candidate = this.registry[name]({ audioEngine: this.audio, workletBaseUrl: this.workletBaseUrl, state });
        await candidate.init();
        if (request !== this.version || this.destroyed) { await candidate.destroy(); return null; }
        this.model = candidate;
        this.modelName = name;
        this.unsubscribeModel = candidate.subscribe((event) => this.emit(event.type, event.payload));
        this.switching = false;
        this.emit('model', { name });
        this.emit('update');
        return candidate;
      } catch (error) {
        await candidate?.destroy();
        if (request === this.version) {
          this.switching = false;
          this.emit('error', { message: error.message });
        }
        throw error;
      }
    };
    const result = this.transition.then(switchModel);
    this.transition = result.catch(() => {});
    return result;
  }

  configure(patch) { return this.model?.configure(patch); }
  setPickup(position) { return this.model?.setPickup(position); }
  strike(options) { return this.switching ? Promise.resolve(false) : this.model?.strike(options) ?? Promise.resolve(false); }
  stop() { this.model?.stop(); }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.version++;
    this.model?.stop();
    this.unsubscribeModel?.();
    this.listeners.clear();
    await this.transition;
    await this.model?.destroy();
    this.model = null;
    this.modelName = null;
    if (this.ownsAudio) await this.audio.destroy();
  }
}
