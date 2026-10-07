import { AntAudioBridge } from './AntAudioBridge.js';
import { SurfaceAudioBridge } from './SurfaceAudioBridge.js';

export const ANT_BASE_SUBSTRATE_OUTPUT_RATIO = 0.22;
export const ANT_BASE_SUBSTRATE_DAMPING = 1;

/** Select an isolated ANT acoustic experiment while sharing the application's engine. */
export class AntEnvironmentAudioBridge {
  constructor(options = {}) {
    this.legacy = new AntAudioBridge(options);
    this.surface = new SurfaceAudioBridge(options);
    this.mode = 'bornSurface';
    this._volume = 1;
    this.baseSubstrateEnabled = false;
    this.baseSubstrateDiagnostics = { inputGroups: 0, deliveredGroups: 0 };
    this.destroyed = false;
  }

  get selected() { return this.mode === 'legacy' ? this.legacy : this.surface; }
  get enabled() { return this.mode === 'legacy' ? this.legacy.enabled : this.surface.enabled; }
  get loading() {
    return this.mode === 'legacy'
      ? this.legacy.loading
      : this.surface.loading || (this.baseSubstrateEnabled && this.legacy.loading);
  }
  get error() {
    return this.mode === 'legacy'
      ? this.legacy.error
      : this.surface.error || (this.baseSubstrateEnabled ? this.legacy.error : null);
  }
  get volume() { return this._volume; }
  get plate() { return this.mode === 'legacy' ? this.legacy.plate : null; }
  get basePlate() { return this.mode === 'bornSurface' && this.baseSubstrateEnabled ? this.legacy.plate : null; }
  get worklet() { return this.mode === 'legacy' ? this.legacy.plate?.worklet : this.surface.worklet; }

  setMode(mode) {
    const next = mode === 'legacy' ? 'legacy' : 'bornSurface';
    if (this.destroyed || next === this.mode) return this.mode;
    this.stop();
    this.mode = next;
    this.applyVolume();
    return this.mode;
  }

  setBaseSubstrateEnabled(enabled) {
    if (this.destroyed) return Promise.resolve(false);
    const next = Boolean(enabled);
    if (next === this.baseSubstrateEnabled) return Promise.resolve(next);
    this.baseSubstrateEnabled = next;
    this.applyVolume();
    if (this.mode !== 'bornSurface' || !this.surface.enabled) {
      if (this.mode === 'bornSurface' && !next) this.legacy.stop();
      return Promise.resolve(next);
    }
    if (!next) {
      this.legacy.stop();
      return this.legacy.cleanupPromise || Promise.resolve(false);
    }
    return this.startBaseSubstrate();
  }

  startBaseSubstrate() {
    return Promise.resolve(this.legacy.setEnabled(true)).then((enabled) => {
      if (enabled) this.legacy.plate?.configure?.({ damping: ANT_BASE_SUBSTRATE_DAMPING });
      return Boolean(enabled);
    });
  }

  setVolume(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || this.destroyed) return this._volume;
    this._volume = Math.max(0, Math.min(1, number));
    this.applyVolume();
    return this._volume;
  }

  applyVolume() {
    this.surface.setVolume(this._volume);
    const legacyVolume = this.mode === 'legacy'
      ? this._volume
      : this._volume * ANT_BASE_SUBSTRATE_OUTPUT_RATIO;
    this.legacy.setVolume(legacyVolume);
  }

  syncPlates(plates) { return this.surface.syncPlates(plates); }
  syncMaterial(material) { return this.surface.syncMaterial(material); }

  setEnabled(enabled) {
    if (!enabled) {
      this.stop();
      return this.legacy.cleanupPromise || this.surface.cleanupPromise || Promise.resolve(false);
    }
    if (this.destroyed) return Promise.resolve(false);
    this.applyVolume();
    if (this.mode === 'legacy') return this.legacy.setEnabled(true);
    const primary = Promise.resolve(this.surface.setEnabled(true));
    if (!this.baseSubstrateEnabled) return primary;
    const substrate = this.startBaseSubstrate();
    return Promise.all([primary, substrate]).then(([surfaceEnabled, substrateEnabled]) =>
      Boolean(surfaceEnabled && substrateEnabled));
  }

  handleFootContact(event, context) {
    if (this.mode === 'legacy') return this.legacy.handleFootContact(event, context);
    const surfaceResult = this.surface.handleFootContact(event, context);
    if (!this.baseSubstrateEnabled) return surfaceResult;
    this.baseSubstrateDiagnostics.inputGroups += 1;
    return Promise.resolve(this.legacy.handleFootContact(event)).then((delivered) => {
      if (delivered) this.baseSubstrateDiagnostics.deliveredGroups += 1;
      return Boolean(surfaceResult || delivered);
    });
  }

  requestDiagnostics() {
    return this.mode === 'bornSurface' ? this.surface.requestDiagnostics() : false;
  }

  getDiagnostics() {
    return {
      mode: this.mode,
      baseSubstrate: {
        enabled: this.baseSubstrateEnabled,
        outputRatio: ANT_BASE_SUBSTRATE_OUTPUT_RATIO,
        damping: ANT_BASE_SUBSTRATE_DAMPING,
        audioActive: this.legacy.enabled,
        inputGroups: this.baseSubstrateDiagnostics.inputGroups,
        deliveredGroups: this.baseSubstrateDiagnostics.deliveredGroups
      },
      surface: this.surface.getDiagnostics()
    };
  }

  stop() { this.legacy.stop(); this.surface.stop(); }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    await Promise.all([this.legacy.destroy(), this.surface.destroy()]);
  }
}
