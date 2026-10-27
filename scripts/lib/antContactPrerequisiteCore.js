import { SurfaceAudioBridge } from '../../src/lib/audio/SurfaceAudioBridge.js';
import { pheromoneValueToAlpha } from '../../src/lib/renderers/AntRenderer.js';

const hex = bytes => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
const digest = async value => hex(await crypto.subtle.digest('SHA-256', typeof value === 'string'
  ? new TextEncoder().encode(value) : value));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (actual, expected, message) => check(actual === expected, `${message}: ${actual} !== ${expected}`);
const same = (actual, expected, message) => check(JSON.stringify(actual) === JSON.stringify(expected), message);

export function physicalCell({ x, y }, size = 96) {
  return Math.round(y * (size - 1)) * size + Math.round(x * (size - 1));
}

export function displayCell({ x, y }, pixels = 640, size = 96) {
  const px = Math.min(pixels - 1, Math.floor(x * pixels));
  const py = Math.min(pixels - 1, Math.floor(y * pixels));
  return Math.floor((py + 0.5) * size / pixels) * size + Math.floor((px + 0.5) * size / pixels);
}

export function ownerAt(material, cell) {
  const index = material.stratigraphy.topLayerByCell[cell];
  return index >= 0 ? material.plates[index]?.id ?? null : null;
}

export function summarizeHistory(strikes, material, field) {
  const raw = [], alphas = [], physicalCells = new Set(), pixelBins = new Set();
  let buried = 0, displayOutside = 0, displayOtherOwner = 0, zeroAlpha = 0, exposedZeroAlpha = 0;
  for (const strike of strikes) {
    const { position, plateId } = strike.payload;
    const currentOwner = ownerAt(material, physicalCell(position));
    const screenOwner = ownerAt(material, displayCell(position));
    const value = field.sample(position.x, position.y), alpha = pheromoneValueToAlpha(value);
    raw.push(value); alphas.push(alpha);
    buried += Number(currentOwner !== plateId);
    displayOutside += Number(screenOwner === null);
    displayOtherOwner += Number(screenOwner !== null && screenOwner !== plateId);
    zeroAlpha += Number(alpha === 0);
    exposedZeroAlpha += Number(alpha === 0 && currentOwner === plateId);
    physicalCells.add(physicalCell(position));
    pixelBins.add(Math.min(639, Math.floor(position.y * 640)) * 640 + Math.min(639, Math.floor(position.x * 640)));
  }
  return { strikes: strikes.length, uniquePhysicalCells: physicalCells.size,
    uniqueNativePointBins: pixelBins.size, noLongerExposedOnOriginalPlate: buried,
    displayOutsideSupport: displayOutside, displayDifferentOwner: displayOtherOwner,
    zeroMappedScalarSamples: zeroAlpha, stillExposedZeroMappedScalarSamples: exposedZeroAlpha,
    rawPheromone: distribution(raw), scalarAlphaProxy: distribution(alphas) };
}

function distribution(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], p05: sorted[Math.floor((sorted.length - 1) * 0.05)],
    median: sorted[Math.floor((sorted.length - 1) * 0.5)],
    p95: sorted[Math.floor((sorted.length - 1) * 0.95)], max: sorted.at(-1),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length };
}

/** Recording transport only: the production bridge still selects and calculates every route. */
export async function createRouteObserver({ context = () => ({}), sink = () => {} } = {}) {
  let posts = [], resolutions = [], onTopologies = 0, offPosts = 0, calls = 0;
  const on = new SurfaceAudioBridge({ audioEngine: {}, workletFactory: async () => ({
    node: { port: { postMessage(message) {
      if (message.type === 'strike') posts.push(structuredClone(message.payload));
      if (message.type === 'topology') onTopologies += 1;
    } } }, disconnect() {}
  }) });
  const off = new SurfaceAudioBridge({ audioEngine: {}, workletFactory: async () => {
    offPosts += 1;
    throw new Error('Off bridge must never create a worklet');
  } });
  const exposedAt = on.exposedPlateAt.bind(on);
  on.exposedPlateAt = position => {
    const plate = exposedAt(position);
    resolutions.push({ position: { ...position }, plateId: plate?.id ?? null,
      physicalCell: physicalCell(position), displayCell: displayCell(position) });
    return plate;
  };
  equal(await on.setEnabled(true), true, 'On bridge enable');
  const wrapper = {
    syncMaterial(material) {
      equal(on.syncMaterial(material), true, 'On topology sync');
      equal(off.syncMaterial(material), true, 'Off topology sync');
      same(on.routingTopLayerByCell96, off.routingTopLayerByCell96, 'On/Off routing topology');
    },
    handleFootContact(event, { responses }) {
      calls += 1;
      const before = JSON.stringify({ event, responses });
      posts = []; resolutions = [];
      const onDelivered = on.handleFootContact(event, { responses });
      const offDelivered = off.handleFootContact(event, { responses });
      equal(offDelivered, false, 'Off post result');
      equal(JSON.stringify({ event, responses }), before, 'observer mutated contact inputs');
      const eligible = resolutions.filter(row => row.plateId !== null);
      equal(posts.length, eligible.length, 'posted exposed feet');
      equal(onDelivered, posts.length > 0, 'On delivery result');
      posts.forEach((payload, index) => {
        equal(payload.plateId, eligible[index].plateId, 'post owner/order');
        same(payload.position, eligible[index].position, 'post position/order');
        check(Number.isFinite(payload.strength) && payload.strength > 0, 'invalid posted strength');
      });
      equal(on.diagnostics.supportedFeet, off.diagnostics.supportedFeet, 'On/Off supported feet');
      equal(on.diagnostics.unsupportedFeet, off.diagnostics.unsupportedFeet, 'On/Off unsupported feet');
      sink({ ...context(), event: structuredClone(event), responses: structuredClone(responses),
        topologyRevision: on.materialRevision, resolutions, posts });
      return onDelivered;
    },
    async destroy() { await on.destroy(); await off.destroy(); }
  };
  return { wrapper, on, off, diagnostics: () => ({ calls, onTopologies, offWorkletCreations: offPosts,
    on: { ...on.diagnostics }, off: { ...off.diagnostics } }) };
}

async function objectHash(value) {
  const arrays = [];
  const text = JSON.stringify(value, (key, item) => {
    if (ArrayBuffer.isView(item)) {
      arrays.push(new Uint8Array(item.buffer, item.byteOffset, item.byteLength));
      return { typed: item.constructor.name, arrayIndex: arrays.length - 1, byteLength: item.byteLength };
    }
    return item instanceof Map ? { map: [...item] } : item instanceof Set ? { set: [...item] } : item;
  });
  const chunks = [new TextEncoder().encode(text), ...arrays];
  const bytes = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return digest(bytes);
}
async function systemHash(controller) {
  const { random, listeners, audioBridge, ...systems } = controller;
  return objectHash(systems);
}
async function legacyFingerprint(snapshot, rng) {
  const material = snapshot.stratigraphy, topology = material.stratigraphy;
  const plates = [...material.plates, ...snapshot.surfacePlates.plates];
  const metadata = JSON.stringify({ state: snapshot.state, status: snapshot.status,
    agents: snapshot.agents, audio: snapshot.audio, analysis: snapshot.analysis, rng,
    material: { revision: material.revision, layerOrder: topology.layerOrder,
      plates: material.plates.map(plate => ({ id: plate.id, bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs,
        grid: plate.grid, material: plate.material, centerline: plate.centerline, edges: plate.edges })) },
    surfacePlates: snapshot.surfacePlates.plates.map(plate => ({ id: plate.id,
      bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs, grid: plate.grid })) });
  const chunks = [new TextEncoder().encode(metadata)];
  for (const array of [snapshot.pheromone.values, snapshot.surface.values, topology.topLayerByCell,
    topology.layerCountByCell, topology.totalDepthByCellMeters, ...plates.map(p => p.mask).filter(ArrayBuffer.isView)]) {
    chunks.push(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
  }
  const bytes = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return digest(bytes);
}

function randomStream() {
  let state = 20261005 >>> 0, calls = 0;
  const random = () => { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  random.record = () => ({ state, calls });
  return random;
}

export async function runMeasurement({ AntController, priorRows, wallLimitMs = 180000 }) {
  check(typeof AntController === 'function', 'AntController required');
  const rows = [], strikes = [], anchors = [], milestones = [], births = [];
  let tick = 0, firstTick = null;
  const prior = new Map(priorRows.map(row => [Number(row.tick), row]));
  const observer = await createRouteObserver({ context: () => ({ tick }), sink(row) {
    row.resolutions.forEach(resolution => {
      const snapshot = world.materialStratigraphy.getSnapshot();
      equal(resolution.plateId, ownerAt(snapshot, resolution.physicalCell), 'routed physical owner');
      resolution.displayOwnerAtContact = ownerAt(snapshot, resolution.displayCell);
    });
    rows.push(row);
    for (const [order, payload] of row.posts.entries()) strikes.push({ tick, eventTimeMs: row.event.simulationTimeMs,
      order, payload, topologyRevision: row.topologyRevision });
  } });
  const random = randomStream(), twinRandom = randomStream();
  const world = new AntController({ random, audioBridge: observer.wrapper });
  const twin = new AntController({ random: twinRandom });
  const eventChunks = ['', ''], counts = [0, 0];
  for (const [index, controller] of [world, twin].entries()) controller.subscribe(({ type, payload }) => {
    if (!['foot-contact', 'plate-birth', 'sphere-birth', 'error'].includes(type)) return;
    check(type !== 'error', JSON.stringify(payload));
    eventChunks[index] += JSON.stringify({ type, payload }); counts[index] += 1;
    if (!index && type === 'plate-birth') { births.push({ tick, id: payload.id, simulationTimeMs: payload.bornAtSimulationTimeMs }); firstTick ??= tick; }
  });
  await world.init(); await twin.init(); world.syncEnvironmentAudio();
  const started = performance.now();
  const checkpoint = async () => {
    const snapshot = world.getSnapshot(), twinSnapshot = twin.getSnapshot(), rng = random.record();
    const hash = await objectHash(snapshot);
    equal(hash, await objectHash(twinSnapshot), `public snapshot parity at tick ${tick}`);
    const old = prior.get(tick);
    if (old) {
      equal(String(rng.state), old.rngState, 'prior H1 RNG state'); equal(String(rng.calls), old.rngCalls, 'prior H1 RNG calls');
      equal(await legacyFingerprint(snapshot, rng), old.sourceStateSha256, `prior H1 state at tick ${tick}`);
    }
    anchors.push({ tick, simulationTimeMs: world.simulationTimeMs, ...rng, fullPublicSnapshotSha256: hash, priorMatched: Boolean(old) });
  };
  const milestone = async name => {
    const hash = await systemHash(world);
    equal(hash, await systemHash(twin), `controller systems parity at ${name}`);
    milestones.push({ name, tick, simulationTimeMs: world.simulationTimeMs,
      plates: world.materialStratigraphy.plates.length, systemStateSha256: hash,
      history: summarizeHistory(strikes, world.materialStratigraphy.getSnapshot(), world.field) });
  };
  try {
    await checkpoint();
    while (tick < 6301) {
      check(performance.now() - started < wallLimitMs, 'registered wall-time boundary exceeded');
      const beforeEvents = [eventChunks[0].length, eventChunks[1].length];
      tick += 1; world.tick(1 / 60); twin.tick(1 / 60);
      same(random.record(), twinRandom.record(), `RNG parity at tick ${tick}`);
      equal(counts[0], counts[1], `event count parity at tick ${tick}`);
      equal(eventChunks[0].slice(beforeEvents[0]), eventChunks[1].slice(beforeEvents[1]), `events at tick ${tick}`);
      if (tick % 6 === 0) await checkpoint();
      if (tick === firstTick) await milestone('first-plate');
      if (firstTick !== null && tick === firstTick + 900) await milestone('first-plate-plus-15s');
      if (firstTick !== null && tick === firstTick + 1800) { await checkpoint(); await milestone('first-plate-plus-30s'); break; }
    }
    equal(firstTick, 4501, 'validated H1 first Plate'); equal(tick, firstTick + 1800, 'complete registered early window');
    const anchorTicks = new Set(anchors.map(row => row.tick));
    for (const priorTick of prior.keys()) check(anchorTicks.has(priorTick), `prior H1 anchor missing at tick ${priorTick}`);
    equal(strikes.length, observer.on.diagnostics.directExposedStrikes, 'strike routing count');
    return { rows, strikes, anchors, summary: { tickCount: tick, firstPlateTick: firstTick,
      endpointSimulationTimeMs: world.simulationTimeMs, wallSeconds: (performance.now() - started) / 1000,
      parityAnchors: anchors.length, priorMatchedAnchors: anchors.filter(row => row.priorMatched).length,
      eventDigest: await digest(eventChunks[0]), rng: random.record(), births, milestones,
      rawGroupedEvents: rows.length, rawFeet: rows.reduce((n, row) => n + row.event.contacts.length, 0),
      responseFeet: rows.reduce((n, row) => n + row.responses.length, 0),
      eligibleSupportDisplayOutsideAtContact: rows.flatMap(row => row.resolutions).filter(row => row.plateId && row.displayOwnerAtContact === null).length,
      eligibleSupportDisplayOtherOwnerAtContact: rows.flatMap(row => row.resolutions).filter(row => row.plateId && row.displayOwnerAtContact && row.displayOwnerAtContact !== row.plateId).length,
      transport: observer.diagnostics() } };
  } finally { await world.destroy(); await twin.destroy(); }
}
