import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { ANT_MAX_TURN_RATE } from '../src/lib/agents/ant/AntAgent.js';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { analyzeRouteCurvature } from './ant-route-curvature-metrics.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HZ = 60, DT = 1 / HZ, TICKS = 600 * HZ;
const SEEDS = [20261005, 20261006, 20261007];
const SNAPSHOT_TICKS = [30, 120, 300, 600].map(seconds => seconds * HZ);
const SOURCES = [
  'src/lib/agents/ant/AntAgent.js', 'src/lib/agents/ant/AntController.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/GaitController.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'src/lib/agents/ant/BodyPoseController.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/ColonyActivation.js', 'scripts/ant-route-curvature-natural.js',
  'scripts/ant-route-curvature-metrics.js'
];
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, (_key, item) => ArrayBuffer.isView(item) ? Array.from(item) : item);
const FLOAT_COLUMNS = ['x', 'y', 'heading', 'intentHeading', 'angularVelocity', 'vx', 'vy',
  'speed', 'targetSpeed', 'trailAdherence', 'travelled', 'collisionScale', 'frontCrowding',
  'leftCrowding', 'rightCrowding', 'followingSpeedLimit'];
const FLAG_COLUMNS = ['turnCapSaturated', 'exited'];

export function encodeCompactCapture(samples) {
  const ids = [], idIndex = new Map();
  const layout = [
    { name: 'id', type: 'uint32', bytesPerValue: 4 },
    { name: 'tick', type: 'uint32', bytesPerValue: 4 },
    ...FLOAT_COLUMNS.map(name => ({ name, type: 'float64', bytesPerValue: 8, nullEncoding: 'NaN' })),
    ...FLAG_COLUMNS.map(name => ({ name, type: 'uint8-bool', bytesPerValue: 1 }))
  ];
  const count = samples.length;
  let offset = 0;
  for (const column of layout) { column.offsetBytes = offset; offset += count * column.bytesPerValue; }
  const buffer = Buffer.allocUnsafe(offset);
  for (let row = 0; row < count; row += 1) {
    const sample = samples[row];
    let id = idIndex.get(sample.id);
    if (id === undefined) { id = ids.length; ids.push(sample.id); idIndex.set(sample.id, id); }
    buffer.writeUInt32LE(id, layout[0].offsetBytes + row * 4);
    buffer.writeUInt32LE(sample.tick, layout[1].offsetBytes + row * 4);
    for (let index = 0; index < FLOAT_COLUMNS.length; index += 1) {
      const value = sample[FLOAT_COLUMNS[index]];
      buffer.writeDoubleLE(value == null ? NaN : value, layout[index + 2].offsetBytes + row * 8);
    }
    for (let index = 0; index < FLAG_COLUMNS.length; index += 1) {
      buffer[layout[FLOAT_COLUMNS.length + index + 2].offsetBytes + row] = sample[FLAG_COLUMNS[index]] ? 1 : 0;
    }
  }
  return { buffer, schema: { schema: 'ant-route-curvature-f64-v1', count, ids, columns: layout } };
}

export function decodeCompactCapture(buffer, schema) {
  assert.equal(schema?.schema, 'ant-route-curvature-f64-v1');
  assert.ok(Buffer.isBuffer(buffer) && Array.isArray(schema.ids) && Array.isArray(schema.columns));
  const rows = Array.from({ length: schema.count }, () => ({}));
  for (const column of schema.columns) {
    for (let row = 0; row < schema.count; row += 1) {
      const offset = column.offsetBytes + row * column.bytesPerValue;
      let value;
      if (column.type === 'uint32') value = buffer.readUInt32LE(offset);
      else if (column.type === 'float64') {
        value = buffer.readDoubleLE(offset);
        if (Number.isNaN(value)) value = null;
      } else value = buffer[offset] === 1;
      rows[row][column.name === 'id' ? 'id' : column.name] = column.name === 'id' ? schema.ids[value] : value;
    }
  }
  return rows;
}

export async function readNaturalCapture(path) {
  if (path.endsWith('.f64.gz')) {
    const schemaPath = path.replace(/\.f64\.gz$/, '.schema.json');
    const [bytes, schema] = await Promise.all([readFile(path), readFile(schemaPath, 'utf8').then(JSON.parse)]);
    return decodeCompactCapture(gunzipSync(bytes), schema);
  }
  const text = gunzipSync(await readFile(path)).toString();
  return text.trimEnd().split('\n').map(line => JSON.parse(line));
}

export async function runNaturalCase({ seed, outputDir, Controller = AntController,
  ticks = TICKS, hooks = true, snapshots = true } = {}) {
  assert.ok(Number.isInteger(seed) && Number.isInteger(ticks) && ticks >= 0);
  const rng = countedLcg(seed), controller = new Controller({ random: rng.random });
  const samples = [], checkpoints = [];
  let activeTick = -1, senseById = new Map(), collisionById = new Map(), footContacts = 0;
  await controller.init();
  if (hooks) for (const agent of controller.agents) samples.push(sampleAgent(agent, 0, 1, {}, 0));
  const restore = hooks ? installCaptureHooks(controller, {
    beforeTick(tick) { activeTick = tick; senseById = new Map(); collisionById = new Map(); },
    capture(agent, travelled, segment) {
      const sense = senseById.get(agent.id) || {};
      samples.push(sampleAgent(agent, activeTick + 1, collisionById.get(agent.id) ?? 1,
        sense, travelled, segment));
    },
    sense(id, value) { senseById.set(id, value); },
    collision(id, value) { collisionById.set(id, value); }
  }) : () => {};
  controller.subscribe(event => { if (event.type === 'foot-contact') footContacts += event.payload.contacts.length; });
  try {
    for (let tick = 0; tick < ticks; tick += 1) {
      if (hooks) restore.beforeTick?.(tick);
      controller.tick(DT);
      if (snapshots && SNAPSHOT_TICKS.includes(tick + 1)) checkpoints.push({ tick: tick + 1,
        simulationTimeMs: controller.simulationTimeMs, population: controller.agents.length,
        totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired,
        pheromone: controller.field.getSnapshot(), surface: controller.surfaceField.getSnapshot(),
        plates: controller.trailPlateBirth.getPlates(), nodules: controller.materialStratigraphy.getNodules() });
    }
    const movement = hooks ? analyzeRouteCurvature(samples, { hz: HZ, windowSeconds: [1, 2, 5] }) : null;
    const summary = {
      seed, hz: HZ, ticks, simulatedSeconds: ticks / HZ, instrumentation: hooks,
      sampleCount: samples.length, activePopulation: controller.agents.length,
      totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired,
      footPoints: footContacts, rngState: rng.state(), rngCalls: rng.calls(),
      pheromoneSha256: sha(Buffer.from(controller.field.values.buffer)),
      surfaceSha256: sha(Buffer.from(controller.surfaceField.values.buffer)),
      finalAgentsSha256: sha(Buffer.from(JSON.stringify(controller.agents))),
      finalPlateCount: controller.trailPlateBirth.plates.length,
      finalNoduleCount: controller.materialStratigraphy.nodules.length,
      routeCurvature: movement
    };
    if (outputDir) {
      await mkdir(outputDir, { recursive: true });
      const prefix = `seed-${seed}`;
      const packed = encodeCompactCapture(samples);
      await writeFile(resolve(outputDir, `${prefix}-trajectory.f64.gz`), gzipSync(packed.buffer), { flag: 'wx' });
      await writeFile(resolve(outputDir, `${prefix}-trajectory.schema.json`), JSON.stringify(packed.schema, null, 2) + '\n', { flag: 'wx' });
      await writeFile(resolve(outputDir, `${prefix}-snapshots.json.gz`), gzipSync(json(checkpoints)), { flag: 'wx' });
      await writeFile(resolve(outputDir, `${prefix}-summary.json`), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
    }
    return { summary, samples, checkpoints, controller, rng };
  } finally {
    restore();
    await controller.destroy();
  }
}

export async function verifyHookParity({ seed = SEEDS[0], ticks = 600 } = {}) {
  const plain = await runNaturalCase({ seed, ticks, hooks: false, snapshots: false });
  const observed = await runNaturalCase({ seed, ticks, hooks: true, snapshots: false });
  const select = value => ({ rngState: value.summary.rngState, rngCalls: value.summary.rngCalls,
    pheromoneSha256: value.summary.pheromoneSha256, surfaceSha256: value.summary.surfaceSha256,
    finalAgentsSha256: value.summary.finalAgentsSha256, totalSpawned: value.summary.totalSpawned,
    totalRetired: value.summary.totalRetired, footPoints: value.summary.footPoints });
  assert.deepEqual(select(observed), select(plain), 'capture hooks preserve state and random stream');
  return { seed, ticks, exactParity: true, hooksSamples: observed.summary.sampleCount,
    state: select(plain) };
}

function installCaptureHooks(controller, { beforeTick, capture, sense, collision }) {
  const originalSense = controller.occupancy.sense;
  const originalConstrain = controller.occupancy.constrainDisplacements;
  const originalAdvance = controller.gaitController.advance;
  controller.occupancy.sense = function (agent, agents) {
    const value = originalSense.call(this, agent, agents);
    sense(agent.id, value);
    return value;
  };
  controller.occupancy.constrainDisplacements = function (agents, displacements) {
    const values = originalConstrain.call(this, agents, displacements);
    for (let index = 0; index < agents.length; index += 1) collision(agents[index].id, values[index]);
    return values;
  };
  controller.gaitController.advance = function (agent, travelled, ...args) {
    const result = originalAdvance.call(this, agent, travelled, ...args);
    capture(agent, travelled, args[2]);
    return result;
  };
  const restore = () => {
    controller.occupancy.sense = originalSense;
    controller.occupancy.constrainDisplacements = originalConstrain;
    controller.gaitController.advance = originalAdvance;
  };
  restore.beforeTick = beforeTick;
  return restore;
}

function countedLcg(seed) {
  let state = seed >>> 0, calls = 0;
  return { random() { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; calls += 1; return state / 0x100000000; },
    state: () => state, calls: () => calls };
}

function sampleAgent(agent, tick, collisionScale, sense, travelled, segment = null) {
  return { id: agent.id, tick, x: agent.x, y: agent.y, heading: agent.heading,
    intentHeading: agent.intentHeading, angularVelocity: agent.angularVelocity,
    vx: agent.vx, vy: agent.vy, speed: Math.hypot(agent.vx, agent.vy), targetSpeed: agent.targetSpeed,
    trailAdherence: agent.trailAdherence, travelled, collisionScale,
    frontCrowding: sense.frontCrowding ?? null, leftCrowding: sense.leftCrowding ?? null,
    rightCrowding: sense.rightCrowding ?? null, followingSpeedLimit: sense.followingSpeedLimit ?? null,
    turnCapSaturated: Math.abs(agent.angularVelocity) >= ANT_MAX_TURN_RATE - 1e-12,
    exited: segment?.to?.x < 0 || segment?.to?.x > 1 || segment?.to?.y < 0 || segment?.to?.y > 1 };
}

async function sourceHashes() {
  return Object.fromEntries(await Promise.all(SOURCES.map(async path => [path, sha(await readFile(resolve(ROOT, path)))])));
}

async function main() {
  const outputDir = resolve(process.argv[2] || 'docs/ant/evidence/2026-10-22-route-curvature-survey/natural');
  const commit = process.argv[3];
  assert.match(commit || '', /^[0-9a-f]{40}$/i, 'pass the exact source commit as argument 2');
  const parity = await verifyHookParity();
  const sources = await sourceHashes();
  const runs = [];
  for (const seed of SEEDS) runs.push((await runNaturalCase({ seed, outputDir })).summary);
  await writeFile(resolve(outputDir, 'manifest.json'), JSON.stringify({
    commit,
    productionState: 'default AntController at repository source state; no behavior changes; 60 Hz fixed ticks',
    seeds: SEEDS, hz: HZ, ticksPerSeed: TICKS, rng: 'LCG state=(imul(state,1664525)+1013904223)>>>0; output=state/2^32',
    parity, sourceSha256: sources, runs
  }, null, 2) + '\n', { flag: 'wx' });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error); process.exitCode = 1;
});
