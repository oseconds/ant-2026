import { compileSurfaceTopology } from './compileSurfaceTopology.js';

const WORKLET_NAME = 'surface-plate-processor';
const WORKLET_URL = '/worklets/surface-plate.worklet.js';
const OUTPUT_GAIN = 0.7;
const MAX_GROUP_STRENGTH = 0.05;
const MAX_LAYERS = 256;
const GRID_SIZE = 96;

/** ANT trail surfaces share one stereo worklet and the application's AudioEngine. */
export class SurfaceAudioBridge {
  constructor({ audioEngine, workletBaseUrl = '/worklets/', workletFactory } = {}) {
    if (!audioEngine) throw new TypeError('SurfaceAudioBridge requires the shared AudioEngine.');
    this.audioEngine = audioEngine;
    this.workletBaseUrl = `${String(workletBaseUrl).replace(/\/?$/, '/')}`;
    this.workletFactory = workletFactory;
    this.worklet = null;
    this.plates = new Map();
    this.topology = null;
    this.routingTopLayerByCell96 = null;
    this.topologyGeneration = 0;
    this.materialRevision = null;
    this._enabled = false;
    this._loading = false;
    this._error = null;
    this._volume = 1;
    this.destroyed = false;
    this.generation = 0;
    this.enablePromise = null;
    this.cleanupPromise = null;
    this.diagnostics = {
      births: 0, routedFootEvents: 0, routedFeet: 0, strikeRoutes: 0,
      supportedFeet: 0, unsupportedFeet: 0, directExposedStrikes: 0,
      injectedImpulseEnergy: 0, events: 0, unroutedContacts: 0,
      capacityRejectedLayers: 0, ignoredWhileDisabled: 0, dropped: 0, processorErrors: 0
    };
  }

  get enabled() { return this._enabled; }
  get loading() { return this._loading; }
  get error() { return this._error; }
  get volume() { return this._volume; }

  setVolume(value) {
    if (!Number.isFinite(Number(value)) || this.destroyed) return this._volume;
    this._volume = Math.max(0, Math.min(1, Number(value)));
    this.applyVolume();
    return this._volume;
  }

  applyVolume() {
    const gain = this.worklet?.gainNode?.gain;
    if (!gain) return;
    const target = OUTPUT_GAIN * this._volume;
    const now = this.audioEngine.context?.currentTime ?? 0;
    gain.cancelScheduledValues?.(now);
    gain.setValueAtTime?.(gain.value, now);
    if (gain.linearRampToValueAtTime) gain.linearRampToValueAtTime(target, now + 0.02);
    else gain.value = target;
  }

  /** Store only immutable, valid descriptors. At capacity this never evicts an older surface. */
  syncPlates(plates) {
    const added = this.storePlates(plates);
    if (added && this.compileTopology({ plates: [...this.plates.values()] })) {
      if (this.worklet && !this._loading) this.post('topology', { ...this.topology, maxLayers: MAX_LAYERS });
    }
    return added;
  }

  storePlates(plates) {
    if (!Array.isArray(plates)) return 0;
    let added = 0;
    for (const source of plates) {
      if (!validPlate(source) || this.plates.has(source.id)) continue;
      if (this.plates.size >= MAX_LAYERS) {
        this.diagnostics.capacityRejectedLayers += 1;
        continue;
      }
      const plate = freezePlate(source);
      this.plates.set(plate.id, plate);
      added += 1;
      this.diagnostics.births += 1;
    }
    return added;
  }

  /** Compile material exposure and packed mechanics from the stratigraphy snapshot. */
  syncMaterial(snapshot) {
    if (!validMaterialSnapshot(snapshot)) return false;
    const revision = `${snapshot.stratigraphy.revision ?? snapshot.revision}:${snapshot.noduleRevision ?? snapshot.stratigraphy.revision}`;
    const added = this.storePlates(snapshot.plates);
    if (revision === this.materialRevision && this.topology && !added) return true;
    const plates = [...this.plates.values()];
    if (!this.compileTopology({ plates, nodules: snapshot.nodules || [], stratigraphy: snapshot.stratigraphy })) return false;
    this.materialRevision = revision;
    if (this.worklet && !this._loading) this.post('topology', { ...this.topology, maxLayers: MAX_LAYERS });
    return true;
  }

  compileTopology({ plates = [...this.plates.values()], nodules = [], stratigraphy = null } = {}) {
    let compiled;
    try {
      compiled = compileSurfaceTopology({ plates, nodules, stratigraphy,
        generation: ++this.topologyGeneration, maxLayers: MAX_LAYERS });
    } catch {
      this.diagnostics.dropped += 1;
      return false;
    }
    if (!validCompiledTopology(compiled, plates)) {
      this.diagnostics.dropped += 1;
      return false;
    }
    this.topology = compiled;
    this.routingTopLayerByCell96 = compiled.routingTopLayerByCell96;
    return true;
  }

  /** Invoke directly from the explicit Audio On gesture. Historical contacts are never replayed. */
  setEnabled(enabled) {
    if (!enabled) {
      this.stop();
      return this.cleanupPromise || Promise.resolve(false);
    }
    if (this.destroyed) return Promise.resolve(false);
    if (this._enabled && this.enablePromise) return this.enablePromise;
    if (this._enabled && this.worklet && !this._loading) return Promise.resolve(true);

    if (!this.topology && !this.compileTopology({ plates: [...this.plates.values()] })) return Promise.resolve(false);

    const generation = ++this.generation;
    this._enabled = true;
    this._loading = true;
    this._error = null;
    const onMessage = (message) => this.handleWorkletMessage(message, generation);
    const onError = (error) => this.handleWorkletError(error, generation);
    const create = this.workletFactory
      ? this.workletFactory({ audioEngine: this.audioEngine, workletBaseUrl: this.workletBaseUrl,
        onMessage, onError, gain: OUTPUT_GAIN * this._volume })
      : this.audioEngine.createWorklet(WORKLET_NAME, `${this.workletBaseUrl}${WORKLET_URL.split('/').pop()}`,
        { maxLayers: MAX_LAYERS }, onMessage, onError, { gain: OUTPUT_GAIN * this._volume, channels: 2 });
    const pending = Promise.resolve(create).then((handle) => {
      if (this.destroyed || !this._enabled || generation !== this.generation) {
        handle?.disconnect?.();
        return false;
      }
      this.worklet = handle;
      this._loading = false;
      this.post('topology', { ...this.topology, maxLayers: MAX_LAYERS });
      return true;
    }).catch((error) => {
      if (!this.destroyed && generation === this.generation) {
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

  /** Every accepted response is an individual foot strike; overlap shares energy across routes. */
  handleFootContact(event, { responses = [] } = {}) {
    if (event?.type !== 'FOOT_CONTACT' || !Array.isArray(event.contacts) || !Array.isArray(responses)) {
      this.diagnostics.dropped += 1;
      return false;
    }
    const strength = Number(event.strength);
    if (!Number.isFinite(strength) || strength <= 0) {
      this.diagnostics.dropped += 1;
      return false;
    }
    this.diagnostics.events += 1;
    const groupStrength = Math.min(MAX_GROUP_STRENGTH, strength);
    const responseByLeg = new Map(responses.map((response) => [response?.legId, response]));
    const feet = [];
    for (const contact of event.contacts) {
      const response = responseByLeg.get(contact?.legId);
      if (!response || !validPoint(response.position)) continue;
      const transfer = clamp(Number(response.strengthTransfer), 0.95, 1.05);
      const radius = clamp(Number(response.footprintRadius), 0.009, 0.014);
      if (!Number.isFinite(transfer) || !Number.isFinite(radius)) continue;
      const plate = this.exposedPlateAt(response.position);
      if (plate) this.diagnostics.supportedFeet += 1;
      else this.diagnostics.unsupportedFeet += 1;
      feet.push({ response, transfer, radius, matching: plate ? [plate] : [] });
    }
    const routes = feet.flatMap((foot) => foot.matching.map((plate) => ({ ...foot, plate })));
    if (!routes.length) {
      if (feet.length) this.diagnostics.unroutedContacts += 1;
      return false;
    }
    if (!this._enabled || this._loading || !this.worklet || this.destroyed) {
      this.diagnostics.ignoredWhileDisabled += 1;
      return false;
    }
    // L2-normalize only across exposed routes. Unsupported feet retain their share.
    const norm = Math.sqrt(routes.reduce((sum, route) => sum
      + (route.transfer / Math.sqrt(route.matching.length)) ** 2, 0));
    const maxNorm = Math.sqrt(feet.length);
    const scale = Math.min(1, maxNorm / norm);
    const perFootBase = groupStrength / Math.sqrt(feet.length);
    for (const route of routes) {
      this.post('strike', {
        plateId: route.plate.id,
        layerId: route.plate.id,
        position: route.response.position,
        strength: perFootBase * route.transfer / Math.sqrt(route.matching.length) * scale,
        footprintRadius: route.radius,
        hardness: clamp(Number(route.response.hardness), 0, 1)
      });
      this.diagnostics.directExposedStrikes += 1;
      const strikeStrength = perFootBase * route.transfer / Math.sqrt(route.matching.length) * scale;
      this.diagnostics.injectedImpulseEnergy += strikeStrength * strikeStrength;
    }
    this.diagnostics.routedFootEvents += 1;
    this.diagnostics.routedFeet += new Set(routes.map((route) => route.response.legId)).size;
    this.diagnostics.strikeRoutes += routes.length;
    return true;
  }

  exposedPlateAt(position) {
    const x = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(position.x * (GRID_SIZE - 1))));
    const y = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(position.y * (GRID_SIZE - 1))));
    const cell = y * GRID_SIZE + x;
    if (this.routingTopLayerByCell96) {
      const layerIndex = this.routingTopLayerByCell96[cell];
      if (!Number.isInteger(layerIndex) || layerIndex < 0) return null;
      const id = this.topology?.layerIds?.[layerIndex];
      const plate = this.plates.get(id);
      return plate && containsPoint(plate, position) ? plate : null;
    }
    // Compatibility path for bridge fixtures without a stratigraphy model:
    // insertion order is bottom-to-top, so the last overlapping plate is exposed.
    const plates = [...this.plates.values()];
    for (let index = plates.length - 1; index >= 0; index -= 1) {
      if (containsPoint(plates[index], position)) return plates[index];
    }
    return null;
  }

  handleWorkletMessage(message, generation) {
    if (generation !== this.generation || !this._enabled || this.destroyed) return;
    if (message?.type === 'diagnostics' && message.payload) this.processorDiagnostics = message.payload;
  }

  handleWorkletError(error, generation) {
    if (generation !== this.generation || !this._enabled || this.destroyed) return;
    this.diagnostics.processorErrors += 1;
    this._error = error?.message || 'Surface audio processor failed.';
    this.stop();
  }

  post(type, payload = {}) { this.worklet?.node?.port?.postMessage({ type, payload }); }

  /** Disable now, clear vibration, and release this worklet without touching the shared engine. */
  stop() {
    this.generation += 1;
    this._enabled = false;
    this._loading = false;
    const worklet = this.worklet;
    this.worklet = null;
    if (!worklet) return;
    try { worklet.node?.port?.postMessage({ type: 'stop', payload: {} }); } catch { /* already closed */ }
    worklet.disconnect?.();
    const cleanup = Promise.resolve().finally(() => {
      if (this.cleanupPromise === cleanup) this.cleanupPromise = null;
    });
    this.cleanupPromise = cleanup;
  }

  async destroy() {
    if (this.destroyed) return this.cleanupPromise;
    this.destroyed = true;
    this.stop();
    await this.cleanupPromise;
    this.plates.clear();
    this.topology = null;
    this.routingTopLayerByCell96 = null;
    this.materialRevision = null;
  }
}

export default SurfaceAudioBridge;

function validPlate(plate) {
  if (!plate || typeof plate.id !== 'string' || !plate.id.length
    || plate.grid?.width !== GRID_SIZE || plate.grid?.height !== GRID_SIZE
    || !(Array.isArray(plate.mask) || ArrayBuffer.isView(plate.mask)) || plate.mask.length !== GRID_SIZE ** 2
    || plate.pickups?.length !== 2 || !plate.pickups.every(validPoint)
    || !Number.isFinite(plate.material?.stiffness) || plate.material.stiffness < 0.65 || plate.material.stiffness > 1.15
    || !Number.isFinite(plate.material?.density) || plate.material.density < 1 || plate.material.density > 1.2
    || !Number.isFinite(plate.material?.damping) || plate.material.damping < 0.25 || plate.material.damping > 0.45
    || !Array.isArray(plate.edges ?? [])) return false;
  let occupied = false;
  for (let index = 0; index < plate.mask.length; index += 1) {
    const value = plate.mask[index];
    if (value !== 0 && value !== 1) return false;
    if (value === 1) occupied = true;
  }
  if (!occupied || !plate.pickups.every((point) => plate.mask[
    Math.round(point.y * (GRID_SIZE - 1)) * GRID_SIZE + Math.round(point.x * (GRID_SIZE - 1))
  ] === 1)) return false;
  return (plate.edges ?? []).every((edge) => Array.isArray(edge) && edge.length === 2
    && edge.every((index) => Number.isInteger(index) && index >= 0 && index < GRID_SIZE ** 2));
}
function validMaterialSnapshot(snapshot) {
  return snapshot && Array.isArray(snapshot.plates) && snapshot.stratigraphy?.version === 1
    && (ArrayBuffer.isView(snapshot.stratigraphy.topLayerByCell)
      || Array.isArray(snapshot.stratigraphy.topLayerByCell))
    && snapshot.stratigraphy.topLayerByCell.length === GRID_SIZE ** 2
    && Array.isArray(snapshot.nodules ?? []);
}
function validCompiledTopology(topology, plates) {
  return topology?.version === 1 && topology.solverGrid === 32 && topology.sourceGrid === GRID_SIZE
    && Array.isArray(topology.layerIds) && topology.layerIds.length <= MAX_LAYERS
    && (ArrayBuffer.isView(topology.routingTopLayerByCell96)
      || Array.isArray(topology.routingTopLayerByCell96))
    && topology.routingTopLayerByCell96.length === GRID_SIZE ** 2
    && topology.layerIds.every((id) => typeof id === 'string' && plates.some((plate) => plate.id === id));
}
function freezePlate(source) {
  return cloneFreeze(source);
}
function containsPoint(plate, point) {
  const x = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(point.x * (GRID_SIZE - 1))));
  const y = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(point.y * (GRID_SIZE - 1))));
  return plate.mask[y * GRID_SIZE + x] === 1;
}
function validPoint(point) { return Number.isFinite(point?.x) && Number.isFinite(point?.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1; }
function clamp(value, min, max) { return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : NaN; }
function cloneFreeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneFreeze));
  if (ArrayBuffer.isView(value)) return Object.freeze(Array.from(value, cloneFreeze));
  if (!value || typeof value !== 'object') return value;
  const copy = {};
  for (const [key, child] of Object.entries(value)) copy[key] = cloneFreeze(child);
  return Object.freeze(copy);
}
