import { PlateModel } from '../models/plate/PlateModel.js';

const MAX_STRIKE_STRENGTH = 0.05;
const PLATE_COORDINATE_SCALE = 0.92 / Math.sqrt(2);
const VOLUME_RAMP_SECONDS = 0.02;

/** Routes distance-step events into the existing shared Plate worklet. */
export class AntAudioBridge {
  constructor({ audioEngine, workletBaseUrl, plateFactory = (options) => new PlateModel(options) } = {}) {
    if (!audioEngine) throw new TypeError('AntAudioBridge requires the shared AudioEngine.');
    this.audioEngine = audioEngine;
    this.workletBaseUrl = workletBaseUrl;
    this.plateFactory = plateFactory;
    this.plate = null;
    this.unsubscribe = null;
    this._enabled = false;
    this._loading = false;
    this._error = null;
    this._volume = 1;
    this.plateOutputGain = 1;
    this.destroyed = false;
    this.generation = 0;
    this.enablePromise = null;
    this.cleanupPromise = null;
  }

  get enabled() { return this._enabled; }
  get loading() { return this._loading; }
  get error() { return this._error; }
  get volume() { return this._volume; }

  /** Adjust only the existing output gain; never initialize audio or alter STEP excitation. */
  setVolume(value) {
    const volume = Number(value);
    if (this.destroyed || !Number.isFinite(volume)) return this._volume;
    this._volume = Math.max(0, Math.min(1, volume));
    this.applyVolume();
    return this._volume;
  }

  applyVolume() {
    if (!this.plate) return;
    const target = this.plateOutputGain * this._volume;
    this.plate.output = { ...this.plate.output, gain: target };
    const gain = this.plate.worklet?.gainNode?.gain;
    if (!gain) return;
    const now = this.audioEngine.context.currentTime;
    const current = gain.value;
    // A short ramp avoids clicks during slider drags and reaches exact silence at 0%.
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(current, now);
    gain.linearRampToValueAtTime(target, now + VOLUME_RAMP_SECONDS);
  }

  /** Call from the explicit Audio On gesture; this is the only lazy-init path. */
  setEnabled(enabled) {
    if (!enabled) {
      this.stop();
      return this.cleanupPromise || Promise.resolve(false);
    }
    if (this.destroyed) return Promise.resolve(false);
    if (this._enabled && this.enablePromise) return this.enablePromise;
    if (this._enabled && this.plate && !this._loading) return Promise.resolve(true);

    const generation = ++this.generation;
    this._enabled = true;
    this._loading = true;
    this._error = null;
    const plate = this.plateFactory({ audioEngine: this.audioEngine, workletBaseUrl: this.workletBaseUrl });
    this.plate = plate;
    this.plateOutputGain = plate.output?.gain ?? 1;
    this.applyVolume();
    this.unsubscribe = plate.subscribe(({ type, payload }) => {
      if (type === 'error' && this.plate === plate) {
        this._error = payload?.message || 'Plate audio processing failed.';
        this.stop();
      }
    });

    const pending = plate.ensureAudio().then(() => {
      if (this.destroyed || !this._enabled || generation !== this.generation || this.plate !== plate) {
        return false;
      }
      this.applyVolume();
      this._loading = false;
      return true;
    }).catch((error) => {
      if (!this.destroyed && generation === this.generation && this.plate === plate) {
        this._error = error?.message || String(error);
        this.stop();
      }
      return false;
    }).finally(() => {
      if (this.enablePromise === pending) this.enablePromise = null;
      if (generation === this.generation) this._loading = false;
    });
    this.enablePromise = pending;
    return pending;
  }

  /** STEP events are dropped until ready; no event queue or timing quantization. */
  handleStep(event) {
    if (!this._enabled || this._loading || this.destroyed || !this.plate || event?.type !== 'STEP') {
      return Promise.resolve(false);
    }
    const x = Number(event.position?.x);
    const y = Number(event.position?.y);
    const strength = Number(event.strength);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(strength)) {
      return Promise.resolve(false);
    }
    // ANT uses a unit square; the Plate accepts a disk, so fit the square
    // inside the disk while preserving its orientation and relative position.
    const position = {
      x: (Math.max(0, Math.min(1, x)) * 2 - 1) * PLATE_COORDINATE_SCALE,
      y: (Math.max(0, Math.min(1, y)) * 2 - 1) * PLATE_COORDINATE_SCALE
    };
    const safeStrength = Math.max(0, Math.min(MAX_STRIKE_STRENGTH, strength));
    const plate = this.plate;
    const generation = this.generation;
    return plate.strike({ position, strength: safeStrength }).catch((error) => {
      if (this._enabled && !this.destroyed && this.plate === plate && this.generation === generation) {
        this._error = error?.message || String(error);
        this.stop();
      }
      return false;
    });
  }

  /** Disable synchronously, cancel pending strikes, then release only Plate resources. */
  stop() {
    this.generation++;
    this._enabled = false;
    this._loading = false;
    const plate = this.plate;
    this.plate = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (!plate) return;
    plate.stop();
    const cleanup = plate.destroy().catch((error) => {
      if (!this._error) this._error = error?.message || String(error);
    }).finally(() => {
      if (this.cleanupPromise === cleanup) this.cleanupPromise = null;
    });
    this.cleanupPromise = cleanup;
  }

  async destroy() {
    if (this.destroyed) return this.cleanupPromise;
    this.destroyed = true;
    this.stop();
    await this.cleanupPromise;
  }
}

export default AntAudioBridge;
