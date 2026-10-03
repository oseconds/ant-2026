import { BaseModel } from '../BaseModel.js';
import { cloneState, mergeState } from '../../utils/state.js';

const SCALE = [
  { name: 'C4', frequency: 261.63 }, { name: 'D4', frequency: 293.66 },
  { name: 'E4', frequency: 329.63 }, { name: 'G4', frequency: 392 },
  { name: 'A4', frequency: 440 }, { name: 'C5', frequency: 523.25 }
];
const DEFAULTS = {
  model: 'string', physical: { frequency: 110 },
  excitation: { strength: 0.7, position: 0.5 }, pickup: { position: 0.5 },
  damping: 0.001, feedback: 0.999, quality: 'normal', duration: 5,
  pattern: { tempo: 110, notes: [] }
};

/** Karplus–Strong plucked string. Audio and inspector voices are kept separate. */
export class StringModel extends BaseModel {
  constructor(options = {}) {
    super(DEFAULTS, { ...options, state: synchronizeDamping(options.state || {}) });
    this.sources = new Set();
    this.patternSources = new Set();
    this.patternPlaybackId = 0;
    this.patternIsPlaying = false;
    this.releasingVoices = new Set();
    this.inspector = null;
    this.status = 'idle';
    this.analysis = {};
  }

  validateState(state) {
    const s = mergeState(DEFAULTS, state);
    const frequency = Number(s.physical?.frequency);
    const feedback = Number(s.feedback);
    const strength = Number(s.excitation?.strength);
    const tempo = Number(s.pattern?.tempo);
    s.model = 'string';
    s.physical.frequency = Number.isFinite(frequency) ? Math.min(880, Math.max(55, frequency)) : 110;
    s.feedback = Number.isFinite(feedback) ? Math.min(.99996, Math.max(.9, feedback)) : .999;
    s.damping = 1 - s.feedback;
    s.excitation.strength = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : .7;
    s.excitation.position = Math.max(0, Math.min(1, Number(s.excitation.position) || 0));
    s.pickup.position = Math.max(0, Math.min(1, Number(s.pickup.position) || 0));
    s.duration = Math.max(.1, Math.min(20, Number(s.duration) || 5));
    s.pattern.tempo = Number.isFinite(tempo) ? Math.max(60, Math.min(180, tempo)) : 110;
    s.pattern.notes = Array.isArray(s.pattern.notes) ? s.pattern.notes.map(n => n && ({ name: String(n.name), frequency: Number(n.frequency) })).filter(n => !n || (Number.isFinite(n.frequency) && n.frequency >= 55 && n.frequency <= 880)) : [];
    return s;
  }

  onConfigure(previous) {
    if (previous.physical.frequency !== this.state.physical.frequency && this.inspector) this.resetInspector();
    this.updateAnalysis();
  }

  configure(patch) {
    this.assertAlive();
    return super.configure(synchronizeDamping(patch, this.state));
  }

  updateAnalysis() {
    const sampleRate = this.audio?.context?.sampleRate || 48000;
    const delayLength = Math.max(2, Math.round(sampleRate / this.state.physical.frequency - .5));
    this.analysis = { sampleRate, delayLength, estimatedFrequency: sampleRate / (delayLength + .5) };
  }

  async init() {
    this.assertAlive();
    this.updateAnalysis();
    this.status = 'ready';
    this.error = null;
    this.resetInspector();
    this.emit('update');
    return this;
  }

  /** Return generated PCM, or mutate the supplied delay line in place per KS. */
  static createDelayLine(frequency, sampleRate, random = Math.random) {
    const n = Math.max(2, Math.round(sampleRate / frequency - .5));
    return Float32Array.from({ length: n }, () => random() * 2 - 1);
  }

  static stepDelayLine(values, cursor, feedback) {
    const current = values[cursor];
    const next = values[(cursor + 1) % values.length];
    const after = feedback * (current + next) / 2;
    values[cursor] = after;
    return { cursor: (cursor + 1) % values.length, change: { index: cursor, before: current, next, after } };
  }

  resetInspector() {
    this.assertAlive();
    const sampleRate = this.audio?.context?.sampleRate || 48000;
    const values = StringModel.createDelayLine(this.state.physical.frequency, sampleRate);
    this.inspector = { values, cursor: 0, steps: 0, lastChange: null, lastChangedPosition: -1, sampleRate };
    this.updateAnalysis();
    this.emit('update', this.getSnapshot());
    return this.getSnapshot().inspector;
  }

  step(count = 1) {
    this.assertAlive();
    if (!this.inspector) this.resetInspector();
    const total = Math.min(100000, Math.max(0, Math.floor(Number(count) || 0)));
    for (let i = 0; i < total; i += 1) {
      const result = StringModel.stepDelayLine(this.inspector.values, this.inspector.cursor, this.state.feedback);
      this.inspector.cursor = result.cursor;
      this.inspector.lastChange = result.change;
      this.inspector.lastChangedPosition = result.change.index;
      this.inspector.steps += 1;
    }
    this.emit('update', this.getSnapshot());
    return this.getSnapshot().inspector;
  }

  strike({ position = this.state.excitation.position, strength = this.state.excitation.strength } = {}) {
    this.assertAlive();
    this.configure({ excitation: { position, strength } });
    return this.playNote(this.state.physical.frequency, { strength: this.state.excitation.strength });
  }

  async playNote(frequency, { strength = this.state.excitation.strength, delayLine = null, duration = this.state.duration } = {}) {
    this.assertAlive();
    frequency = finiteRange(frequency, 55, 880, 'frequency');
    strength = finiteRange(strength, 0, 1, 'strength');
    duration = finiteRange(duration, .1, 20, 'duration');
    if (strength === 0) return false;
    const version = this.operationVersion;
    try {
      await this.ensureAudio();
      if (this.destroyed || version !== this.operationVersion) return false;
      const ctx = this.audio.context;
      if (!delayLine) {
        this.resetInspector();
        delayLine = this.inspector.values;
      }
      const buffer = createKSBuffer(ctx, frequency, duration, this.state.feedback, delayLine);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const connection = this.audio.connect(source, { gain: Math.max(0, Math.min(1, strength)) });
      this.stopPatternSources();
      const ordinaryVoices = [...this.sources].filter(voice => !voice.pattern && !voice.releasing);
      if (ordinaryVoices.length >= 3) {
        const oldest = ordinaryVoices[0];
        oldest.releasing = true;
        this.releasingVoices.add(oldest);
        const now = ctx.currentTime;
        const gain = oldest.connection.gainNode?.gain;
        if (gain) {
          gain.cancelScheduledValues(now);
          gain.setValueAtTime(Math.max(.001, gain.value), now);
          gain.exponentialRampToValueAtTime(.001, now + .07);
          try { oldest.source.stop(now + .075); } catch {}
        } else {
          try { oldest.source.stop(); } catch {}
        }
      }
      const voice = { source, connection, pattern: false };
      this.sources.add(voice);
      source.onended = () => {
        this.sources.delete(voice); this.releasingVoices.delete(voice); connection.disconnect();
        if (!this.sources.size && !this.destroyed) { this.status = 'idle'; this.emit('update'); }
      };
      source.start();
      this.status = 'playing';
      this.error = null;
      this.updateAnalysis();
      this.emit('update', this.getSnapshot());
      return source;
    } catch (error) {
      if (this.destroyed || version !== this.operationVersion) return false;
      if (!this.destroyed && version === this.operationVersion) { this.status = 'error'; this.error = error.message; this.emit('error', { message: error.message }); this.emit('update'); }
      throw error;
    }
  }

  generatePattern() {
    this.assertAlive();
    let previous = '';
    const notes = Array.from({ length: 8 }, (_, i) => {
      if (i > 0 && Math.random() < .18) { previous = ''; return null; }
      const choices = SCALE.filter(note => note.name !== previous);
      const note = choices[Math.floor(Math.random() * choices.length)];
      previous = note.name;
      return { ...note };
    });
    if (notes.every(n => !n)) notes[0] = { ...SCALE[0] };
    this.configure({ pattern: { notes } });
    return cloneState(this.state.pattern.notes);
  }

  async playPattern() {
    this.assertAlive();
    if (!this.state.pattern.notes.length) this.generatePattern();
    const version = this.operationVersion;
    try { await this.ensureAudio(); }
    catch (error) {
      if (this.destroyed || version !== this.operationVersion) return false;
      if (version === this.operationVersion && !this.destroyed) { this.status = 'error'; this.error = error.message; this.emit('error', { message: error.message }); this.emit('update'); }
      throw error;
    }
    if (this.destroyed || version !== this.operationVersion) return false;
    this.stopPatternSources();
    for (const voice of [...this.sources]) if (!voice.pattern) this.disposeVoice(voice);
    const ctx = this.audio.context;
    const playbackId = ++this.patternPlaybackId;
    this.patternIsPlaying = true;
    const stepDuration = 60 / this.state.pattern.tempo / 2;
    const startTime = ctx.currentTime + .04;
    this.state.pattern.notes.forEach((note, index) => {
      if (!note) return;
      const duration = Math.max(.3, stepDuration * 1.5);
      const buffer = createKSBuffer(ctx, note.frequency, duration, this.state.feedback);
      const source = ctx.createBufferSource(); source.buffer = buffer;
      const connection = this.audio.connect(source, { gain: .65 });
      const voice = { source, connection, pattern: true };
      this.patternSources.add(voice); this.sources.add(voice);
      source.onended = () => {
        this.patternSources.delete(voice); this.sources.delete(voice); connection.disconnect();
        if (playbackId === this.patternPlaybackId && this.patternSources.size === 0) {
          this.patternIsPlaying = false; this.status = this.sources.size ? 'playing' : 'idle'; this.emit('update');
        }
      };
      source.start(startTime + index * stepDuration);
    });
    this.patternIsPlaying = this.patternSources.size > 0;
    this.status = this.sources.size ? 'playing' : 'idle'; this.error = null; this.emit('update', this.getSnapshot());
  }

  stopPatternSources() {
    this.patternPlaybackId += 1; this.patternIsPlaying = false;
    for (const voice of [...this.patternSources]) this.disposeVoice(voice);
    this.patternSources.clear();
  }

  disposeVoice(voice) {
    voice.source.onended = null;
    this.sources.delete(voice); this.patternSources.delete(voice); this.releasingVoices.delete(voice);
    try { voice.source.stop(); } catch {}
    voice.connection.disconnect();
  }

  stop() {
    this.stopPatternSources();
    for (const voice of [...this.sources]) this.disposeVoice(voice);
    this.sources.clear(); this.releasingVoices.clear();
    super.stop();
  }

  getSnapshot() {
    const snapshot = super.getSnapshot();
    snapshot.analysis = { ...this.analysis };
    snapshot.inspector = this.inspector && {
      ...this.inspector,
      values: Float32Array.from(this.inspector.values),
      delayMs: this.inspector.values.length / this.inspector.sampleRate * 1000,
      estimatedFrequency: this.inspector.sampleRate / (this.inspector.values.length + .5)
    };
    snapshot.patternIsPlaying = this.patternIsPlaying;
    return snapshot;
  }

  async destroy() {
    if (this.destroyed) return;
    await super.destroy();
  }
}

export default StringModel;

function createKSBuffer(context, frequency, duration, feedback, initialDelayLine = null) {
  const delayLength = Math.max(2, Math.round(context.sampleRate / frequency - .5));
  const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const output = buffer.getChannelData(0);
  const delayLine = initialDelayLine?.length === delayLength
    ? Float32Array.from(initialDelayLine)
    : StringModel.createDelayLine(frequency, context.sampleRate);
  let cursor = 0;
  const fadeSamples = Math.min(Math.floor(context.sampleRate * .03), frameCount);
  for (let frame = 0; frame < frameCount; frame++) {
    const current = delayLine[cursor];
    const next = delayLine[(cursor + 1) % delayLength];
    const tail = frame >= frameCount - fadeSamples ? (frameCount - frame) / fadeSamples : 1;
    output[frame] = current * .75 * tail;
    delayLine[cursor] = feedback * (current + next) / 2;
    cursor = (cursor + 1) % delayLength;
  }
  return buffer;
}

function synchronizeDamping(patch) {
  const hasFeedback = Object.hasOwn(patch, 'feedback');
  const hasDamping = Object.hasOwn(patch, 'damping');
  if (!hasFeedback && !hasDamping) return patch;
  const feedback = hasFeedback
    ? Math.max(.9, Math.min(.99996, Number(patch.feedback) || .999))
    : Math.max(.9, Math.min(.99996, 1 - (Number(patch.damping) || .00004)));
  return { ...patch, feedback, damping: 1 - feedback };
}

function finiteRange(value, min, max, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new RangeError(`${label} must be between ${min} and ${max}.`);
  }
  return number;
}
