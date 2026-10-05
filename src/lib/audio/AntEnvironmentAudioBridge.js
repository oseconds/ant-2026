import { AntAudioBridge } from './AntAudioBridge.js';
import { SurfaceAudioBridge } from './SurfaceAudioBridge.js';

/** Select an isolated ANT acoustic experiment while sharing the application's engine. */
export class AntEnvironmentAudioBridge {
  constructor(options = {}) {
    this.legacy = new AntAudioBridge(options);
    this.surface = new SurfaceAudioBridge(options);
    this.mode = 'bornSurface';
    this.destroyed = false;
  }

  get selected() { return this.mode === 'legacy' ? this.legacy : this.surface; }
  get enabled() { return this.selected.enabled; }
  get loading() { return this.selected.loading; }
  get error() { return this.selected.error; }
  get volume() { return this.selected.volume; }
  get plate() { return this.mode === 'legacy' ? this.legacy.plate : null; }
  get worklet() { return this.mode === 'legacy' ? this.legacy.plate?.worklet : this.surface.worklet; }

  setMode(mode) {
    const next = mode === 'legacy' ? 'legacy' : 'bornSurface';
    if (this.destroyed || next === this.mode) return this.mode;
    this.selected.stop();
    this.mode = next;
    return this.mode;
  }

  setVolume(value) {
    this.legacy.setVolume(value);
    return this.surface.setVolume(value);
  }

  syncPlates(plates) { return this.surface.syncPlates(plates); }
  setEnabled(enabled) { return this.destroyed ? Promise.resolve(false) : this.selected.setEnabled(enabled); }
  handleFootContact(event, context) { return this.selected.handleFootContact(event, context); }
  stop() { this.legacy.stop(); this.surface.stop(); }
  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    await Promise.all([this.legacy.destroy(), this.surface.destroy()]);
  }
}
