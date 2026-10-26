/** Install read-only ANT foot/contact and audio-post observation on a live model. */
export function installNativeAvObserver(model, {
  performanceNow = () => globalThis.performance.now(),
  audioContext = null
} = {}) {
  if (!model?.surfaceField || !model?.materialStratigraphy) {
    throw new TypeError('A live ANT model is required.');
  }
  const data = { events: [], posts: [], postCounts: {}, observerCostMs: 0 };
  const surfaceField = model.surfaceField;
  const audioBridge = model.audioBridge;
  const surfaceBridge = audioBridge?.surface;
  const originals = [];
  let activeEvent = null;
  let nextEventId = 1;
  let postOrder = 0;
  const timed = (operation) => {
    const start = performanceNow();
    try { return operation(); }
    finally { data.observerCostMs += performanceNow() - start; }
  };
  const wrap = (object, key, replacement) => {
    if (typeof object?.[key] !== 'function') return;
    const original = object[key];
    object[key] = replacement(original);
    originals.push(() => { if (object[key] !== original && object[key]?.__avOriginal === original) object[key] = original; });
    object[key].__avOriginal = original;
  };

  wrap(surfaceField, 'applyFootContact', (original) => function (event, ...args) {
    const result = original.call(this, event, ...args);
    timed(() => {
      if (!Array.isArray(result)) return;
      const eventId = nextEventId++;
      const eventTime = Number.isFinite(event?.simulationTimeMs) ? event.simulationTimeMs : null;
      const performanceTimeMs = performanceNow();
      const audioTime = Number.isFinite(audioContext?.currentTime) ? audioContext.currentTime : null;
      for (const response of result) {
        const x = response.position?.x, y = response.position?.y;
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const width = model.materialStratigraphy.width;
        const height = model.materialStratigraphy.height;
        const cell = Math.round(y * (height - 1)) * width + Math.round(x * (width - 1));
        const layers = model.materialStratigraphy.layerCountByCell?.[cell] || 0;
        const plate = surfaceBridge?.exposedPlateAt?.(response.position) || null;
        data.events.push({
          eventId, source: 'FOOT_CONTACT', simulationTimeMs: eventTime,
          performanceTimeMs,
          audioContextTimeSeconds: audioTime,
          antId: event?.antId ?? null, contactGroup: event?.contactGroup ?? null,
          legId: response.legId, x, y,
          preContactCompaction: response.compaction,
          rawPheromonePostGasterPreNextTick: model.field?.sample?.(x, y) ?? null,
          localL: layers, exposedPlateId: plate?.id ?? null
        });
      }
      activeEvent = { eventId, simulationTimeMs: eventTime, antId: event?.antId ?? null };
    });
    return result;
  });

  wrap(audioBridge, 'handleFootContact', (original) => function (event, ...args) {
    const prior = activeEvent;
    try { return original.call(this, event, ...args); }
    finally { activeEvent = prior; }
  });

  wrap(surfaceBridge, 'post', (original) => function (type, payload, ...args) {
    timed(() => {
      data.postCounts[type] = (data.postCounts[type] || 0) + 1;
      if (type === 'strike') {
        data.posts.push({
          type, postOrder: ++postOrder,
          eventId: activeEvent?.eventId ?? null,
          simulationTimeMs: activeEvent?.simulationTimeMs ?? null,
          postSimulationTimeMs: model.simulationTimeMs,
          performanceTimeMs: performanceNow(),
          audioContextTimeSeconds: Number.isFinite(audioContext?.currentTime) ? audioContext.currentTime : null,
          payload: payload && {
            plateId: payload.plateId, layerId: payload.layerId,
            position: payload.position && { x: payload.position.x, y: payload.position.y },
            strength: payload.strength, footprintRadius: payload.footprintRadius,
            hardness: payload.hardness
          }
        });
      }
    });
    return original.call(this, type, payload, ...args);
  });

  return {
    data,
    restore() { for (let index = originals.length - 1; index >= 0; index -= 1) originals[index](); },
    fingerprint() {
      const snapshot = model.getSnapshot();
      if (snapshot.audio) snapshot.audio.diagnostics = null;
      return { simulationTimeMs: model.simulationTimeMs, snapshot };
    }
  };
}

export default installNativeAvObserver;
