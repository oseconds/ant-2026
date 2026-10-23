import { Buffer } from 'node:buffer';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntAgent } from '../src/lib/agents/ant/AntAgent.js';
import { LocalOccupancy } from '../src/lib/agents/ant/LocalOccupancy.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { GaitController } from '../src/lib/agents/ant/GaitController.js';
import { BodyPoseController } from '../src/lib/agents/ant/BodyPoseController.js';
import { GasterDeposition } from '../src/lib/agents/ant/GasterDeposition.js';
import { ColonyActivation } from '../src/lib/agents/ant/ColonyActivation.js';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';
import { TrailPlateBirth } from '../src/lib/agents/ant/TrailPlateBirth.js';
import { MaterialStratigraphy } from '../src/lib/agents/ant/MaterialStratigraphy.js';

const FORMAT = 'ant-transfer-state/v1';
const OMITTED_ROOT_KEYS = ['listeners', 'fieldFactory', 'audioBridge'];
const TYPE_CONSTRUCTORS = [
  AntController, AntAgent, LocalOccupancy, PheromoneField, GaitController,
  BodyPoseController, GasterDeposition, ColonyActivation, SurfaceField,
  TrailPlateBirth, MaterialStratigraphy
];
const TYPED_ARRAYS = new Map(('Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array '
  + 'Int32Array Uint32Array Float32Array Float64Array BigInt64Array BigUint64Array')
  .split(' ').map(name => [name, globalThis[name]]));

export function createSeededRandom(seed, checkpoint = {}) {
  const initialSeed = (checkpoint.seed ?? seed) >>> 0;
  let state = (checkpoint.state ?? initialSeed) >>> 0;
  let calls = Number.isSafeInteger(checkpoint.calls) ? checkpoint.calls : 0;
  function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    calls += 1;
    return state / 0x100000000;
  }
  random.state = () => state;
  Object.defineProperty(random, 'calls', { get: () => calls });
  Object.defineProperty(random, 'seed', { value: initialSeed });
  Object.defineProperty(random, 'algorithm', { value: 'lcg-1664525-1013904223-u32' });
  return random;
}

export function rngCheckpoint(random) {
  if (typeof random !== 'function' || random.algorithm !== 'lcg-1664525-1013904223-u32'
      || typeof random.state !== 'function'
      || !Number.isSafeInteger(random.calls) || random.calls < 0) {
    throw new TypeError('Capture requires a restorable RNG with state() and integer calls.');
  }
  const state = random.state();
  if (!Number.isInteger(state) || state < 0 || state > 0xffffffff) {
    throw new TypeError('RNG state must be an unsigned 32-bit integer.');
  }
  return { algorithm: 'lcg-1664525-1013904223-u32', seed: random.seed >>> 0,
    state: state >>> 0, calls: random.calls };
}

export function prototypeRegistry(extraTypes = []) {
  const byPrototype = new Map([[Object.prototype, 'Object'], [Array.prototype, 'Array'],
    [Map.prototype, 'Map'], [Set.prototype, 'Set'], [Date.prototype, 'Date'],
    [RegExp.prototype, 'RegExp'], [DataView.prototype, 'DataView'], [null, 'null']]);
  const byId = new Map([['Object', Object.prototype], ['Array', Array.prototype],
    ['Map', Map.prototype], ['Set', Set.prototype], ['Date', Date.prototype],
    ['RegExp', RegExp.prototype], ['DataView', DataView.prototype], ['null', null]]);
  for (const Type of TYPED_ARRAYS.values()) {
    if (Type?.prototype) {
      byPrototype.set(Type.prototype, Type.name);
      byId.set(Type.name, Type.prototype);
    }
  }
  for (const item of [...TYPE_CONSTRUCTORS, ...extraTypes]) {
    const Type = typeof item === 'function' ? item : item?.Type;
    if (typeof Type !== 'function' || !Type.prototype) continue;
    const requestedId = typeof item === 'function' ? item.name : item.id;
    const prototypeId = requestedId || Type.name;
    if (byId.has(prototypeId) && byId.get(prototypeId) !== Type.prototype) {
      throw new TypeError(`Duplicate prototype id: ${prototypeId}`);
    }
    byPrototype.set(Type.prototype, prototypeId);
    byId.set(prototypeId, Type.prototype);
  }
  return { byPrototype, byId };
}

export function serializeStateGraph(root, { extraTypes = [], excludeRootKeys = [] } = {}) {
  const registry = prototypeRegistry(extraTypes);
  const nodes = [];
  const seen = new WeakMap();
  const exclusions = new Set(excludeRootKeys);

  function ref(value, owner = null, key = null) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return encodeNumber(value);
    if (typeof value === 'undefined') return { undefined: true };
    if (typeof value === 'bigint') return { bigint: value.toString() };
    if (typeof value === 'symbol') {
      const symbolKey = Symbol.keyFor(value);
      if (symbolKey === undefined) throw new TypeError(`Cannot serialize non-global symbol at ${String(key)}.`);
      return { symbol: symbolKey };
    }
    if (typeof value === 'function') {
      if (!isRestorableRandom(value)) throw new TypeError(`Cannot serialize function at ${String(key)}.`);
      if (seen.has(value)) return { ref: seen.get(value) };
      const id = nodes.length;
      seen.set(value, id);
      nodes.push({ kind: 'random', checkpoint: rngCheckpoint(value) });
      return { ref: id };
    }
    if (seen.has(value)) return { ref: seen.get(value) };

    const id = nodes.length;
    seen.set(value, id);
    nodes.push(null);

    if (value instanceof ArrayBuffer) {
      nodes[id] = { kind: 'array-buffer', byteLength: value.byteLength,
        bytes: Buffer.from(value).toString('base64') };
      return { ref: id };
    }
    if (ArrayBuffer.isView(value)) {
      const dataView = value instanceof DataView;
      const kind = dataView ? 'data-view' : 'typed-array';
      const details = dataView
        ? { byteOffset: value.byteOffset, byteLength: value.byteLength }
        : { constructor: value.constructor.name, byteOffset: value.byteOffset, length: value.length };
      nodes[id] = { kind, ...details, buffer: ref(value.buffer, value, 'buffer'),
        prototype: prototypeId(value, registry), props: ownProperties(value, child => ref(child, value),
          dataView ? null : isTypedArrayIndex) };
      return { ref: id };
    }
    if (value instanceof Map) {
      nodes[id] = { kind: 'map', prototype: prototypeId(value, registry),
        entries: [...value].map(([mapKey, mapValue]) => [ref(mapKey, value, 'map key'), ref(mapValue, value, 'map value')]),
        props: ownProperties(value, child => ref(child, value)), extensible: Object.isExtensible(value) };
      return { ref: id };
    }
    if (value instanceof Set) {
      nodes[id] = { kind: 'set', prototype: prototypeId(value, registry),
        values: [...value].map(item => ref(item, value, 'set value')),
        props: ownProperties(value, child => ref(child, value)), extensible: Object.isExtensible(value) };
      return { ref: id };
    }
    if (value instanceof Date) {
      nodes[id] = { kind: 'date', time: value.getTime(), prototype: prototypeId(value, registry),
        props: ownProperties(value, child => ref(child, value)), extensible: Object.isExtensible(value) };
      return { ref: id };
    }
    if (value instanceof RegExp) {
      nodes[id] = { kind: 'regexp', source: value.source, flags: value.flags, lastIndex: value.lastIndex,
        prototype: prototypeId(value, registry), props: ownProperties(value, child => ref(child, value), new Set(['lastIndex'])),
        extensible: Object.isExtensible(value) };
      return { ref: id };
    }
    if (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer) {
      throw new TypeError('SharedArrayBuffer is not supported in ANT transfer captures.');
    }

    const isArray = Array.isArray(value);
    nodes[id] = { kind: isArray ? 'array' : 'object', prototype: prototypeId(value, registry),
      props: ownProperties(value, child => ref(child, value)),
      length: isArray ? value.length : undefined, extensible: Object.isExtensible(value) };
    return { ref: id };
  }

  function ownProperties(value, encode, skip = null) {
    const props = [];
    for (const key of Reflect.ownKeys(value)) {
      if (typeof skip === 'function' ? skip(key) : skip?.has(key)) continue;
      if (value === root && exclusions.has(key)) continue;
      if (typeof key === 'symbol') {
        const symbolKey = Symbol.keyFor(key);
        if (symbolKey === undefined) throw new TypeError('Cannot serialize an object with a non-global symbol key.');
        props.push({ key: { symbol: symbolKey }, descriptor: encodeDescriptor(Object.getOwnPropertyDescriptor(value, key), encode) });
      } else {
        props.push({ key, descriptor: encodeDescriptor(Object.getOwnPropertyDescriptor(value, key), encode) });
      }
    }
    return props;
  }

  const rootRef = ref(root);
  return { format: FORMAT, root: rootRef, nodes };
}

export function restoreStateGraph(graph, { extraTypes = [] } = {}) {
  if (graph?.format !== FORMAT || !Array.isArray(graph.nodes)) throw new TypeError('Unsupported ANT state graph.');
  const registry = prototypeRegistry(extraTypes);
  const values = new Array(graph.nodes.length);

  for (let id = 0; id < graph.nodes.length; id += 1) {
    const node = graph.nodes[id];
    if (node.kind === 'array-buffer') {
      const bytes = Buffer.from(node.bytes, 'base64');
      values[id] = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + node.byteLength);
    }
  }
  for (let id = 0; id < graph.nodes.length; id += 1) {
    const node = graph.nodes[id];
    if (values[id] !== undefined) continue;
    switch (node.kind) {
      case 'random': values[id] = createSeededRandom(node.checkpoint.seed, node.checkpoint); break;
      case 'array': values[id] = []; break;
      case 'object': values[id] = Object.create(resolvePrototype(node.prototype, registry)); break;
      case 'map': values[id] = new Map(); break;
      case 'set': values[id] = new Set(); break;
      case 'date': values[id] = new Date(node.time); break;
      case 'regexp': values[id] = new RegExp(node.source, node.flags); values[id].lastIndex = node.lastIndex; break;
      case 'typed-array': {
        const Type = TYPED_ARRAYS.get(node.constructor);
        if (!Type) throw new TypeError(`Unsupported typed array: ${node.constructor}`);
        values[id] = new Type(resolveRef(node.buffer), node.byteOffset, node.length);
        break;
      }
      case 'data-view': values[id] = new DataView(resolveRef(node.buffer), node.byteOffset, node.byteLength); break;
      default: throw new TypeError(`Unsupported ANT graph node kind: ${node.kind}`);
    }
    if (node.prototype && !['random', 'array-buffer'].includes(node.kind)) {
      Object.setPrototypeOf(values[id], resolvePrototype(node.prototype, registry));
    }
  }

  for (let id = 0; id < graph.nodes.length; id += 1) {
    const node = graph.nodes[id];
    const target = values[id];
    if (node.kind === 'map') for (const [key, value] of node.entries) target.set(resolveRef(key), resolveRef(value));
    if (node.kind === 'set') for (const value of node.values) target.add(resolveRef(value));
    for (const item of node.props || []) {
      const key = item.key?.symbol !== undefined ? Symbol.for(item.key.symbol) : item.key;
      Object.defineProperty(target, key, decodeDescriptor(item.descriptor, resolveRef));
    }
    if (node.kind === 'array' && target.length !== node.length) target.length = node.length;
    if (node.extensible === false) Object.preventExtensions(target);
  }

  return resolveRef(graph.root);

  function resolveRef(value) {
    if (value === null || typeof value !== 'object') return value;
    if (value.ref !== undefined) return values[value.ref];
    if (value.undefined === true) return undefined;
    if (value.number !== undefined) return decodeNumber(value.number);
    if (value.bigint !== undefined) return BigInt(value.bigint);
    if (value.symbol !== undefined) return Symbol.for(value.symbol);
    throw new TypeError('Malformed ANT graph reference.');
  }
}

export function cloneStateGraph(root, options = {}) {
  return restoreStateGraph(serializeStateGraph(root, options), options);
}

export function captureControllerState(controller, options = {}) {
  if (!controller?.initialized || !controller.running) throw new Error('Capture requires a running initialized controller.');
  if (controller.listeners?.size) throw new Error('Capture requires no active controller listeners.');
  if (controller.audioBridge != null) throw new Error('Capture requires audio transport to be disabled.');
  if (!(controller.field instanceof PheromoneField)) throw new Error('Capture requires the production PheromoneField.');
  if (!(controller.random && typeof controller.random === 'function')) throw new Error('Capture requires the controller RNG.');
  const checkpoint = rngCheckpoint(controller.random);
  return { format: FORMAT, checkpoint, graph: serializeStateGraph(controller, {
    ...options, excludeRootKeys: [...OMITTED_ROOT_KEYS, ...(options.excludeRootKeys || [])]
  }) };
}

export function restoreControllerState(capture, options = {}) {
  if (capture?.format !== FORMAT || capture.graph?.format !== FORMAT) throw new TypeError('Unsupported ANT controller capture.');
  const controller = restoreStateGraph(capture.graph, options);
  controller.listeners = new Set();
  controller.audioBridge = null;
  controller.fieldFactory = createProductionField;
  const actual = rngCheckpoint(controller.random);
  if (JSON.stringify(actual) !== JSON.stringify(capture.checkpoint)) throw new Error('Restored RNG does not match capture checkpoint.');
  return controller;
}

function createProductionField(options) { return new PheromoneField(options); }

function encodeDescriptor(descriptor, encode) {
  if (!descriptor || !('value' in descriptor)) throw new TypeError('Accessor properties are not supported in ANT captures.');
  return { value: encode(descriptor.value), writable: descriptor.writable,
    enumerable: descriptor.enumerable, configurable: descriptor.configurable };
}

function decodeDescriptor(descriptor, resolveRef) {
  return { value: resolveRef(descriptor.value), writable: descriptor.writable,
    enumerable: descriptor.enumerable, configurable: descriptor.configurable };
}

function prototypeId(value, registry) {
  const prototype = Object.getPrototypeOf(value);
  const id = registry.byPrototype.get(prototype);
  if (id === undefined) throw new TypeError(`Unsupported prototype: ${prototype?.constructor?.name || 'null'}`);
  return id;
}

function resolvePrototype(id, registry) {
  if (!registry.byId.has(id)) throw new TypeError(`Unknown ANT capture prototype: ${id}`);
  return registry.byId.get(id);
}

function isRestorableRandom(value) {
  return value.algorithm === 'lcg-1664525-1013904223-u32'
    && typeof value.state === 'function' && Number.isSafeInteger(value.calls) && value.calls >= 0;
}

function isTypedArrayIndex(key) {
  if (typeof key !== 'string' || key === '') return false;
  const number = Number(key);
  return Number.isInteger(number) && number >= 0 && String(number) === key;
}

function encodeNumber(value) {
  if (Number.isNaN(value)) return { number: 'NaN' };
  if (value === Infinity) return { number: 'Infinity' };
  if (value === -Infinity) return { number: '-Infinity' };
  if (Object.is(value, -0)) return { number: '-0' };
  return value;
}

function decodeNumber(value) {
  if (value === 'NaN') return NaN;
  if (value === 'Infinity') return Infinity;
  if (value === '-Infinity') return -Infinity;
  if (value === '-0') return -0;
  throw new TypeError(`Unsupported encoded number: ${value}`);
}
